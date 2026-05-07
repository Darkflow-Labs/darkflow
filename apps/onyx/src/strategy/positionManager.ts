import type { ClosedPosition, Position } from "../types/domain.js";

type PositionManagerConfig = {
  stopLossBps: number;
  takeProfitBps: number;
  maxHoldMs: number;
};

export class PositionManager {
  private readonly config: PositionManagerConfig;
  private readonly openPositions = new Map<string, Position>();

  public constructor(config: PositionManagerConfig) {
    this.config = config;
  }

  public open(position: Position) {
    this.openPositions.set(position.tokenMint, position);
  }

  public getOpenPosition(tokenMint: string) {
    return this.openPositions.get(tokenMint);
  }

  public getOpenMints() {
    return [...this.openPositions.keys()];
  }

  public hasOpenPosition(tokenMint: string) {
    return this.openPositions.has(tokenMint);
  }

  public evaluateForExit(
    tokenMint: string,
    pnlBps: number,
    now: number,
    reason: ClosedPosition["reason"]
  ): ClosedPosition | undefined {
    const position = this.openPositions.get(tokenMint);
    if (!position) {
      return undefined;
    }
    return this.close(position, pnlBps, now, reason);
  }

  public updatePrice(tokenMint: string, priceSol: number, now = Date.now()) {
    const position = this.openPositions.get(tokenMint);
    if (!position) {
      return;
    }
    position.lastPrice = priceSol;
    position.lastUpdateAt = now;
    position.highestObservedPrice = Math.max(position.highestObservedPrice, priceSol);
    this.openPositions.set(tokenMint, position);
  }

  public markPartialTakeProfit(tokenMint: string, soldPctBps: number, now = Date.now()) {
    const position = this.openPositions.get(tokenMint);
    if (!position) {
      return undefined;
    }
    const remainingRatio = Math.max(0, 1 - soldPctBps / 10_000);
    position.entrySol = Number((position.entrySol * remainingRatio).toFixed(8));
    position.quantity = Number((position.quantity * remainingRatio).toFixed(8));
    position.partialTakeProfitCount += 1;
    position.lastUpdateAt = now;
    this.openPositions.set(tokenMint, position);
    return position;
  }

  public forceCloseAll(now = Date.now()): ClosedPosition[] {
    const closed: ClosedPosition[] = [];
    for (const position of this.openPositions.values()) {
      const pnlBps = position.entryPriceSol > 0
        ? Math.floor(((position.lastPrice - position.entryPriceSol) / position.entryPriceSol) * 10_000)
        : -50;
      closed.push(this.close(position, pnlBps, now, "kill-switch"));
    }
    return closed;
  }

  private close(
    position: Position,
    pnlBps: number,
    now: number,
    reason: ClosedPosition["reason"]
  ): ClosedPosition {
    this.openPositions.delete(position.tokenMint);
    return {
      ...position,
      exitTime: now,
      pnlBps,
      reason
    };
  }
}
