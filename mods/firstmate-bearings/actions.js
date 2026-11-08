// Which action buttons a card shows, and the note each one sends. Pure: no Herdr calls.
// A button shows only when the snapshot row proves the action is valid; when unsure, it is left out.
import { sanitizeId } from "./ask.js";

export const ACTIONS = {
  start: { label: "Start now", icon: "action-start.svg" },
  done: { label: "Done", icon: "action-done.svg" },
  defer: { label: "Defer", icon: "action-defer.svg" },
  drop: { label: "Drop", icon: "action-drop.svg", confirm: true },
  stop: { label: "Stop", icon: "action-stop.svg", confirm: true },
};

// The status text of a row says what is known about it: "hand task", "deferred", "working", "held".
const statusIs = (row, ...texts) => texts.includes(row.status?.text);

const RULES = {
  decisions: (row) => [statusIs(row, "hand task") && "done", !statusIs(row, "deferred") && "defer", "drop"],
  "in-flight": (row) => [statusIs(row, "working") && "stop"],
  queued: (row) => [!row.status && !row.reason && "start"],
};

// The action ids, in button order, for a row of a section. Discuss is not here: every card has it.
export const actionsFor = (sectionId, row) => (RULES[sectionId]?.(row) ?? []).filter(Boolean);

export const actionBody = (action, sectionId, itemId) => `[bearings panel] ${action} ${sectionId} ${sanitizeId(itemId)}`;

export const actionArgs = (requestId, action, sectionId, itemId) =>
  ["note", "--request-id", requestId, "--", actionBody(action, sectionId, itemId)];
