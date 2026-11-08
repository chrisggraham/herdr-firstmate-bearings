// A sidebar panel that shows the bearings of one open Firstmate. It never switches tabs.
// openAskDialog opens a dialog (this same mod as an overlay) that sends one note to that Firstmate.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, exec, theme, props, openOverlay, closeOverlay, notify } from "herdr";
import { findCandidates, inboxPath, listHomes, scriptPath } from "./homes.js";
import { readBearings } from "./bearings.js";
import { noteArgs, newRequestId } from "./ask.js";

const FETCH_EVERY_MS = 30000;
const CLOCK_EVERY_MS = 5000;
const PICK_STORE = "picked";

const ago = (ms) => {
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
};

const firstLine = (text) => String(text).trim().split("\n")[0];

export default class FirstmateBearings extends View {
  init(_props, cx) {
    if (props()?.ask) return this.initAsk(cx);
    this.isHome = new Map();
    this.picked = localStorage.getItem(PICK_STORE);
    this.listOpen = false;
    this.collapsed = new Set();
    this.shown = null;
    this.running = null;
    this.reveal = [];
    cx.timer.every(FETCH_EVERY_MS, (cx) => this.fetch(cx));
    cx.timer.every(CLOCK_EVERY_MS, (cx) => cx.notify());
  }

  // Finds out which candidate folders are Firstmate homes; each pair is checked once.
  discover(candidates, cx) {
    for (const candidate of candidates) {
      if (this.isHome.has(candidate.key)) continue;
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
    } catch {
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
    if (key === this.shown) return;
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
    if (!home || this.running === home.key) return;
    this.running = home.key;
    const reveal = this.reveal;
    cx.spawn(async (cx) => {
      try {
        const result = await exec(scriptPath(home), ["--json", ...this.reveal], { on: home.machine });
        if (result.code !== 0) throw new Error(firstLine(result.stderr) || `exit code ${result.code}`);
        const bearings = readBearings(result.stdout);
        if (this.home?.key === home.key && this.reveal === reveal) Object.assign(this, { data: bearings, error: null, updated: Date.now() });
      } catch (e) {
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
    const texts = [this.data?.unsupported, this.data?.health].filter(Boolean);
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

  rowView(sectionId, row, index, t) {
    const line = h_flex().id(`row-${sectionId}-${index}`).h(24).flex_none().pl(33).pr(14).items_center()
      .text_size(12).text_color(row.flagged ? t.blocked : t.muted)
      .child(div().flex_1().min_w(0).truncate().child(row.text));
    if (!row.url) return line;
    return line.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => cx.open_url(row.url));
  }
}
