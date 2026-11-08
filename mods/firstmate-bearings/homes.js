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

export const inboxPath = (home) => pathIn(home, "bin/fm-inbox.sh");

// The space's name when someone named it, else the folder's name.
export function homeName(candidate) {
  const folderName = candidate.folder.replace(/\/+$/, "").split("/").pop();
  const name = candidate.named ? candidate.spaceName : folderName;
  return candidate.machine ? `${name} · ${candidate.machine}` : name;
}

// Keeps the candidates the check found to be homes, with their display name.
export function listHomes(candidates, isHome) {
  return candidates
    .filter((candidate) => isHome.get(candidate.key) === true)
    .map((candidate) => ({ key: candidate.key, machine: candidate.machine, folder: candidate.folder, name: homeName(candidate) }));
}
