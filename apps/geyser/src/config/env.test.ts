import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

describe("geyser env schema", () => {
  it("requires upstream endpoint for core role", () => {
    process.env.GEYSER_ROLE = "core";
    process.env.GEYSER_PROGRAM_ID = "program";
    process.env.GEYSER_REDIS_ADAPTER = "redis";
    process.env.GEYSER_REDIS_URL = "redis://localhost:6379";
    delete process.env.GEYSER_UPSTREAM_ENDPOINT;
    expect(() => loadEnv()).toThrow();
  });

  it("allows edge role without upstream endpoint", () => {
    process.env.GEYSER_ROLE = "edge";
    process.env.GEYSER_PROGRAM_ID = "program";
    process.env.GEYSER_REDIS_ADAPTER = "redis";
    process.env.GEYSER_REDIS_URL = "redis://localhost:6379";
    delete process.env.GEYSER_UPSTREAM_ENDPOINT;
    const env = loadEnv();
    expect(env.GEYSER_ROLE).toBe("edge");
  });
});
