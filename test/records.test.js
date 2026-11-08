import { test } from "node:test";
import assert from "node:assert/strict";
import { dropGoneRecords, keysToFetch } from "../mods/firstmate-bearings/records.js";

const key = (id, signature) => ({ id, signature });

test("an id with no cached record is fetched; an unchanged one is not", () => {
  const cache = new Map([["a", { signature: "s1", record: {} }]]);
  assert.deepEqual(keysToFetch([key("a", "s1"), key("b", "s1")], cache), [key("b", "s1")]);
});

test("an id whose snapshot entry changed is fetched again", () => {
  const cache = new Map([["a", { signature: "s1", record: {} }]]);
  assert.deepEqual(keysToFetch([key("a", "s2")], cache), [key("a", "s2")]);
});

test("an id that left the snapshot is forgotten, so it is fetched again if it returns", () => {
  const cache = new Map([["a", { signature: "s1", record: {} }], ["b", { signature: "s1", record: {} }]]);
  dropGoneRecords([key("a", "s1")], cache);
  assert.deepEqual([...cache.keys()], ["a"]);
  dropGoneRecords([], cache);
  assert.deepEqual(keysToFetch([key("b", "s1")], cache), [key("b", "s1")]);
});
