// A sidebar panel that shows the bearings of one open Firstmate. It never switches tabs.
// openAskDialog opens a dialog (this same mod as an overlay) that sends one note to that Firstmate.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, machines, exec, theme, props, openOverlay, closeOverlay, notify, appHome, readTextFile, writeTextFile } from "herdr";
import { awayPath, findCandidates, inboxPath, listHomes, needsCheck, scriptPath, showPath } from "./homes.js";
import { REVEAL_FLAGS, cardOf, isAwayRefusal, readBearings } from "./bearings.js";
import { dropGoneRecords, keysToFetch } from "./records.js";
import { parseTaskRecord } from "./toon.js";
import { noteArgs, newRequestId } from "./ask.js";
import { readConfig } from "./config.js";
import { LOG_FILE, formatLine, appendLine } from "./log.js";
import { loadSet, saveSet, toggleId } from "./state.js";

const FETCH_EVERY_MS = 30000;
const CLOCK_EVERY_MS = 5000;
const REPO_URL = "https://github.com/chrisggraham/herdr-firstmate-bearings";
const PICK_STORE = "picked";
const COLLAPSED_STORE = "collapsed";
const EXPANDED_STORE = "expanded";
const SHOW_PARALLEL = 3;
const FIELD_KEY_WIDTH = 96;
const PILL_ALPHA = "26";
const CHIP_HOVER_ALPHA = "40";

const ago = (ms) => {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
};

// A remote machine answers only once its layout is ready; asking sooner fails.
const machineReady = (machine) => machine === null || machines().some((m) => m.name === machine && m.layout === "ready");

const firstLine = (text) => String(text).trim().split("\n")[0];

export default class FirstmateBearings extends View {
  init(_props, cx) {
    if (props()?.ask) return this.initAsk(cx);
    this.checks = new Map();
    this.counts = new Map();
    this.away = false;
    this.awayHomes = new Set();
    this.homes = [];
    this.picked = localStorage.getItem(PICK_STORE);
    this.listOpen = false;
    // Kept in storage: the panel is built again when the person switches spaces and comes back.
    this.collapsed = loadSet(localStorage, COLLAPSED_STORE);
    this.expanded = loadSet(localStorage, EXPANDED_STORE);
    // Full task records by Firstmate: home key -> task id -> { signature, record }.
    this.records = new Map();
    this.logging = Promise.resolve();
    this.shown = null;
    this.running = null;
    cx.timer.every(FETCH_EVERY_MS, (cx) => { this.fetch(cx); this.checkAway(cx); });
    cx.timer.every(CLOCK_EVERY_MS, (cx) => cx.notify());
  }

  // Adds one line to the log file in the Herdr app folder and to the app log. Never throws.
  logError(source, error) {
    const line = formatLine(new Date(), source, error);
    console.log(`firstmate-bearings ${line}`);
    const path = `${appHome()}/${LOG_FILE}`;
    this.logging = this.logging.then(async () => {
      const before = await readTextFile(path);
      await writeTextFile(path, appendLine(before, line), before);
    }).catch(() => {});
  }

  // Finds out which candidate folders are Firstmate homes. A folder that is not a home is checked
  // again after each fetch interval, because it may become one; a home is not checked again.
  discover(candidates, cx) {
    const now = Date.now();
    for (const candidate of candidates) {
      if (!needsCheck(this.checks, candidate.key, now, FETCH_EVERY_MS) || !machineReady(candidate.machine)) continue;
      this.checks.set(candidate.key, { found: false, at: now });
      cx.spawn(async (cx) => {
        const found = await this.hasScript(candidate);
        this.checks.set(candidate.key, { found, at: now });
        cx.notify();
      });
    }
  }

  // One cheap test per Firstmate: its state/.afk file exists while it is in away mode.
  checkAway(cx) {
    for (const home of this.homes) {
      if (!machineReady(home.machine)) continue;
      cx.spawn(async (cx) => {
        try {
          const result = await exec("test", ["-e", awayPath(home)], { on: home.machine });
          if (result.code === 0) this.awayHomes.add(home.key); else this.awayHomes.delete(home.key);
        } catch (e) {
          this.logError("away", e);
        }
        cx.notify();
      });
    }
  }

