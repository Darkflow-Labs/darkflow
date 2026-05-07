import { readFile } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../telemetry/logger.js";
import { ReplayEngine } from "./replayEngine.js";
import type { ReplayEvent } from "../types/domain.js";

const logger = createLogger({ component: "replay", level: "info" });

const run = async () => {
  const fixturePath = path.resolve(process.cwd(), "test/replay/fixtures.json");
  const fixtureRaw = await readFile(fixturePath, "utf8");
  const events = JSON.parse(fixtureRaw) as ReplayEvent[];
  const replay = new ReplayEngine({ events, speedMultiplier: 5, logger });

  await replay.run({
    onLaunch: (event) => {
      logger.info({ event }, "Replay launch event");
    },
    onPrice: (event) => {
      logger.debug({ event }, "Replay price event");
    }
  });

  const simulationSummary = replay.simulateClosedLoop();
  logger.info({ simulationSummary }, "Replay closed-loop expectancy summary.");
};

run().catch((error: unknown) => {
  logger.error({ error }, "Replay runner failed.");
  process.exitCode = 1;
});
