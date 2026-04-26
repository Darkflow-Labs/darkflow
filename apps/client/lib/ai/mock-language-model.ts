import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import type { PresentTerminalInput } from "@/lib/ai/schema";

const emptyUsage = {
  inputTokens: {
    total: 0,
    noCache: 0,
    cacheRead: 0,
    cacheWrite: 0,
  },
  outputTokens: {
    total: 0,
    text: 0,
    reasoning: 0,
  },
} as const;

export const createMockTerminalModel = (payload: PresentTerminalInput) => {
  const inputJson = JSON.stringify(payload);
  return new MockLanguageModelV3({
    provider: "darkflow-mock",
    modelId: "terminal-mock-v1",
    doStream: async () => {
      const chunks: LanguageModelV3StreamPart[] = [
        { type: "stream-start", warnings: [] },
        {
          type: "tool-call",
          toolCallId: `tc_${Date.now()}`,
          toolName: "present_terminal",
          input: inputJson,
        },
        {
          type: "finish",
          usage: emptyUsage,
          finishReason: { unified: "tool-calls" as const, raw: "tool-calls" },
        },
      ];
      return {
        stream: simulateReadableStream({
          chunks,
          chunkDelayInMs: 28,
          initialDelayInMs: 40,
        }),
      };
    },
  });
};
