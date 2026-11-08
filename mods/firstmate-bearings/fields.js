// Sorts the fields of an opened card by type: short values become badges, long text stays a paragraph,
// and a URL becomes a link chip, never raw text.
// Pure: the clock is passed in.

import { prChip } from "./bearings.js";
import { splitUrls } from "./urls.js";

// Fields that are always long free text, however short one value is.
const TEXT_KEYS = new Set(["holdreason", "question", "body", "reason", "doing"]);
const DATE_KEYS = new Set(["filed", "created", "closed", "holduntil"]);
const MAX_BADGE_LENGTH = 40;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const keyOf = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, "");
const prefixOf = (label) => label.toLowerCase().replace(/[_-]/g, " ");

// "3d ago", "today" or "in 9d" for a YYYY-MM-DD date, by whole days from the clock's day (UTC).
// Text that is not a date gives "".
export function relativeDate(text, now) {
  const match = ISO_DATE.exec(text);
  if (!match) return "";
  const day = Date.UTC(match[1], match[2] - 1, match[3]);
  const days = Math.round((day - Math.floor(now / DAY_MS) * DAY_MS) / DAY_MS);
  if (days === 0) return "today";
  return days < 0 ? `${-days}d ago` : `in ${days}d`;
}

const isTrue = (value) => value === "yes" || value === "true";
const isFalse = (value) => value === "no" || value === "false";

const urlsIn = (value) => splitUrls(value).filter((s) => s.url).map((s) => s.url);

function isLongText(key, value) {
  return TEXT_KEYS.has(key) || value.length > MAX_BADGE_LENGTH;
}

// A URL the text matcher found can still be rejected by the parser; it then has no host and no path.
function safeUrl(url) {
  try {
    return new URL(url);
  } catch {
    return { host: url, pathname: "" };
  }
}

// { url, label, isPr } for a link chip: "PR #12" for a pull request, else the host and last path part.
export function linkOf(url) {
  const pr = prChip(url).label;
  if (pr !== "PR") return { url, label: pr, isPr: true };
  const { host, pathname } = safeUrl(url);
  const last = pathname.split("/").filter(Boolean).pop();
  return { url, label: last ? `${host}/${last}` : host, isPr: false };
}

// A badge is { prefix, text, tip }: the key as a muted prefix, the value, and the full date as a tooltip.
function badgeOf(label, key, value, now) {
  if (isTrue(value)) return { prefix: "", text: prefixOf(label), tip: "" };
  const relative = DATE_KEYS.has(key) ? relativeDate(value, now) : "";
  return { prefix: prefixOf(label), text: relative || value, tip: relative ? value : "" };
}

// Badges on the second line of a closed card, most useful first. A badge not listed (for example "id") never goes there.
const LINE_BADGE_ORDER = ["kind", "priority", "blocked", "held", "filed", "closed", "created", "hold until", "blocked by", "hold kind", "deps"];
// The second line does not wrap, so its badges share this many characters (prefix, text and padding).
const LINE_BADGE_CHARS = 26;
const BADGE_PADDING_CHARS = 2;

const badgeLength = ({ prefix, text }) => prefix.length + text.length + BADGE_PADDING_CHARS;
// A boolean badge has no prefix; its text is the name.
const badgeRank = ({ prefix, text }) => LINE_BADGE_ORDER.indexOf(prefix || text);

// Splits badges into { line, rest }: the useful ones that fit the second line, and the others for the opened card.
// A badge that does not fit is dropped from the line, and a later smaller one can still take its place.
export function lineBadges(badges) {
  const ranked = badges.filter((badge) => badgeRank(badge) >= 0).sort((a, b) => badgeRank(a) - badgeRank(b));
  const line = [];
  let used = 0;
  for (const badge of ranked) {
    if (used + badgeLength(badge) > LINE_BADGE_CHARS) continue;
    line.push(badge);
    used += badgeLength(badge);
  }
  return { line, rest: badges.filter((badge) => !line.includes(badge)) };
}

// Splits [label, value] fields into badges, texts ({ label, value }) and links, keeping their order.
// A boolean shows only when true. A long-text field keeps its URLs inside the text; any other
// field with a URL gives link chips and nothing else.
export function typedFields(fields, now) {
  const badges = [];
  const texts = [];
  const links = new Map();
  for (const [label, rawValue] of fields) {
    const value = String(rawValue);
    const key = keyOf(label);
    if (isFalse(value)) continue;
    const urls = urlsIn(value);
    if (urls.length > 0 && !TEXT_KEYS.has(key)) urls.forEach((url) => links.set(url, linkOf(url)));
    else if (isLongText(key, value)) texts.push({ label, value });
    else badges.push(badgeOf(label, key, value, now));
  }
  return { badges, texts, links: [...links.values()] };
}
