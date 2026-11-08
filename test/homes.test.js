import { test } from "node:test";
import assert from "node:assert/strict";
import { findCandidates, homeKey, homeName, listHomes, scriptPath } from "../mods/firstmate-bearings/homes.js";

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
  const isHome = new Map([[homeKey(null, "/work/crew"), true], [homeKey(null, "/work/plain"), false]]);
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

test("a remote name includes the machine", () => {
  assert.equal(homeName({ named: true, spaceName: "crew", folder: "/work/crew", machine: "build-box" }), "crew · build-box");
});

test("the script path joins the folder and the script", () => {
  assert.equal(scriptPath({ folder: "/work/crew/" }), "/work/crew/bin/fm-bearings-snapshot.sh");
});
