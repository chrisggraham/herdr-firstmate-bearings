import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseHome, spaceHomeKeys, findCandidates, homeKey, homeName, listHomes, awayPath, needsCheck, scriptPath, loginShellArgs } from "../mods/firstmate-bearings/homes.js";

// Two spaces on this computer (one named) and one unnamed space on machine "build-box".
const spaces = [
  { id: "s1", name: "crew", named: true, machine: null, tabs: [{ id: "t1" }, { id: "t2" }] },
  { id: "s2", name: "alpha", named: false, machine: null, tabs: [{ id: "t3" }] },
  { id: "s3", name: "beta", named: false, machine: "build-box", tabs: [{ id: "t4" }] },
];
const pane = (tab, cwd, extra = {}) => ({ pane: `p-${tab}-${cwd}`, tab, cwd, ...extra });

test("panes across two machines give one candidate per machine and folder", () => {
  const candidates = findCandidates(spaces, [pane("t1", "/work/crew"), pane("t4", "/work/crew")]);
  assert.deepEqual(candidates.map((c) => [c.machine, c.folder]), [[null, "/work/crew"], ["build-box", "/work/crew"]]);
});

test("duplicates collapse by machine and folder, preferring a named space", () => {
  const panes = [pane("t3", "/work/crew"), pane("t1", "/work/crew"), pane("t2", "/work/crew")];
  const candidates = findCandidates(spaces, panes);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].spaceName, "crew");
});

test("empty folders, mod panes and panes outside any space are skipped", () => {
  const panes = [pane("t1", null), pane("t1", ""), pane("t1", "/work/x", { mod: "files" }), pane("gone", "/work/y")];
  assert.deepEqual(findCandidates(spaces, panes), []);
});

test("a folder without the script is not a home", () => {
  const candidates = findCandidates(spaces, [pane("t1", "/work/crew"), pane("t3", "/work/plain")]);
  const isHome = new Map([[homeKey(null, "/work/crew"), { found: true, at: 0 }], [homeKey(null, "/work/plain"), { found: false, at: 0 }]]);
  assert.deepEqual(listHomes(candidates, isHome).map((h) => h.folder), ["/work/crew"]);
});

test("a folder not yet checked is not listed", () => {
  const candidates = findCandidates(spaces, [pane("t1", "/work/crew")]);
  assert.deepEqual(listHomes(candidates, new Map()), []);
});

test("the name is the space name when named, else the folder name", () => {
  assert.equal(homeName({ named: true, spaceName: "crew", folder: "/work/other", machine: null }), "crew");
  assert.equal(homeName({ named: false, spaceName: "alpha", folder: "/work/other/", machine: null }), "other");
});

test("a remote name is the same as a local name; the machine is shown apart", () => {
  assert.equal(homeName({ named: true, spaceName: "crew", folder: "/work/crew", machine: "build-box" }), "crew");
});

test("a folder is checked once, and a non-home again after the interval", () => {
  const checks = new Map([["home", { found: true, at: 0 }], ["plain", { found: false, at: 1000 }]]);
  assert.equal(needsCheck(checks, "new", 1000, 30000), true);
  assert.equal(needsCheck(checks, "home", 999999, 30000), false);
  assert.equal(needsCheck(checks, "plain", 30999, 30000), false);
  assert.equal(needsCheck(checks, "plain", 31000, 30000), true);
});

test("the script path joins the folder and the script", () => {
  assert.equal(scriptPath({ folder: "/work/crew/" }), "/work/crew/bin/fm-bearings-snapshot.sh");
});

test("the away marker is the .afk file in the state folder", () => {
  assert.equal(awayPath({ folder: "/work/crew/" }), "/work/crew/state/.afk");
});

test("the login shell gets the script and each argument as separate arguments, never joined into a command", () => {
  const args = loginShellArgs("/home/x/bin/fm-tasks-axi.sh", ["show", "t; rm -rf /", "--full"]);
  assert.deepEqual(args, ["-lc", 'exec "$0" "$@"', "/home/x/bin/fm-tasks-axi.sh", "show", "t; rm -rf /", "--full"]);
});

// Three Firstmates; a, b and c are their keys.
const homesAbc = ["a", "b", "c"].map((key) => ({ key }));
const chosenKey = (...args) => chooseHome(...args)?.key ?? null;

test("chooseHome follows the order: space panes, the space's pick, the last viewed, the only one", () => {
  const cases = [
    { name: "one Firstmate pane in the space wins over a pick and the last viewed", spaceKeys: ["b"], pick: "c", last: "a", want: "b" },
    { name: "two panes: the space's pick when it is one of them", spaceKeys: ["a", "b"], pick: "b", last: "c", want: "b" },
    { name: "two panes: the first when the pick is not one of them", spaceKeys: ["a", "b"], pick: "c", last: "c", want: "a" },
    { name: "two panes: the first when there is no pick", spaceKeys: ["b", "c"], pick: null, last: "a", want: "b" },
    { name: "a pane whose Firstmate is not found is skipped", spaceKeys: ["gone"], pick: "c", last: "a", want: "c" },
    { name: "no pane: the space's pick", spaceKeys: [], pick: "c", last: "a", want: "c" },
    { name: "no pane and no pick: the last viewed", spaceKeys: [], pick: null, last: "b", want: "b" },
    { name: "no pane and a pick no longer found: the last viewed", spaceKeys: [], pick: "gone", last: "b", want: "b" },
    { name: "nothing remembered and several found: none", spaceKeys: [], pick: null, last: null, want: null },
  ];
  for (const { name, spaceKeys, pick, last, want } of cases) {
    assert.equal(chosenKey(homesAbc, new Set(spaceKeys), pick, last), want, name);
  }
});

test("chooseHome shows the only Firstmate when nothing else decides", () => {
  assert.equal(chosenKey([{ key: "a" }], new Set(), null, null), "a");
  assert.equal(chosenKey([], new Set(), "a", "a"), null);
});

test("spaceHomeKeys lists the folders of the panes in one space, on its machine", () => {
  const panes = [pane("t1", "/work/crew"), pane("t2", "/work/other"), pane("t3", "/work/crew"), pane("t1", null), pane("t2", "/work/x", { mod: "files" })];
  assert.deepEqual([...spaceHomeKeys(spaces[0], panes)], [homeKey(null, "/work/crew"), homeKey(null, "/work/other")]);
  assert.deepEqual([...spaceHomeKeys(spaces[2], [pane("t4", "/work/crew")])], [homeKey("build-box", "/work/crew")]);
  assert.deepEqual([...spaceHomeKeys(undefined, panes)], []);
});
