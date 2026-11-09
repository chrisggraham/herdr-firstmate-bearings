// Finds Firstmate homes among the open panes. Pure: no Herdr calls.

export const SCRIPT = "bin/fm-bearings-snapshot.sh";

// A candidate is one folder on one machine that holds an open pane.
// `machine` is null for this computer.
export function findCandidates(spaces, panes) {
  const spaceOfTab = new Map();
  for (const space of spaces) for (const tab of space.tabs ?? []) spaceOfTab.set(tab.id, space);

  const candidates = new Map();
  for (const pane of panes) {
    const space = spaceOfTab.get(pane.tab);
    if (!pane.cwd || pane.mod || !space) continue;
    const machine = space.machine ?? null;
    const key = homeKey(machine, pane.cwd);
    const known = candidates.get(key);
    if (known?.named || (known && !space.named)) continue;
    candidates.set(key, { key, machine, folder: pane.cwd, spaceName: space.name, named: space.named });
  }
  return [...candidates.values()];
}

export const homeKey = (machine, folder) => JSON.stringify([machine, folder]);

const pathIn = (home, file) => `${home.folder.replace(/\/+$/, "")}/${file}`;

export const scriptPath = (home) => pathIn(home, SCRIPT);

// This file exists in a Firstmate home while it is in away mode.
export const awayPath = (home) => pathIn(home, "state/.afk");

// Arguments for /bin/sh that run a script through the login shell, so the script finds the tools in the user's
// PATH (a remote exec has a bare one). The script and its arguments are passed as separate arguments, never joined into a command string.
export const loginShellArgs = (script, args) => ["-lc", 'exec "$0" "$@"', script, ...args];

export const showPath = (home) => pathIn(home, "bin/fm-tasks-axi.sh");

export const inboxPath = (home) => pathIn(home, "bin/fm-inbox.sh");

// The space's name when someone named it, else the folder's name.
export function homeName(candidate) {
  const folderName = candidate.folder.replace(/\/+$/, "").split("/").pop();
  return candidate.named ? candidate.spaceName : folderName;
}

// `checks` maps a candidate key to { found, at }. A folder that is not a home is checked again
// once `every` milliseconds have passed, because it may become a home later. A home is not checked again.
export function needsCheck(checks, key, now, every) {
  const check = checks.get(key);
  return !check || (!check.found && now - check.at >= every);
}

// Keeps the candidates the check found to be homes, with their display name.
export function listHomes(candidates, checks) {
  return candidates
    .filter((candidate) => checks.get(candidate.key)?.found === true)
    .map((candidate) => ({ key: candidate.key, machine: candidate.machine, folder: candidate.folder, name: homeName(candidate) }));
}

// The keys of the folders that hold an open pane in one space (none when there is no space).
export function spaceHomeKeys(space, panes) {
  const tabs = new Set((space?.tabs ?? []).map((tab) => tab.id));
  const keys = new Set();
  for (const pane of panes) {
    if (pane.cwd && !pane.mod && tabs.has(pane.tab)) keys.add(homeKey(space.machine ?? null, pane.cwd));
  }
  return keys;
}

// The Firstmate to show: one with a pane in the space (the space's pick when several), else the space's pick,
// else the last one viewed, else the only one found. Null when none of these applies.
export function chooseHome(homes, spaceKeys, pick, last) {
  const byKey = (key) => homes.find((home) => home.key === key);
  const inSpace = homes.filter((home) => spaceKeys.has(home.key));
  if (inSpace.length > 0) return inSpace.find((home) => home.key === pick) ?? inSpace[0];
  return byKey(pick) ?? byKey(last) ?? (homes.length === 1 ? homes[0] : null);
}
