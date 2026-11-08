// Reads config.json. Pure: no Herdr calls.

export const DEFAULTS = { hideEmptySections: true, demo: false };

// A missing, unreadable or wrong-typed value gives the default. Never throws.
export function readConfig(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text ?? "");
  } catch {
    return { ...DEFAULTS };
  }
  const flag = (name) => (typeof parsed?.[name] === "boolean" ? parsed[name] : DEFAULTS[name]);
  return { hideEmptySections: flag("hideEmptySections"), demo: flag("demo") };
}
