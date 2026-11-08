# Plan: Firstmate Bearings

A Herdr app sidebar panel, opened like Files or Changes from any tab. It lists the Firstmates open anywhere in Herdr. Pick one and its bearings show in the panel. It never changes tabs and never moves Firstmate.

Status: planned 2026-11-08. No open questions. If the build reaches a point this plan does not decide, stop and ask; do not guess.

## Background

- [Firstmate](https://github.com/kunchenguid/firstmate) (MIT) ships `bin/fm-bearings-snapshot.sh` in every home. `--json` prints a snapshot with `schema: "fm-bearings.v1"`. The script's header (lines 1–95) and `--help` own the contract. One run takes 3–4 s.
- Herdr app mods are JS (`main.js` default-exports a `View`), documented in `~/.config/herdr-app/AGENTS.md`, `herdr.d.ts` and `gpui-kit.d.ts`. `exec(cmd, args, {on, timeout})` runs a program on this machine or, with `on: <machine>`, on a machine Herdr knows. `cx.open_url(url)` hands a URL to the system.
- Herdr has no hook to add a panel button. A panel is a block in the layout's `panel-body` stack, and its button is a line in the tab-bar mod.
- Starting pattern: Herdr's built-in Files mod (`~/.config/herdr-app/mods/files/main.js`: timer refresh, `exec`, re-fetch when a render key changes) and the `herdr-folders` mod (github.com/chrisggraham/herdr-folders) (pure logic in its own file, tested with `node --test`, README and RECIPE shape).
- Herdr runs one copy of a panel mod. It starts the first time it is shown and stays alive while it is in the layout.

## Scope

### Placement
- Mod folder `mods/firstmate-bearings/`. Panel block: `{"id": "firstmate-bearings", "type": "block", "content": {"mod": "firstmate-bearings"}}` in `panel-body`. Tab-bar button label: **Firstmate**, with `icon.svg`.
- Open or closed state is whatever the user's tab bar already does (per space or per tab). The mod does not touch it.

### Finding Firstmates
- Works from any tab: candidates are every open pane in every space and on every machine. Each pane's `cwd` (`panes()`) is paired with the machine of the space that holds its tab (`spaces()`). Skip empty folders and mod panes. Recompute when these live lists change.
- For each new machine and folder pair, run `test -x <folder>/bin/fm-bearings-snapshot.sh` on that machine. Exit 0: that folder is a Firstmate home.
- Cache each pair's result for the life of the mod.
- Known gap: a Firstmate with no pane in its home folder (for example only a worker tab open) is not found.
- A Firstmate's key is machine plus home path. Duplicates collapse.
- Name: the space's name when someone named it, else the home folder's name. Add the machine for remote ones ("crew · build-box").
- Only Firstmates with a tab open somewhere are found. There is no config file.

### Picking
- Heading of the list: **Firstmates**.
- Nothing picked and two or more found: show the list. Exactly one found: show it directly.
- A switcher at the top shows the picked Firstmate; clicking it reopens the list.
- One pick for the whole panel (Herdr's single copy), remembered in `localStorage` by key across restarts.
- If the picked Firstmate is no longer found (its tabs closed), the panel goes back to the list, or to the only one left.

### Fetching
- Only the picked Firstmate is fetched: right away on pick, then every 30 s.
- Command: `exec("<home>/bin/fm-bearings-snapshot.sh", ["--json"], {on: machine})`, with Herdr's default 30 s timeout. `on` is omitted for this machine.
- One run at a time; skip a tick while one is running.
- No `--include-prs`. No GitHub calls.
- On a failure (transport error, timeout, non-zero exit, bad JSON), keep the last good data, mark it stale with its age, and show one error line with the reason.

### Data rules
- Only source: the script's JSON. Never read Firstmate's `state/` or `data/`.
- `schema` must be `fm-bearings.v1`. Anything else shows "Unsupported bearings version (got X)" and no sections.
- Ignore unknown keys. A missing key is an empty section.
- Never use the output's `home` field (it can be relative); the name comes from discovery.
- Use the default limited output. When `omitted[]` is non-empty, show "More not shown" at the end.

### Display
Switcher, "updated 12s ago", then collapsible sections, each with a count. Collapsed state lives in memory only. One truncated line per item.

1. **Waiting on you**: `decisions_open[].summary`. Highlighted when above zero.
2. **In flight**: `in_flight[]`: name, state, doing.
3. **PRs**: `recorded_prs[]`: task id and the URL. Clicking a row calls `cx.open_url(url)`. This is the only click that leaves the panel.
4. **Secondmates**: `secondmates[]`: id, state, freshness. Flag unreadable ones.
5. **Queued**: `gates[].title`.
6. **Landed**: `landed[].what`.

When `unhealthy_endpoints` is present and non-empty, show a warning line under the switcher. Not shown: `reports`, `contributions`, `candidate_prs`.

## Out of scope (v1)
- Opening bearings as its own tab or space (v2: buttons calling `tab.new` with this mod).
- Any navigation or action on Firstmate: switching tabs, jump to worker, edits.
- Live PR status (`--include-prs`), a config file of homes, the terminal (TUI) Herdr, ssh.
- Changing how the sidebar opens or closes.

## Repo

```
herdr-firstmate-bearings/
  mods/firstmate-bearings/
    main.js       view, picker, timers, exec
    homes.js      candidates, dedupe, naming (pure)
    bearings.js   parse, schema check, sections (pure)
    mod.json      title "Firstmate Bearings", version
    icon.svg
  test/           node --test on homes.js and bearings.js
  test/fixtures/  invented sample output
  README.md       Features, Install, Use, Update, Development
  RECIPE.md       Herdr's six-section recipe (AGENTS.md "recipe" section)
  preview.png
  LICENSE         MIT
  docs/plan.md    this file; becomes docs/design.md after the build
```

Same shape as `herdr-folders`: no build step, no dependencies. Gitignore Herdr's generated `gpui-kit.d.ts`, `herdr.d.ts` and `jsconfig.json`.

RECIPE.md tells the user's agent to add the button and the panel block to the user's own tab bar and layout. If they use Herdr's stock ones, the agent first runs `layout.clone` and `mod.clone tabs`, then edits the copies. It must warn that the mod runs a program on the user's machines.

## Tests

`node --test`:
- `homes.js`: panes and spaces across two machines give the right candidates; duplicates collapse by machine and home; a folder without the script is not a home; naming uses the space name when named, else the folder name; remote names include the machine.
- `bearings.js`: a v1 fixture gives six sections with the right counts; an unknown schema gives the unsupported state; missing keys give empty sections; `omitted` and `unhealthy_endpoints` produce their lines; PR rows carry their URLs.
- Fixtures are invented: no real task names, repos, URLs or questions. Real bearings output holds private text and never goes in the repo.

`herdr-app check mods/firstmate-bearings` passes.

## QA (by hand, on the machine running the Herdr app)

Setup: symlink the mod into `~/.config/herdr-app/mods/`, then add the button line and the panel block to the tester's own tab-bar mod and layout, as RECIPE.md says. Have two Firstmates open in tabs: A on this machine or a remote one, B on a remote machine.

1. From a tab with no Firstmate, open the panel: A and B are listed under "Firstmates".
2. Pick A: bearings show within 5 s, and the current tab does not change.
3. "Waiting on you" matches `/bearings` in that Firstmate.
4. Click a PR row: it opens in the browser.
5. Open the panel in another space: it shows the same pick.
6. Close every tab of B: B leaves the list.
7. Disconnect B's machine while B is picked: the last data stays, marked stale, with an error line.
8. Restart Herdr: the panel shows the same pick.

## Decision log (2026-11-08)

| # | Question | Answer |
|---|---|---|
| 1 | Who plans, who builds | Plan in a direct session; Firstmate builds |
| 2 | Shape | Sidebar panel only; no tab or space in v1 |
| 3 | Navigation | None; never switch tabs or move Firstmate |
| 4 | Which Firstmate | Picker of Firstmates found in open tabs; no config |
| 5 | Remote access | Herdr's `exec {on}`; never ssh |
| 6 | Installing for others | RECIPE.md tells the user's agent to add button and panel |
| 7 | Pick shared across tabs | Yes, Herdr's default (one panel copy) |
| 8 | TUI Herdr | App only in v1 |
| 9 | PRs | Firstmate's recorded PRs as clickable URLs; no live check |
| 10 | Item detail | One truncated line per item |
| 11 | Button label | Firstmate |
| 12 | Plan location | `docs/plan.md`, then `docs/design.md` |
| 13 | License | MIT |
| 14 | Repo | `herdr-firstmate-bearings`, private until v1 ships, then public; no personal data in it |
| 15 | Runbook changes (Decisions stage, stop-and-ask) | After this plan is built |
