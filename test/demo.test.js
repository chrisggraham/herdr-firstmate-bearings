import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_HOME, demoBearings } from "../mods/firstmate-bearings/demo.js";
import { cardOf, readBearings, repoOf } from "../mods/firstmate-bearings/bearings.js";
import { typedFields } from "../mods/firstmate-bearings/fields.js";

const NOW = Date.UTC(2030, 5, 15);
const { snapshot, records } = demoBearings(NOW);
const bearings = readBearings(JSON.stringify(snapshot));
const sectionOf = (id) => bearings.sections.find((section) => section.id === id);
const taskRows = bearings.sections.flatMap((section) => section.rows.map((row) => ({ section, row })));

test("the sample Firstmate is named demo on host example", () => {
  assert.equal(DEMO_HOME.name, "demo");
  assert.equal(DEMO_HOME.machine, "example");
});

test("every section a task can be in shows sample rows", () => {
  const counts = Object.fromEntries(bearings.sections.map((section) => [section.id, section.count]));
  assert.deepEqual(counts, { decisions: 2, "in-flight": 2, prs: 2, queued: 3, landed: 4 });
});

test("one queued task is blocked", () => {
  const held = sectionOf("queued").rows.filter((row) => row.status?.text === "held");
  assert.equal(held.length, 1);
});

test("every task has a record, and every record has a task", () => {
  const ids = bearings.records.map((key) => key.id);
  assert.deepEqual(ids.filter((id) => !(id in records)), []);
  assert.deepEqual(Object.keys(records).filter((id) => !ids.includes(id)), []);
});

test("every card shows a repo", () => {
  for (const { section, row } of taskRows) {
    assert.ok(repoOf(row, records[row.itemId]), `${section.id} ${row.title} has no repo`);
  }
});

test("every card shows its description", () => {
  for (const { section, row } of taskRows.filter(({ section }) => section.id !== "prs")) {
    const card = cardOf(row, records[row.itemId]);
    assert.ok(typedFields(card.fields, NOW).texts.some((text) => text.label === "body"), `${section.id} ${row.title}`);
  }
});

test("in-flight, PR and landed cards each show a PR chip", () => {
  for (const id of ["in-flight", "prs", "landed"]) {
    for (const row of sectionOf(id).rows) {
      const links = typedFields(cardOf(row, records[row.itemId]).fields, NOW).links;
      assert.ok(row.pr || links.some((link) => link.isPr), `${id} ${row.title}`);
    }
  }
});

test("dates are relative to the clock", () => {
  const queued = sectionOf("queued").rows[0];
  const badges = typedFields(cardOf(queued, records[queued.itemId]).fields, NOW).badges;
  assert.ok(badges.some((badge) => badge.prefix === "filed" && badge.text === "4d ago"));
});

test("the sample holds no real names: every URL is under github.com/example", () => {
  const urls = JSON.stringify([snapshot, records]).match(/https?:\/\/[^"\s]+/g);
  assert.ok(urls.length > 0);
  assert.ok(urls.every((url) => url.startsWith("https://github.com/example/")));
});
