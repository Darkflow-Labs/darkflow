import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  TransactionMessage,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  VersionedTransaction
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { parsePumpBondingCurveAccount } from "./pumpBondingCurve.js";
import type { TradeIntent } from "../../../core/types/domain.js";

type BuildEntryTxInput = {
  connection: Connection;
  signerKeypair: Keypair;
  recentBlockhash: string;
  intent: TradeIntent;
  sellVariant?: "primary" | "alternate";
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 6;
const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const PUMP_GLOBAL = new PublicKey("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf");
const PUMP_EVENT_AUTHORITY = new PublicKey("Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1");
const PUMP_FEE = new PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");
const PUMP_FEE_PROGRAM = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
const BUY_EXACT_SOL_IN_DISCRIMINATOR = Buffer.from("38 fc 74 08 9e df cd 5f".replaceAll(" ", ""), "hex"); // 6903419673668549688 LE
const SELL_DISCRIMINATOR = Buffer.from("33 e6 85 a4 01 7f 83 ad".replaceAll(" ", ""), "hex"); // 12502976635542562355 LE
const EXTEND_ACCOUNT_DISCRIMINATOR = Buffer.from([234, 102, 194, 203, 150, 72, 62, 229]);
const BREAKING_FEE_RECIPIENTS = [
  "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
  "9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7",
  "GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL",
  "3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR",
  "5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6",
  "EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL",
  "5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD",
  "A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW"
].map((v) => new PublicKey(v));

const deriveGlobalVolumeAccumulator = () =>
  PublicKey.findProgramAddressSync([Buffer.from("global_volume_accumulator")], PUMP_PROGRAM)[0];
const deriveUserVolumeAccumulator = (user: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("user_volume_accumulator"), user.toBuffer()], PUMP_PROGRAM)[0];
const deriveFeeConfig = () => PublicKey.findProgramAddressSync([Buffer.from("fee_config"), PUMP_PROGRAM.toBuffer()], PUMP_FEE_PROGRAM)[0];
const deriveCreatorVault = (creator: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM)[0];
const deriveBondingCurveV2 = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("bonding-curve-v2"), mint.toBuffer()], PUMP_PROGRAM)[0];
const deriveBondingCurveLegacy = (mint: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM)[0];

const pickBreakingFeeRecipient = (mint: PublicKey) =>
  BREAKING_FEE_RECIPIENTS[mint.toBytes()[0]! % BREAKING_FEE_RECIPIENTS.length]!;

const setLoadedAccountsDataSizeLimitInstruction = (bytes: number) =>
  (() => {
    const payload = Buffer.alloc(5);
    payload.writeUInt8(4, 0);
    payload.writeUInt32LE(bytes, 1);
    return new TransactionInstruction({
      programId: ComputeBudgetProgram.programId,
      keys: [],
      data: payload
    });
  })();

const buildExtendAccountInstruction = (bondingCurve: PublicKey, user: PublicKey) =>
  new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false }
    ],
    data: EXTEND_ACCOUNT_DISCRIMINATOR
  });

const putU64 = (value: bigint) => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(value);
  return out;
};

const resolveTokenProgram = async (connection: Connection, mint: PublicKey) => {
  const mintInfo = await connection.getAccountInfo(mint, "processed");
  if (!mintInfo) {
    throw new Error("mint-account-not-found");
  }
  if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return TOKEN_2022_PROGRAM_ID;
  }
  return TOKEN_PROGRAM_ID;
};

const resolveFeeRecipient = async (connection: Connection, isMayhemMode: boolean) => {
  if (!isMayhemMode) {
    return PUMP_FEE;
  }
  const globalInfo = await connection.getAccountInfo(PUMP_GLOBAL, "processed");
  if (!globalInfo?.data || globalInfo.data.length < 515) {
    return PUMP_FEE;
  }
  const reservedFeeRecipientOffset = 483;
  return new PublicKey(globalInfo.data.subarray(reservedFeeRecipientOffset, reservedFeeRecipientOffset + 32));
};

const resolveBondingCurve = async (connection: Connection, mint: PublicKey, hint?: string) => {
  const inferCurveFlags = (raw: Buffer) => {
    const isMayhemMode = raw.length > 81 ? raw.readUInt8(81) !== 0 : false;
    const isCashbackCoin = raw.length > 82 ? raw.readUInt8(82) !== 0 : false;
    return { isMayhemMode, isCashbackCoin };
  };
  const legacy = deriveBondingCurveLegacy(mint);
  const v2 = deriveBondingCurveV2(mint);
  const candidates: PublicKey[] = [];
  if (hint) {
    try { candidates.push(new PublicKey(hint)); } catch { /* ignore */ }
  }
  candidates.push(legacy, v2);

  const unique: PublicKey[] = [];
  const seen = new Set<string>();
  for (const p of candidates) {
    const s = p.toBase58();
    if (!seen.has(s)) { seen.add(s); unique.push(p); }
  }

  // Single batch call replaces N sequential getAccountInfo calls.
  const infos = await connection.getMultipleAccountsInfo(unique, "processed");

  let lastSeen: PublicKey | null = null;
  let lastFlags: { isMayhemMode: boolean; isCashbackCoin: boolean } | null = null;
  let lastLen = 0;
  for (let i = 0; i < unique.length; i++) {
    const info = infos[i];
    if (!info?.data) continue;
    const buf = Buffer.isBuffer(info.data) ? info.data : Buffer.from(info.data as Uint8Array);
    lastSeen = unique[i]!;
    lastFlags = inferCurveFlags(buf);
    lastLen = buf.length;
    const parsed = parsePumpBondingCurveAccount(buf);
    if (parsed) {
      return {
        curve: unique[i]!,
        parsed,
        accountDataLength: buf.length,
        inferredFlags: { isMayhemMode: parsed.isMayhemMode, isCashbackCoin: parsed.isCashbackCoin }
      };
    }
  }
  return { curve: lastSeen ?? legacy, parsed: null, accountDataLength: lastLen, inferredFlags: lastFlags };
};

