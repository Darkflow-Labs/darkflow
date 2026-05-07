import { DarkflowGeyserError } from "../errors.js";
import type { GeyserEvent, GeyserLaunchEvent, GeyserTickEvent } from "../types.js";

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object";

const parseLaunch = (payload: Record<string, unknown>): GeyserLaunchEvent => {
  if (
    payload.v !== 1 ||
    payload.type !== "launch" ||
    typeof payload.signature !== "string" ||
    typeof payload.tokenMint !== "string" ||
    typeof payload.creator !== "string" ||
    typeof payload.slot !== "number" ||
    typeof payload.source !== "string" ||
    typeof payload.receivedAt !== "number"
  ) {
    throw new DarkflowGeyserError("Invalid launch payload", "INVALID_LAUNCH_PAYLOAD", payload);
  }
  return payload as unknown as GeyserLaunchEvent;
};

const parseTick = (payload: Record<string, unknown>): GeyserTickEvent => {
  if (
    payload.v !== 1 ||
    payload.type !== "tick" ||
    typeof payload.tokenMint !== "string" ||
    typeof payload.priceSol !== "number" ||
    typeof payload.source !== "string" ||
    typeof payload.receivedAt !== "number"
  ) {
    throw new DarkflowGeyserError("Invalid tick payload", "INVALID_TICK_PAYLOAD", payload);
  }
  return payload as unknown as GeyserTickEvent;
};

export const parseGeyserMessage = (raw: string): GeyserEvent => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DarkflowGeyserError("Invalid JSON frame", "INVALID_JSON_FRAME", { raw });
  }
  if (!isObject(parsed)) {
    throw new DarkflowGeyserError("Unexpected frame shape", "INVALID_FRAME_SHAPE", { parsed });
  }
  if (parsed.type === "launch") {
    return parseLaunch(parsed);
  }
  if (parsed.type === "tick") {
    return parseTick(parsed);
  }
  throw new DarkflowGeyserError("Unknown geyser event type", "UNKNOWN_EVENT_TYPE", parsed);
};
