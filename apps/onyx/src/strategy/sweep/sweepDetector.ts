import type { PriceTick } from "@darkflow/engine/solana/ingest";

export type SweepProfile = "safer" | "aggressive";

export type SweepDetectorConfig = {
  profile: SweepProfile;
  minMoonMomentumBps: number;
  moonWindowMs: number;
  minMoonTicks: number;
  minMoonBuyRatioBps: number;
  minDipBps: number;
  maxDipBps: number;
  minStabilizationMs: number;
  reversalBuyRatioBps: number;
  reversalMinTicks: number;
  maxWatchMs: number;
  minPriceFloorSol: number;
};

export type SweepState =
  | "watching"
  | "qualified"
  | "dipped"
  | "stabilizing"
  | "armed"
  | "triggered"
  | "invalidated";

type MintState = {
  tokenMint: string;
  state: SweepState;
  firstSeenAt: number;
  qualifiedAt?: number;
  dipSeenAt?: number;
  stabilizationStartedAt?: number;
  armSeenAt?: number;
  lastUpdatedAt: number;
  athPriceSol: number;
  localLowPriceSol: number;
  prices: Array<{ ts: number; priceSol: number }>;
  buyTicks: number[];
  sellTicks: number[];
  triggerCount: number;
};

export type SweepSignal = {
  tokenMint: string;
  detectedAt: number;
  state: SweepState;
  dipFromAthBps: number;
  momentumBps: number;
  buyRatioBps: number;
};

export class SweepDetector {
  private readonly config: SweepDetectorConfig;
  private readonly mintStates = new Map<string, MintState>();

  public constructor(config: SweepDetectorConfig) {
    this.config = config;
  }

  public processTick(tick: PriceTick): SweepSignal | undefined {
    const state = this.getOrCreateState(tick);
    state.lastUpdatedAt = tick.receivedAt;
    state.prices.push({ ts: tick.receivedAt, priceSol: tick.priceSol });
    this.recordFlowTick(state, tick);
    this.pruneWindows(state, tick.receivedAt);

    if (tick.priceSol < this.config.minPriceFloorSol) {
      state.state = "invalidated";
      return undefined;
    }
    if (tick.priceSol > state.athPriceSol) {
      state.athPriceSol = tick.priceSol;
    }
    state.localLowPriceSol = Math.min(state.localLowPriceSol, tick.priceSol);

    if (tick.receivedAt - state.firstSeenAt > this.config.maxWatchMs) {
      state.state = "invalidated";
      return undefined;
    }

    const momentumBps = this.computeMomentumBps(state);
    const buyRatioBps = this.computeBuyRatioBps(state);
    const dipFromAthBps = this.computeDipFromAthBps(state, tick.priceSol);
    const totalTicks = state.buyTicks.length + state.sellTicks.length;

    if (state.state === "watching") {
      const moonQualified =
        totalTicks >= this.config.minMoonTicks &&
        momentumBps >= this.config.minMoonMomentumBps &&
        buyRatioBps >= this.config.minMoonBuyRatioBps;
      if (moonQualified) {
        state.state = "qualified";
        state.qualifiedAt = tick.receivedAt;
      }
      return undefined;
    }

    if (state.state === "qualified") {
      if (dipFromAthBps >= this.config.minDipBps && dipFromAthBps <= this.config.maxDipBps) {
        state.state = "dipped";
        state.dipSeenAt = tick.receivedAt;
        state.stabilizationStartedAt = tick.receivedAt;
        state.localLowPriceSol = tick.priceSol;
      } else if (dipFromAthBps > this.config.maxDipBps) {
        state.state = "invalidated";
      }
      return undefined;
    }

    if (state.state === "dipped" || state.state === "stabilizing") {
      const localLowBreak = tick.priceSol < state.localLowPriceSol;
      if (localLowBreak) {
        state.localLowPriceSol = tick.priceSol;
        state.stabilizationStartedAt = tick.receivedAt;
        state.state = "stabilizing";
        return undefined;
      }
      const stabilizedForMs = tick.receivedAt - (state.stabilizationStartedAt ?? tick.receivedAt);
      if (stabilizedForMs >= this.config.minStabilizationMs) {
        state.state = "armed";
        state.armSeenAt = tick.receivedAt;
      } else {
        state.state = "stabilizing";
      }
      return undefined;
    }

    if (state.state === "armed") {
      const hasReversalFlow =
        totalTicks >= this.config.reversalMinTicks &&
        buyRatioBps >= this.config.reversalBuyRatioBps;
      const bouncedFromLowBps = this.computeBounceFromLowBps(state, tick.priceSol);
      const stillInDipBand = dipFromAthBps >= this.config.minDipBps && dipFromAthBps <= this.config.maxDipBps;
      if (hasReversalFlow && bouncedFromLowBps >= 100 && stillInDipBand) {
        state.state = "triggered";
        state.triggerCount += 1;
        return {
          tokenMint: tick.tokenMint,
          detectedAt: tick.receivedAt,
          state: state.state,
          dipFromAthBps,
          momentumBps,
          buyRatioBps
        };
      }
      if (dipFromAthBps > this.config.maxDipBps) {
        state.state = "invalidated";
      }
    }
    return undefined;
  }

