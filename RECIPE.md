# Firstmate Bearings: recipe

This recipe builds the mod, or installs it from this repo, for a Herdr agent.

## What you see

A **Firstmate** button in the tab bar opens a sidebar panel. The panel lists open Firstmates, then shows the picked one's bearings: a switcher with "updated Ns ago", then six collapsible sections with counts.

## How it behaves

- Candidates are the folders of all open panes in all spaces, with the machine of each pane's space. Mod panes and empty folders are skipped.
- A candidate is a Firstmate home when `test -x <folder>/bin/fm-bearings-snapshot.sh` exits 0 on its machine. The result is cached per machine and folder.
- Only the picked Firstmate is fetched, right away and then every 30 seconds: `exec("<home>/bin/fm-bearings-snapshot.sh", ["--json"], {on: machine})`. One run at a time.
- The schema must be `fm-bearings.v1`; anything else shows "Unsupported bearings version (got X)".
- The PR chip of a PR row calls `cx.open_url(url)`.

## Built from

- `mods/firstmate-bearings/homes.js`: candidates, dedupe and names. No Herdr calls.
- `mods/firstmate-bearings/bearings.js`: parse, schema check and sections. No Herdr calls.
- `mods/firstmate-bearings/main.js`: the view, the picker (kept in `localStorage`), timers and `exec`.
- `mod.json`: `{"place": "none", "title": "Firstmate Bearings"}`.

## Install into the user's Herdr

1. Warn the user: this mod runs a program (`bin/fm-bearings-snapshot.sh`) on their machines. Continue only if they agree.
2. Put `mods/firstmate-bearings` in `~/.config/herdr-app/mods/`.
3. If the user has their own tab bar and layout, edit them. If they use Herdr's stock ones, first run `herdr-app do layout.clone '{"name":"main","as":"main-firstmate"}'` and `herdr-app do mod.clone '{"name":"tabs","as":"tabs-firstmate"}'`, then edit the copies.
4. In the layout, add this block to the `panel-body` stack: `{"id": "firstmate-bearings", "type": "block", "content": {"mod": "firstmate-bearings"}}`.
5. In the tab-bar mod, add a line like Herdr's Files button: `panelButton("firstmate-bearings", "Firstmate", "mods/firstmate-bearings/icon.svg")`.

## Watch out

- A Firstmate with no pane in its home folder is not found.
- Open or closed state of the panel is the tab bar's, not the mod's.
- The mod never reads Firstmate's `state/` or `data/`, and never uses the snapshot's `home` field.

## Done when

- `herdr-app check mods/firstmate-bearings` passes and `node --test` passes.
- From a tab with no Firstmate, the panel lists the open Firstmates.
- Picking one shows its bearings within 5 seconds without changing the tab.
- Closing every tab of a Firstmate removes it from the list.
- With the Firstmate's machine disconnected, the last data stays, marked stale, with an error line.
- After a Herdr restart, the panel shows the same pick.
