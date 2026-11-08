import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskRecord, parseToon } from "../mods/firstmate-bearings/toon.js";

const SHOW = [
  "task:",
  "  id: demo-task",
  '  title: "Captain: Set up the widget (priority)"',
  "  state: queued",
  "  held: yes",
  '  hold_until: "-"',
  '  body: "First line\\nSecond \\"quoted\\" line"',
  '  empty: ""',
  "  deps: none",
].join("\n");

test("a show record gives its keys with bare and quoted values", () => {
  const record = parseTaskRecord(SHOW);
  assert.equal(record.id, "demo-task");
  assert.equal(record.title, "Captain: Set up the widget (priority)");
  assert.equal(record.hold_until, "-");
  assert.equal(record.empty, "");
  assert.equal(record.deps, "none");
});

test("quoted values keep colons and unescape newlines and quotes", () => {
  assert.equal(parseTaskRecord(SHOW).body, 'First line\nSecond "quoted" line');
});

test("top-level key/value lines and blocks are both read", () => {
  assert.deepEqual(parseToon("schema: v1\nother:\n  a: 1\n"), { schema: "v1", other: { a: "1" } });
});

test("text without a task block gives an empty record", () => {
  assert.deepEqual(parseTaskRecord(""), {});
  assert.deepEqual(parseTaskRecord("error: not found"), {});
});

test("a quoted value that is not valid JSON loses its quotes", () => {
  assert.equal(parseTaskRecord('task:\n  note: "bad \\q escape"').note, "bad \\q escape");
});
