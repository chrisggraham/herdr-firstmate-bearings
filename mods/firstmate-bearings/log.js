// Formats the error log, one line per error. Pure: no Herdr calls.

export const LOG_FILE = "firstmate-bearings.log";
const MAX_LINES = 200;
const MAX_MESSAGE = 200;

// "2026-01-01T00:00:00.000Z fetch: exit code 1". The message is the error's first line, cut short.
export function formatLine(date, source, error) {
  const message = String(error?.message ?? error).trim().split("\n")[0].slice(0, MAX_MESSAGE);
  return `${date.toISOString()} ${source}: ${message}`;
}

// Adds a line to the log text and keeps the newest lines only.
export function appendLine(text, line) {
  const lines = (text ?? "").split("\n").filter(Boolean);
  return `${[...lines, line].slice(-MAX_LINES).join("\n")}\n`;
}
