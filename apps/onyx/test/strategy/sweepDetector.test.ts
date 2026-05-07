import test from "node:test";
import assert from "node:assert/strict";
import { SweepDetector } from "../../src/strategy/sweep/sweepDetector.js";
import type { PriceTick } from "@darkflow/engine/solana/ingest";

const makeTick = (receivedAt: number, priceSol: number, eventType: string): PriceTick => ({
  tokenMint: "mint-1",
  priceSol,
  receivedAt,
  source: "drpc-primary",
  eventType
});

test("SweepDetector triggers after moon, dip, stabilization, and reversal", () => {
  const detector = new SweepDetector({
    profile: "safer",
    minMoonMomentumBps: 3000,
    moonWindowMs: 30_000,
    minMoonTicks: 6,
    minMoonBuyRatioBps: 6000,
    minDipBps: 2000,
    maxDipBps: 5000,
    minStabilizationMs: 2000,
    reversalBuyRatioBps: 6500,
    reversalMinTicks: 4,
    maxWatchMs: 120_000,
    minPriceFloorSol: 0.00000001
  });

  const ticks: PriceTick[] = [
    makeTick(1_000, 1.0, "buy"),
    makeTick(1_500, 1.1, "buy"),
    makeTick(2_000, 1.2, "buy"),
    makeTick(2_500, 1.3, "buy"),
    makeTick(3_000, 1.4, "sell"),
    makeTick(3_500, 1.45, "buy"),
    makeTick(4_000, 1.1, "sell"),
    makeTick(5_000, 1.08, "sell"),
    makeTick(7_200, 1.1, "buy"),
    makeTick(7_800, 1.12, "buy"),
    makeTick(8_500, 1.14, "buy")
  ];
  const signals = ticks.map((tick) => detector.processTick(tick)).filter(Boolean);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.tokenMint, "mint-1");
});

test("SweepDetector invalidates when dip exceeds max", () => {
  const detector = new SweepDetector({
    profile: "aggressive",
    minMoonMomentumBps: 2000,
    moonWindowMs: 30_000,
    minMoonTicks: 4,
    minMoonBuyRatioBps: 5000,
    minDipBps: 1500,
    maxDipBps: 3000,
    minStabilizationMs: 1000,
    reversalBuyRatioBps: 6000,
    reversalMinTicks: 3,
    maxWatchMs: 120_000,
    minPriceFloorSol: 0.00000001
  });

  detector.processTick(makeTick(1_000, 1.0, "buy"));
  detector.processTick(makeTick(1_500, 1.2, "buy"));
  detector.processTick(makeTick(2_000, 1.3, "buy"));
  detector.processTick(makeTick(2_500, 1.35, "buy"));
  detector.processTick(makeTick(3_000, 0.85, "sell"));
  const signal = detector.processTick(makeTick(3_500, 0.84, "sell"));
  assert.equal(signal, undefined);
});

test("SweepDetector does not trigger once dip is fully reclaimed", () => {
  const detector = new SweepDetector({
    profile: "safer",
    minMoonMomentumBps: 3000,
    moonWindowMs: 30_000,
    minMoonTicks: 6,
    minMoonBuyRatioBps: 6000,
    minDipBps: 2000,
    maxDipBps: 5000,
    minStabilizationMs: 2000,
    reversalBuyRatioBps: 6500,
    reversalMinTicks: 4,
    maxWatchMs: 120_000,
    minPriceFloorSol: 0.00000001
  });

  const ticks: PriceTick[] = [
    makeTick(1_000, 1.0, "buy"),
    makeTick(1_500, 1.1, "buy"),
    makeTick(2_000, 1.2, "buy"),
    makeTick(2_500, 1.3, "buy"),
    makeTick(3_000, 1.4, "buy"),
    makeTick(3_500, 1.45, "buy"),
    makeTick(4_000, 1.1, "sell"),
    makeTick(5_000, 1.08, "sell"),
    makeTick(7_200, 1.5, "buy"),
    makeTick(7_800, 1.52, "buy"),
    makeTick(8_500, 1.55, "buy")
  ];
  const signals = ticks.map((tick) => detector.processTick(tick)).filter(Boolean);
  assert.equal(signals.length, 0);
});
