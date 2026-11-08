import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isAwayRefusal, readBearings } from "../mods/firstmate-bearings/bearings.js";

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
  assert.ok(bearings.sections.every((s) => s.hidden === 0));
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
  const [row] = readBearings(text).sections[0].rows;
  assert.equal(row.detail, "");
  assert.deepEqual([row.repo, row.status], ["a/b", { text: "unknown", tone: "muted" }]);
});

test("empty sections are left out by default and kept when asked", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", landed: [{ id: "t-0", what: "Widget docs" }] });
  assert.deepEqual(readBearings(text).sections.map((s) => s.id), ["landed"]);
  assert.equal(readBearings(text, { hideEmpty: false }).sections.length, 6);
});

test("a row has a title, a detail line, a repo label and a status pill", () => {
  const rows = readBearings(fixture).sections.find((s) => s.id === "in-flight").rows;
  assert.equal(rows[0].title, "Add widget cache");
  assert.equal(rows[0].detail, "writing tests");
  assert.equal(rows[0].repo, "example/widgets");
  assert.deepEqual(rows.map((r) => r.status), [{ text: "working", tone: "working" }, { text: "paused", tone: "idle" }]);
});

test("each section has a tone for its accent bar", () => {
  const tones = readBearings(fixture).sections.map((s) => s.tone);
  assert.deepEqual(tones, ["blocked", "accent", "ansi4", "dim", "muted", "done"]);
});

test("landed cards show a merged pill and a blocked gate shows held", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", landed: [{ id: "l", what: "Done" }],
    gates: [{ id: "g", title: "Gate", blocked_by: "t-1" }, { id: "h", title: "Free", blocked_by: "-" }] });
  const sections = Object.fromEntries(readBearings(text).sections.map((s) => [s.id, s]));
  assert.deepEqual(sections.landed.rows[0].status, { text: "merged", tone: "done" });
  assert.deepEqual(sections.queued.rows.map((r) => r.status), [{ text: "held", tone: "idle" }, undefined]);
});

test("a PR card is titled by its task and has a chip with the number and repo", () => {
  const [card] = readBearings(fixture).sections.find((s) => s.id === "prs").rows;
  assert.equal(card.title, "Add widget cache");
  assert.deepEqual(card.pr, { label: "PR #7", repo: "widgets" });
  assert.equal(card.url, "https://example.com/widgets/pull/7");
});

test("a PR URL with no pull number still gets a plain chip", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", recorded_prs: [{ id: "t", url: "https://example.com/x" }] });
  assert.deepEqual(readBearings(text).sections[0].rows[0].pr, { label: "PR", repo: "" });
});

test("a section with omitted items has a hidden count and the flag that reveals them", () => {
  const sections = Object.fromEntries(readBearings(fixture).sections.map((s) => [s.id, s]));
  assert.deepEqual([sections.landed.hidden, sections.landed.revealFlag], [3, "--all-landed"]);
  assert.equal(sections["in-flight"].hidden, 0);
});

test("hidden counts come from 'showing X of Y' and from a trailing count", () => {
  const omitted = [{ surface: "holds bucketed blocked: 4", reveal: "--all-decisions" }, { surface: "landed showing 1 of 4", reveal: "--all-landed" }];
  const sections = Object.fromEntries(readBearings(JSON.stringify({ schema: "fm-bearings.v1", omitted }), { hideEmpty: false }).sections.map((s) => [s.id, s]));
  assert.equal(sections.decisions.hidden, 4);
  assert.equal(sections.landed.hidden, 3);
});

test("an omitted surface with no count gives no hidden items", () => {
  const omitted = [{ surface: "landed per-home capped at 6 for 1 home(s)", reveal: "--all-landed" }, { surface: "prs not requested", reveal: "--include-prs" }];
  const sections = readBearings(JSON.stringify({ schema: "fm-bearings.v1", omitted }), { hideEmpty: false }).sections;
  assert.ok(sections.every((s) => s.hidden === 0));
});

test("a hold card shows its title alone, without 'Captain' or the reason, and a plain pill", () => {
  const decisions = [
    { id: "a", verb: "captain-hold", owner: "(main)", summary: "Captain: Stripe setup for billing launch (priority): Captain does the Stripe setup by hand…", question: "Q" },
    { id: "b", verb: "captain-hold", owner: "(main)", summary: "PHP2Shell: patch the sites (captain hand task): Captain…", question: "Q" },
    { id: "c", verb: "captain-hold", owner: "(main)", summary: "PHP2Shell: patch fnContact and retire two PHP 5.6 sites", question: "Q" },
  ];
  const rows = readBearings(JSON.stringify({ schema: "fm-bearings.v1", decisions_open: decisions })).sections[0].rows;
  assert.deepEqual(rows.map((r) => r.title), ["Stripe setup for billing launch (priority)", "PHP2Shell: patch the sites (captain hand task)", "PHP2Shell: patch fnContact and retire two PHP 5.6 sites"]);
  assert.deepEqual(rows.map((r) => r.status.text), ["decision", "hand task", "decision"]);
  assert.ok(rows.every((r) => !r.detail.includes("captain-hold") && !r.detail.includes("(main)") && !r.facts.some((f) => f.includes("(main)"))));
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

test("the away-mode refusal is told from other failures", () => {
  const stderr = "fm-afk-return: away mode is still active; run bin/fm-afk-return.sh before ordinary captain work\n";
  assert.equal(isAwayRefusal(3, stderr), true);
  assert.equal(isAwayRefusal(0, stderr), false);
  assert.equal(isAwayRefusal(1, "jq: parse error"), false);
});

test("a card's counts name the waiting decisions and the tasks in flight", () => {
  const snapshot = (extra) => JSON.stringify({ schema: "fm-bearings.v1", ...extra });
  const open = (n) => Array.from({ length: n }, (_, i) => ({ key: `k${i}` }));
  assert.equal(readBearings(snapshot({ decisions_open: open(3), in_flight: open(1) })).counts, "3 waiting · 1 in flight");
  assert.equal(readBearings(snapshot({ in_flight: open(2) })).counts, "2 in flight");
  assert.equal(readBearings(snapshot({})).counts, "");
});
