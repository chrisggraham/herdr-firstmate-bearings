// Turns the bearings snapshot (schema fm-bearings.v1) into panel sections. Pure: no Herdr calls.

export const SCHEMA = "fm-bearings.v1";

const list = (value) => (Array.isArray(value) ? value : []);
const joinParts = (...parts) => parts.filter(Boolean).join(" · ");

const SECTIONS = [
  { id: "decisions", title: "Waiting on you", highlight: true, items: (b) => list(b.decisions_open), row: (d) => ({ text: d.summary ?? "" }) },
  { id: "in-flight", title: "In flight", items: (b) => list(b.in_flight), row: (t) => ({ text: joinParts(t.name, t.state, t.doing) }) },
  { id: "prs", title: "PRs", items: (b) => list(b.recorded_prs), row: (p) => ({ text: joinParts(p.id, p.url), url: p.url }) },
  { id: "secondmates", title: "Secondmates", items: (b) => list(b.secondmates), row: secondmateRow },
  { id: "queued", title: "Queued", items: (b) => list(b.gates), row: (g) => ({ text: g.title ?? "" }) },
  { id: "landed", title: "Landed", items: (b) => list(b.landed), row: (l) => ({ text: l.what ?? "" }) },
];

function secondmateRow(secondmate) {
  const unreadable = secondmate.freshness === "unavailable";
  return { text: joinParts(secondmate.id, secondmate.state, secondmate.freshness), flagged: unreadable };
}

// Throws on text that is not JSON; the caller shows that as a failed refresh.
export function readBearings(text) {
  const snapshot = JSON.parse(text);
  if (snapshot?.schema !== SCHEMA) return { unsupported: `Unsupported bearings version (got ${snapshot?.schema})`, sections: [], health: null, hidden: null };

  const sections = SECTIONS.map(({ id, title, highlight, items, row }) => {
    const rows = items(snapshot).map(row);
    return { id, title, count: rows.length, rows, highlighted: Boolean(highlight) && rows.length > 0 };
  });
  return { unsupported: null, sections, health: healthOf(snapshot), hidden: hiddenOf(snapshot) };
}

// What the snapshot left out: the count of hidden items and the flags that reveal them. Null when nothing is hidden.
function hiddenOf(snapshot) {
  const flags = [];
  let count = 0;
  for (const { surface, reveal } of list(snapshot.omitted)) {
    if (!String(reveal).startsWith("--all-")) continue;
    flags.push(reveal);
    const [, shown, total] = /showing (\d+) of (\d+)/.exec(surface) ?? [];
    count += total ? total - shown : 0;
  }
  return flags.length > 0 ? { count, flags } : null;
}

// A plain sentence for a secondmate task that has no running agent. Null when every endpoint is fine.
function healthOf(snapshot) {
  const names = list(snapshot.unhealthy_endpoints).map((endpoint) => endpoint.id);
  if (names.length === 0) return null;
  return `${names.length === 1 ? "A secondmate task has" : `${names.length} secondmate tasks have`} no running agent: ${names.join(", ")}`;
}
