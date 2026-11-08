import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardOf, repoOf, isAwayRefusal, readBearings, taskRecordKeys, REVEAL_FLAGS } from "../mods/firstmate-bearings/bearings.js";

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
  assert.deepEqual([row.repo, row.status], ["a/b", undefined]);
});

test("empty sections are left out by default and kept when asked", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", landed: [{ id: "t-0", what: "Widget docs" }] });
  assert.deepEqual(readBearings(text).sections.map((s) => s.id), ["landed"]);
  assert.equal(readBearings(text, { hideEmpty: false }).sections.length, 6);
});

test("an in-flight card shows the Doing text once, as a field and not as the detail", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", in_flight: [{ id: "t", name: "Task", doing: "PR https://github.com/o/r/pull/7 checks green" }] });
  const [row] = readBearings(text).sections[0].rows;
  assert.equal(row.detail, "");
  assert.deepEqual(row.facts.filter(([k]) => k === "Doing"), [["Doing", "PR https://github.com/o/r/pull/7 checks green"]]);
});

test("a row has a title, a repo label and a status pill", () => {
  const rows = readBearings(fixture).sections.find((s) => s.id === "in-flight").rows;
  assert.equal(rows[0].title, "Add widget cache");
  assert.equal(rows[0].repo, "example/widgets");
  assert.deepEqual(rows.map((r) => r.status), [{ text: "working", tone: "working" }, { text: "paused", tone: "idle" }]);
});

test("each section has a tone for its accent bar", () => {
  const tones = readBearings(fixture).sections.map((s) => s.tone);
  assert.deepEqual(tones, ["blocked", "ansi4", "ansi4", "dim", "muted", "ansi2"]);
});

test("landed cards show a merged pill and a blocked gate shows held", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", landed: [{ id: "l", what: "Done" }],
    gates: [{ id: "g", title: "Gate", blocked_by: "t-1" }, { id: "h", title: "Free", blocked_by: "-" }] });
  const sections = Object.fromEntries(readBearings(text).sections.map((s) => [s.id, s]));
  assert.deepEqual(sections.landed.rows[0].status, { text: "merged", tone: "ansi2" });
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

test("a hold card shows its title alone, without 'Captain' or the reason, and a plain pill", () => {
  const decisions = [
    { id: "a", verb: "captain-hold", owner: "(main)", summary: "Captain: Stripe setup for billing launch (priority): Captain does the Stripe setup by hand…", question: "Q" },
    { id: "b", verb: "captain-hold", owner: "(main)", summary: "PHP2Shell: patch the sites (captain hand task): Captain…", question: "Q" },
    { id: "c", verb: "captain-hold", owner: "(main)", summary: "PHP2Shell: patch fnContact and retire two PHP 5.6 sites", question: "Q" },
  ];
  const rows = readBearings(JSON.stringify({ schema: "fm-bearings.v1", decisions_open: decisions })).sections[0].rows;
  assert.deepEqual(rows.map((r) => r.title), ["Stripe setup for billing launch (priority)", "PHP2Shell: patch the sites (captain hand task)", "PHP2Shell: patch fnContact and retire two PHP 5.6 sites"]);
  assert.deepEqual(rows.map((r) => r.status.text), ["decision", "hand task", "decision"]);
  assert.ok(rows.every((r) => !r.detail.includes("captain-hold") && !r.detail.includes("(main)") && !r.facts.some(([, v]) => v.includes("(main)"))));
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
    [["Repo", "example/widgets"], ["State", "paused"], ["Doing", "waiting on CI"], ["Kind", "task"], ["Id", "t-2"]]);
  assert.deepEqual(sections.queued.rows[0].facts, [["Owner", "fleet"], ["Filed", "2026-01-01"]]);
  assert.deepEqual(sections.decisions.rows[0].facts.slice(0, 1), [["Question", "Which name for the widget? A or B."]]);
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

test("a queued card with owner and reason both empty has no detail", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1", gates: [{ title: "Task", owner: "(main)", reason: "-" }] });
  assert.equal(readBearings(text).sections[0].rows[0].detail, "");
});

test("the snapshot is always fetched with the flags that list every decision and landed item", () => {
  assert.deepEqual(REVEAL_FLAGS, ["--all-decisions", "--all-landed"]);
});

test("a task record gives the card its full title and every field, then the snapshot fields it lacks", () => {
  const row = { title: "Add widget c…", facts: [["Repo", "example/widgets"], ["State", "working"], ["Doing", "writing tests"]] };
  const record = { id: "t-1", title: "Captain: Add widget cache, with a long name that the snapshot cut", state: "working", deps: "none", closed: "-", note: "" };
  assert.deepEqual(cardOf(row, record), {
    title: "Add widget cache, with a long name that the snapshot cut",
    fields: [["id", "t-1"], ["state", "working"], ["Doing", "writing tests"]],
  });
});

test("a card with no record keeps its snapshot title and fields", () => {
  const row = { title: "Add widget cache", facts: [["Repo", "example/widgets"], ["Kind", "none"], ["Id", "t-9"]] };
  assert.deepEqual(cardOf(row, undefined), { title: "Add widget cache", fields: [["Id", "t-9"]] });
  assert.deepEqual(cardOf(row, {}).title, "Add widget cache");
});

