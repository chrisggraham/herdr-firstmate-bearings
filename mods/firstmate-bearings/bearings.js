// Turns the bearings snapshot (schema fm-bearings.v1) into panel sections. Pure: no Herdr calls.

export const SCHEMA = "fm-bearings.v1";

const list = (value) => (Array.isArray(value) ? value : []);
const joinParts = (...parts) => parts.filter(Boolean).join(" · ");

// Each row is a card: a title, a muted detail line, and the facts the card shows when opened.
// `url` is the PR link, shown on the opened card.
const SECTIONS = [
  { id: "decisions", title: "Waiting on you", highlight: true, items: (b) => list(b.decisions_open), row: (d) => ({
    title: d.summary ?? "", detail: joinParts(d.verb, d.owner), facts: facts({ Question: d.question, Key: d.key, Owner: d.owner }) }) },
  { id: "in-flight", title: "In flight", items: (b) => list(b.in_flight), row: (t) => ({
    title: t.name ?? t.id ?? "", detail: joinParts(t.repo, t.state, shownDoing(t.doing)),
    facts: facts({ Repo: t.repo, State: t.state, Doing: shownDoing(t.doing), Kind: t.kind, Id: t.id }) }) },
  { id: "prs", title: "PRs", items: (b) => list(b.recorded_prs), row: prRow },
  { id: "secondmates", title: "Secondmates", items: (b) => list(b.secondmates), row: secondmateRow },
  { id: "queued", title: "Queued", items: (b) => list(b.gates), row: (g) => ({
    title: g.title ?? "", detail: joinParts(g.owner, g.reason), facts: facts({ "Blocked by": g.blocked_by, Reason: g.reason, Owner: g.owner, Filed: g.filed }) }) },
  { id: "landed", title: "Landed", items: (b) => list(b.landed), row: (l) => ({
    title: l.what ?? "", detail: l.owner ?? "", facts: facts({ Owner: l.owner, Artifact: l.artifact }) }) },
];

// "Label: value" lines for the values the snapshot gave. The snapshot writes "-" for no value.
function facts(values) {
  return Object.entries(values).filter(([, value]) => value && value !== "-").map(([label, value]) => `${label}: ${value}`);
}

// A "backend ..." note means the snapshot could not see the task's terminal. That check
// can fail when the snapshot runs through the app (it needs the terminal socket), so it is not shown.
const shownDoing = (doing) => (/^backend /.test(doing ?? "") ? "" : doing);

// The PR is titled by the task it belongs to when the snapshot lists that task.
function prRow(pr, snapshot) {
  const task = [...list(snapshot.in_flight), ...list(snapshot.landed)].find((item) => item.id === pr.id);
  const title = task?.name ?? task?.what ?? pr.id ?? "";
  return { title, detail: String(pr.url ?? "").replace(/^https?:\/\//, ""), facts: facts({ Task: pr.id }), url: pr.url };
}

function secondmateRow(secondmate) {
  const unreadable = secondmate.freshness === "unavailable";
  return {
    title: secondmate.id ?? "", detail: joinParts(secondmate.state, secondmate.freshness), flagged: unreadable,
    facts: facts({ State: secondmate.state, Doing: secondmate.doing, Freshness: secondmate.freshness, Source: secondmate.provenance, Reason: secondmate.reason }),
  };
}

// Throws on text that is not JSON; the caller shows that as a failed refresh.
// With hideEmpty, a section with no rows is left out.
export function readBearings(text, { hideEmpty = true } = {}) {
  const snapshot = JSON.parse(text);
  if (snapshot?.schema !== SCHEMA) return { unsupported: `Unsupported bearings version (got ${snapshot?.schema})`, sections: [], hidden: null };

  const sections = SECTIONS.map(({ id, title, highlight, items, row }) => {
    const rows = items(snapshot).map((item) => row(item, snapshot));
    return { id, title, count: rows.length, rows, highlighted: Boolean(highlight) && rows.length > 0 };
  }).filter((section) => !hideEmpty || section.count > 0);
  return { unsupported: null, sections, hidden: hiddenOf(snapshot) };
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
