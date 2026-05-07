import { describe, expect, it } from "vitest";
import { DarkflowParseError } from "../errors.js";
import { parseLaunchMessage } from "./launchMessage.js";

describe("parseLaunchMessage", () => {
  it("parses a valid launch DTO", () => {
    const raw = JSON.stringify({
      type: "launch",
      signature: "sig",
      tokenMint: "mint",
      creator: "cr",
      receivedAt: 1,
      slot: 2,
      source: "drpc-logs",
      name: "n"
    });
    const msg = parseLaunchMessage(raw);
    expect(msg.type).toBe("launch");
    expect(msg.tokenMint).toBe("mint");
    expect(msg.name).toBe("n");
  });

  it("rejects invalid source", () => {
    const raw = JSON.stringify({
      type: "launch",
      signature: "sig",
      tokenMint: "mint",
      creator: "cr",
      receivedAt: 1,
      slot: 2,
      source: "unknown"
    });
    expect(() => parseLaunchMessage(raw)).toThrow(DarkflowParseError);
  });

  it("rejects non-launch type", () => {
    expect(() => parseLaunchMessage(JSON.stringify({ type: "other" }))).toThrow(DarkflowParseError);
  });
});
