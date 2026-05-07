import type { Logger } from "pino";
import type { ReplayEvent } from "../types/domain.js";

type ReplayEngineInput = {
  events: ReplayEvent[];
  speedMultiplier?: number;
  logger: Logger;
};

type ReplayHandlers = {
  onLaunch: (event: ReplayEvent) => Promise<void> | void;
  onPrice: (event: ReplayEvent) => Promise<void> | void;
};

export type ReplaySimulationSummary = {
  launches: number;
  entries: number;
  exits: number;
  wins: number;
  losses: number;
  grossAlphaBps: number;
  impactCostBps: number;
  feeCostBps: number;
  slippageCostBps: number;
  netExpectancyBps: number;
};

export class ReplayEngine {
  private readonly events: ReplayEvent[];
  private readonly speedMultiplier: number;
  private readonly logger: Logger;

  public constructor({ events, speedMultiplier = 1, logger }: ReplayEngineInput) {
    this.events = [...events].sort((a, b) => a.timestamp - b.timestamp);
    this.speedMultiplier = speedMultiplier;
    this.logger = logger;
  }

  public async run(handlers: ReplayHandlers) {
    if (this.events.length === 0) {
      this.logger.warn("Replay skipped; no events provided.");
      return;
    }

    const startTimestamp = this.events[0]?.timestamp ?? 0;
    let previousTimestamp = startTimestamp;

    for (const event of this.events) {
      const gap = event.timestamp - previousTimestamp;
      const sleepMs = Math.max(0, Math.floor(gap / this.speedMultiplier));
      if (sleepMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }

      if (event.type === "launch") {
        await handlers.onLaunch(event);
      } else {
        await handlers.onPrice(event);
      }

      previousTimestamp = event.timestamp;
    }

    this.logger.info({ eventCount: this.events.length }, "Replay completed.");
  }

  public simulateClosedLoop(): ReplaySimulationSummary {
    let launches = 0;
    let entries = 0;
    let exits = 0;
    let wins = 0;
    let losses = 0;
    let grossAlphaBps = 0;
    let impactCostBps = 0;
    let feeCostBps = 0;
    let slippageCostBps = 0;

    const entryPriceByMint = new Map<string, number>();

    for (const event of this.events) {
      if (event.type === "launch") {
        launches += 1;
        continue;
      }
      if (event.priceSol === undefined) {
        continue;
      }
      const existingEntry = entryPriceByMint.get(event.tokenMint);
      if (existingEntry === undefined) {
        entryPriceByMint.set(event.tokenMint, event.priceSol);
        entries += 1;
        impactCostBps += 180;
        feeCostBps += 80;
        slippageCostBps += 420;
        continue;
      }

      const pnlBps = existingEntry > 0 ? Math.floor(((event.priceSol - existingEntry) / existingEntry) * 10_000) : 0;
      const netBps = pnlBps - 180 - 80 - 420;
      grossAlphaBps += pnlBps;
      exits += 1;
      if (netBps >= 0) {
        wins += 1;
      } else {
        losses += 1;
      }
      entryPriceByMint.delete(event.tokenMint);
    }

    const denominator = Math.max(1, exits);
    return {
      launches,
      entries,
      exits,
      wins,
      losses,
      grossAlphaBps: Number((grossAlphaBps / denominator).toFixed(2)),
      impactCostBps: Number((impactCostBps / Math.max(1, entries)).toFixed(2)),
      feeCostBps: Number((feeCostBps / Math.max(1, entries)).toFixed(2)),
      slippageCostBps: Number((slippageCostBps / Math.max(1, entries)).toFixed(2)),
      netExpectancyBps: Number(((grossAlphaBps - impactCostBps - feeCostBps - slippageCostBps) / denominator).toFixed(2))
    };
  }
}
