import type { LaunchSignal } from "../types/domain.js";

export type LaunchHandler = (signal: LaunchSignal) => void;

/**
 * Normalized subscription surface for launch discovery (gRPC, DRPC logs, or custom sources).
 */
export type LaunchSignalSource = {
  onLaunch(handler: LaunchHandler): void;
  start(): void;
  stop(): void;
};
