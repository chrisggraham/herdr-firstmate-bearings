# Firstmate Bearings

Firstmate Bearings is a sidebar panel for the Herdr desktop app. It shows the bearings of a [Firstmate](https://github.com/kunchenguid/firstmate) that is open in any tab. It only reads. It never switches tabs and never changes Firstmate.

## Features

- Lists the Firstmates open anywhere in Herdr, on this computer and on connected machines.
- Shows one Firstmate's bearings in six sections: Waiting on you, In flight, PRs, Secondmates, Queued and Landed. Each section is collapsible and shows a count. Sections with nothing in them are hidden.
- Each item is a card with a color bar for its section, its full title, a status pill (for example working, held, merged) and a muted repo and detail line. A left click opens the card in place to show every field of the task (from `fm-tasks-axi.sh show <id> --full`, fetched once per task) and then the snapshot fields it lacks. Click again to close it.
- Section and card open or closed state survives a switch of space.
- Refreshes every 30 seconds, or at once with the refresh button in the header. If a refresh fails, the last data stays, marked with its age, with one error line.
- A PR card has a chip like "PR #12" with its repo; it opens the PR in your browser.
- Every section shows all its items: the snapshot is fetched with `--all-decisions` and `--all-landed`.
- No dependencies and no build step.

## Install

The mod runs `bin/fm-bearings-snapshot.sh` from a Firstmate home on your machines. Install it only if you want that.

1. Copy or link `mods/firstmate-bearings` into `~/.config/herdr-app/mods/`.
2. Add the **Firstmate** button and the panel block to your tab bar and layout. Give your Herdr agent the URL of this repo, or follow `RECIPE.md`.
3. Check the mod: `herdr-app check ~/.config/herdr-app/mods/firstmate-bearings`

## Use

1. Click **Firstmate** in the tab bar. The panel lists the Firstmates found in open tabs.
2. Pick one. With exactly one found, the panel shows it at once.
3. With more than one Firstmate, click the name box at the top (it has a chevron) to go back to the list. With one Firstmate, the panel opens it directly and shows no box.

The speech-bubble icon button (tooltip "Discuss with Firstmate") in an expanded card opens a short note to that Firstmate about the item. A dialog takes a short note. **Send** adds the note to that Firstmate's inbox with `bin/fm-inbox.sh note`, with only the section and the item id (never the row's text). The note box is multi-line: Enter adds a line, Cmd or Ctrl+Enter sends, and Esc cancels. On success the dialog closes and the card's Discuss icon shows a check for a few seconds; a failure keeps the dialog open with the error. Nothing is typed into the Firstmate pane.

The pick is shared by every tab and is kept across restarts. A Firstmate is found when one of its panes is open in its home folder. A Firstmate with only a worker tab open is not found.

## Settings

`mods/firstmate-bearings/config.json` holds the settings. It is read on every refresh.

```json
{ "hideEmptySections": true, "demo": false }
```

- `hideEmptySections` (default `true`): hide a section that has no items. Set it to `false` to show every section.
- `demo` (default `false`): show a built-in sample Firstmate instead of the real ones. See Demo mode.

## Demo mode

Demo mode shows invented data, so a screenshot never shows real projects. It is for taking a screenshot of the panel.

1. Set `"demo": true` in `mods/firstmate-bearings/config.json`. The panel picks it up within a few seconds.
2. The panel lists one Firstmate named `demo` on the host `example`. Open it: it has a few sample projects and tasks in every section.
3. Take the screenshot.
4. Set `"demo": false` again.

In demo mode the panel runs no command and writes no log line. The Discuss and action buttons look and work as usual, including the check after a send, but send nothing. Refresh only draws the sample data again. The sample data is in `mods/firstmate-bearings/demo.js`.

## Errors

Every error the mod catches is logged with its time, where it happened and a short message, in `firstmate-bearings.log` in the Herdr app folder (`~/.config/herdr-app/`, or `$HERDR_APP_HOME`). The log keeps the newest 200 lines. Each line also goes to the app's console output.

## Update

Pull this repo again. Herdr reloads the mod.

## Development

- `npm test` runs `node --test`. There are no dependencies.
- `herdr-app check mods/firstmate-bearings` checks the mod.
- `docs/design.md` describes the data contract, discovery and display.

An expanded card also shows small action buttons, only when its data proves the action is valid: **Done** (a hand task), **Defer** (a hold that is not deferred) and **Drop** in Waiting on you, **Stop** for a working task, and **Start now** for a queued item that is not blocked or held. Drop and Stop ask first. Each button sends one note, `[bearings panel] <action> <section> <item id>`, through the same inbox command; the panel runs nothing else. PR and Landed cards have Discuss only.
