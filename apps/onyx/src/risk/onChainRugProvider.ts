import { Commitment, Connection, PublicKey } from "@solana/web3.js";
import type { Logger } from "pino";
import type { LaunchSignal, RugChecks } from "../types/domain.js";
import {
  deriveBondingCurvePda,
  parsePumpBondingCurveAccount,
  type ParsedPumpBondingCurve
} from "@darkflow/engine/solana/adapters/pump";

type ParsedShape = {
  type?: string;
  info?: {
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    supply?: string;
    owner?: string;
    mint?: string;
    tokenAmount?: { amount?: string; decimals?: number };
  };
};

const worstCaseRugChecks = (migrationState: RugChecks["migrationState"] = "migrated"): RugChecks => ({
  mintAuthorityRevoked: false,
  freezeAuthorityRevoked: false,
  topHoldersConcentrationBps: 10_000,
  creatorSupplyShareBps: 10_000,
  creatorRiskScore: 99,
  creatorRiskUnknown: true,
  creatorHistorySignals: 0,
  migrationState
});

const bpsFromRatio = (num: bigint, den: bigint): number => {
  if (den <= 0n) return 0;
  return Number((num * 10_000n) / den);
};

const raceTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export type OnChainRugProviderInput = {
  connection: Connection;
  pumpProgramId: string;
  commitment?: Commitment;
  logger?: Logger;
  rpcTimeoutMs?: number;
  largestHolderProbe?: number;
  unknownCreatorRiskScore?: number;
  minCreatorHistorySignals?: number;
};

export class OnChainRugSignalProvider {
  private readonly connection: Connection;
  private readonly pumpProgramId: PublicKey;
  private readonly commitment: Commitment;
  private readonly logger?: Logger;
  private readonly rpcTimeoutMs: number;
  private readonly largestHolderProbe: number;
  private readonly unknownCreatorRiskScore: number;
  private readonly minCreatorHistorySignals: number;

  public constructor({
    connection,
    pumpProgramId,
    commitment = "processed",
    logger,
    rpcTimeoutMs = 3500,
    largestHolderProbe = 10,
    unknownCreatorRiskScore = 60,
    minCreatorHistorySignals = 8
  }: OnChainRugProviderInput) {
    this.connection = connection;
    this.pumpProgramId = new PublicKey(pumpProgramId);
    this.commitment = commitment;
    this.logger = logger;
    this.rpcTimeoutMs = rpcTimeoutMs;
    this.largestHolderProbe = largestHolderProbe;
    this.unknownCreatorRiskScore = unknownCreatorRiskScore;
    this.minCreatorHistorySignals = minCreatorHistorySignals;
  }

