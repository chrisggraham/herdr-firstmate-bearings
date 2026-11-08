// Builds the note the Parley dialog sends. Pure: no Herdr calls.
// The note holds the section and the item id, never the row's text: row text can come from worker output.

export const MAX_ID_LENGTH = 64;

const PREFIX = "[bearings panel] discuss";

export function noteBody(sectionId, itemId, typed) {
  const id = String(itemId).replace(/\s+/g, "").slice(0, MAX_ID_LENGTH);
  const text = String(typed).trim();
  const target = `${PREFIX} ${sectionId} ${id}`;
  return text ? `${target} - ${text}` : target;
}

// `--` keeps a body that starts with a dash from being read as a flag.
export const noteArgs = (requestId, sectionId, itemId, typed) =>
  ["note", "--request-id", requestId, "--", noteBody(sectionId, itemId, typed)];

// Made once per dialog, so a retry of the same dialog writes one note.
export const newRequestId = () => `bearings-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
