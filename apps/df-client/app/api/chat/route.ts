import { openai } from "@ai-sdk/openai";
import { frontendTools } from "@assistant-ui/react-ai-sdk";
import {
  convertToModelMessages,
  streamText,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { DARKFLOW_SYSTEM } from "@/lib/ai/prompt";
import { presentTerminalSchema } from "@/lib/ai/schema";
import { buildMockTerminalPayload } from "@/lib/ai/build-mock-terminal";
import { createMockTerminalModel } from "@/lib/ai/mock-language-model";

export const maxDuration = 30;

const presentTerminal = tool({
  description:
    "Emit the structured terminal payload shown as token cards in the UI.",
  inputSchema: presentTerminalSchema,
  execute: async (input) => input,
});

export const POST = async (req: Request) => {
  const {
    messages,
    system,
    tools,
  }: {
    messages: UIMessage[];
    system?: string;
    tools?: Record<string, unknown>;
  } = await req.json();

  const mergedSystem = [DARKFLOW_SYSTEM, system].filter(Boolean).join("\n\n");

  const useOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const model = useOpenAI
    ? openai("gpt-4o-mini")
    : createMockTerminalModel(buildMockTerminalPayload(messages));

  const result = streamText({
    model,
    system: mergedSystem,
    messages: await convertToModelMessages(messages),
    tools: {
      ...frontendTools(
        (tools ?? {}) as Parameters<typeof frontendTools>[0],
      ),
      present_terminal: presentTerminal,
    },
    toolChoice: useOpenAI
      ? "auto"
      : { type: "tool", toolName: "present_terminal" },
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse();
};
