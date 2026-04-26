import { z } from "zod";

export const riskSchema = z.enum(["Low", "Medium", "High"]);

export const terminalTokenSchema = z.object({
  symbol: z.string().min(1).max(16),
  price: z.number().nonnegative(),
  change: z.string(),
  reason: z.string(),
  risk: riskSchema,
});

export const presentTerminalSchema = z.object({
  message: z.string(),
  tokens: z.array(terminalTokenSchema).min(1).max(12),
});

export type PresentTerminalInput = z.infer<typeof presentTerminalSchema>;
export type TerminalToken = z.infer<typeof terminalTokenSchema>;
export type RiskLevel = z.infer<typeof riskSchema>;
