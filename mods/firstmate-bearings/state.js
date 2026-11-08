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
