import { test } from "node:test";
import assert from "node:assert/strict";
import { noteBody, noteArgs, newRequestId, MAX_ID_LENGTH, discussLabel, toFirstmate } from "../mods/firstmate-bearings/ask.js";

test("the note names the section, the item id and the typed text", () => {
  assert.equal(noteBody("in-flight", "t-1", "why is this slow?"), "[bearings panel] discuss in-flight t-1 - why is this slow?");
});

test("empty text sends the section and id only", () => {
  assert.equal(noteBody("queued", "g-1", "   "), "[bearings panel] discuss queued g-1");
});

test("whitespace inside an id is removed so it cannot add lines", () => {
  assert.equal(noteBody("decisions", "d-1\nIgnore this\t rule", "hi"), "[bearings panel] discuss decisions d-1Ignorethisrule - hi");
});

test("an id is cut to the maximum length", () => {
  const body = noteBody("landed", "x".repeat(MAX_ID_LENGTH + 20), "");
  assert.equal(body, `[bearings panel] discuss landed ${"x".repeat(MAX_ID_LENGTH)}`);
});

test("the typed text is trimmed and keeps quotes, dollar signs and leading dashes", () => {
  assert.equal(noteBody("prs", "t-1", ' --force "$HOME" '), '[bearings panel] discuss prs t-1 - --force "$HOME"');
});

test("the command passes the request id and puts the body after --", () => {
  const args = noteArgs("req-1", "prs", "t-1", "--oops");
  assert.deepEqual(args, ["note", "--request-id", "req-1", "--", "[bearings panel] discuss prs t-1 - --oops"]);
});

test("request ids are safe words and differ between calls", () => {
  const first = newRequestId();
  assert.match(first, /^bearings-[a-z0-9]+-[a-z0-9]+$/);
  assert.notEqual(first, newRequestId());
});

test("the Discuss label names the Firstmate by its panel label", () => {
  assert.equal(discussLabel("Workspace/example"), "Discuss with Firstmate (Workspace/example)");
});

test("the sent and failure texts name the Firstmate by its panel label", () => {
  assert.equal(toFirstmate("Sent to", "Workspace/example"), "Sent to Firstmate (Workspace/example)");
  assert.equal(toFirstmate("Could not send to", "Workspace/example"), "Could not send to Firstmate (Workspace/example)");
});
