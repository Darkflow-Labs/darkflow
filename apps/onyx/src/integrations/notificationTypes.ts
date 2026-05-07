export type SnipeOpportunityPayload = {
  tokenMint: string;
  /** Present when quality-snipe gate ran; omitted when `ONYX_QUALITY_SNIPE_ENABLED` is false. */
  qualityScore?: number;
  qualityThreshold?: number;
  riskScore: number;
  edgeNetBps: number;
  source: string;
  creator?: string;
};

export type NotificationSink = {
  name: string;
  notifySnipeOpportunity(payload: SnipeOpportunityPayload): Promise<void>;
};
