// Keeps a set of open or closed card and section ids in storage, so a new view of the panel
// (for example after a space switch) shows it as it was. Pure: the storage is passed in.

export function loadSet(storage, key) {
  try {
    const ids = JSON.parse(storage.getItem(key));
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

export function saveSet(storage, key, ids) {
  try {
    storage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // Storage can be full or blocked; the panel then keeps its state for this view only.
  }
}

// Adds the id when it is absent and removes it when present.
export function toggleId(ids, id) {
  if (!ids.delete(id)) ids.add(id);
}

// True when every section is closed.
export const allClosed = (sectionIds, collapsed) => sectionIds.every((id) => collapsed.has(id));

// Closes every section and every opened card; when all sections are already closed, opens them all.
// Opened cards stay closed after an expand.
export function toggleAll(sectionIds, collapsed, expanded) {
  if (allClosed(sectionIds, collapsed)) {
    collapsed.clear();
    return;
  }
  sectionIds.forEach((id) => collapsed.add(id));
  expanded.clear();
}

// The Firstmate picked in each space: space id -> home key.
export function loadPicks(storage, key) {
  try {
    const picks = JSON.parse(storage.getItem(key));
    return picks && typeof picks === "object" && !Array.isArray(picks) ? picks : {};
  } catch {
    return {};
  }
}

// Remembers a pick for one space and drops the picks of spaces that no longer exist. Returns the new picks.
export function savePick(storage, key, picks, spaceId, homeKey, liveSpaceIds) {
  const next = Object.fromEntries(Object.entries(picks).filter(([id]) => liveSpaceIds.includes(id)));
  next[spaceId] = homeKey;
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the pick then holds for this view only.
  }
  return next;
}

// Remembers the last parsed bearings of one Firstmate and when they were fetched (home key -> { data, at }),
// so a new view of the panel shows them at once. Drops the Firstmates that are no longer found. Returns the new
// snapshots; loadPicks reads them back, because it reads any saved object.
export function saveSnapshot(storage, key, snapshots, homeKey, data, at, liveHomeKeys) {
  const next = Object.fromEntries(Object.entries(snapshots).filter(([id]) => liveHomeKeys.includes(id)));
  next[homeKey] = { data, at };
  try {
    storage.setItem(key, JSON.stringify(next));
  } catch {
    // Storage can be full or blocked; the snapshots then hold for this view only.
  }
  return next;
}