  public async load(launch: LaunchSignal): Promise<RugChecks> {
    const loadStarted = Date.now();
    let mint: PublicKey;
    let creator: PublicKey;
    try {
      mint = new PublicKey(launch.tokenMint);
      creator = new PublicKey(launch.creator);
    } catch {
      this.logger?.warn({ launch }, "Invalid mint or creator pubkey for rug load.");
      return worstCaseRugChecks("migrated");
    }

    const t = this.rpcTimeoutMs;

    // Fire ALL independent reads simultaneously — no sequential phases.
    // Phase-1 wall-clock = max(individual timeouts) instead of their sum.
    const [curveOutcome, mintInfoOutcome, sigOutcome, largestAccsOutcome, creatorAccsOutcome] =
      await Promise.all([
        this.safe("bonding_curve", () =>
          raceTimeout(this.resolveBondingCurve(mint, launch.bondingCurve), t, "bonding_curve")
        ),
        this.safeTimed("mint", () =>
          raceTimeout(this.readMintInfo(mint), Math.min(t, 1200), "mint")
        ),
        // Limit to minCreatorHistorySignals — we only need to know if threshold is met.
        this.safeTimed("creator_sigs", () =>
          raceTimeout(
            this.connection
              .getSignaturesForAddress(creator, { limit: this.minCreatorHistorySignals + 1 })
              .then((s) => s.length),
            Math.min(t, 1200),
            "creator_sigs"
          )
        ),
        this.safeTimed("largest_accounts", () =>
          raceTimeout(
            this.connection.getTokenLargestAccounts(mint, this.commitment),
            Math.min(t, 800),
            "largest_accounts"
          )
        ),
        this.safeTimed("creator_tokens", () =>
          raceTimeout(
            this.connection.getParsedTokenAccountsByOwner(creator, { mint }, this.commitment),
            Math.min(t, 1000),
            "creator_tokens"
          )
        )
      ]);

    // Extract supply from the mint info (used by both holder concentration and creator share).
    const mintInfo = mintInfoOutcome.ok ? mintInfoOutcome.value : null;
    const supply = mintInfo?.supply ?? 0n;
    const curveAddr = curveOutcome.ok ? curveOutcome.value?.address?.toBase58() : undefined;

    // Phase 2: resolve token-account owners for the top holders.
    // Depends on Phase 1 largest_accounts result — starts immediately after.
    const holderOutcome = await (async (): Promise<
      ({ ok: true; value: number } | { ok: false; error: unknown }) & { latencyMs: number }
    > => {
      if (!largestAccsOutcome.ok) {
        return { ok: false as const, error: "largest-failed", latencyMs: 0 };
      }
      const rows = largestAccsOutcome.value.value ?? [];
      const probe = rows.slice(0, this.largestHolderProbe);
      if (probe.length === 0) return { ok: true as const, value: 0, latencyMs: 0 };
      return this.safeTimed("holders", () =>
        raceTimeout(
          this.computeHolderConcentration(probe, supply, curveAddr),
          Math.min(t, 800),
          "holders"
        )
      );
    })();

    // Creator supply share — computed from Phase 1 data, no extra RPC needed.
    const creatorSupplyShareBps = (() => {
      if (!creatorAccsOutcome.ok) return 10_000;
      let creatorRaw = 0n;
      for (const row of creatorAccsOutcome.value.value) {
        const acc = row.account.data;
        if (!acc || typeof acc !== "object" || !("parsed" in acc)) continue;
        const p = (acc as { parsed?: ParsedShape }).parsed;
        if (!p?.info?.tokenAmount?.amount) continue;
        creatorRaw += BigInt(p.info.tokenAmount.amount);
      }
      return supply > 0n ? bpsFromRatio(creatorRaw, supply) : 10_000;
    })();

    const mintAuthorityRevoked = mintInfo ? !mintInfo.hasMintAuthority : false;
    const freezeAuthorityRevoked = mintInfo ? !mintInfo.hasFreezeAuthority : false;

    const curveParsed = curveOutcome.ok ? curveOutcome.value?.parsed : undefined;
    const migrationState: RugChecks["migrationState"] =
      !curveParsed || curveParsed.complete ? "migrated" : "bonding";

    const topHoldersConcentrationBps = holderOutcome.ok ? holderOutcome.value : 10_000;
    const creatorHistorySignals = sigOutcome.ok ? sigOutcome.value : 0;
    const creatorRiskUnknown =
      !sigOutcome.ok || creatorHistorySignals < this.minCreatorHistorySignals;
    const historyDrivenScore = Math.max(
      35,
      Math.min(95, Math.round(95 - Math.min(40, creatorHistorySignals) * 1.5))
    );
    const creatorRiskScore = creatorRiskUnknown
      ? Math.round(
          (this.unknownCreatorRiskScore * this.minCreatorHistorySignals +
            historyDrivenScore * creatorHistorySignals) /
            (this.minCreatorHistorySignals + Math.max(1, creatorHistorySignals))
        )
      : historyDrivenScore;

    this.logger?.debug(
      {
        tokenMint: launch.tokenMint,
        mintReadMs: mintInfoOutcome.latencyMs,
        sigReadMs: sigOutcome.latencyMs,
        largestReadMs: largestAccsOutcome.latencyMs,
        holderReadMs: holderOutcome.latencyMs,
        creatorTokensReadMs: creatorAccsOutcome.latencyMs,
        totalRiskMs: Date.now() - loadStarted
      },
      "On-chain rug read latency."
    );

    return {
      mintAuthorityRevoked,
      freezeAuthorityRevoked,
      topHoldersConcentrationBps,
      creatorSupplyShareBps,
      creatorRiskScore,
      creatorRiskUnknown,
      creatorHistorySignals,
      migrationState
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private safe<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
    return fn()
      .then((value) => ({ ok: true as const, value }))
      .catch((error: unknown) => {
        this.logger?.debug({ label, error }, "On-chain rug sub-read failed.");
        return { ok: false as const, error };
      });
  }

  private async safeTimed<T>(
    label: string,
    fn: () => Promise<T>
  ): Promise<({ ok: true; value: T } | { ok: false; error: unknown }) & { latencyMs: number }> {
    const started = Date.now();
    const outcome = await this.safe(label, fn);
    return { ...outcome, latencyMs: Date.now() - started };
  }

  /** Read mint authorities and supply in a single RPC call. */
  private async readMintInfo(mint: PublicKey): Promise<{
    hasMintAuthority: boolean;
    hasFreezeAuthority: boolean;
    supply: bigint;
  }> {
    const res = await this.connection.getParsedAccountInfo(mint, this.commitment);
    const data = res.value?.data;
    if (!data || typeof data !== "object" || !("parsed" in data)) {
      throw new Error("Mint account not parsed");
    }
    const parsed = (data as { parsed?: ParsedShape }).parsed;
    if (parsed?.type !== "mint" || !parsed.info) {
      throw new Error("Not a mint account");
    }
    return {
      hasMintAuthority: parsed.info.mintAuthority != null,
      hasFreezeAuthority: parsed.info.freezeAuthority != null,
      supply: parsed.info.supply ? BigInt(parsed.info.supply) : 0n
    };
  }

  /**
   * Compute top-5 holder concentration using getMultipleAccountsInfo (1 batch call)
   * instead of individual getParsedAccountInfo calls per holder (N calls).
   */
  private async computeHolderConcentration(
    rows: Array<{ address: PublicKey | string; amount: string }>,
    supply: bigint,
    excludeOwner?: string
  ): Promise<number> {
    if (supply === 0n || rows.length === 0) return 0;

    const keys = rows.map((r) => new PublicKey(r.address));
    // Single batch call replaces N individual getParsedAccountInfo calls.
    const accountInfos = await this.connection.getMultipleAccountsInfo(keys, this.commitment);

    const holders: Array<{ amount: bigint; owner: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const info = accountInfos[i];
      if (!info?.data) continue;
      const data = Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data as Uint8Array);
      if (data.length < 72) continue;
      // SPL Token account layout: mint[0:32] | owner[32:64] | amount[64:72 LE u64]
      const owner = new PublicKey(data.slice(32, 64)).toBase58();
      // Use amount from getLargestAccounts (already sorted and validated by the RPC).
      const amount = BigInt(rows[i]!.amount);
      holders.push({ amount, owner });
    }

    const filtered = excludeOwner
      ? holders.filter((h) => h.owner !== excludeOwner)
      : (() => {
          // Exclude the largest holder if they own ≥92% — that's the bonding curve vault.
          if (holders.length > 0 && supply > 0n) {
            const ratio = Number((holders[0]!.amount * 100n) / supply);
            if (ratio >= 92) return holders.slice(1);
          }
          return holders;
        })();

    filtered.sort((a, b) => (a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : 0));
    const top5 = filtered.slice(0, 5);
    const sum = top5.reduce((acc, r) => acc + r.amount, 0n);
    return bpsFromRatio(sum, supply);
  }

  private async resolveBondingCurve(
    mint: PublicKey,
    hint?: string
  ): Promise<{ address: PublicKey; parsed: ParsedPumpBondingCurve } | null> {
    const candidates: PublicKey[] = [];
    if (hint) {
      try {
        candidates.push(new PublicKey(hint));
      } catch {
        /* ignore */
      }
    }
    candidates.push(deriveBondingCurvePda(mint, this.pumpProgramId, "bonding-curve-v2"));
    candidates.push(deriveBondingCurvePda(mint, this.pumpProgramId, "bonding-curve"));

    const unique: PublicKey[] = [];
    const seen = new Set<string>();
    for (const p of candidates) {
      const s = p.toBase58();
      if (!seen.has(s)) {
        seen.add(s);
        unique.push(p);
      }
    }

    const infos = await this.connection.getMultipleAccountsInfo(unique, this.commitment);
    for (let i = 0; i < unique.length; i++) {
      const info = infos[i];
      if (!info?.data) continue;
      const buf = Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data);
      const parsed = parsePumpBondingCurveAccount(buf);
      if (parsed) return { address: unique[i]!, parsed };
    }
    return null;
  }
}
