# Design: Firstmate Bearings

A Herdr app sidebar panel. It lists the Firstmates open anywhere in Herdr. Pick one and its bearings show. It never changes tabs and never moves Firstmate.

## Data contract

- Only source: `bin/fm-bearings-snapshot.sh --json` in a Firstmate home. The script's header and `--help` own the contract.
- `schema` must be `fm-bearings.v1`. Anything else shows "Unsupported bearings version (got X)" and no sections.
- Ignore unknown keys. A missing key is an empty section.
- Never read Firstmate's `state/` or `data/`. Never use the output's `home` field (it can be relative); the name comes from discovery.
- Use no `--include-prs`. Always pass `--all-decisions` and `--all-landed`, so every item shows.
- After each snapshot, run `<home>/bin/fm-tasks-axi.sh show <id> --full` once per task id not yet cached (three at a time), and again only when that id's snapshot entry changes. The record gives the card its full title and fields.
- Command: `exec("<home>/bin/fm-bearings-snapshot.sh", ["--json"], {on: machine})`, 30 s timeout, `on` omitted for this machine.

## Discovery

- Candidates are every open pane in every space on every machine: the pane's `cwd` plus the machine of its space. Skip empty folders and mod panes.
- Per new machine and folder pair, run `test -x <folder>/bin/fm-bearings-snapshot.sh` on that machine. Exit 0 means a Firstmate home. Cache the result for the life of the mod.
- A Firstmate's key is machine plus home path. Duplicates collapse.
- Name: the space's name when someone named it, else the home folder's name, plus the machine for remote ones ("crew · build-box").
- Known gap: a Firstmate with no pane in its home folder is not found.

## Picking and fetching

- The shown space is the one `spaces()` marks `active`. The panel is built again on a space switch and chooses again.
- The shown Firstmate is chosen by `chooseHome` in `homes.js`, in this order: a Firstmate with a pane in the space (several: the space's pick if it is one of them, else the first); the space's pick; the last Firstmate viewed; the only one found. If none applies, show the list.
- Picks are kept in `localStorage` by space id and Firstmate key. Picks for spaces that no longer exist are dropped when a pick is saved. The last viewed Firstmate is kept in its own key.
- A pick in a space that has one Firstmate pane does not change what shows, because the pane decides. The back arrow still opens the list.
- Only the picked Firstmate is fetched: on pick, then every 30 s. One run at a time.
- The last parsed bearings of each Firstmate and the time they were fetched are kept in `localStorage` (one entry per Firstmate; entries for Firstmates no longer found are dropped on save). When the panel is built again or the shown Firstmate changes, those bearings show at once with "updated" counted from their fetch time, and a fetch runs while they stay on screen. Loading shows only when a Firstmate has no kept bearings. Full task records are not kept; they are fetched again.
- On failure (transport error, timeout, non-zero exit, bad JSON), keep the last good data, mark it stale with its age, and show one error line.

## Display

Switcher, "updated 12s ago", then the filter row, then collapsible sections with counts (collapsed and opened state kept in `localStorage`, so a switch of space keeps it). A section with no items is hidden unless `hideEmptySections` is `false` in `config.json`.

The filter row sits under the header and is always visible. The search box and the repo select each take half the panel width and follow it when it is resized. Logic is in `filters.js`.

- Search matches the title, repo, detail line, task id and PR number, as a case-insensitive substring. `/` focuses it when the panel has the keyboard; Esc clears it; its × clears the text.
- The repo select lists "All repos", then every repo on any card in any section, by name, each with its card count. A long name is cut with an ellipsis in the trigger and in the list. A selected repo that no card has any more falls back to "All repos".
- The filters combine (AND). While one is on, a line under the filter row reads "Showing N of M · Clear filters", each section count reads "N of M", and a section with no match is hidden. Collapse state and card actions work on the cards that show.
- The filters are kept in the panel only: a new panel starts with none. The repo list has no arrow-key navigation (the kit's `Select` has none); it works with the pointer, and Esc closes it.

Each item is a card: a bar in the section color (Waiting on you blocked, In flight and PRs blue, Secondmates dim, Queued muted, Landed green), a title (two lines at most), a status pill, a muted repo label and detail line. Colors are theme tokens only. A left click opens the card in place to the full title and every fact the snapshot has for it; a second click closes it. Right-click is left free.

1. **Waiting on you**: `decisions_open[]` summary; opened, the question, key and owner. Highlighted above zero.
2. **In flight**: `in_flight[]` name; repo label, state pill, detail is doing.
3. **PRs**: `recorded_prs[]` titled by the task it belongs to; the card has a "PR #n" chip with the repo, which calls `cx.open_url(url)`.
4. **Secondmates**: `secondmates[]` id, state, freshness. Unreadable ones (freshness `unavailable`) are flagged.
5. **Queued**: `gates[]` title; opened, blocker, reason, owner, filed date.
6. **Landed**: `landed[]` what; opened, owner and artifact.

`unhealthy_endpoints` and the snapshot's "backend ..." notes are not shown. The snapshot checks each task's terminal through the terminal socket. That check can fail when the snapshot runs through the app on another machine, so it would show false alarms. Not shown: `reports`, `contributions`, `candidate_prs`.

## Errors and settings

Caught errors are logged to `firstmate-bearings.log` in the app folder (time, place, first line of the message; newest 200 lines). A remote machine is not asked anything until its layout is ready. `config.json` holds one setting, `hideEmptySections` (default true).

## Not built

Opening bearings as its own tab or space; any navigation or action on Firstmate; live PR status; a config file of homes; the terminal (TUI) Herdr; ssh.
