import { test } from "node:test";
import assert from "node:assert/strict";
import { allClosed, loadPicks, loadSet, savePick, saveSet, saveSnapshot, toggleAll, toggleId } from "../mods/firstmate-bearings/state.js";

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

test("collapse all closes every section and every opened card", () => {
  const collapsed = new Set(["a"]);
  const expanded = new Set(["card-1"]);
  toggleAll(["a", "b", "c"], collapsed, expanded);
  assert.deepEqual([...collapsed].sort(), ["a", "b", "c"]);
  assert.equal(expanded.size, 0);
});

test("with every section closed, the same call opens all sections", () => {
  const collapsed = new Set(["a", "b"]);
  toggleAll(["a", "b"], collapsed, new Set());
  assert.equal(collapsed.size, 0);
  assert.equal(allClosed(["a", "b"], collapsed), false);
});

const memory = (initial) => {
  const data = new Map(initial ? [["picks", initial]] : []);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("loadPicks reads a saved object and ignores anything else", () => {
  assert.deepEqual(loadPicks(memory('{"s1":"a"}'), "picks"), { s1: "a" });
  assert.deepEqual(loadPicks(memory(), "picks"), {});
  assert.deepEqual(loadPicks(memory("[1]"), "picks"), {});
  assert.deepEqual(loadPicks(memory("not json"), "picks"), {});
});

test("savePick keeps one pick per space and drops the picks of spaces that are gone", () => {
  const storage = memory();
  const picks = savePick(storage, "picks", { s1: "a", gone: "b" }, "s2", "c", ["s1", "s2"]);
  assert.deepEqual(picks, { s1: "a", s2: "c" });
  assert.deepEqual(loadPicks(storage, "picks"), picks);
  assert.deepEqual(savePick(storage, "picks", picks, "s1", "b", ["s1", "s2"]), { s1: "b", s2: "c" });
});

const snapshotStorage = (initial) => {
  const data = new Map(initial ? [["snapshots", initial]] : []);
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("saveSnapshot keeps one snapshot per Firstmate and drops the Firstmates that are gone", () => {
  const storage = snapshotStorage();
  const before = { a: { data: { n: 1 }, at: 1 }, gone: { data: { n: 2 }, at: 2 } };
  const after = saveSnapshot(storage, "snapshots", before, "b", { n: 3 }, 3, ["a", "b"]);
  assert.deepEqual(after, { a: { data: { n: 1 }, at: 1 }, b: { data: { n: 3 }, at: 3 } });
  assert.deepEqual(loadPicks(storage, "snapshots"), after);
  assert.deepEqual(saveSnapshot(storage, "snapshots", after, "a", { n: 4 }, 4, ["a", "b"]).a, { data: { n: 4 }, at: 4 });
});

test("a storage that refuses a snapshot write still returns the snapshots for this view", () => {
  const full = { setItem() { throw new Error("full"); } };
  assert.deepEqual(saveSnapshot(full, "snapshots", {}, "a", { n: 1 }, 1, ["a"]), { a: { data: { n: 1 }, at: 1 } });
});