  public evictExpired(now: number) {
    for (const [mint, state] of this.mintStates.entries()) {
      if (now - state.lastUpdatedAt > this.config.maxWatchMs || state.state === "invalidated") {
        this.mintStates.delete(mint);
      }
    }
  }

  private getOrCreateState(tick: PriceTick) {
    const existing = this.mintStates.get(tick.tokenMint);
    if (existing) {
      return existing;
    }
    const created: MintState = {
      tokenMint: tick.tokenMint,
      state: "watching",
      firstSeenAt: tick.receivedAt,
      lastUpdatedAt: tick.receivedAt,
      athPriceSol: tick.priceSol,
      localLowPriceSol: tick.priceSol,
      prices: [],
      buyTicks: [],
      sellTicks: [],
      triggerCount: 0
    };
    this.mintStates.set(tick.tokenMint, created);
    return created;
  }

  private recordFlowTick(state: MintState, tick: PriceTick) {
    const eventType = (tick.eventType ?? "").toLowerCase();
    if (eventType.includes("buy")) {
      state.buyTicks.push(tick.receivedAt);
      return;
    }
    if (eventType.includes("sell")) {
      state.sellTicks.push(tick.receivedAt);
    }
  }

  private pruneWindows(state: MintState, now: number) {
    const minTs = now - this.config.moonWindowMs;
    state.prices = state.prices.filter((entry) => entry.ts >= minTs);
    state.buyTicks = state.buyTicks.filter((ts) => ts >= minTs);
    state.sellTicks = state.sellTicks.filter((ts) => ts >= minTs);
  }

  private computeMomentumBps(state: MintState) {
    const first = state.prices[0];
    const last = state.prices[state.prices.length - 1];
    if (!first || !last || first.priceSol <= 0) {
      return 0;
    }
    return Math.floor(((last.priceSol - first.priceSol) / first.priceSol) * 10_000);
  }

  private computeBuyRatioBps(state: MintState) {
    const total = state.buyTicks.length + state.sellTicks.length;
    if (total === 0) {
      return 0;
    }
    return Math.floor((state.buyTicks.length * 10_000) / total);
  }

  private computeDipFromAthBps(state: MintState, currentPriceSol: number) {
    if (state.athPriceSol <= 0) {
      return 0;
    }
    return Math.floor(((state.athPriceSol - currentPriceSol) / state.athPriceSol) * 10_000);
  }

  private computeBounceFromLowBps(state: MintState, currentPriceSol: number) {
    if (state.localLowPriceSol <= 0) {
      return 0;
    }
    return Math.floor(((currentPriceSol - state.localLowPriceSol) / state.localLowPriceSol) * 10_000);
  }
}
