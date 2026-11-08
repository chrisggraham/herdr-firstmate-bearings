// A sidebar panel that shows the bearings of one open Firstmate. It never switches tabs.
// openAskDialog opens a dialog (this same mod as an overlay) that sends one note to that Firstmate.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, machines, exec, theme, props, openOverlay, closeOverlay, notify, appHome, readTextFile, writeTextFile } from "herdr";
import { findCandidates, inboxPath, listHomes, scriptPath } from "./homes.js";
import { readBearings } from "./bearings.js";
import { noteArgs, newRequestId } from "./ask.js";
import { readConfig } from "./config.js";
import { LOG_FILE, formatLine, appendLine } from "./log.js";
import { loadSet, saveSet, toggleId } from "./state.js";

const FETCH_EVERY_MS = 30000;
const CLOCK_EVERY_MS = 5000;
const PICK_STORE = "picked";
const COLLAPSED_STORE = "collapsed";
const EXPANDED_STORE = "expanded";
const TITLE_MAX_HEIGHT = 36;
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
    this.isHome = new Map();
    this.picked = localStorage.getItem(PICK_STORE);
    this.listOpen = false;
    // Kept in storage: the panel is built again when the person switches spaces and comes back.
    this.collapsed = loadSet(localStorage, COLLAPSED_STORE);
    this.expanded = loadSet(localStorage, EXPANDED_STORE);
    this.capped = new Map();
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
    this.capped.clear();
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
        if (this.home?.key === home.key && this.reveal === reveal) {
          this.rememberCapped(bearings, reveal);
          Object.assign(this, { data: bearings, error: null, updated: Date.now() });
        }
      } catch (e) {
        this.logError("fetch", e);
        if (this.home?.key === home.key) this.error = firstLine(e.message ?? e);
      } finally {
        if (this.running === home.key) this.running = null;
        cx.notify();
      }
    });
  }

  // The row count of each section as the snapshot caps it, so "Show fewer" appears only after more rows came.
  rememberCapped(bearings, reveal) {
    for (const section of bearings.sections) {
      if (!reveal.includes(section.revealFlag)) this.capped.set(section.id, section.count);
    }
  }

  // Shows or hides the rows a section's flag adds; the other sections keep their state.
  setReveal(flag, show, cx) {
    this.reveal = show ? [...this.reveal, flag] : this.reveal.filter((f) => f !== flag);
    this.running = null;
    this.fetch(cx);
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
    const name = div().min_w(0).truncate().font_bold().child(home.name);
    // With several Firstmates the name is a select box: a chevron shows that it opens the list.
    const title = homes.length > 1
      ? h_flex().id("firstmate-switcher").min_w(0).h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border)
        .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { this.listOpen = true; cx.notify(); })
        .child(name).child(svg("mods/workspace-chrome/chevron-down.svg").size(12).flex_none().text_color(t.dim))
      : name;
    const machine = div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(home.machine ?? "");
    const updated = this.updated ? `updated ${ago(this.updated)}` : "loading…";
    const switcher = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(title).child(machine)
      .child(this.pill(updated, t.muted, t.hover))
      .child(this.refreshButton(t));
    return v_flex().flex_1().min_h(0).child(switcher)
      .child(v_flex().id("firstmate-sections").flex_1().min_h(0).overflow_y_scrollbar().pb(6)
        .children(this.errorLines(t)).children(this.noteLines(t)).children(this.sectionViews(t)));
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
      .child(icon.size(13).text_color(busy ? t.working : t.muted));
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
    return (this.data?.sections ?? []).map((section) => this.sectionView(section, t));
  }

  // "Show N more" fetches the full list of one section; "Show fewer" goes back to the short list.
  // Neither shows when there is nothing more or fewer to show.
  revealControl(section, t) {
    const showing = this.reveal.includes(section.revealFlag);
    const longer = section.count > (this.capped.get(section.id) ?? Infinity);
    if (showing ? !longer : section.hidden === 0) return [];
    const label = showing ? "Show fewer" : `Show ${section.hidden} more`;
    return [div().id(`reveal-${section.id}`).mx(10).mt(6).h(26).flex_none().flex().items_center().justify_center().rounded(6)
      .border_1().border_color(t.border).text_size(12).text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.setReveal(section.revealFlag, !showing, cx)).child(label)];
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
    const rows = open ? section.rows.map((row, i) => this.rowView(section, row, i, t)) : [];
    return v_flex().flex_none().child(header).children(rows).children(open ? this.revealControl(section, t) : []);
  }

  // A card has a bar in its section's color, its title (up to two lines), a status pill and a muted
  // line with the repo and detail. A left click opens it to the full title and every fact; a PR
  // chip opens the PR.
  rowView(section, row, index, t) {
    const id = `${section.id}-${index}-${row.title}`;
    const open = this.expanded.has(id);
    const title = div().flex_1().min_w(0).text_size(12.5).line_height("17px").font_medium().text_color(row.flagged ? t.blocked : t.foreground)
      .when(!open, (el) => el.max_h(TITLE_MAX_HEIGHT).overflow_hidden()).child(row.title);
    const top = h_flex().gap(8).items_start().child(title).when(Boolean(row.status), (el) => el.child(this.statusPill(row.status, t)));
    const card = v_flex().id(`row-${id}`).flex_none().mx(10).mt(6).px(10).py(6).gap(3).rounded(8)
      .bg(t.raised).border_l(3).border_color(t[section.tone] ?? t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.toggleCard(id, cx)).child(top);
    const meta = this.metaLine(row, t);
    const lines = open ? row.facts.map((text) => div().text_size(11.5).text_color(t.muted).child(text)) : [];
    const ask = h_flex().id(`ask-${id}`).mt(4).h(26).px(10).items_center().justify_center().rounded(6).border_1().border_color(t.border)
      .text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.selected))
      .on_click(() => this.openAskDialog(section.id, row.itemId)).child("Ask Firstmate");
    return card.when(Boolean(meta), (el) => el.child(meta)).children(lines).when(open, (el) => el.child(ask));
  }

  // The muted repo label and detail, then the PR chip when the card has one.
  metaLine(row, t) {
    const repo = row.pr?.repo || row.repo;
    const parts = [
      repo && div().flex_none().max_w(150).truncate().text_size(11).text_color(t.dim).child(repo),
      row.detail && div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(row.detail),
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
