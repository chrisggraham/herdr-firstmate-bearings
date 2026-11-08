const URL_PATTERN = /https?:\/\/[^\s<>"'.,;:!?)\]}][^\s<>"']*/g;
const TRAILING = /[.,;:!?)\]}]+$/;

// Splits a field value into text and link segments. A link segment has `url`; trailing punctuation stays text.
export function splitUrls(value) {
  const text = String(value ?? "");
  const segments = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING, "");
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({ text: url, url });
    last = match.index + url.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