  async hasScript(candidate) {
    try {
      const result = await exec("test", ["-x", scriptPath(candidate)], { on: candidate.machine });
      return result.code === 0;
    } catch (e) {
      this.logError("discover", e);
      return false;
    }
  }

  // The Firstmate whose bearings show, or null when the list shows.
  currentHome(homes) {
    if (this.listOpen) return null;
    return homes.find((home) => home.key === this.picked) ?? (homes.length === 1 ? homes[0] : null);
  }

  // Starts a fresh fetch when the shown Firstmate changes.
  follow(home, cx) {
    const key = home?.key ?? null;
    // A remote machine that was not ready at the first fetch is tried again as soon as it is.
    if (key === this.shown) {
      if (home && !this.data && !this.error) this.fetch(cx);
      return;
    }
    this.shown = key;
    this.home = home;
    this.data = null;
    this.error = null;
    this.away = false;
    this.updated = null;
    if (home) this.fetch(cx);
  }

  pick(home, cx) {
    this.picked = home.key;
    this.listOpen = false;
    localStorage.setItem(PICK_STORE, home.key);
    cx.notify();
  }

  fetch(cx) {
    const home = this.home;
    if (!home || this.running === home.key || !machineReady(home.machine)) return;
    this.running = home.key;
    cx.spawn(async (cx) => {
      try {
        const config = readConfig(await readTextFile(`${appHome()}/mods/firstmate-bearings/config.json`).catch(() => null));
        const result = await exec(scriptPath(home), ["--json", ...REVEAL_FLAGS], { on: home.machine });
        if (isAwayRefusal(result.code, result.stderr)) {
          this.awayHomes.add(home.key);
          if (this.home?.key === home.key) Object.assign(this, { away: true, error: null });
          return;
        }
        if (result.code !== 0) throw new Error(firstLine(result.stderr) || `exit code ${result.code}`);
        const bearings = readBearings(result.stdout, { hideEmpty: config.hideEmptySections });
        if (this.home?.key === home.key) {
          Object.assign(this, { data: bearings, error: null, away: false, updated: Date.now() });
          this.awayHomes.delete(home.key);
        }
        this.counts.set(home.key, bearings.counts);
        this.fetchRecords(home, bearings.records, cx);
      } catch (e) {
        this.logError("fetch", e);
        if (this.home?.key === home.key) this.error = firstLine(e.message ?? e);
      } finally {
        if (this.running === home.key) this.running = null;
        cx.notify();
      }
    });
  }

