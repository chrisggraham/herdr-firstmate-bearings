import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readBearings } from "../mods/firstmate-bearings/bearings.js";

const fixture = readFileSync(new URL("./fixtures/bearings.json", import.meta.url), "utf8");
const countsOf = (bearings) => Object.fromEntries(bearings.sections.map((s) => [s.id, s.count]));

test("a v1 snapshot gives six sections with their counts", () => {
  const bearings = readBearings(fixture);
  assert.deepEqual(bearings.sections.map((s) => s.title),
    ["Waiting on you", "In flight", "PRs", "Secondmates", "Queued", "Landed"]);
  assert.deepEqual(countsOf(bearings), { decisions: 1, "in-flight": 2, prs: 1, secondmates: 2, queued: 2, landed: 1 });
});

test("waiting on you is highlighted only when it has rows", () => {
  const waiting = (text) => readBearings(text).sections[0].highlighted;
  assert.equal(waiting(fixture), true);
  assert.equal(waiting(JSON.stringify({ schema: "fm-bearings.v1" })), false);
});

test("an unknown schema gives the unsupported state and no sections", () => {
  const bearings = readBearings(JSON.stringify({ schema: "fm-bearings.v2" }));
  assert.equal(bearings.unsupported, "Unsupported bearings version (got fm-bearings.v2)");
  assert.deepEqual(bearings.sections, []);
});

test("missing keys give empty sections", () => {
  const bearings = readBearings(JSON.stringify({ schema: "fm-bearings.v1" }));
  assert.ok(Object.values(countsOf(bearings)).every((n) => n === 0));
  assert.deepEqual(bearings.notes, []);
});

test("unknown keys are ignored", () => {
  const bearings = readBearings(JSON.stringify({ schema: "fm-bearings.v1", future: [1, 2] }));
  assert.equal(bearings.sections.length, 6);
});

test("omitted and unhealthy endpoints give their notes", () => {
  assert.deepEqual(readBearings(fixture).notes, [
    { kind: "warning", text: "1 unhealthy endpoint" },
    { kind: "more", text: "More not shown" },
  ]);
});

test("PR rows carry their URLs and other rows do not", () => {
  const sections = Object.fromEntries(readBearings(fixture).sections.map((s) => [s.id, s]));
  assert.equal(sections.prs.rows[0].url, "https://example.com/widgets/pull/7");
  assert.equal(sections["in-flight"].rows[0].url, undefined);
});

test("an unreadable secondmate is flagged", () => {
  const rows = readBearings(fixture).sections.find((s) => s.id === "secondmates").rows;
  assert.deepEqual(rows.map((r) => r.flagged), [false, true]);
});

test("text that is not JSON throws", () => {
  assert.throws(() => readBearings("not json"));
});