const parseSellPercentBps = (amountOverride?: string | number) => {
  if (typeof amountOverride === "number") {
    return Math.max(1, Math.min(10_000, Math.floor(amountOverride)));
  }
  if (typeof amountOverride === "string" && amountOverride.trim().endsWith("%")) {
    const pct = Number(amountOverride.trim().slice(0, -1));
    if (Number.isFinite(pct)) {
      return Math.max(1, Math.min(10_000, Math.floor(pct * 100)));
    }
  }
  return 10_000;
};

export const buildEntryTransaction = async ({
  connection,
  signerKeypair,
  recentBlockhash,
  intent,
  sellVariant = "primary"
}: BuildEntryTxInput) => {
  const payer = signerKeypair.publicKey;
  const mint = new PublicKey(intent.tokenMint);
  const hint = intent.bondingCurveHint ?? intent.launchSignal?.bondingCurve;

  // Optimistic ATA for sell — correct for ~99% of pump.fun tokens (standard TOKEN_PROGRAM_ID).
  const userAtaStd = getAssociatedTokenAddressSync(mint, payer, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  // Fire all independent reads in parallel: token program, bonding curve, and (sell) token balance.
  const [tokenProgram, { curve: bondingCurve, parsed: curveState, accountDataLength, inferredFlags }, rawBalanceStd] =
    await Promise.all([
      resolveTokenProgram(connection, mint),
      resolveBondingCurve(connection, mint, hint),
      intent.side === "sell"
        ? connection.getTokenAccountBalance(userAtaStd, "processed").then((b) => BigInt(b.value.amount)).catch(() => null)
        : Promise.resolve(null)
    ] as const);

  const creatorPk = curveState?.creator
    ? new PublicKey(curveState.creator)
    : intent.launchSignal?.creator
      ? new PublicKey(intent.launchSignal.creator)
      : (() => {
          throw new Error("missing-creator-for-creator-vault");
        })();
  const creatorVault = deriveCreatorVault(creatorPk);
  const feeRecipient = await resolveFeeRecipient(connection, Boolean(curveState?.isMayhemMode ?? inferredFlags?.isMayhemMode));
  const associatedBondingCurve = getAssociatedTokenAddressSync(
    mint,
    bondingCurve,
    true,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const userAta = getAssociatedTokenAddressSync(mint, payer, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
  const feeConfig = deriveFeeConfig();
  const globalVolumeAccumulator = deriveGlobalVolumeAccumulator();
  const userVolumeAccumulator = deriveUserVolumeAccumulator(payer);
  const bondingCurveV2 = deriveBondingCurveV2(mint);
  const breakingFeeRecipient = pickBreakingFeeRecipient(mint);

  const loadedAccountsLimitIx = setLoadedAccountsDataSizeLimitInstruction(16_384_000);
  const computeUnitLimitIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 220_000 });
  const computeUnitPriceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: Math.max(75_000, Math.floor(intent.tipLamports / 4))
  });
  const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    payer,
    userAta,
    payer,
    mint,
    tokenProgram,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  let sellDebug:
    | {
        variant: "primary" | "alternate";
        trackVolumeEncoding: "option-bool" | "bool";
        includesUserVolumeAccumulator: boolean;
      }
    | undefined;
  const tradeIx =
    intent.side === "buy"
      ? (() => {
          const priceSolPerToken =
            curveState && curveState.virtualTokenReserves > 0n && curveState.virtualSolReserves > 0n
              ? Number(curveState.virtualSolReserves) /
                LAMPORTS_PER_SOL /
                (Number(curveState.virtualTokenReserves) / 10 ** TOKEN_DECIMALS)
              : 0;
          const tokenAmountRaw =
            priceSolPerToken > 0
              ? BigInt(Math.max(1, Math.floor((intent.amountSol / priceSolPerToken) * 10 ** TOKEN_DECIMALS)))
              : BigInt(Math.max(1, Math.floor(intent.amountSol * 100_000)));
          const spendableSolInLamports = BigInt(Math.max(1, Math.floor(intent.amountSol * LAMPORTS_PER_SOL)));
          const minTokensOutRaw = BigInt(
            Math.max(1, Math.floor(Number(tokenAmountRaw) * (1 - intent.maxSlippageBps / 10_000)))
          );
          const data = Buffer.concat([
            BUY_EXACT_SOL_IN_DISCRIMINATOR,
            putU64(spendableSolInLamports),
            putU64(minTokensOutRaw),
            Buffer.from([1])
          ]);
          const keys = [
            { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
            { pubkey: feeRecipient, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: tokenProgram, isSigner: false, isWritable: false },
            { pubkey: creatorVault, isSigner: false, isWritable: true },
            { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: globalVolumeAccumulator, isSigner: false, isWritable: false },
            { pubkey: userVolumeAccumulator, isSigner: false, isWritable: true },
            { pubkey: feeConfig, isSigner: false, isWritable: false },
            { pubkey: PUMP_FEE_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
            { pubkey: breakingFeeRecipient, isSigner: false, isWritable: true }
          ];
          return new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data });
        })()
      : await (async () => {
          // rawBalanceStd was fetched in parallel above (valid for standard TOKEN_PROGRAM_ID ATAs).
          // For the rare TOKEN_2022 case the ATA address differs, so fall back to a fresh fetch.
          const rawBalance = tokenProgram.equals(TOKEN_2022_PROGRAM_ID)
            ? BigInt((await connection.getTokenAccountBalance(userAta, "processed")).value.amount)
            : (rawBalanceStd ?? (() => { throw new Error("no-token-balance-to-sell"); })());
          const sellPctBps = parseSellPercentBps(intent.amountOverride);
          const amountInRaw = (rawBalance * BigInt(sellPctBps)) / 10_000n;
          if (amountInRaw <= 0n) {
            throw new Error("no-token-balance-to-sell");
          }
          const priceSolPerToken =
            curveState && curveState.virtualTokenReserves > 0n && curveState.virtualSolReserves > 0n
              ? Number(curveState.virtualSolReserves) /
                LAMPORTS_PER_SOL /
                (Number(curveState.virtualTokenReserves) / 10 ** TOKEN_DECIMALS)
              : 0;
          const expectedSolOut =
            (Number(amountInRaw) / 10 ** TOKEN_DECIMALS) * Math.max(0, priceSolPerToken);
          // Use permissive sell floor to avoid false rejects from reserve drift / quote mismatch.
          const minSolLamports = 1n;
          const includesUserVolumeAccumulator = sellVariant === "primary"
            ? Boolean(curveState?.isCashbackCoin ?? inferredFlags?.isCashbackCoin)
            : false;
          const trackVolumeBytes = sellVariant === "primary" ? Buffer.from([1, 1]) : Buffer.from([1]);
          sellDebug = {
            variant: sellVariant,
            trackVolumeEncoding: sellVariant === "primary" ? "option-bool" : "bool",
            includesUserVolumeAccumulator
          };
          const data = Buffer.concat([SELL_DISCRIMINATOR, putU64(amountInRaw), putU64(minSolLamports), trackVolumeBytes]);
          const keys = [
            { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
            { pubkey: feeRecipient, isSigner: false, isWritable: true },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: bondingCurve, isSigner: false, isWritable: true },
            { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
            { pubkey: userAta, isSigner: false, isWritable: true },
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: creatorVault, isSigner: false, isWritable: true },
            { pubkey: tokenProgram, isSigner: false, isWritable: false },
            { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
            { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false },
            { pubkey: feeConfig, isSigner: false, isWritable: false },
            { pubkey: PUMP_FEE_PROGRAM, isSigner: false, isWritable: false },
            ...(includesUserVolumeAccumulator
              ? [{ pubkey: userVolumeAccumulator, isSigner: false, isWritable: true }]
              : []),
            { pubkey: bondingCurveV2, isSigner: false, isWritable: false },
            { pubkey: breakingFeeRecipient, isSigner: false, isWritable: true }
          ];
          return new TransactionInstruction({ programId: PUMP_PROGRAM, keys, data });
        })();

  const extendAccountIx = intent.side === "buy" && accountDataLength > 0 && accountDataLength < 150
    ? buildExtendAccountInstruction(bondingCurve, payer)
    : null;
  const instructions =
    intent.side === "buy"
      ? [
          loadedAccountsLimitIx,
          computeUnitLimitIx,
          computeUnitPriceIx,
          ...(extendAccountIx ? [extendAccountIx] : []),
          createAtaIx,
          tradeIx
        ]
      : [computeUnitPriceIx, ...(extendAccountIx ? [extendAccountIx] : []), tradeIx];
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash,
    instructions
  }).compileToV0Message();
  const tx = new VersionedTransaction(messageV0);
  tx.sign([signerKeypair]);
  return {
    serialized: tx.serialize(),
    signature: tx.signatures[0] ? Buffer.from(tx.signatures[0]).toString("base64") : undefined,
    debug: {
      side: intent.side,
      sell: sellDebug
    }
  };
};