  // Fetches the full record of each task id that has none yet, a few at a time. An id is marked
  // as fetched before the call, so no id is asked for twice; a failed call leaves an empty record.
  fetchRecords(home, keys, cx) {
    const cache = this.records.get(home.key) ?? new Map();
    this.records.set(home.key, cache);
    dropGoneRecords(keys, cache);
    const queue = keysToFetch(keys, cache);
    if (queue.length === 0) return;
    for (const { id, signature } of queue) cache.set(id, { signature, record: {} });
    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        await this.fetchRecord(home, key, cache);
        cx.notify();
      }
    };
    cx.spawn(() => Promise.all(Array.from({ length: SHOW_PARALLEL }, worker)));
  }

  async fetchRecord(home, { id, signature }, cache) {
    try {
      const result = await exec(showPath(home), ["show", id, "--full"], { on: home.machine });
      if (result.code !== 0) throw new Error(firstLine(result.stderr) || `exit code ${result.code}`);
      if (cache.get(id)?.signature === signature) cache.set(id, { signature, record: parseTaskRecord(result.stdout) });
    } catch (e) {
      this.logError("show", e);
    }
  }

  toggle(id, cx) {
    toggleId(this.collapsed, id);
    saveSet(localStorage, COLLAPSED_STORE, this.collapsed);
    cx.notify();
  }

  toggleCard(id, cx) {
    toggleId(this.expanded, id);
    saveSet(localStorage, EXPANDED_STORE, this.expanded);
    cx.notify();
  }

  // A click on the refresh button fetches at once; a fetch that is running ignores it.
  refresh(cx) {
    this.fetch(cx);
    cx.notify();
  }

  // The dialog: one text input, Cancel and Send. It runs no timers and no discovery.
  initAsk(cx) {
    this.ask = props().ask;
    this.requestId = newRequestId();
    this.text = "";
    this.sending = false;
    this.input = InputState.new({ value: "" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.send(cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // The way in for the panel: call this from the "Ask Firstmate" button of an expanded card.
  openAskDialog(sectionId, itemId) {
    const home = this.home;
    const ask = { machine: home.machine, folder: home.folder, homeName: home.name, sectionId, itemId };
    openOverlay({ mod: "firstmate-bearings", kind: "dialog", width: 380, props: { ask } });
  }

  send(cx) {
    if (this.sending) return;
    this.sending = true;
    const { machine, homeName, sectionId, itemId } = this.ask;
    cx.spawn(async (cx) => {
      try {
        const result = await exec(inboxPath(this.ask), noteArgs(this.requestId, sectionId, itemId, this.text), { on: machine });
        if (result.code !== 0) throw new Error(firstLine(result.stderr) || `exit code ${result.code}`);
        notify({ title: `Sent to ${homeName}`, level: "success" });
        closeOverlay(props().overlay);
      } catch (e) {
        notify({ title: `Could not send to ${homeName}`, body: firstLine(e.message ?? e), level: "error" });
      } finally {
        this.sending = false;
        cx.notify();
      }
    });
  }

  askKey(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  askView() {
    const t = theme();
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("firstmate-ask").track_focus(this.handle).on_key_down((e, cx) => this.askKey(e, cx))
      .w_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().child(div().flex_1().min_w(0).truncate().text_size(15).font_semibold().child(`Ask ${this.ask.homeName} about this`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(14).pb(7).text_size(11.5).text_color(t.dim).child("Your note (optional)"))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(t.accent).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().pt(20).gap(8).justify_end()
        .child(button("ask-cancel", "Cancel", false, () => closeOverlay(props().overlay)))
        .child(button("ask-send", this.sending ? "Sending…" : "Send", true, (_e, cx) => this.send(cx))));
  }

  render(cx) {
    if (this.ask) return this.askView();
    const t = theme();
    const candidates = findCandidates(spaces(), panes());
    this.discover(candidates, cx);
    const homes = listHomes(candidates, this.checks);
    const keys = (list) => list.map((h) => h.key).join("|");
    const changed = keys(homes) !== keys(this.homes);
    this.homes = homes;
    if (changed) this.checkAway(cx);
    const home = this.currentHome(homes);
    this.follow(home, cx);

    const body = home ? this.bearingsView(home, t) : this.listView(homes, t);
    return v_flex().id("firstmate-bearings").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13).child(body);
  }

  // The first page: the mod's icon, what it is, the repo link and one card per Firstmate.
  listView(homes, t) {
    const link = div().id("repo-link").text_size(12).text_color(t.accent).cursor_pointer().hover((s) => s.opacity(0.8))
      .on_click((_e, cx) => cx.open_url(REPO_URL)).child("github.com/chrisggraham/herdr-firstmate-bearings");
    const intro = v_flex().flex_none().px(14).py(12).gap(6)
      .child(h_flex().gap(8).items_center().child(svg("mods/firstmate-bearings/icon.svg").size(18).flex_none().text_color(t.accent))
        .child(div().font_semibold().child("Firstmate Bearings")))
      .child(div().text_size(12).text_color(t.muted).child("Shows what each Firstmate is waiting on and working on."))
      .child(link);
    const cards = homes.map((home) => this.homeCard(home, t));
    const empty = div().px(14).text_size(12).text_color(t.dim).child("No Firstmate is open in any tab");
    return v_flex().flex_1().min_h(0)
      .child(v_flex().id("firstmate-list").flex_1().min_h(0).overflow_y_scrollbar().pb(6)
        .child(intro).children(cards).when(cards.length === 0, (el) => el.child(empty)));
  }

  // A card for one Firstmate: its name, its machine and short counts when a fetch has shown them.
  homeCard(home, t) {
    const counts = this.counts.get(home.key);
    return v_flex().id(`home-${home.key}`).flex_none().mx(10).mt(6).px(10).py(8).gap(3).rounded(8)
      .bg(t.raised).border_l(3).border_color(t.accent).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.pick(home, cx))
      .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).truncate().font_semibold().child(home.name))
        .when(this.awayHomes.has(home.key), (el) => el.child(this.pill("☾ away", t.muted, t.hover))))
      .when(Boolean(home.machine), (el) => el.child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(home.machine)))
      .when(Boolean(counts), (el) => el.child(div().text_size(11.5).text_color(t.muted).child(counts)));
  }

  bearingsView(home, t) {
    const back = h_flex().id("firstmate-back").size(26).flex_none().items_center().justify_center().rounded(6)
      .text_size(18).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { this.listOpen = true; cx.notify(); }).child("‹");
    const name = div().min_w(0).truncate().font_bold().child(home.name);
    const machine = div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(home.machine ?? "");
    const updated = this.updated ? `updated ${ago(this.updated)}` : "loading…";
    const header = h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(back).child(name).child(machine)
      .child(this.pill(updated, t.muted, t.hover))
      .child(this.refreshButton(t));
    return v_flex().flex_1().min_h(0).child(header)
      .child(v_flex().id("firstmate-sections").flex_1().min_h(0).overflow_y_scrollbar().pb(6)
        .children(this.awayLines(home, t)).children(this.errorLines(t)).children(this.noteLines(t)).children(this.sectionViews(t)));
  }

  // A calm card while the Firstmate is in away mode. Data from before stays under it.
  awayLines(home, t) {
    if (!this.away) return [];
    const stale = this.updated ? `Showing data from ${ago(this.updated)}.` : "";
    return [v_flex().flex_none().mx(10).mt(8).px(10).py(8).gap(3).rounded(8).bg(t.raised)
      .child(div().text_size(12.5).font_medium().child(`${home.name} is in away mode. Bearings shows again after it returns.`))
      .when(Boolean(stale), (el) => el.child(div().text_size(11.5).text_color(t.muted).child(stale)))];
  }

  // A small rounded label: text in a color on a faint tint of the same color.
  pill(text, color, background) {
    return div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(background).text_size(10.5).font_semibold().text_color(color).child(text);
  }

  statusPill(status, t) {
    const color = t[status.tone] ?? t.muted;
    return this.pill(status.text, color, color + PILL_ALPHA);
  }

  // The spinner shows while a fetch runs.
  refreshButton(t) {
    const busy = this.running !== null;
    const icon = busy ? svg("mods/workspace-chrome/spinner.svg").spin(900) : svg("mods/firstmate-bearings/refresh.svg");
    return h_flex().id("firstmate-refresh").size(26).flex_none().items_center().justify_center().rounded(6)
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.refresh(cx))
      .child(icon.size(14).text_color(busy ? t.working : t.foreground));
  }

  errorLines(t) {
    if (!this.error) return [];
    const stale = this.updated ? ` (showing data from ${ago(this.updated)})` : "";
    return [div().px(14).py(6).text_size(12).text_color(t.blocked).child(`Refresh failed: ${this.error}${stale}`)];
  }

  noteLines(t) {
    const texts = [this.data?.unsupported].filter(Boolean);
    return texts.map((text) => div().px(14).py(6).text_size(12).text_color(t.muted).child(text));
  }

  sectionViews(t) {
    return (this.data?.sections ?? []).map((section, i) => this.sectionView(section, t, i === 0));
  }

  // A section header is a plain line, not a card: a divider above it, a bold title in the section's
  // accent color and a count pill in the same color.
  sectionView(section, t, first) {
    const open = !this.collapsed.has(section.id);
    const accent = t[section.tone] ?? t.muted;
    const header = h_flex().id(`section-${section.id}`).h(36).flex_none().mx(12).mt(first ? 4 : 14).gap(7).items_center()
      .when(!first, (el) => el.border_t(1).border_color(t.border).pt(10))
      .cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_e, cx) => this.toggle(section.id, cx))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(13).flex_none().text_color(accent))
      .child(div().flex_1().min_w(0).truncate().text_size(14).font_bold().text_color(accent).child(section.title))
      .child(this.pill(String(section.count), accent, accent + PILL_ALPHA));
    const rows = open ? section.rows.map((row, i) => this.rowView(section, row, i, t)) : [];
    return v_flex().flex_none().child(header).children(rows);
  }

  // A card has a bar in its section's color, its full title, a status pill and a muted line with
  // the repo and detail. A left click opens it to every field; a PR chip opens the PR.
  rowView(section, row, index, t) {
    const id = `${section.id}-${index}-${row.title}`;
    const open = this.expanded.has(id);
    const record = this.records.get(this.home.key)?.get(row.itemId)?.record;
    const card = cardOf(row, record);
    const title = div().flex_1().min_w(0).text_size(12.5).line_height("17px").font_medium().text_color(row.flagged ? t.blocked : t.foreground)
      .child(card.title);
    const top = h_flex().gap(8).items_start().child(title).when(Boolean(row.status), (el) => el.child(this.statusPill(row.status, t)));
    const view = v_flex().id(`row-${id}`).flex_none().mx(10).mt(6).px(10).py(6).gap(3).rounded(8)
      .bg(t.raised).border_l(3).border_color(t[section.tone] ?? t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.toggleCard(id, cx)).child(top);
    const meta = this.metaLine(row, t);
    const grid = open ? this.fieldGrid(card.fields, t) : [];
    const ask = h_flex().id(`ask-${id}`).mt(4).h(26).px(10).gap(6).items_center().justify_center().rounded(6)
      .bg(t.accent + PILL_ALPHA).text_size(12).font_semibold().text_color(t.accent).cursor_pointer()
      .hover((s) => s.bg(t.accent + CHIP_HOVER_ALPHA))
      .on_click(() => this.openAskDialog(section.id, row.itemId))
      .child(svg("mods/firstmate-bearings/ask.svg").size(13).flex_none()).child("Ask Firstmate");
    return view.when(Boolean(meta), (el) => el.child(meta)).children(grid).when(open, (el) => el.child(ask));
  }

  // Every field of an opened card as a two-column grid: a small muted key and a value that wraps.
  fieldGrid(fields, t) {
    return fields.map(([key, value]) => h_flex().gap(8).items_start()
      .child(div().w(FIELD_KEY_WIDTH).flex_none().text_size(10.5).text_color(t.dim).child(key))
      .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.muted).child(value)));
  }

  // The muted repo label and detail, then the PR chip when the card has one.
  metaLine(row, t) {
    const repo = row.pr?.repo || row.repo;
    const parts = [
      repo && h_flex().flex_none().max_w(150).gap(4).items_center()
        .child(svg("mods/firstmate-bearings/repo.svg").size(11).flex_none().text_color(t.dim))
        .child(div().min_w(0).truncate().text_size(11).text_color(t.dim).child(repo)),
      row.detail && div().flex_1().min_w(0).text_size(11).text_color(t.muted).child(row.detail),
      row.pr && this.prChip(row, t),
    ].filter(Boolean);
    return parts.length > 0 ? h_flex().gap(6).items_center().children(parts) : null;
  }

  // A chip like "PR #12" in the accent color: it opens the PR and changes color under the pointer.
  prChip(row, t) {
    const icon = svg("mods/workspace-chrome/git-compare.svg").size(11).flex_none();
    return h_flex().id(`pr-${row.itemId}`).flex_none().h(18).px(6).gap(4).items_center().rounded(5).bg(t.accent + PILL_ALPHA)
      .text_size(10.5).font_semibold().text_color(t.accent).cursor_pointer().hover((s) => s.bg(t.accent + CHIP_HOVER_ALPHA))
      .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(row.url); }).child(icon).child(row.pr.label);
  }
}
