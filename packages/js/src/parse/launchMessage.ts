import { DarkflowParseError } from "../errors.js";
import type { LaunchMessage, LaunchSource } from "../types.js";

const LAUNCH_SOURCES = new Set<LaunchSource>(["drpc-logs", "grpc", "high-volume-lane", "sweep-detector"]);

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const parseLaunchMessage = (raw: string): LaunchMessage => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new DarkflowParseError("Launch message is not valid JSON", { preview: raw.slice(0, 200) });
  }

  if (!isRecord(parsed)) {
    throw new DarkflowParseError("Launch message must be a JSON object");
  }

  if (parsed.type !== "launch") {
    throw new DarkflowParseError('Expected type "launch"', { type: parsed.type });
  }

  const signature = parsed.signature;
  const tokenMint = parsed.tokenMint;
  const creator = parsed.creator;
  const receivedAt = parsed.receivedAt;
  const slot = parsed.slot;
  const source = parsed.source;

  if (typeof signature !== "string" || signature.length === 0) {
    throw new DarkflowParseError("Invalid or missing signature");
  }
  if (typeof tokenMint !== "string" || tokenMint.length === 0) {
    throw new DarkflowParseError("Invalid or missing tokenMint");
  }
  if (typeof creator !== "string" || creator.length === 0) {
    throw new DarkflowParseError("Invalid or missing creator");
  }
  if (typeof receivedAt !== "number" || !Number.isFinite(receivedAt)) {
    throw new DarkflowParseError("Invalid or missing receivedAt");
  }
  if (typeof slot !== "number" || !Number.isFinite(slot)) {
    throw new DarkflowParseError("Invalid or missing slot");
  }
  if (typeof source !== "string" || !LAUNCH_SOURCES.has(source as LaunchSource)) {
    throw new DarkflowParseError("Invalid or missing source", { source });
  }

  const msg: LaunchMessage = {
    type: "launch",
    signature,
    tokenMint,
    creator,
    receivedAt,
    slot,
    source: source as LaunchSource
  };

  if (typeof parsed.name === "string") {
    msg.name = parsed.name;
  }
  if (typeof parsed.symbol === "string") {
    msg.symbol = parsed.symbol;
  }
  if (typeof parsed.uri === "string") {
    msg.uri = parsed.uri;
  }
  if (typeof parsed.bondingCurve === "string") {
    msg.bondingCurve = parsed.bondingCurve;
  }
  if (typeof parsed.user === "string") {
    msg.user = parsed.user;
  }

  return msg;
};
