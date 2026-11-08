import { test } from "node:test";
import assert from "node:assert/strict";
import { splitUrls } from "../mods/firstmate-bearings/urls.js";

test("text with no URL is one text segment", () => {
  assert.deepEqual(splitUrls("plain words"), [{ text: "plain words" }]);
});

test("a value that is a URL is one link segment", () => {
  const url = "https://github.com/o/r/pull/12";
  assert.deepEqual(splitUrls(url), [{ text: url, url }]);
});

test("a URL inside text is split out, and trailing punctuation stays text", () => {
  assert.deepEqual(splitUrls("see https://x.io/a, then stop"), [
    { text: "see " },
    { text: "https://x.io/a", url: "https://x.io/a" },
    { text: ", then stop" },
  ]);
});

test("two URLs and an http URL are all found; other schemes are not", () => {
  const out = splitUrls("http://a.io/1 ftp://b.io https://c.io/2");
  assert.deepEqual(out.filter((s) => s.url).map((s) => s.url), ["http://a.io/1", "https://c.io/2"]);
});

test("a closing parenthesis after a URL stays text", () => {
  assert.deepEqual(splitUrls("(https://x.io/a)").filter((s) => s.url), [{ text: "https://x.io/a", url: "https://x.io/a" }]);
});

test("an empty or non-string value gives no link", () => {
  assert.deepEqual(splitUrls(""), []);
  assert.deepEqual(splitUrls(42), [{ text: "42" }]);
});

test("a scheme with no host is not a link", () => {
  assert.deepEqual(splitUrls("see https://."), [{ text: "see https://." }]);
});
