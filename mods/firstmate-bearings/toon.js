// Reads the TOON text that `fm-tasks-axi.sh show <id> --full` prints. Only that shape is supported:
// "key: value" lines, values bare or in double quotes (JSON escapes), and one level of nesting
// where an unindented "name:" line is followed by indented lines. Pure: no Herdr calls.

const LINE = /^(\s*)([^:\s][^:]*?):(?:\s+(.*))?$/;

function readValue(text) {
  const value = text.trim();
  if (!value.startsWith('"')) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value.slice(1, -1);
  }
}

// Returns { name: { key: value } } for nested blocks and { key: value } entries for top-level lines.
export function parseToon(text) {
  const result = {};
  let block = null;
  for (const line of String(text).split("\n")) {
    const match = LINE.exec(line);
    if (!match) continue;
    const [, indent, key, value] = match;
    if (indent.length === 0 && value === undefined) {
      block = result[key] = {};
    } else if (indent.length === 0) {
      block = null;
      result[key] = readValue(value);
    } else if (block) {
      block[key] = readValue(value ?? "");
    }
  }
  return result;
}

// The record of one task: the keys under "task:". Empty when the text has no such block.
export const parseTaskRecord = (text) => parseToon(text).task ?? {};
