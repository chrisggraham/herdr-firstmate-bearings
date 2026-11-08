// Turns the bearings snapshot (schema fm-bearings.v1) into panel sections. Pure: no Herdr calls.

export const SCHEMA = "fm-bearings.v1";

const list = (value) => (Array.isArray(value) ? value : []);
const joinParts = (...parts) => parts.filter((part) => part && part !== "-").join(" · ");

// The snapshot flags that list every decision and every landed item instead of a short list.
export const REVEAL_FLAGS = ["--all-decisions", "--all-landed"];

// Each row is a card: a title, a muted detail line, an optional muted `repo` label and status pill,
// and the fields (label and value pairs) the card shows when opened. A section with `hasTask: false`
// holds items that are not tasks, so no task record exists for them. A PR row has `pr` (the chip) and `url` (where it opens).
// `tone` names the theme color of a section's accent bar; a status tone names the color of its pill.
const SECTIONS = [
  { id: "decisions", title: "Waiting on you", tone: "blocked", highlight: true, items: (b) => list(b.decisions_open), row: decisionRow },
  { id: "in-flight", title: "In flight", tone: "ansi4", items: (b) => list(b.in_flight), row: (t) => ({
    title: t.name ?? t.id ?? "", detail: shownDoing(t.doing) ?? "", repo: t.repo, status: statusOf(t.state),
    facts: facts({ Repo: t.repo, State: t.state, Doing: shownDoing(t.doing), Kind: t.kind, Id: t.id }) }) },
  { id: "prs", title: "PRs", tone: "ansi4", items: (b) => list(b.recorded_prs), row: prRow },
  { id: "secondmates", title: "Secondmates", tone: "dim", hasTask: false, items: (b) => list(b.secondmates), row: secondmateRow },
  { id: "queued", title: "Queued", tone: "muted", items: (b) => list(b.gates), row: (g) => ({
    title: g.title ?? "", detail: joinParts(plainOwner(g.owner), g.reason), status: hasValue(g.blocked_by) ? statusOf("held") : undefined, reason: hasValue(g.reason) ? g.reason : "", facts: facts({ "Blocked by": g.blocked_by, Reason: g.reason, Owner: plainOwner(g.owner), Filed: g.filed }) }) },
  { id: "landed", title: "Landed", tone: "ansi2", items: (b) => list(b.landed), row: (l) => ({
    title: l.what ?? "", detail: plainOwner(l.owner), status: statusOf("merged"), facts: facts({ Owner: plainOwner(l.owner), Artifact: l.artifact }) }) },
];

const STATUS_TONES = { working: "working", blocked: "blocked", paused: "idle", held: "idle", merged: "ansi2", done: "ansi2" };
const statusOf = (text) => (hasValue(text) && text !== "unknown" ? { text, tone: STATUS_TONES[text] ?? "muted" } : undefined);
const hasValue = (value) => Boolean(value) && value !== "-";

// "(main)" is the snapshot's placeholder owner, not a name.
const plainOwner = (owner) => (/^\(/.test(owner ?? "") ? "" : owner ?? "");

// A hold's summary is "<title>: <reason>" cut short. The title is the part before the last colon
// (when that part is long enough to be a title); the full text is the Question fact of the opened card.
const MIN_TITLE_LENGTH = 20;
function decisionTitle(summary) {
  const text = String(summary ?? "");
  const cut = text.lastIndexOf(": ");
  return stripCaptain(cut >= MIN_TITLE_LENGTH ? text.slice(0, cut) : text);
}

const stripCaptain = (title) => String(title).replace(/^captain\b:?\s*/i, "");

// The snapshot's verb "captain-hold" is internal; the pill says what the person has to do.
function decisionStatus(decision) {
  const text = `${decision.summary} ${decision.question}`;
  if (/hand task/i.test(text)) return { text: "hand task", tone: "idle" };
  if (/deferred/i.test(text)) return { text: "deferred", tone: "idle" };
  return { text: "decision", tone: "blocked" };
}

function decisionRow(decision) {
  return { title: decisionTitle(decision.summary), detail: "", status: decisionStatus(decision),
    facts: facts({ Question: decision.question, Key: decision.key, Owner: plainOwner(decision.owner) }) };
}

// [label, value] pairs for the values the snapshot gave. The snapshot writes "-" for no value.
function facts(values) {
  return Object.entries(values).filter(([, value]) => hasValue(value));
}

const isEmptyField = (value) => !hasValue(value) || value === "none";
const fieldKey = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, "");

// Fields the card already shows in its own way, so the grid leaves them out: the repo line, and the card title (also named name, summary or what).
const SHOWN_ELSEWHERE = new Set(["repo", "title", "name", "summary", "what"]);

