import type { PresentTerminalInput } from "@/lib/ai/schema";
import { getTokens } from "@/lib/data/mockData";

const lastUserText = (messages: unknown): string => {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: string; parts?: unknown };
    if (m?.role !== "user" || !Array.isArray(m.parts)) continue;
    const text = m.parts
      .filter(
        (p): p is { type: string; text?: string } =>
          typeof p === "object" && p !== null && "type" in p,
      )
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (text) return text;
  }
  return "";
};

export const buildMockTerminalPayload = (
  messages: unknown,
): PresentTerminalInput => {
  const q = lastUserText(messages).toLowerCase();
  const pool = getTokens();
  const pick = (sym: string) => pool.find((t) => t.symbol === sym);

  if (q.includes("sol") || q.includes("solana")) {
    const t = pick("SOL") ?? pool[0];
    return {
      message:
        "Solana spot is bid-heavy in this mock tape. Flow favors continuation unless perp funding flips hard negative.",
      tokens: [t, ...(pool.filter((x) => x.symbol !== t.symbol).slice(0, 2))],
    };
  }

  if (q.includes("meme") || q.includes("bonk") || q.includes("wif")) {
    return {
      message:
        "Meme basket is running hot with elevated variance. Size smaller and lean on liquidity pockets.",
      tokens: pool.filter((x) => ["BONK", "WIF"].includes(x.symbol)),
    };
  }

  if (q.includes("risk") || q.includes("safe")) {
    return {
      message:
        "If you want lower beta, stick to majors and watch depth instead of social momentum.",
      tokens: pool.filter((x) => x.risk === "Low" || x.symbol === "SOL"),
    };
  }

  return {
    message:
      "Here is a quick pulse on the mock watchlist. Tap a card to load the chart in Trade mode.",
    tokens: pool.slice(0, 3),
  };
};
