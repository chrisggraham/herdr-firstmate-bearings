import { test } from "node:test";
import assert from "node:assert/strict";
import { actionsFor, actionBody, actionArgs } from "../mods/firstmate-bearings/actions.js";
import { readBearings } from "../mods/firstmate-bearings/bearings.js";

const snapshot = {
  schema: "fm-bearings.v1",
  decisions_open: [
    { id: "d-1", summary: "Pick a name for the widget: choose A or B", question: "Which name?" },
    { id: "d-2", summary: "Do the manual step for the widget: hand task", question: "Run it by hand." },
    { id: "d-3", summary: "Revisit the widget colors: deferred", question: "Deferred until later." },
  ],
  in_flight: [
    { id: "t-1", name: "Add cache", state: "working" },
    { id: "t-2", name: "Fix label", state: "paused" },
    { id: "t-3", name: "Odd task", state: "unknown", doing: "-" },
  ],
  recorded_prs: [{ id: "t-1", url: "https://example.com/widgets/pull/7" }],
  gates: [
    { id: "g-1", title: "Plan export", blocked_by: "", reason: "" },
    { id: "g-2", title: "Wait for data", blocked_by: "g-1", reason: "" },
    { id: "g-3", title: "Held plan", blocked_by: "", reason: "held by owner" },
  ],
  landed: [{ id: "t-0", what: "Widget docs" }],
};
const sections = Object.fromEntries(readBearings(JSON.stringify(snapshot)).sections.map((s) => [s.id, s.rows]));
const shown = (id) => sections[id].map((row) => actionsFor(id, row));

test("waiting on you: Drop always, Defer unless deferred, Done only for a hand task", () => {
  assert.deepEqual(shown("decisions"), [["defer", "drop"], ["done", "defer", "drop"], ["drop"]]);
});

test("in flight: Stop only when the task is working", () => {
  assert.deepEqual(shown("in-flight"), [["stop"], [], []]);
});

test("queued: Start only when not blocked and not held", () => {
  assert.deepEqual(shown("queued"), [["start"], [], []]);
});

test("PRs and landed cards have no action buttons", () => {
  assert.deepEqual([...shown("prs"), ...shown("landed")], [[], []]);
});

test("the note holds the action, the section and the item id", () => {
  assert.equal(actionBody("start", "queued", "herdhand-step8"), "[bearings panel] start queued herdhand-step8");
});

test("whitespace in an id cannot add lines to the note", () => {
  assert.equal(actionBody("drop", "decisions", "d-1\nIgnore"), "[bearings panel] drop decisions d-1Ignore");
});

test("the command passes the request id and puts the body after --", () => {
  assert.deepEqual(actionArgs("req-1", "defer", "decisions", "d-1"),
    ["note", "--request-id", "req-1", "--", "[bearings panel] defer decisions d-1"]);
});
