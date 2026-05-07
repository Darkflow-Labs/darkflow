import "dotenv/config";
import { createRequire } from "node:module";
import type { CommitmentLevel as CommitmentLevelType, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import type { ClientDuplexStream } from "@grpc/grpc-js";

const _require = createRequire(import.meta.url);
const { default: Client, CommitmentLevel } = _require("@triton-one/yellowstone-grpc") as {
  default: new (endpoint: string, xToken?: string, channelOptions?: unknown) => {
    subscribe(): Promise<ClientDuplexStream<SubscribeRequest, SubscribeUpdate>>;
  };
  CommitmentLevel: typeof CommitmentLevelType;
};

const endpoint = process.env.ONYX_GRPC_ENDPOINT;
const token = process.env.ONYX_GRPC_X_TOKEN;
const programId = process.env.ONYX_NEW_LAUNCH_PROGRAM_ID ?? "";

if (!endpoint) {
  console.error("Missing ONYX_GRPC_ENDPOINT");
  process.exit(1);
}
if (!token) {
  console.error("Missing ONYX_GRPC_X_TOKEN");
  process.exit(1);
}

const client = new Client(endpoint, token, undefined);
const startedAt = Date.now();
console.log(`[grpc-smoke] endpoint=${endpoint}`);

try {
  const stream = await client.subscribe();
  console.log(`[grpc-smoke] subscribe open in ${Date.now() - startedAt}ms`);

  let messageCount = 0;
  stream.on("data", () => {
    messageCount += 1;
    if (messageCount === 1) {
      console.log(`[grpc-smoke] first message in ${Date.now() - startedAt}ms`);
    }
  });
  stream.on("error", (error: unknown) => {
    console.error("[grpc-smoke] stream error", error);
    process.exit(1);
  });
  stream.on("end", () => {
    console.log("[grpc-smoke] stream ended");
    process.exit(0);
  });
  stream.on("close", () => {
    console.log("[grpc-smoke] stream closed");
    process.exit(0);
  });

  stream.write({
    slots: {},
    accounts: {},
    transactions: {
      pumpfun: {
        vote: false,
        failed: false,
        accountInclude: programId ? [programId] : [],
        accountExclude: [],
        accountRequired: []
      }
    },
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    commitment: CommitmentLevel.FINALIZED,
    entry: {},
    transactionsStatus: {}
  });

  setTimeout(() => {
    console.log(`[grpc-smoke] timeout — ${messageCount} messages in ${Date.now() - startedAt}ms`);
    process.exit(messageCount > 0 ? 0 : 2);
  }, 35_000);
} catch (error) {
  console.error("[grpc-smoke] subscribe failed", error);
  process.exit(1);
}
