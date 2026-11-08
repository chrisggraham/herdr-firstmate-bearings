import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaskRecord } from "../mods/firstmate-bearings/toon.js";
import { cardOf } from "../mods/firstmate-bearings/bearings.js";
import { labelOf, linkOf, relativeDate, typedFields } from "../mods/firstmate-bearings/fields.js";

const NOW = Date.UTC(2030, 5, 15, 23, 59);

test("a date is shown by whole days from the clock's day", () => {
  const cases = [
    ["2030-06-15", "today"],
    ["2030-06-14", "1d ago"],
    ["2030-06-12", "3d ago"],
    ["2030-07-15", "in 30d"],
    ["2030-06-16", "in 1d"],
    ["2029-06-15", "365d ago"],
    ["soon", ""],
    ["2030-06-15 10:00", ""],
    ["", ""],
  ];
  for (const [text, expected] of cases) assert.equal(relativeDate(text, NOW), expected, text);
});

test("short values are badges with the key as prefix", () => {
  const { badges, texts } = typedFields([["Kind", "ship"], ["Priority", "1"], ["Id", "abc-123"], ["Hold kind", "captain"]], NOW);
  assert.deepEqual(badges.map((b) => [b.prefix, b.text]), [["kind", "ship"], ["priority", "1"], ["id", "abc-123"], ["hold kind", "captain"]]);
  assert.deepEqual(texts, []);
});

test("a long-text label reads as words: body is Description, hold_reason is Hold reason", () => {
  assert.deepEqual(["body", "hold_reason", "question", "doing"].map(labelOf), ["Description", "Hold reason", "Question", "Doing"]);
});

test("a date badge shows the relative date, with the full date as tooltip", () => {
  const { badges } = typedFields([["Filed", "2030-06-12"], ["hold_until", "2030-06-20"], ["Closed", "unknown"]], NOW);
  assert.deepEqual(badges, [
    { prefix: "filed", text: "3d ago", tip: "2030-06-12" },
    { prefix: "hold until", text: "in 5d", tip: "2030-06-20" },
    { prefix: "closed", text: "unknown", tip: "" },
  ]);
});

test("a boolean shows only when true, and then only as its name", () => {
  const { badges } = typedFields([["blocked", "yes"], ["held", "no"], ["Flag", "true"], ["Other", "false"]], NOW);
  assert.deepEqual(badges, [{ prefix: "", text: "blocked", tip: "" }, { prefix: "", text: "flag", tip: "" }]);
});

test("long-text fields and long values are texts, in order", () => {
  const long = "x".repeat(41);
  const { badges, texts } = typedFields([
    ["Question", "Ship it?"], ["Kind", "ship"], ["Hold reason", "waiting"], ["Note", long],
  ], NOW);
  assert.deepEqual(texts.map((t) => t.label), ["Question", "Hold reason", "Note"]);
  assert.deepEqual(badges.map((b) => b.text), ["ship"]);
});

test("a value of exactly the badge limit stays a badge", () => {
  const { badges, texts } = typedFields([["Note", "x".repeat(40)]], NOW);
  assert.equal(badges.length, 1);
  assert.equal(texts.length, 0);
});

test("a URL becomes a link chip, never a badge or text", () => {
  const { badges, texts, links } = typedFields([
    ["Artifact", "https://example.com/acme/app/pull/12"],
    ["links", "report:https://docs.example.com/guide/setup"],
    ["Artifact", "https://example.com/acme/app/pull/12"],
  ], NOW);
  assert.deepEqual(links, [
    { url: "https://example.com/acme/app/pull/12", label: "PR #12", isPr: true },
    { url: "https://docs.example.com/guide/setup", label: "docs.example.com/setup", isPr: false },
  ]);
  assert.deepEqual([badges, texts], [[], []]);
});

test("a long-text field keeps its URL inside the text", () => {
  const { texts, links } = typedFields([["Question", "See https://example.com/x first"]], NOW);
  assert.equal(texts.length, 1);
  assert.deepEqual(links, []);
});

test("a link with no path is labeled by its host", () => {
  assert.equal(linkOf("https://example.com").label, "example.com");
});

test("a URL the parser rejects is labeled by its own text", () => {
  assert.equal(linkOf("https://[bad").label, "https://[bad");
});

const LONG_BODY = "From https://example.com/acme/app/pull/25 'Not fixed': foreground service stopped before startForeground (possible crash); the silent server never sends an SSH greeting, so the connection hangs until the timeout and the user sees no error at all.";
const RECORD_TEXT = `task:
  id: queued-example
  title: "Example: items the review left unfixed"
  state: queued
  blocked: no
  held: no
  kind: ship
  repo: example-app
  created: 2030-06-10
  closed: "-"
  deps: none
  body: ${JSON.stringify(LONG_BODY)}
`;

test("a real-shaped record with a long body shows the body as a paragraph on the opened card", () => {
  const row = { title: "Example: items…", facts: [["Filed", "2030-06-10"]] };
  const card = cardOf(row, parseTaskRecord(RECORD_TEXT));
  const { texts } = typedFields(card.fields, NOW);
  assert.deepEqual(texts, [{ label: "body", value: LONG_BODY }]);
});

test("the Doing text of an in-flight card is a paragraph, even when short", () => {
  const { texts, badges } = typedFields([["Doing", "tests green"]], NOW);
  assert.deepEqual(texts, [{ label: "Doing", value: "tests green" }]);
  assert.deepEqual(badges, []);
});

test("created is dropped when filed has the same date, and kept otherwise", () => {
  const same = typedFields([["filed", "2030-06-10"], ["created", "2030-06-10"]], NOW);
  assert.deepEqual(same.badges.map((b) => b.prefix), ["filed"]);
  const other = typedFields([["filed", "2030-06-12"], ["created", "2030-06-10"]], NOW);
  assert.deepEqual(other.badges.map((b) => b.prefix), ["filed", "created"]);
});
