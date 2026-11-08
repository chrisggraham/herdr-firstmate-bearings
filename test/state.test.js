import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSet, saveSet, toggleId } from "../mods/firstmate-bearings/state.js";

const fakeStorage = (values = {}) => ({
  values,
  getItem: (key) => values[key] ?? null,
  setItem: (key, value) => { values[key] = value; },
});

test("a saved set comes back in a new view", () => {
  const storage = fakeStorage();
  saveSet(storage, "expanded", new Set(["a", "b"]));
  assert.deepEqual([...loadSet(storage, "expanded")], ["a", "b"]);
});

test("missing or broken storage gives an empty set", () => {
  assert.equal(loadSet(fakeStorage(), "x").size, 0);
  assert.equal(loadSet(fakeStorage({ x: "not json" }), "x").size, 0);
  assert.equal(loadSet(fakeStorage({ x: "{}" }), "x").size, 0);
  assert.equal(loadSet({ getItem() { throw new Error("blocked"); } }, "x").size, 0);
});

test("a storage that refuses a write does not throw", () => {
  assert.doesNotThrow(() => saveSet({ setItem() { throw new Error("full"); } }, "x", new Set(["a"])));
});

test("toggling adds an absent id and removes a present one", () => {
  const ids = new Set();
  toggleId(ids, "a");
  assert.deepEqual([...ids], ["a"]);
  toggleId(ids, "a");
  assert.equal(ids.size, 0);
});
