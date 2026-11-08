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

- Nothing picked and two or more found: show the list. Exactly one found: show it.
- One pick for the whole panel, kept in `localStorage` by key. If the pick is no longer found, the panel goes back to the list, or to the only one left.
- Only the picked Firstmate is fetched: on pick, then every 30 s. One run at a time.
- On failure (transport error, timeout, non-zero exit, bad JSON), keep the last good data, mark it stale with its age, and show one error line.

## Display

Switcher, "updated 12s ago", then collapsible sections with counts (collapsed and opened state kept in `localStorage`, so a switch of space keeps it). A section with no items is hidden unless `hideEmptySections` is `false` in `config.json`.

Each item is a card: a bar in the section color (Waiting on you blocked, In flight accent, PRs blue, Secondmates dim, Queued muted, Landed done), a title (two lines at most), a status pill, a muted repo label and detail line. Colors are theme tokens only. A left click opens the card in place to the full title and every fact the snapshot has for it; a second click closes it. Right-click is left free.

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
