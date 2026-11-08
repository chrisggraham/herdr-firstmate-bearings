// Herdr remembers an open side panel per space only for the ids in the shared "workspace.panels" list.
// Pure: returns the list to save, or null when nothing needs saving.

const STOCK_PANELS = ["files", "changes"];

export function withPanel(current, id) {
  if (current === undefined || current === null) return [...STOCK_PANELS, id];
  if (!Array.isArray(current) || current.includes(id)) return null;
  return [...current, id];
}
