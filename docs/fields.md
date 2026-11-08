# Field catalog

This page records what Firstmate sends to the panel and how the panel shows it. All example values are invented.

The panel reads two sources:

- The snapshot: `fm-bearings-snapshot.sh --json --all-decisions --all-landed`. One call gives every section.
- The task record: `fm-tasks-axi.sh show <id> --full`. One call for each task id; the panel fetches it again only when the snapshot entry for that id changes.

Value types used below: **date** (`YYYY-MM-DD`), **enum**, **boolean** (`yes` or `no`), **id**, **URL**, **text** (free text), **list**. The snapshot writes `-` for no value. A record writes `-` or `none`.

## Snapshot

Top-level keys the panel does not read: `schema` (enum, `fm-bearings.v1`; the panel refuses any other value), `contributions` (object of counts for owned contributions), `secondmate_reconcile` (list), `reports` (list of `{id, path}`), `prs` (text, a note that PR discovery was not requested) and `omitted` (list of `{surface, reveal}`: what the snapshot left out and the flag that shows it).

| Key | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `schema` | enum | Snapshot version | `fm-bearings.v1` | Checked only |
| `home` | text | Name of the Firstmate home | `Workspace/example` | Not shown |
| `generated` | date-time (UTC) | When the snapshot was made | `2030-06-15T09:30:00Z` | Not shown |
| `decisions_open` | list | Holds that wait for the captain | see below | Section "Waiting on you" |
| `in_flight` | list | Tasks being worked on | see below | Section "In flight" |
| `recorded_prs` | list | Pull requests recorded for tasks | see below | Section "PRs" |
| `secondmates` | list | Secondmate homes and what they do | see below | Section "Secondmates" |
| `gates` | list | Queued tasks | see below | Section "Queued" |
| `landed` | list | Finished work | see below | Section "Landed" |

### `decisions_open` item

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Task id | `fix-login-form` | Key for the task record |
| `key` | id | Hold key | `fix-login-form` | Field "Key" |
| `verb` | enum (`captain-hold`) | Kind of hold | `captain-hold` | Not shown; the status pill says what to do |
| `summary` | text | Title and reason, cut short | `Fix login form: which error text?` | Card title (part before the last colon) |
| `question` | text | Full question | `Which error text should the login form show?` | Text field "Question" |
| `owner` | text | Home that owns it; `(main)` means this home | `(main)` | Field "Owner" (hidden for `(main)`) |

### `in_flight` item

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Task id | `example-task` | Key for the task record |
| `kind` | enum (`ship`, `task`) | Kind of work | `ship` | Badge "kind" |
| `state` | enum (`working`, `paused`, `done`) | Worker state | `working` | Status pill |
| `repo` | text | Repository name | `example-repo` | Repo on line 2 |
| `name` | text | Task title | `Add a search box` | Card title |
| `doing` | text | What the worker does now | `tests green on branch` | Detail line, and the text field "Doing" on the opened card (notes that start with `backend` are hidden) |

### `recorded_prs` item

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Task id | `example-task` | Card title comes from the task of this id |
| `url` | URL | Pull request | `https://example.com/acme/app/pull/12` | PR chip "PR #12" |

### `secondmates` item

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Secondmate id | `example-mate` | Card title |
| `state` | enum | State | `working` | Status pill |
| `doing` | text | What it does now | `reading the backlog` | Field "Doing" |
| `provenance` | enum | Where the facts came from (live or cached ledger) | `live` | Field "Source" |
| `freshness` | enum | How current the facts are; `unavailable` flags the card | `fresh` | Detail line and field |
| `age_seconds` | number | Age of the facts | `42` | Not shown |
| `contradiction` | text | Conflict between sources | `terminal shows idle` | Not shown |
| `reason` | text | Why the facts are as they are | `ledger unreadable` | Text field "Reason" |

### `gates` item

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Task id | `example-queued` | Key for the task record |
| `title` | text | Task title | `Add dark mode` | Card title |
| `blocked_by` | id or `-` | Task that blocks it | `example-first` | Field "Blocked by"; status pill "held" |
| `reason` | text or `-` | Why it waits | `waits for review` | Detail line and text field "Reason" |
| `owner` | text | Owning home | `(main)` | Field "Owner" |
| `filed` | date | Day it was queued | `2030-06-12` | Badge "filed 3d ago" |

### `landed` item

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Task id | `example-done` | Key for the task record |
| `what` | text | Title of the finished work | `Add a search box` | Card title |
| `artifact` | URL | Where the work landed (a merged pull request) | `https://example.com/acme/app/pull/9` | Link chip "PR #9" |

A landed item has no `repo`. The panel uses the `repo` of its task record.
| `owner` | text | Owning home | `(main)` | Field "Owner" |

## Task record

