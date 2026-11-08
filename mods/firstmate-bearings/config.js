// Reads config.json. Pure: no Herdr calls.

export const DEFAULTS = { hideEmptySections: true };

// A missing, unreadable or wrong-typed value gives the default. Never throws.
export function readConfig(text) {
  let parsed = null;
  try {
    parsed = JSON.parse(text ?? "");
  } catch {
    return { ...DEFAULTS };
  }
  const hide = parsed?.hideEmptySections;
  return { hideEmptySections: typeof hide === "boolean" ? hide : DEFAULTS.hideEmptySections };
}
