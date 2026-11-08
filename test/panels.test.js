import { test } from "node:test";
import assert from "node:assert/strict";
import { withPanel } from "../mods/firstmate-bearings/panels.js";

test("an unset list gets the stock panels and this one", () => {
  assert.deepEqual(withPanel(undefined, "firstmate-bearings"), ["files", "changes", "firstmate-bearings"]);
  assert.deepEqual(withPanel(null, "firstmate-bearings"), ["files", "changes", "firstmate-bearings"]);
});

test("a list without this panel gets it appended and keeps the others", () => {
  assert.deepEqual(withPanel(["changes"], "firstmate-bearings"), ["changes", "firstmate-bearings"]);
  assert.deepEqual(withPanel([], "firstmate-bearings"), ["firstmate-bearings"]);
});

test("a list with this panel stays as it is", () => {
  assert.equal(withPanel(["files", "firstmate-bearings"], "firstmate-bearings"), null);
});

test("a value that is not a list is left alone", () => {
  assert.equal(withPanel("files", "firstmate-bearings"), null);
});
