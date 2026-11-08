# Design: Firstmate Bearings

A Herdr app sidebar panel. It lists the Firstmates open anywhere in Herdr. Pick one and its bearings show. It never changes tabs and never moves Firstmate.

## Data contract

- Only source: `bin/fm-bearings-snapshot.sh --json` in a Firstmate home. The script's header and `--help` own the contract.
- `schema` must be `fm-bearings.v1`. Anything else shows "Unsupported bearings version (got X)" and no sections.
- Ignore unknown keys. A missing key is an empty section.
- Never read Firstmate's `state/` or `data/`. Never use the output's `home` field (it can be relative); the name comes from discovery.
- Use the default limited output, with no `--include-prs`. When `omitted[]` is non-empty, show a "Show N more" button that fetches the full lists in place; "Show fewer" goes back.
- Command: `exec("<home>/bin/fm-bearings-snapshot.sh", ["--json"], {on: machine})`, 30 s timeout, `on` omitted for this machine.

## Discovery

- Candidates are every open pane in every space on every machine: the pane's `cwd` plus the machine of its space. Skip empty folders and mod panes.
- Per new machine and folder pair, run `test -x <folder>/bin/fm-bearings-snapshot.sh` on that machine. Exit 0 means a Firstmate home. Cache the result for the life of the mod.
- A Firstmate's key is machine plus home path. Duplicates collapse.
- Name: the space's name when someone named it, else the home folder's name, plus the machine for remote ones ("crew · build-box").
- Known gap: a Firstmate with no pane in its home folder is not found.

## Picking and fetching

- Nothing picked and two or more found: show the list. Exactly one found: show it.
- One pick for the whole panel, kept in `localStorage` by key. If the pick is no longer found, the panel goes back to the list, or to the only one left.
- Only the picked Firstmate is fetched: on pick, then every 30 s. One run at a time.
- On failure (transport error, timeout, non-zero exit, bad JSON), keep the last good data, mark it stale with its age, and show one error line.

## Display

Switcher, "updated 12s ago", then collapsible sections with counts (collapsed state in memory only), one truncated line per item:

1. **Waiting on you**: `decisions_open[].summary`, highlighted above zero.
2. **In flight**: `in_flight[]` name, state, doing.
3. **PRs**: `recorded_prs[]` id and URL. A click calls `cx.open_url(url)`.
4. **Secondmates**: `secondmates[]` id, state, freshness. Unreadable ones (freshness `unavailable`) are flagged.
5. **Queued**: `gates[].title`.
6. **Landed**: `landed[].what`.

A muted line in plain words names each secondmate task with no running agent when `unhealthy_endpoints` is non-empty; it is not an alarm. Not shown: `reports`, `contributions`, `candidate_prs`.

## Not built

Opening bearings as its own tab or space; any navigation or action on Firstmate; live PR status; a config file of homes; the terminal (TUI) Herdr; ssh.
