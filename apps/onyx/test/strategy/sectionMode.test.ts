import test from "node:test";
import assert from "node:assert/strict";
import {
  allowsLaunchSource,
  allowsSweepDetectorSource,
  parseSectionModeFromArgv
} from "../../src/strategy/modes/sectionMode.js";

test("parseSectionModeFromArgv parses sniping mode", () => {
  const mode = parseSectionModeFromArgv(["--mode", "sniping"]);
  assert.equal(mode, "sniping");
  assert.equal(allowsLaunchSource(mode), true);
  assert.equal(allowsSweepDetectorSource(mode), false);
});

test("parseSectionModeFromArgv parses sweep mode", () => {
  const mode = parseSectionModeFromArgv(["--mode", "sweep"]);
  assert.equal(mode, "sweep");
  assert.equal(allowsLaunchSource(mode), false);
  assert.equal(allowsSweepDetectorSource(mode), true);
});

test("parseSectionModeFromArgv parses positional mode", () => {
  const mode = parseSectionModeFromArgv(["sweep"]);
  assert.equal(mode, "sweep");
});

test("parseSectionModeFromArgv throws on missing --mode", () => {
  assert.throws(() => parseSectionModeFromArgv([]), /Missing required mode/);
});

test("parseSectionModeFromArgv throws on invalid mode", () => {
  assert.throws(() => parseSectionModeFromArgv(["--mode", "invalid"]), /Invalid --mode value/);
});
