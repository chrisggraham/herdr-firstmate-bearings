// The filters of the panel: a text search and a repo. Pure: no Herdr calls.

export const ALL_REPOS = "";

export const isFiltering = ({ search, repo }) => search.trim() !== "" || repo !== ALL_REPOS;

// `view` is what the card shows: { title, repo }. A PR row's chip text ("PR #12") holds the PR number.
function haystack(row, view) {
  return [view.title, view.repo, row.detail, row.itemId, row.pr?.label].filter(Boolean).join("\n").toLowerCase();
}

const matches = (row, view, { search, repo }) =>
  (repo === ALL_REPOS || view.repo === repo) && haystack(row, view).includes(search.trim().toLowerCase());

// The sections that hold a match, each with its matching rows and `total`, the rows it had.
// Each row keeps its `index` in the whole section, so the id of an opened card does not move.
// A section with no match is left out. With no filter on, every section stays.
export function filterSections(sections, filter, viewOf) {
  const on = isFiltering(filter);
  return sections
    .map((section) => ({
      ...section,
      total: section.rows.length,
      rows: section.rows.map((row, index) => ({ ...row, index })).filter((row) => !on || matches(row, viewOf(row), filter)),
    }))
    .filter((section) => !on || section.rows.length > 0);
}

// "All repos" is the caller's; this lists every repo on any card in any section, by name, with its card count.
export function repoOptions(sections, viewOf) {
  const counts = new Map();
  for (const { rows } of sections) {
    for (const row of rows) {
      const { repo } = viewOf(row);
      if (repo) counts.set(repo, (counts.get(repo) ?? 0) + 1);
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([repo, count]) => ({ repo, count }));
}

// A selected repo that no card has any more falls back to all repos.
export const validRepo = (repo, options) => (options.some((option) => option.repo === repo) ? repo : ALL_REPOS);

// "Showing 3 of 12": the cards that show out of all the cards.
export function filterSummary(filtered, all) {
  const count = (sections) => sections.reduce((sum, section) => sum + section.rows.length, 0);
  return `Showing ${count(filtered)} of ${count(all)}`;
}
