// A sidebar panel that shows the bearings of one open Firstmate. Read-only: it never
// switches tabs and never changes Firstmate.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, machines, exec, theme, appHome, readTextFile, writeTextFile } from "herdr";
import { findCandidates, listHomes, scriptPath } from "./homes.js";
import { readBearings } from "./bearings.js";
import { readConfig } from "./config.js";
import { LOG_FILE, formatLine, appendLine } from "./log.js";

const FETCH_EVERY_MS = 30000;
const CLOCK_EVERY_MS = 5000;
const PICK_STORE = "picked";

const ago = (ms) => {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
};

// A remote machine answers only once its layout is ready; asking sooner fails.
const machineReady = (machine) => machine === null || machines().some((m) => m.name === machine && m.layout === "ready");

const firstLine = (text) => String(text).trim().split("\n")[0];

export default class FirstmateBearings extends View {
  init(_props, cx) {
    this.isHome = new Map();
    this.picked = localStorage.getItem(PICK_STORE);
    this.listOpen = false;
    this.collapsed = new Set();
    this.expanded = new Set();
    this.logging = Promise.resolve();
    this.shown = null;
    this.running = null;
    this.reveal = [];
    cx.timer.every(FETCH_EVERY_MS, (cx) => this.fetch(cx));
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

  // Finds out which candidate folders are Firstmate homes; each pair is checked once.
  discover(candidates, cx) {
    for (const candidate of candidates) {
      if (this.isHome.has(candidate.key) || !machineReady(candidate.machine)) continue;
      this.isHome.set(candidate.key, false);
      cx.spawn(async (cx) => {
        const found = await this.hasScript(candidate);
        this.isHome.set(candidate.key, found);
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
    this.updated = null;
    this.reveal = [];
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
    const reveal = this.reveal;
    cx.spawn(async (cx) => {
      try {
        const config = readConfig(await readTextFile(`${appHome()}/mods/firstmate-bearings/config.json`).catch(() => null));
        const result = await exec(scriptPath(home), ["--json", ...this.reveal], { on: home.machine });
        if (result.code !== 0) throw new Error(firstLine(result.stderr) || `exit code ${result.code}`);
        const bearings = readBearings(result.stdout, { hideEmpty: config.hideEmptySections });
        if (this.home?.key === home.key && this.reveal === reveal) Object.assign(this, { data: bearings, error: null, updated: Date.now() });
      } catch (e) {
        this.logError("fetch", e);
        if (this.home?.key === home.key) this.error = firstLine(e.message ?? e);
      } finally {
        if (this.running === home.key) this.running = null;
        cx.notify();
      }
    });
  }

  setReveal(flags, cx) {
    this.reveal = flags;
    this.running = null;
    this.fetch(cx);
  }

  toggle(id, cx) {
    if (!this.collapsed.delete(id)) this.collapsed.add(id);
    cx.notify();
  }

  render(cx) {
    const t = theme();
    const candidates = findCandidates(spaces(), panes());
    this.discover(candidates, cx);
    const homes = listHomes(candidates, this.isHome);
    const home = this.currentHome(homes);
    this.follow(home, cx);

    const body = home ? this.bearingsView(home, homes, t) : this.listView(homes, t);
    return v_flex().id("firstmate-bearings").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13).child(body);
  }

  listView(homes, t) {
    const rows = homes.map((home) => h_flex().id(`home-${home.key}`).h(30).flex_none().px(14).items_center().cursor_pointer()
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pick(home, cx)).child(div().flex_1().min_w(0).truncate().child(home.name)));
    const empty = div().p(14).text_size(12).text_color(t.dim).child("No Firstmate is open in any tab");
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(42).flex_none().px(14).items_center().font_semibold().border_b(1).border_color(t.border).child("Firstmates"))
      .child(v_flex().id("firstmate-list").flex_1().min_h(0).overflow_y_scrollbar().py(6).children(rows).when(rows.length === 0, (el) => el.child(empty)));
  }

  bearingsView(home, homes, t) {
    const name = div().flex_1().min_w(0).truncate().font_semibold().child(home.name);
    // With several Firstmates the name is a select box: a chevron shows that it opens the list.
    const title = homes.length > 1
      ? h_flex().id("firstmate-switcher").flex_1().min_w(0).h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border)
        .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.listOpen = true; cx.notify(); })
        .child(name).child(svg("mods/workspace-chrome/chevron-down.svg").size(12).flex_none().text_color(t.dim))
      : name;
    const switcher = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(title)
      .child(div().flex_none().text_size(11).text_color(t.dim).child(this.updated ? `updated ${ago(this.updated)}` : "loading…"));
    return v_flex().flex_1().min_h(0).child(switcher)
      .child(v_flex().id("firstmate-sections").flex_1().min_h(0).overflow_y_scrollbar().pb(6)
        .children(this.errorLines(t)).children(this.noteLines(t)).children(this.sectionViews(t)));
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
    const sections = (this.data?.sections ?? []).map((section) => this.sectionView(section, t));
    return [...sections, ...this.revealControl(t)];
  }

  // "Show N more" fetches the full lists; "Show fewer" goes back to the short ones.
  revealControl(t) {
    const hidden = this.data?.hidden;
    const showing = this.reveal.length > 0;
    if (!hidden && !showing) return [];
    const label = showing ? "Show fewer" : hidden.count > 0 ? `Show ${hidden.count} more` : "Show more";
    return [div().id("firstmate-reveal").mx(10).mt(8).h(28).flex_none().flex().items_center().justify_center().rounded(6)
      .border_1().border_color(t.border).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.setReveal(showing ? [] : hidden.flags, cx)).child(label)];
  }

  sectionView(section, t) {
    const open = !this.collapsed.has(section.id);
    const alert = section.highlighted;
    const header = h_flex().id(`section-${section.id}`).h(30).flex_none().mx(8).mt(8).px(8).gap(7).items_center().rounded(6)
      .bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.toggle(section.id, cx))
      .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(alert ? t.blocked : t.foreground).child(section.title))
      .child(div().px(7).h(18).flex().items_center().rounded(9).bg(t.hover).text_size(11).text_color(alert ? t.blocked : t.muted)
        .child(String(section.count)));
    const rows = open ? section.rows.map((row, i) => this.rowView(section.id, row, i, t)) : [];
    return v_flex().flex_none().child(header).children(rows);
  }

  // A card shows its title (up to two lines) and a muted detail line. A left click opens it
  // to the full title and every fact; the PR link on an opened card opens the PR.
  rowView(sectionId, row, index, t) {
    const id = `${sectionId}-${index}`;
    const open = this.expanded.has(id);
    const card = v_flex().id(`row-${id}`).flex_none().mx(10).mt(6).px(10).py(7).gap(2).rounded(8)
      .bg(t.raised).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { if (!this.expanded.delete(id)) this.expanded.add(id); cx.notify(); })
      .child(div().text_size(13).font_semibold().text_color(row.flagged ? t.blocked : t.foreground)
        .when(!open, (el) => el.max_h(36).overflow_hidden()).child(row.title));
    if (!open) return card.when(Boolean(row.detail), (el) => el.child(div().text_size(11.5).text_color(t.muted).truncate().child(row.detail)));
    const lines = [row.detail, ...row.facts].filter(Boolean).map((text) => div().text_size(11.5).text_color(t.muted).child(text));
    return card.children(lines).when(Boolean(row.url), (el) => el.child(div().id(`link-${id}`).text_size(11.5).text_color(t.accent)
      .cursor_pointer().on_click((_e, cx) => cx.open_url(row.url)).child(row.url)));
  }
}
