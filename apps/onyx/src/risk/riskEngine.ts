import type { Logger } from "pino";
import type { LaunchSignal, RiskDecision, RugChecks } from "../types/domain.js";
import { RugSignalProvider } from "./rugSignalProvider.js";

type RiskEngineConfig = {
  maxSignalAgeMs: number;
  confidenceCooldownMs: number;
  maxTopHolderConcentrationBps: number;
  maxCreatorSupplyShareBps: number;
  maxCreatorRiskScore: number;
  maxSlippageBps: number;
  defaultSlippageBps: number;
  latencyDegradeMs: number;
};

type RiskEngineInput = {
  config: RiskEngineConfig;
  rugSignalProvider: RugSignalProvider;
  logger: Logger;
};

export class RiskEngine {
  private readonly config: RiskEngineConfig;
  private readonly rugSignalProvider: RugSignalProvider;
  private readonly logger: Logger;
  private readonly cooldownByCreator = new Map<string, number>();

  public constructor({ config, rugSignalProvider, logger }: RiskEngineInput) {
    this.config = config;
    this.rugSignalProvider = rugSignalProvider;
    this.logger = logger;
  }

  public async evaluate(launch: LaunchSignal): Promise<RiskDecision> {
    // Measure staleness at decision start; on-chain reads should not penalize signal freshness.
    const evaluationStartedAt = Date.now();
    const staleSignalMs = evaluationStartedAt - launch.receivedAt;
    const rugChecks = await this.rugSignalProvider.load(launch);
    const reasons = this.validateHardFails(launch.creator, staleSignalMs, rugChecks);

    const scoreBreakdown = this.computeRiskScoreBreakdown(staleSignalMs, rugChecks);
    const score = this.computeRiskScore(scoreBreakdown);
    const expectedSlippageBps = this.estimateSlippageBps(launch, staleSignalMs, rugChecks);

    if (expectedSlippageBps > this.config.maxSlippageBps) {
      reasons.push(
        `Expected slippage ${expectedSlippageBps} bps exceeds max ${this.config.maxSlippageBps} bps`
      );
    }

    const decision: RiskDecision = {
      passed: reasons.length === 0,
      reasons,
      score,
      staleSignalMs,
      expectedSlippageBps,
      creatorRiskScore: rugChecks.creatorRiskScore,
      creatorRiskUnknown: rugChecks.creatorRiskUnknown,
      scoreBreakdown
    };

    if (!decision.passed) {
      this.cooldownByCreator.set(launch.creator, Date.now() + this.config.confidenceCooldownMs);
    }

    this.logger.info(
      {
        launch: launch.tokenMint,
        creator: launch.creator,
        passed: decision.passed,
        score: decision.score,
        creatorRiskScore: decision.creatorRiskScore,
        creatorRiskUnknown: decision.creatorRiskUnknown,
        scoreBreakdown: decision.scoreBreakdown,
        reasons: decision.reasons
      },
      "Risk decision created."
    );

    return decision;
  }

  public updateRuntimeConfig(config: Partial<RiskEngineConfig>) {
    Object.assign(this.config, config);
  }

