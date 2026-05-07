import type { ExecutionResult, Position, TradeIntent } from "../../../core/types/domain.js";
import { ExecutionEngine } from "./executionEngine.js";

type ExitExecutorInput = {
  executionEngine: ExecutionEngine;
  maxSlippageBps: number;
  baseTipLamports: number;
};

export class ExitExecutor {
  private readonly executionEngine: ExecutionEngine;
  private readonly maxSlippageBps: number;
  private readonly baseTipLamports: number;

  public constructor({ executionEngine, maxSlippageBps, baseTipLamports }: ExitExecutorInput) {
    this.executionEngine = executionEngine;
    this.maxSlippageBps = maxSlippageBps;
    this.baseTipLamports = baseTipLamports;
  }

  public async execute(position: Position, sellPctBps = 10_000): Promise<ExecutionResult> {
    const sellPct = Math.max(1, Math.min(10_000, sellPctBps));
    const percentString = `${(sellPct / 100).toFixed(2).replace(/\.00$/, "")}%`;
    const intent: TradeIntent = {
      tokenMint: position.tokenMint,
      side: "sell",
      amountSol: position.entrySol,
      amountOverride: percentString,
      bondingCurveHint: position.bondingCurve,
      denominatedInQuote: false,
      maxSlippageBps: this.maxSlippageBps,
      tipLamports: this.baseTipLamports
    };
    return this.executionEngine.execute(intent);
  }
}
