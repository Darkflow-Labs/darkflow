import type { NotificationSink, SnipeOpportunityPayload } from "./notificationTypes.js";

type DiscordWebhookSinkInput = {
  name?: string;
  webhookUrl: string;
};

const pumpFunCoinUrl = (mint: string) => `https://pump.fun/coin/${mint}`;

export const createDiscordWebhookSink = ({
  webhookUrl,
  name = "discord-webhook"
}: DiscordWebhookSinkInput): NotificationSink => ({
  name,
  notifySnipeOpportunity: async (payload: SnipeOpportunityPayload) => {
    const qualityLine =
      payload.qualityScore !== undefined && payload.qualityThreshold !== undefined
        ? `Quality: **${payload.qualityScore}** / min **${payload.qualityThreshold}**`
        : "Quality snipe gate: **disabled** (passed viability + risk only)";
    const body = {
      content: null,
      embeds: [
        {
          title: "Onyx — snipe-worthy signal",
          url: pumpFunCoinUrl(payload.tokenMint),
          color: 0x5865f2,
          fields: [
            { name: "Mint", value: `\`${payload.tokenMint}\``, inline: false },
            { name: "Source", value: payload.source, inline: true },
            { name: "Risk score", value: String(payload.riskScore), inline: true },
            { name: "Edge net (bps)", value: String(payload.edgeNetBps), inline: true },
            {
              name: "Quality",
              value: qualityLine,
              inline: false
            },
            ...(payload.creator
              ? [{ name: "Creator", value: `\`${payload.creator}\``, inline: false }]
              : [])
          ],
          timestamp: new Date().toISOString()
        }
      ]
    };
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Discord webhook failed: ${res.status} ${text}`.trim());
    }
  }
});