  private validateHardFails(creator: string, staleSignalMs: number, rugChecks: RugChecks) {
    const reasons: string[] = [];
    const cooldownUntil = this.cooldownByCreator.get(creator);
    if (cooldownUntil && cooldownUntil > Date.now()) {
      reasons.push(`Creator cooldown active for ${cooldownUntil - Date.now()}ms`);
    }

    if (staleSignalMs > this.config.maxSignalAgeMs) {
      reasons.push(`Stale launch signal (${staleSignalMs}ms > ${this.config.maxSignalAgeMs}ms)`);
    }

    if (!rugChecks.mintAuthorityRevoked) {
      reasons.push("Mint authority is still active.");
    }

    if (!rugChecks.freezeAuthorityRevoked) {
      reasons.push("Freeze authority is still active.");
    }

    if (rugChecks.topHoldersConcentrationBps > this.config.maxTopHolderConcentrationBps) {
      reasons.push(
        `Top holder concentration ${rugChecks.topHoldersConcentrationBps} bps exceeds threshold ${this.config.maxTopHolderConcentrationBps} bps`
      );
    }

    if (rugChecks.creatorSupplyShareBps > this.config.maxCreatorSupplyShareBps) {
      reasons.push(
        `Creator supply share ${rugChecks.creatorSupplyShareBps} bps exceeds threshold ${this.config.maxCreatorSupplyShareBps} bps`
      );
    }

    if (rugChecks.creatorRiskScore > this.config.maxCreatorRiskScore) {
      reasons.push(
        `Creator risk score ${rugChecks.creatorRiskScore} exceeds threshold ${this.config.maxCreatorRiskScore}`
      );
    }

    if (rugChecks.migrationState !== "bonding") {
      reasons.push(`Token state is ${rugChecks.migrationState}, expected bonding.`);
    }

    return reasons;
  }

  private computeRiskScoreBreakdown(staleSignalMs: number, rugChecks: RugChecks) {
    const stale = Math.round(Math.min(100, (staleSignalMs / Math.max(1, this.config.maxSignalAgeMs)) * 100));
    const concentration = Math.round(
      Math.min(100, (rugChecks.topHoldersConcentrationBps / Math.max(1, this.config.maxTopHolderConcentrationBps)) * 100)
    );
    const creatorSupply = Math.round(
      Math.min(100, (rugChecks.creatorSupplyShareBps / Math.max(1, this.config.maxCreatorSupplyShareBps)) * 100)
    );
    const creatorRisk = rugChecks.creatorRiskScore;
    const authority = (rugChecks.mintAuthorityRevoked ? 0 : 50) + (rugChecks.freezeAuthorityRevoked ? 0 : 50);
    const migration = rugChecks.migrationState === "bonding" ? 0 : 100;

    return {
      stale,
      concentration,
      creatorSupply,
      creatorRisk,
      authority,
      migration
    };
  }

  private computeRiskScore(scoreBreakdown: {
    stale: number;
    concentration: number;
    creatorSupply: number;
    creatorRisk: number;
    authority: number;
    migration: number;
  }) {
    const weighted =
      scoreBreakdown.stale * 0.1 +
      scoreBreakdown.concentration * 0.25 +
      scoreBreakdown.creatorSupply * 0.2 +
      scoreBreakdown.creatorRisk * 0.2 +
      scoreBreakdown.authority * 0.15 +
      scoreBreakdown.migration * 0.1;
    return Math.round(Math.max(0, Math.min(100, weighted)));
  }

  private estimateSlippageBps(launch: LaunchSignal, staleSignalMs: number, rugChecks: RugChecks) {
    const concentrationPressureBps = Math.floor(rugChecks.topHoldersConcentrationBps / 7);
    const creatorPressureBps = Math.floor(rugChecks.creatorSupplyShareBps / 5);
    const stalenessPressureBps = Math.floor((staleSignalMs / Math.max(1, this.config.maxSignalAgeMs)) * 450);
    const migrationPressureBps = rugChecks.migrationState === "bonding" ? 0 : 500;
    const authorityPressureBps =
      (rugChecks.mintAuthorityRevoked ? 0 : 250) + (rugChecks.freezeAuthorityRevoked ? 0 : 250);
    const latencyPressureBps = Math.floor((staleSignalMs / Math.max(1, this.config.latencyDegradeMs)) * 120);
    const base = this.config.defaultSlippageBps;
    return Math.min(
      this.config.maxSlippageBps + 500,
      base +
        concentrationPressureBps +
        creatorPressureBps +
        stalenessPressureBps +
        migrationPressureBps +
        authorityPressureBps +
        latencyPressureBps
    );
  }
}
