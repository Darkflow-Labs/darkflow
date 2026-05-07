type SourceHealthInput = {
  staleTimeoutMs: number;
};

export type SourceHealthSnapshot = {
  totalSignals: number;
  duplicateSignals: number;
  staleSignals: number;
  missRateBps: number;
  duplicateRateBps: number;
  staleRateBps: number;
  healthy: boolean;
};

export class SourceHealthTracker {
  private readonly staleTimeoutMs: number;
  private readonly signatures = new Set<string>();
  private totalSignals = 0;
  private duplicateSignals = 0;
  private staleSignals = 0;

  public constructor({ staleTimeoutMs }: SourceHealthInput) {
    this.staleTimeoutMs = staleTimeoutMs;
  }

  public record(signalSignature: string, signalAgeMs: number) {
    this.totalSignals += 1;
    if (this.signatures.has(signalSignature)) {
      this.duplicateSignals += 1;
    } else {
      this.signatures.add(signalSignature);
    }

    if (signalAgeMs > this.staleTimeoutMs) {
      this.staleSignals += 1;
    }
  }

  public snapshot(): SourceHealthSnapshot {
    const total = Math.max(1, this.totalSignals);
    const duplicateRateBps = Math.floor((this.duplicateSignals * 10_000) / total);
    const staleRateBps = Math.floor((this.staleSignals * 10_000) / total);

    return {
      totalSignals: this.totalSignals,
      duplicateSignals: this.duplicateSignals,
      staleSignals: this.staleSignals,
      // For single source v1 this is computed as stale signal ratio.
      missRateBps: staleRateBps,
      duplicateRateBps,
      staleRateBps,
      healthy: staleRateBps < 3000 && duplicateRateBps < 1500
    };
  }
}