`show <id> --full` prints one `task:` block of `key: value` lines. The panel shows every key below that has a value, except the ones the card shows in another way.

| Field | Type | Meaning | Example | Panel |
|---|---|---|---|---|
| `id` | id | Task id | `example-task` | Badge "id" |
| `title` | text | Full title | `Add a search box` | Card title |
| `state` | enum (`queued`, `in_flight`, `done`) | Backlog state | `in_flight` | Status pill |
| `blocked` | boolean | A dependency is open | `yes` | Badge "blocked" (only when `yes`) |
| `blocked_by` | id or `none` | The blocking task | `example-first` | Badge "blocked by" |
| `held` | boolean | Held for the captain | `yes` | Badge "held" (only when `yes`) |
| `hold_reason` | text | Why it is held | `Needs a design choice` | Text field "Hold reason" |
| `hold_kind` | enum (`captain`) | Who must act | `captain` | Badge "hold kind" |
| `hold_until` | date or `-` | Hold ends on this day | `2030-06-20` | Badge "hold until in 5d" |
| `kind` | enum (`ship`, `task`, `ops`, `scout`, `docs`, `captain`) | Kind of work | `ship` | Badge "kind" |
| `repo` | text | Repository | `example-repo` | Repo on line 2 |
| `priority` | number or `-` | Priority | `1` | Badge "priority" |
| `created` | date | Day it was filed | `2030-06-10` | Badge "created 5d ago" |
| `closed` | date or `-` | Day it was closed | `2030-06-14` | Badge "closed 1d ago" |
| `deps` | list (`blocked-by:<id>`) | Tasks it depends on | `blocked-by:example-first` | Badge "deps" |
| `links` | list (`<name>:<URL or path>`) | Pull requests and reports | `pr:https://example.com/acme/app/pull/12` | Link chip "PR #12" |
| `body` | text | Long description | `Add a search box to the page header.` | Text field "Body" |

## Layout of a card

A card has two lines. A closed card shows only these two lines. An opened card adds the parts below them. All sections use this layout.

**Line 1:** the title, cut to one line when closed, with the status pill or the PR chip at its right. A click on line 1 opens or closes the card.

**Line 2:** always shown, even with no repo. A click on line 2 runs an action and never opens the card.

- Left: the repo (git-branch icon), shown in full, then the PR chip when the item has a PR link. The line does not wrap. When the line is too narrow, the PR chip is cut before the repo. No badge is on line 2.
- Right: every valid action icon for the section, then Discuss.
- The repo comes from the PR, then the snapshot row, then the `repo` of the task record. The snapshot has no repo for Landed rows, so the record gives it. The panel never takes a repo from a URL.

**Opened part**, top to bottom:

1. One wrapping row of all the **badges**: short values (enum, boolean, date, id, priority, kind). A badge is small and rounded with a subtle background. The key is a dim prefix ("kind ship"). A boolean shows only when true, as its name ("blocked"). A date shows as a relative age ("filed 3d ago") with the full date as the tooltip. When `created` and `filed` have the same date, only "filed" shows. `closed` always shows.
2. The detail line (for example what the worker does now).
3. **Text paragraphs**: `hold_reason`, `question`, `body`, `reason`, and any value longer than 40 characters. Each has a small dim label above and wraps in the softer value color. A URL inside a text paragraph stays a link.
4. **Link chips** that are not the PR chip on line 2. There is no divider.

Rules:

- A field the card shows in another way is skipped (title, repo, state as the status pill, the PR URL as the PR chip). An empty value is skipped.
- A URL in any other field is never shown as raw text. It becomes a link chip: the first pull request on line 2, any other link at the end of the opened part. A pull request shows the git-compare icon and "PR #12". Any other URL shows a link icon with the host and last path part ("docs.example.com/setup"). The same URL shows once.

## Ideas

Each typed field can drive more than text:

- `filed`, `created`: relative age ("3d ago"). Color the badge as stale after a set number of days. Sort the section by age.
- `closed`: "landed 2d ago" on Landed cards. Group Landed by day.
- `hold_until`: "until Nov 15", and sort held cards by the day. Mark a hold whose day has passed.
- `priority`: a marker on the closed card, and sort by it inside a section.
- `blocked_by`: a link to the blocking card that opens it and scrolls to it.
- `deps`: the same link to each task it depends on.
- `links`: link chips, as above. A `report:` link can open the report file.
- `artifact` on Landed cards: a "PR #9" chip. Next steps: show the merge state, or the time from `created` to `closed` as "took 3d".
- `generated`: show "updated 2m ago" in the panel header, so a stale snapshot is easy to see.
- Age of in-flight work: the days since `created`, shown on the card. A long age is a sign of stuck work.
- `kind`: a small icon for each kind instead of a word.
