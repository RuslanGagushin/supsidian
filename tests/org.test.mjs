// Org-mode TODOs: timestamps, the date reader, keywords and states, repeaters, parsing a note, the agenda and match queries.
// The clock is frozen at Thursday 2026-10-29 10:00.
import { before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { openVault, ev } from "./harness.mjs";
import * as H from "./harness.mjs";

const NOW = "2026-10-29T10:00:00";
const NOTE = `---
tags: [home]
---
# Project :work:
## TODO [#A] Write report :urgent:
DEADLINE: <2026-10-27 Tue>
- [x] outline
- [ ] draft
- [ ] review
## NEXT Call Bob
SCHEDULED: <2026-10-25 Sun>
## DONE Old thing
CLOSED: [2026-10-20 Tue 09:00]
## Meeting <2026-10-29 Thu 14:00-15:00>
## Plain heading
SCHEDULED: <2026-10-31 Sat>
## WAIT Parts :shop:
DEADLINE: <2026-11-05 Thu -10d>
\`\`\`
## TODO inside code
\`\`\`
- TODO list item task #errand
- [ ] loose checkbox
`;
const day = (y, m, d) => ev(([y, m, d]) => odn(y, m, d), [y, m, d]);

before(() => openVault({ demo: false, time: NOW, notes: { "Work.md": NOTE, "Gym.md": "## TODO Run\nSCHEDULED: <2026-10-22 Thu +1w>\n" } }));

describe("timestamps", () => {
  test("parse and print round-trip with time ranges, repeaters and warnings", async () => {
    const r = await ev(() => ["<2026-10-29 Thu 09:00-10:30 +1w -2d>", "[2026-01-05 Mon]", "<2026-02-01 Sun .+2m --3d>"].map((s) => orgTsStr(orgTsParse(s))));
    assert.deepEqual(r, ["<2026-10-29 Thu 09:00-10:30 +1w -2d>", "[2026-01-05 Mon]", "<2026-02-01 Sun .+2m --3d>"]);
    assert.deepEqual(await ev(() => orgTsParse("<2026-10-29 Thu 9:05>")), { active: true, dn: await day(2026, 10, 29), time: 545, end: null, rep: null, warn: null });
    assert.equal(await ev(() => orgTsParse("no date")), null);
  });

  test("repeaters: days, weeks, months clamp to the month's end", async () => {
    const r = await ev(() => {
      const w = orgTsParse("<2026-10-01 Thu +1w>"), m = orgTsParse("<2026-01-31 Sat +1m>"), plain = orgTsParse("<2026-10-01 Thu>");
      return [orgOccursOn(w, odn(2026, 10, 29)), orgOccursOn(w, odn(2026, 10, 30)), orgOccursOn(w, odn(2026, 9, 24)),
        orgOccursOn(m, odn(2026, 2, 28)), orgOccursOn(m, odn(2026, 3, 31)), orgOccursOn(plain, odn(2026, 10, 2))];
    });
    assert.deepEqual(r, [true, false, false, true, true, false]);
  });

  test("the date reader understands Org's shortcuts (today is Thu Oct 29)", async () => {
    const cases = { "": [2026, 10, 29], ".": [2026, 10, 29], today: [2026, 10, 29], tomorrow: [2026, 10, 30], "+3": [2026, 11, 1], "-1w": [2026, 10, 22],
      fri: [2026, 10, 30], thu: [2026, 10, 29], "2fri": [2026, 11, 6], "11-05": [2026, 11, 5], "3-01": [2027, 3, 1], "5": [2026, 11, 5], "30": [2026, 10, 30],
      "2026-12-01": [2026, 12, 1], "nov 5": [2026, 11, 5], "5 nov": [2026, 11, 5], "jan 2 2028": [2028, 1, 2], "05.11": [2026, 11, 5], "завтра": [2026, 10, 30], "пт": [2026, 10, 30] };
    for (const [input, [y, m, d]] of Object.entries(cases)) assert.equal(await ev((s) => orgReadDate(s)?.dn, input), await day(y, m, d), JSON.stringify(input));
    assert.equal(await ev(() => orgReadDate("++2", odn(2026, 12, 1)).dn), await day(2026, 12, 3), "++ counts from the current date");
    assert.deepEqual(await ev(() => { const r = orgReadDate("fri 14:00-15:30 +1w -2d"); return [r.time, r.end, r.rep, r.warn]; }), [840, 930, { type: "+", n: 1, u: "w" }, { first: false, n: 2, u: "d" }]);
    assert.equal(await ev(() => orgReadDate("tomorrow 2pm").time), 840);
    for (const bad of ["25:00", "someday", "12:00-24:30"]) assert.equal(await ev((s) => orgReadDate(s), bad), null, bad);
  });
});

describe("keywords and states", () => {
  test("keyword sets: explicit, implicit done, default", async () => {
    const r = await ev(() => [orgParseKw("TODO(t) DOING | DONE(d!) KILLED"), orgParseKw("OPEN CLOSED"), orgParseKw("")]);
    assert.deepEqual(r.map((x) => [x.todo, x.done]), [[["TODO", "DOING"], ["DONE", "KILLED"]], [["OPEN"], ["CLOSED"]], [["TODO", "NEXT", "WAIT"], ["DONE", "CANCELLED"]]]);
    assert.deepEqual(await ev(() => { const s = orgParseKw(ORG_DEFAULT_KW); return ["TODO", "NEXT", "WAIT", "DONE", "CANCELLED", null].map((k) => orgKwClass(k, s)); }), ["todo", "next", "wait", "done", "cancel", ""]);
    assert.deepEqual(await ev(() => orgSet({ fm: { todo: "A B | C" } }).all), ["A", "B", "C"]);
  });

  test("a heading's keyword, priority, title and tags", async () => {
    const r = await ev(() => { const s = orgParseKw(ORG_DEFAULT_KW); const info = orgLine("## TODO [#B] Fix the sink :home:plumbing:"); const o = orgHead(info.rest, s); return { o, back: orgBuild(info, o) }; });
    assert.deepEqual(r.o, { kw: "TODO", pri: "B", title: "Fix the sink", tags: ["home", "plumbing"] });
    assert.equal(r.back, "## TODO [#B] Fix the sink :home:plumbing:");
    assert.deepEqual(await ev(() => orgHead("TODOLIST is not a keyword", orgParseKw(ORG_DEFAULT_KW)).kw), null);
  });

  const apply = (src, fn, arg) => ev(({ src, fn, arg }) => { const L = src.split("\n"); const set = orgParseKw(ORG_DEFAULT_KW); const msg = globalThis[fn](L, 0, ...arg.map((a) => (a === "$set" ? set : a))); return { text: L.join("\n"), msg }; }, { src, fn, arg });

  test("closing adds CLOSED, reopening removes it", async () => {
    const done = await apply("## TODO Task\nSCHEDULED: <2026-10-29 Thu>", "orgSetState", ["DONE", "$set"]);
    assert.equal(done.text, "## DONE Task\nCLOSED: [2026-10-29 Thu 10:00] SCHEDULED: <2026-10-29 Thu>");
    const open = await apply(done.text, "orgSetState", ["TODO", "$set"]);
    assert.equal(open.text, "## TODO Task\nSCHEDULED: <2026-10-29 Thu>");
    const plain = await apply("- TODO item", "orgSetState", ["DONE", "$set"]);
    assert.equal(plain.text, "- DONE item\n  CLOSED: [2026-10-29 Thu 10:00]");
    assert.equal((await apply("## TODO x", "orgSetState", [null, "$set"])).text, "## x");
  });

  test("repeating entries move to the next date and stay open", async () => {
    assert.equal((await apply("## TODO Run\nSCHEDULED: <2026-10-22 Thu +1w>", "orgSetState", ["DONE", "$set"])).text, "## TODO Run\nSCHEDULED: <2026-10-29 Thu +1w>");
    assert.equal((await apply("## NEXT Pay\nDEADLINE: <2026-08-01 Sat ++1m>", "orgSetState", ["DONE", "$set"])).text, "## NEXT Pay\nDEADLINE: <2026-11-01 Sun ++1m>", "++ skips past today");
    assert.equal((await apply("## TODO Water\nSCHEDULED: <2026-10-01 Thu .+3d>", "orgSetState", ["DONE", "$set"])).text, "## TODO Water\nSCHEDULED: <2026-11-01 Sun .+3d>", ".+ counts from today");
    assert.equal((await apply("- [ ] pills\n  SCHEDULED: <2026-10-29 Thu +1d>", "orgSetBox", [true])).text, "- [ ] pills\n  SCHEDULED: <2026-10-30 Fri +1d>");
  });

  test("checkboxes, priorities, tags and shifting dates", async () => {
    assert.equal((await apply("- [ ] buy milk", "orgSetBox", [true])).text, "- [x] buy milk");
    assert.equal((await apply("- [x] buy milk", "orgSetBox", [false])).text, "- [ ] buy milk");
    const pri = async (src, dir) => (await apply(src, "orgSetPriority", ["$set", dir])).text;
    assert.deepEqual([await pri("## TODO a", 1), await pri("## TODO [#A] a", 1), await pri("## TODO [#B] a", 1), await pri("## TODO a", -1), await pri("## TODO [#C] a", -1)],
      ["## TODO [#A] a", "## TODO a", "## TODO [#A] a", "## TODO [#C] a", "## TODO a"]);
    assert.equal((await apply("## TODO a :old:", "orgSetTags", ["$set", ["x", "y"]])).text, "## TODO a :x:y:");
    assert.equal((await apply("## TODO a\nDEADLINE: <2026-10-29 Thu 09:00>", "orgShift", ["dead", 3])).text, "## TODO a\nDEADLINE: <2026-11-01 Sun 09:00>");
    assert.equal((await apply("## Party <2026-10-29 Thu>", "orgShift", ["ts", -1])).text, "## Party <2026-10-28 Wed>");
    assert.equal((await apply("## TODO a\nSCHEDULED: <2026-10-29 Thu>", "orgSetPlanning", ["SCHEDULED", null])).text, "## TODO a");
  });
});

describe("parsing a note", () => {
  const entries = () => ev(() => orgParse(vault.notes.get("Work.md")).map((e) => ({ kind: e.kind, kw: e.kw, pri: e.pri, title: e.title, tags: e.alltags, inh: e.inherited, cb: [e.cbDone, e.cbTotal], sched: e.sched?.dn ?? null, dead: e.dead?.dn ?? null, closed: !!e.closed, outline: e.outline })));

  test("headings, items, checkboxes, events; nothing from code blocks", async () => {
    const es = await entries();
    assert.deepEqual(es.map((e) => `${e.kind}:${e.kw ?? ""}:${e.title}`), [
      "hl:TODO:Write report", "box::outline", "box::draft", "box::review", "hl:NEXT:Call Bob", "hl:DONE:Old thing", "event::Meeting",
      "hl::Plain heading", "hl:WAIT:Parts", "item:TODO:list item task #errand", "box::loose checkbox"]);
  });

  test("tags are inherited from the file and parent headings", async () => {
    const [report, , , , call, , , , parts, item] = await entries();
    assert.deepEqual(report.tags, ["home", "work", "urgent"]);
    assert.deepEqual(report.inh, ["home", "work"]);
    assert.deepEqual(parts.tags, ["home", "work", "shop"]);
    assert.deepEqual(item.tags, ["home", "work", "shop", "errand"], "a list item below a heading inherits its tags");
    assert.deepEqual(call.outline, ["Project"]);
  });

  test("planning lines, priorities and checkbox counts", async () => {
    const [report, , , , call, old, , plain] = await entries();
    assert.equal(report.pri, "A");
    assert.equal(report.dead, await day(2026, 10, 27));
    assert.deepEqual(report.cb, [1, 3]);
    assert.equal(call.sched, await day(2026, 10, 25));
    assert.equal(old.closed, true);
    assert.equal(plain.sched, await day(2026, 10, 31), "a plain heading with a planning line is on the agenda too");
  });
});

describe("agenda", () => {
  const today = () => ev(() => { const T = onow().dn; return orgDayEntries(T, orgAll(), T).map((x) => `${x.label} ${x.e.title}`.trim()); });

  test("today: overdue deadline first, scheduled carry-over, events, warnings; nothing done", async () => {
    assert.deepEqual(await today(), ["Meeting", "2 d. ago: Write report", "In 7 d.: Parts", "Scheduled: Run", "Sched.5x: Call Bob"]);
  });

  test("a repeating entry shows on its future days, not past ones", async () => {
    const r = await ev(() => { const T = onow().dn; const on = (dn) => orgDayEntries(dn, orgAll(), T).map((x) => x.e.title); return [on(odn(2026, 11, 5)), on(odn(2026, 10, 22))]; });
    assert.ok(r[0].includes("Run"));
    assert.ok(r[0].includes("Parts"), "the deadline day itself");
    assert.ok(r[1].includes("Run"), "its own first day");
  });

  test("match queries: tags, properties, TODO states", async () => {
    const m = (q) => ev((q) => orgAll().filter(orgMatcher(q)).map((e) => e.title), q);
    assert.deepEqual(await m("+work -shop/!"), ["Write report", "draft", "review", "Call Bob"], "open checkboxes count as open TODOs");
    assert.deepEqual(await m("+work-shop"), [], "a hyphen is part of the tag name here (Obsidian tags), unlike Org's +work-boss");
    assert.deepEqual(await m("PRIORITY=A"), ["Write report"]);
    assert.deepEqual(await m("/WAIT|NEXT"), ["Call Bob", "Parts"]);
    assert.deepEqual(await m("errand|shop"), ["Parts", "list item task #errand", "loose checkbox"]);
    assert.deepEqual(await m("LEVEL>1+urgent"), ["Write report"]);
    assert.deepEqual(await m("CATEGORY=gym"), ["Run"]);
  });

  test("the agenda view lists today and t cycles a TODO", async () => {
    const page = H.page;
    await ev(() => openTasksView(true, "agenda"));
    await page.waitForSelector(".ag-row");
    const text = await page.textContent(".ag-body");
    assert.match(text, /Write report/);
    assert.match(text, /Meeting/);
    assert.match(await page.getAttribute("#tasks-btn", "title"), /2 overdue|overdue/i);
    await ev(() => { const i = AGROWS.findIndex((x) => x.e.title === "Call Bob"); orgSelect(i); $(".ag-body").focus(); });
    await page.keyboard.press("t");
    await page.waitForFunction(() => vault.notes.get("Work.md").raw.includes("## WAIT Call Bob"));
    await page.keyboard.press("q");
    assert.equal(await ev(() => board.view), null);
    assert.equal(H.errors.length, 0, H.errors.join("\n"));
  });

  test("the TODO list view", async () => {
    await ev(() => { AG.todoKw = "ALL"; openTasksView(true, "todo"); });
    const titles = await H.page.$$eval(".ag-row .ag-title, .ag-row", (rows) => rows.map((r) => r.textContent));
    const all = titles.join("\n");
    for (const t of ["Write report", "Parts", "Run"]) assert.match(all, new RegExp(t));
    assert.doesNotMatch(all, /Old thing/);
  });
});