test("a snapshot field is not repeated when the record has the same key in another spelling", () => {
  const row = { title: "T", facts: [["Blocked by", "x"], ["Owner", "fleet"]] };
  assert.deepEqual(cardOf(row, { blocked_by: "y" }).fields, [["blocked_by", "y"], ["Owner", "fleet"]]);
});

test("each task id appears once, with a signature that changes when its snapshot entry changes", () => {
  const snapshot = (doing) => ({ in_flight: [{ id: "t-1", doing }], recorded_prs: [{ id: "t-1", url: "u" }], secondmates: [{ id: "sm-a" }], gates: [{ title: "no id" }] });
  const [first] = taskRecordKeys(snapshot("a"));
  assert.equal(taskRecordKeys(snapshot("a")).length, 1);
  assert.equal(first.id, "t-1");
  assert.notEqual(taskRecordKeys(snapshot("b"))[0].signature, first.signature);
  assert.equal(taskRecordKeys(snapshot("a"))[0].signature, first.signature);
});

test("a card leaves out the fields it already shows in its own way", () => {
  const row = { title: "T", status: { text: "working", tone: "working" }, pr: { label: "PR #1", repo: "o/r" }, url: "https://github.com/o/r/pull/1",
    facts: [["Repo", "o/r"], ["State", "working"], ["Doing", "x"]] };
  const record = { id: "t-1", title: "T", name: "T", summary: "s", what: "w", repo: "o/r", state: "working", pr: "https://github.com/o/r/pull/1", kind: "ship" };
  assert.deepEqual(cardOf(row, record).fields, [["id", "t-1"], ["kind", "ship"], ["Doing", "x"]]);
});

test("a card keeps a state it does not show as a pill, and leaves out the state unknown", () => {
  assert.deepEqual(cardOf({ title: "T", facts: [["State", "paused"]] }, undefined).fields, [["State", "paused"]]);
  assert.deepEqual(cardOf({ title: "T", facts: [["State", "unknown"]] }, undefined).fields, []);
});

test("a landed card shows the repo from its task record, never from a URL", () => {
  const row = { title: "T", facts: [], url: "https://github.com/o/from-url/pull/1" };
  assert.equal(repoOf(row, { repo: "example-repo" }), "example-repo");
  assert.equal(repoOf(row, { repo: "-" }), "");
  assert.equal(repoOf(row, undefined), "");
});

test("the PR's repo and the snapshot repo come before the record repo", () => {
  assert.equal(repoOf({ pr: { repo: "o/pr" }, repo: "o/snap" }, { repo: "rec" }), "pr");
  assert.equal(repoOf({ repo: "o/snap" }, { repo: "rec" }), "snap");
});

test("a card shows only the repo part of an owner/repo name, so every section matches", () => {
  const prs = readBearings(JSON.stringify({ schema: "fm-bearings.v1", recorded_prs: [{ id: "t", url: "https://github.com/example/acme-api/pull/12" }] }));
  assert.equal(repoOf(prs.sections[0].rows[0], undefined), "acme-api");
  assert.equal(repoOf({ repo: "acme-api" }, undefined), "acme-api");
});

test("an opened PR card shows the id once and never repeats the PR chip, its URL or the pill", () => {
  const url = "https://github.com/example/acme-api/pull/12";
  const [row] = readBearings(JSON.stringify({ schema: "fm-bearings.v1", recorded_prs: [{ id: "t-1", url }] })).sections[0].rows;
  const record = { id: "t-1", state: "in_flight", pr: "PR #12", links: `pr:${url}`, kind: "ship" };
  assert.deepEqual(cardOf(row, record).fields, [["id", "t-1"], ["state", "in_flight"], ["links", `pr:${url}`], ["kind", "ship"]]);
});

test("a card drops a field that repeats the pill or the repo, whatever its key", () => {
  const row = { title: "T", status: { text: "working", tone: "working" }, repo: "acme-api", facts: [] };
  assert.deepEqual(cardOf(row, { id: "t-1", phase: "working", home: "acme-api", kind: "ship" }).fields, [["id", "t-1"], ["kind", "ship"]]);
});

test("a card drops a badge whose value another field already has, and keeps the id", () => {
  const row = { title: "T", facts: [["Task", "t-1"], ["Owner", "bo"]] };
  assert.deepEqual(cardOf(row, { kind: "ship", id: "t-1", name2: "ship" }).fields, [["kind", "ship"], ["id", "t-1"], ["Owner", "bo"]]);
});

test("yes, no and date values may repeat across fields", () => {
  const record = { held: "yes", blocked: "yes", created: "2030-06-12", filed: "2030-06-12" };
  assert.deepEqual(cardOf({ title: "T", facts: [] }, record).fields, Object.entries(record));
});

test("every task section's card gets the repo from its task record", () => {
  const text = JSON.stringify({ schema: "fm-bearings.v1",
    decisions_open: [{ id: "d", summary: "A long enough title here: why", question: "q" }],
    in_flight: [{ id: "f", name: "F" }], gates: [{ id: "g", title: "G" }], landed: [{ id: "l", what: "L" }] });
  const sections = readBearings(text, { hideEmpty: false }).sections.filter((s) => s.count > 0);
  assert.deepEqual(sections.map((s) => s.id), ["decisions", "in-flight", "queued", "landed"]);
  for (const section of sections) assert.equal(repoOf(section.rows[0], { repo: "example-repo" }), "example-repo", section.id);
});
