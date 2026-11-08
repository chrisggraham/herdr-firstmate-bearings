import { test } from "node:test";
import assert from "node:assert/strict";
import { formatLine, appendLine } from "../mods/firstmate-bearings/log.js";

const when = new Date("2026-01-01T00:00:00.000Z");

test("a line has the time, the source and the first line of the message", () => {
  assert.equal(formatLine(when, "fetch", new Error("exit code 1\nmore detail")), "2026-01-01T00:00:00.000Z fetch: exit code 1");
  assert.equal(formatLine(when, "config", "plain text"), "2026-01-01T00:00:00.000Z config: plain text");
});

test("a long message is cut short", () => {
  assert.ok(formatLine(when, "fetch", "x".repeat(500)).length < 260);
});

test("appending keeps only the newest lines", () => {
  let text = null;
  for (let i = 0; i < 250; i++) text = appendLine(text, `line ${i}`);
  const lines = text.trim().split("\n");
  assert.equal(lines.length, 200);
  assert.equal(lines.at(-1), "line 249");
  assert.equal(lines[0], "line 50");
});
