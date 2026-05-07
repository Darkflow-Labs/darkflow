import type { PriceTick } from "@darkflow/engine/solana/ingest";
import type { ClosedPosition, Position } from "../types/domain.js";

type ExitEngineConfig = {
  stopLossBps: number;
  exitArmingDelayMs: number;
  takeProfitMinBps: number;
  takeProfitMaxBps: number;
  trailingStopBps: number;
  maxHoldMs: number;
  maxSourceDivergenceBps: number;
  externalGraceMs: number;
  assumedExitSlippageBps: number;
  baseExecutionFrictionBps: number;
  earlyFastFailStopLossRatioBps: number;
  earlyFastFailStopLossMinBps: number;
};

type EvaluateInput = {
  position: Position;
  tick: PriceTick;
  externalTick?: PriceTick;
  now: number;
};

export type ExitDecision = {
  shouldExit: boolean;
  reason?: ClosedPosition["reason"];
  pnlBps?: number;
  deferredByDivergence?: boolean;
};

export class ExitEngine {
  private readonly config: ExitEngineConfig;

  public constructor(config: ExitEngineConfig) {
    this.config = config;
  }

  public evaluate({ position, tick, externalTick, now }: EvaluateInput): ExitDecision {
    const pnlBps = this.computePnlBps(position.entryPriceSol, tick.priceSol);
    const effectivePnlBps = pnlBps - this.estimatedRoundTripCostBps(position);
    const drawdownFromHighBps = this.computePnlBps(position.highestObservedPrice, tick.priceSol);
    const timeInPositionMs = now - position.openedAt;
    const isStopLossArmed = timeInPositionMs >= this.config.exitArmingDelayMs;
    const earlyFastFailStopLossBps = Math.max(
      this.config.earlyFastFailStopLossMinBps,
      Math.floor((this.config.stopLossBps * this.config.earlyFastFailStopLossRatioBps) / 10_000)
    );

    if (this.shouldDeferForDivergence(tick, externalTick, now)) {
      return { shouldExit: false, deferredByDivergence: true };
    }

    if (isStopLossArmed && effectivePnlBps <= -this.config.stopLossBps) {
      return { shouldExit: true, reason: "stop-loss", pnlBps: effectivePnlBps };
    }
    if (!isStopLossArmed && effectivePnlBps <= -earlyFastFailStopLossBps) {
      return { shouldExit: true, reason: "stop-loss", pnlBps: effectivePnlBps };
    }

    if (effectivePnlBps >= this.config.takeProfitMaxBps) {
      return { shouldExit: true, reason: "take-profit", pnlBps: effectivePnlBps };
    }

    if (
      effectivePnlBps >= this.config.takeProfitMinBps &&
      drawdownFromHighBps <= -this.config.trailingStopBps
    ) {
      return { shouldExit: true, reason: "trailing-stop", pnlBps: effectivePnlBps };
    }

    if (now - position.openedAt >= this.config.maxHoldMs) {
      return { shouldExit: true, reason: "max-hold", pnlBps: effectivePnlBps };
    }

    return { shouldExit: false };
  }

  private shouldDeferForDivergence(primaryTick: PriceTick, externalTick: PriceTick | undefined, now: number) {
    if (!externalTick) {
      return false;
    }
    if (now - externalTick.receivedAt > this.config.externalGraceMs) {
      return false;
    }
    const divergence = Math.abs(this.computePnlBps(primaryTick.priceSol, externalTick.priceSol));
    return divergence > this.config.maxSourceDivergenceBps;
  }

  private computePnlBps(entryPrice: number, currentPrice: number) {
    if (entryPrice <= 0) {
      return 0;
    }
    return Math.floor(((currentPrice - entryPrice) / entryPrice) * 10_000);
  }

  private estimatedRoundTripCostBps(position: Position) {
    return (
      Math.max(0, position.expectedEntrySlippageBps) +
      Math.max(0, this.config.assumedExitSlippageBps) +
      Math.max(0, this.config.baseExecutionFrictionBps)
    );
  }
}
