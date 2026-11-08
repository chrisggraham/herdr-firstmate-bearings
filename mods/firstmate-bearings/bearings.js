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
  if (snapshot?.schema !== SCHEMA) return { unsupported: `Unsupported bearings version (got ${snapshot?.schema})`, sections: [], notes: [] };

  const sections = SECTIONS.map(({ id, title, highlight, items, row }) => {
    const rows = items(snapshot).map(row);
    return { id, title, count: rows.length, rows, highlighted: Boolean(highlight) && rows.length > 0 };
  });
  return { unsupported: null, sections, notes: notesOf(snapshot) };
}

// Lines for the switcher area: a warning for unhealthy endpoints, a note for what the snapshot left out.
function notesOf(snapshot) {
  const notes = [];
  const unhealthy = list(snapshot.unhealthy_endpoints).length;
  if (unhealthy > 0) notes.push({ kind: "warning", text: `${unhealthy} unhealthy endpoint${unhealthy === 1 ? "" : "s"}` });
  if (list(snapshot.omitted).length > 0) notes.push({ kind: "more", text: "More not shown" });
  return notes;
}