// Whether the card shows this field elsewhere: by key, as the status pill (and never the state "unknown"), or as the PR chip.
function isShownElsewhere(row, [label, value]) {
  const key = fieldKey(label);
  if (SHOWN_ELSEWHERE.has(key)) return true;
  if (key === "state") return Boolean(row.status) || value === "unknown";
  return Boolean(row.pr) && value === row.url;
}

// The title and fields an opened card shows. With a task record (from `fm-tasks-axi.sh show`),
// the title is the record's full title and the fields are every record field, then the snapshot
// fields the record does not already have. Fields with no value are left out.
export function cardOf(row, record) {
  const recordFields = Object.entries(record ?? {}).filter(([, value]) => typeof value === "string");
  const shown = new Set(recordFields.map(([key]) => fieldKey(key)));
  const snapshotFields = row.facts.filter(([label]) => !shown.has(fieldKey(label)));
  const fields = [...recordFields, ...snapshotFields].filter((field) => !isEmptyField(field[1]) && !isShownElsewhere(row, field));
  const title = record?.title ? stripCaptain(record.title) : row.title;
  return { title, fields };
}

// The repo a card shows: the PR's, then the snapshot row's, then the task record's.
// A landed row has no repo in the snapshot, so its record gives it. A repo is never taken from a URL except a PR row's own.
export function repoOf(row, record) {
  const recordRepo = isEmptyField(record?.repo) ? "" : record.repo;
  return row.pr?.repo || row.repo || recordRepo;
}

// A "backend ..." note means the snapshot could not see the task's terminal. That check
// can fail when the snapshot runs through the app (it needs the terminal socket), so it is not shown.
const shownDoing = (doing) => (/^backend /.test(doing ?? "") ? "" : doing);

// The PR is titled by the task it belongs to when the snapshot lists that task.
function prRow(pr, snapshot) {
  const task = [...list(snapshot.in_flight), ...list(snapshot.landed)].find((item) => item.id === pr.id);
  const title = task?.name ?? task?.what ?? pr.id ?? "";
  return { title, detail: "", facts: facts({ Task: pr.id }), pr: prChip(pr.url), url: pr.url };
}

// The chip text and repo from a ".../<repo>/pull/<number>" URL; a URL of another shape gets a plain "PR".
export function prChip(url) {
  const [, repo = "", number] = /^https?:\/\/[^/]+\/(.+)\/pull\/(\d+)/.exec(String(url ?? "")) ?? [];
  return { label: number ? `PR #${number}` : "PR", repo };
}

function secondmateRow(secondmate) {
  const unreadable = secondmate.freshness === "unavailable";
  return {
    title: secondmate.id ?? "", detail: secondmate.freshness ?? "", status: statusOf(secondmate.state), flagged: unreadable,
    facts: facts({ State: secondmate.state, Doing: secondmate.doing, Freshness: secondmate.freshness, Source: secondmate.provenance, Reason: secondmate.reason }),
  };
}

// The snapshot command refuses while the Firstmate is in away mode. That is not a failure of the panel.
export const isAwayRefusal = (code, stderr) => code !== 0 && /away mode is still active/.test(String(stderr));

// "3 waiting · 1 in flight": short counts for a Firstmate card; empty when both are zero.
export function countsLine(snapshot) {
  const waiting = list(snapshot?.decisions_open).length;
  const inFlight = list(snapshot?.in_flight).length;
  return joinParts(waiting > 0 && `${waiting} waiting`, inFlight > 0 && `${inFlight} in flight`);
}

// Throws on text that is not JSON; the caller shows that as a failed refresh.
// With hideEmpty, a section with no rows is left out.
export function readBearings(text, { hideEmpty = true } = {}) {
  const snapshot = JSON.parse(text);
  if (snapshot?.schema !== SCHEMA) return { unsupported: `Unsupported bearings version (got ${snapshot?.schema})`, sections: [], counts: "" };

  const sections = SECTIONS.map(({ id, title, tone, highlight, items, row }) => {
    const rows = items(snapshot).map((item) => ({ ...row(item, snapshot), itemId: item.id }));
    return { id, title, tone, count: rows.length, rows, highlighted: Boolean(highlight) && rows.length > 0 };
  }).filter((section) => !hideEmpty || section.count > 0);
  return { unsupported: null, sections, counts: countsLine(snapshot), records: taskRecordKeys(snapshot) };
}

// One { id, signature } per task id in the snapshot. The signature changes when any snapshot
// entry of that id changes, which is when its task record is fetched again.
export function taskRecordKeys(snapshot) {
  const entries = new Map();
  for (const { id, items, hasTask } of SECTIONS) {
    if (hasTask === false) continue;
    for (const item of items(snapshot)) {
      if (!item.id) continue;
      entries.set(item.id, [...(entries.get(item.id) ?? []), { section: id, item }]);
    }
  }
  return [...entries].map(([id, parts]) => ({ id, signature: JSON.stringify(parts) }));
}
