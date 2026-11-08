import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readBearings } from "../mods/firstmate-bearings/bearings.js";

const fixture = readFileSync(new URL("./fixtures/bearings.json", import.meta.url), "utf8");
const countsOf = (bearings) => Object.fromEntries(bearings.sections.map((s) => [s.id, s.count]));

test("a v1 snapshot gives six sections with their counts", () => {
  const bearings = readBearings(fixture, { hideEmpty: false });
  assert.deepEqual(bearings.sections.map((s) => s.title),
    ["Waiting on you", "In flight", "PRs", "Secondmates", "Queued", "Landed"]);
  assert.deepEqual(countsOf(bearings), { decisions: 1, "in-flight": 2, prs: 1, secondmates: 2, queued: 2, landed: 1 });
});

test("waiting on you is highlighted only when it has rows", () => {
  const waiting = (text) => readBearings(text, { hideEmpty: false }).sections[0].highlighted;
  assert.equal(waiting(fixture), true);
  assert.equal(waiting(JSON.stringify({ schema: "fm-bearings.v1" })), false);
});

test("an unknown schema gives the unsupported state and no sections", () => {
  const bearings = readBearings(JSON.stringify({ schema: "fm-bearings.v2" }));
  assert.equal(bearings.unsupported, "Unsupported bearings version (got fm-bearings.v2)");
  assert.deepEqual(bearings.sections, []);
});

test("missing keys give empty sections", () => {
  const bearings = readBearings(JSON.stringify({ schema: "fm-bearings.v1" }), { hideEmpty: false });
  assert.ok(Object.values(countsOf(bearings)).every((n) => n === 0));
  assert.equal(bearings.hidden, null);
});

test("unknown keys are ignored", () => {
  const bearings = readBearings(JSON.stringify({ schema: "fm-bearings.v1", future: [1, 2] }), { hideEmpty: false });
  assert.equal(bearings.sections.length, 6);
});

test("unhealthy endpoints are not shown", () => {
  assert.equal("health" in readBearings(fixture), false);
});

test("a backend note from the snapshot is not shown on a card", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", in_flight: [{ id: "t", name: "Task", state: "unknown", repo: "a/b", doing: "backend target gone: x" }] });
  assert.equal(readBearings(text).sections[0].rows[0].detail, "a/b · unknown");
});

test("empty sections are left out by default and kept when asked", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", landed: [{ id: "t-0", what: "Widget docs" }] });
  assert.deepEqual(readBearings(text).sections.map((s) => s.id), ["landed"]);
  assert.equal(readBearings(text, { hideEmpty: false }).sections.length, 6);
});

test("a row has a title and a detail line with repo and state", () => {
  const rows = readBearings(fixture).sections.find((s) => s.id === "in-flight").rows;
  assert.equal(rows[0].title, "Add widget cache");
  assert.equal(rows[0].detail, "example/widgets · working · writing tests");
});

test("a PR card is titled by its task and links to the PR", () => {
  const [card] = readBearings(fixture).sections.find((s) => s.id === "prs").rows;
  assert.equal(card.title, "Add widget cache");
  assert.equal(card.detail, "example.com/widgets/pull/7");
  assert.equal(card.url, "https://example.com/widgets/pull/7");
});

test("omitted lists give a hidden count and the flags that reveal them", () => {
  assert.deepEqual(readBearings(fixture).hidden, { count: 3, flags: ["--all-landed"] });
});

test("an omitted surface with no reveal flag is not offered", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", omitted: [{ surface: "prs not requested", reveal: "--include-prs" }] });
  assert.equal(readBearings(text).hidden, null);
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

test("an opened card lists the facts the snapshot has and skips empty ones", () => {
  const sections = Object.fromEntries(readBearings(fixture).sections.map((s) => [s.id, s]));
  assert.deepEqual(sections["in-flight"].rows[1].facts,
    ["Repo: example/widgets", "State: paused", "Doing: waiting on CI", "Kind: task", "Id: t-2"]);
  assert.deepEqual(sections.queued.rows[0].facts, ["Owner: fleet", "Filed: 2026-01-01"]);
  assert.deepEqual(sections.decisions.rows[0].facts.slice(0, 1), ["Question: Which name for the widget? A or B."]);
});

test("every row carries its item id for the Ask dialog", () => {
  const sections = readBearings(fixture).sections;
  assert.deepEqual(sections.map((s) => s.rows.map((r) => r.itemId)),
    [["d-1"], ["t-1", "t-2"], ["t-1"], ["sm-a", "sm-b"], ["g-1", "g-2"], ["t-0"]]);
});
