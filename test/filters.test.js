import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_REPOS, filterSections, filterSummary, isFiltering, repoOptions, validRepo } from "../mods/firstmate-bearings/filters.js";

const sections = [
  { id: "in-flight", rows: [
    { itemId: "t-1", title: "Add sidebar", detail: "building", repo: "web-app" },
    { itemId: "t-2", title: "Fix login", detail: "", repo: "api" },
  ] },
  { id: "prs", rows: [{ itemId: "t-1", title: "Add sidebar", detail: "", pr: { label: "PR #42" }, repo: "web-app" }] },
  { id: "queued", rows: [{ itemId: "t-3", title: "Tidy docs", detail: "Owner: ana", repo: "" }] },
];
const viewOf = (row) => ({ title: row.title, repo: row.repo });
const none = { search: "", repo: ALL_REPOS };
const rowIds = (result) => result.map((s) => s.rows.map((r) => r.itemId));

test("no filter returns every row with its total", () => {
  const result = filterSections(sections, none, viewOf);
  assert.deepEqual(result.map((s) => s.total), [2, 1, 1]);
  assert.equal(filterSummary(result, sections), "Showing 4 of 4");
});

test("search matches title, repo, detail, task id and PR number without regard to case", () => {
  const ids = (search) => rowIds(filterSections(sections, { ...none, search }, viewOf)).flat();
  assert.deepEqual(ids("SIDEBAR"), ["t-1", "t-1"]);
  assert.deepEqual(ids("api"), ["t-2"]);
  assert.deepEqual(ids("building"), ["t-1"]);
  assert.deepEqual(ids("t-3"), ["t-3"]);
  assert.deepEqual(ids("#42"), ["t-1"]);
  assert.deepEqual(ids("  tidy "), ["t-3"]);
});

test("a section with no match is left out and keeps its total", () => {
  const result = filterSections(sections, { ...none, search: "fix" }, viewOf);
  assert.deepEqual(result.map((s) => s.id), ["in-flight"]);
  assert.deepEqual([result[0].rows.length, result[0].total], [1, 2]);
  assert.equal(filterSummary(result, sections), "Showing 1 of 4");
});

test("search and repo combine", () => {
  assert.deepEqual(rowIds(filterSections(sections, { search: "sidebar", repo: "api" }, viewOf)), []);
  assert.deepEqual(rowIds(filterSections(sections, { search: "sidebar", repo: "web-app" }, viewOf)), [["t-1"], ["t-1"]]);
});

test("a repo filter keeps only that repo's cards", () => {
  assert.deepEqual(rowIds(filterSections(sections, { ...none, repo: "api" }, viewOf)), [["t-2"]]);
});

test("the repo list counts every section, sorts by name and skips cards without a repo", () => {
  assert.deepEqual(repoOptions(sections, viewOf), [{ repo: "api", count: 1 }, { repo: "web-app", count: 2 }]);
});

test("a selected repo that is gone falls back to all repos", () => {
  const options = repoOptions(sections, viewOf);
  assert.equal(validRepo("api", options), "api");
  assert.equal(validRepo("gone", options), ALL_REPOS);
});

test("only text or a repo counts as a filter", () => {
  assert.equal(isFiltering(none), false);
  assert.equal(isFiltering({ search: "  ", repo: ALL_REPOS }), false);
  assert.equal(isFiltering({ search: "x", repo: ALL_REPOS }), true);
  assert.equal(isFiltering({ search: "", repo: "api" }), true);
});

test("a row keeps its place in the section when others are filtered out", () => {
  const [section] = filterSections(sections, { ...none, search: "login" }, viewOf);
  assert.deepEqual(section.rows.map((row) => row.index), [1]);
});
