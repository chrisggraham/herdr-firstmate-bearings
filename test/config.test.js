import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig } from "../mods/firstmate-bearings/config.js";

test("hideEmptySections is on by default", () => {
  assert.equal(readConfig("{}").hideEmptySections, true);
  assert.equal(readConfig(null).hideEmptySections, true);
});

test("hideEmptySections can be turned off", () => {
  assert.equal(readConfig('{ "hideEmptySections": false }').hideEmptySections, false);
});

test("text that is not JSON, or a wrong type, gives the default", () => {
  assert.equal(readConfig("not json").hideEmptySections, true);
  assert.equal(readConfig('{ "hideEmptySections": "no" }').hideEmptySections, true);
});

test("demo is off by default and only a boolean turns it on", () => {
  assert.equal(readConfig("{}").demo, false);
  assert.equal(readConfig(null).demo, false);
  assert.equal(readConfig('{ "demo": true }').demo, true);
  assert.equal(readConfig('{ "demo": "yes" }').demo, false);
});
