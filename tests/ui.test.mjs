// The app in use: board, navigation, search, tags, editor, autocomplete, rendering, pasted files, palettes, settings, themes and phones.
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { openVault, ev, raw } from "./harness.mjs";
import * as H from "./harness.mjs";

const page = () => H.page;
// cards in reading order (the masonry DOM is in column order); checks that each one is on the page too
const titles = () => ev(() => {
  const shown = boardModel().shown.map((c) => c.path);
  const onPage = new Set([...document.querySelectorAll("#board .sn-masonry .sn-card")].map((c) => c.dataset.path));
  return shown.filter((p) => onPage.has(p)).map((p) => p.replace(/^cards\/|\.md$/g, ""));
});
const noErrors = () => assert.equal(H.errors.length, 0, H.errors.map((e) => e.stack || e).join("\n"));

describe("tables and fonts", () => {
  beforeEach(() => openVault());

  test("a table fills the note width, keeps its column alignment and scrolls when too wide", async () => {
    const r = await ev(() => {
      const el = renderMarkdown("| Month | Km |\n| :--- | :-: |\n| Oct | 980 |\n", "cards/x.md");
      el.classList.add("markdown-rendered");
      el.style.width = "500px";
      document.body.append(el);
      const wrap = el.querySelector(".sn-table-wrap"), css = (s) => getComputedStyle(el.querySelector(s)).textAlign;
      const wide = renderMarkdown(`| ${"word ".repeat(0)}${Array(40).fill("Longheaderword").join(" | ")} |\n|${" --- |".repeat(40)}\n`, "cards/x.md");
      wide.classList.add("markdown-rendered");
      wide.style.width = "500px";
      document.body.append(wide);
      const w = wide.querySelector(".sn-table-wrap");
      return { table: el.querySelector("table").offsetWidth, wrap: wrap.clientWidth, first: css("tbody td:first-child"), second: css("tbody td:last-child"), scrolls: w.scrollWidth > w.clientWidth, wideBox: w.offsetWidth };
    });
    assert.equal(r.table, r.wrap);
    assert.equal(r.first, "start"); // :--- gives left, which reads as start
    assert.equal(r.second, "center");
    assert.ok(r.scrolls);
    assert.equal(r.wideBox, 500);
    noErrors();
  });

  test("Inter is the interface font and a writing font, and is embedded for Cyrillic too", async () => {
    const r = await ev(async () => {
      const family = (s) => getComputedStyle(document.body).getPropertyValue(s).trim();
      UI.writeFont = "sans"; applyTheme();
      const ui = getComputedStyle(document.body).fontFamily;
      const reading = h("div", { cls: "sn-reading" });
      document.body.append(reading);
      const plexText = getComputedStyle(reading).fontFamily;
      UI.writeFont = "inter"; applyTheme();
      const interText = getComputedStyle(reading).fontFamily;
      const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Inter").length;
      return { ui, plexText, interText, faces, family: family("--font-inter") };
    });
    assert.match(r.ui, /^"?Inter/);
    assert.match(r.plexText, /^"?IBM Plex Sans/, "IBM Plex Sans for writing stays Plex under the Inter interface");
    assert.match(r.interText, /^"?Inter/);
    assert.equal(r.faces, 2);
    noErrors();
  });
});

describe("board", () => {
  beforeEach(() => openVault());

  test("the demo board shows the top-level cards in manual order", async () => {
    const t = await titles();
    assert.deepEqual(t.slice(0, 4), ["This week", "History", "Architecture", "Knowledge"]);
    assert.ok(!t.includes("Roman Empire"), "children are not on the top level at depth 1");
    assert.ok(!t.includes("Book"), "templates are not cards");
    noErrors();
  });

  test("open a card as the board, breadcrumbs, back and up", async () => {
    await ev(() => setTarget("cards/Roman Empire.md"));
    assert.deepEqual(await titles(), ["Colosseum", "Aqueducts"], "child_order");
    assert.match(await page().textContent(".sn-crumbs"), /All cards.*History.*Roman Empire/);
    await page().keyboard.press("Alt+ArrowUp");
    assert.equal(await ev(() => board.target), "cards/History.md");
    await page().keyboard.press("Alt+ArrowLeft");
    assert.equal(await ev(() => board.target), "cards/Roman Empire.md");
    noErrors();
  });

  test("depth ∞ over a parent cycle finishes", async () => {
    await ev(() => { board.depth = 0; setTarget("cards/Cycle A.md"); });
    assert.deepEqual(await titles(), ["Cycle B"]);
    await ev(() => { setTarget(null); });
    assert.ok((await titles()).length > 10);
    noErrors();
  });

  test("search filters the board, Escape closes it", async () => {
    await ev(() => { board.depth = 0; renderBoard(); });
    await page().keyboard.press("Control+f");
    await page().keyboard.type("aqueduct");
    await page().waitForFunction(() => board.filter.query === "aqueduct" && document.querySelectorAll("#board .sn-masonry .sn-card").length === 4);
    assert.deepEqual(await titles(), ["This week", "Roman Empire", "Aqueducts", "Pont du Gard"], "titles and text both match");
    await page().keyboard.press("Escape");
    await page().keyboard.press("Escape");
    assert.equal(await ev(() => board.searchOpen), false);
  });

  test("a tag view collects cards from the whole vault", async () => {
    await ev(() => openTagView("definition"));
    assert.deepEqual((await titles()).sort(), ["Back-of-napkin math", "Choice paralysis", "Manual mode"]);
    await ev(() => goBack());
    assert.equal(await ev(() => board.tagView), null);
  });

  test("the composer types into a new card from anywhere on the board", async () => {
    await page().focus("#board");
    await page().keyboard.type("Fresh idea");
    await page().waitForFunction(() => $(".sn-composer textarea")?.value === "Fresh idea");
    await page().keyboard.press("Enter");
    await page().waitForFunction(() => vault.notes.has("cards/Fresh idea.md"));
    noErrors();
  });

  test("select mode and Delete with several cards selected", async () => {
    await ev(() => { board.selection = new Set(["cards/Knowledge.md", "cards/Draft thoughts.md"]); renderBoard(); });
    assert.match(await page().textContent(".sn-selbar"), /2 selected/);
    await page().focus('#board .sn-card[data-path="cards/Knowledge.md"]');
    await page().keyboard.press("Delete");
    await page().click(".modal .mod-warning");
    await page().waitForFunction(() => !vault.notes.has("cards/Knowledge.md") && !vault.notes.has("cards/Draft thoughts.md"));
    await page().keyboard.press("Control+z");
    await page().waitForFunction(() => vault.notes.has("cards/Knowledge.md") && vault.notes.has("cards/Draft thoughts.md"));
  });
});

describe("editor", () => {
  beforeEach(async () => { await openVault({ demo: false, notes: { "cards/Note.md": "---\ncolor: red\n---\nHello\n", "cards/Colosseum.md": "", "cards/Cola.md": "", "cards/pic.md": "" } }); await ev(() => openEditor("cards/Note.md", { focus: true })); });
  const ta = ".sn-editor-text";
  const value = () => ev((sel) => $(sel).value, ta);
  const setValue = (v, s = v.length, e = s) => ev(([v, s, e]) => { const t = $(".sn-editor-text"); t.value = v; t.setSelectionRange(s, e); t.focus(); }, [v, s, e]);

  test("typing saves the body and keeps the frontmatter", async () => {
    await page().focus(ta);
    await page().keyboard.press("End");
    await ev(() => { const t = $(".sn-editor-text"); t.setSelectionRange(t.value.length, t.value.length); });
    await page().keyboard.type("World");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("cards/Note.md").raw.includes("World"));
    assert.equal(await raw("cards/Note.md"), "---\ncolor: red\n---\nHello\nWorld");
    noErrors();
  });

  test("Enter as Android sends it breaks the line: CodeMirror dispatches its own keydown on the editor", async () => {
    await setValue("Hello");
    // what CodeMirror does when an Android keyboard reports Enter only as input: a synthetic keydown on its content element
    const handled = await ev(() => { const e = new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, cancelable: true }); $(".sn-editor-text").dispatchEvent(e); return e.defaultPrevented; });
    assert.equal(handled, true, "CodeMirror's keymap handles it");
    await page().keyboard.type("World");
    assert.equal(await value(), "Hello\nWorld");
    noErrors();
  });

  test("the editor is CodeMirror: undo and redo cover typing and formatting", async () => {
    assert.equal(await ev(() => !!$(".sn-editor-text").cmView), true);
    await setValue("plain", 0, 5);
    await page().keyboard.press("Control+b");
    await page().keyboard.press("End");
    await page().keyboard.type(" more");
    assert.equal(await value(), "**plain** more");
    await page().keyboard.press("ControlOrMeta+z");
    assert.equal(await value(), "**plain**", "undo takes back the typing");
    await page().keyboard.press("ControlOrMeta+z");
    assert.equal(await value(), "plain", "then the bold");
    await page().keyboard.press("ControlOrMeta+Shift+z");
    assert.equal(await value(), "**plain**");
    noErrors();
  });

  test("lines stop wrapping only while the caret is on a table row", async () => {
    const wraps = () => ev(() => $(".sn-editor-text").classList.contains("cm-lineWrapping"));
    await setValue("| a | b |\n| --- | --- |\n| 1 | 2 |\n\ntext", 2);
    await page().keyboard.press("ArrowRight");
    assert.equal(await wraps(), false, "caret on the table");
    await page().keyboard.press("ControlOrMeta+End");
    assert.equal(await wraps(), true, "caret below it: wrapping is back");
    await page().keyboard.press("ControlOrMeta+Home");
    await page().keyboard.press("ControlOrMeta+End");
    assert.equal(await wraps(), true, "and again the second time");
    noErrors();
  });

  test("Ctrl+B and Ctrl+I wrap the selection", async () => {
    await setValue("make bold", 5, 9);
    await page().keyboard.press("Control+b");
    assert.equal(await value(), "make **bold**");
    await setValue("x", 0, 1);
    await page().keyboard.press("Control+i");
    assert.equal(await value(), "*x*");
  });

  test("Enter continues lists and checkboxes, ends them on an empty item", async () => {
    await setValue("- one");
    await page().keyboard.press("Enter");
    assert.equal(await value(), "- one\n- ");
    await page().keyboard.press("Enter");
    assert.equal(await value(), "- one\n\n", "a blank line, so the next text doesn't join the last item");
    await setValue("1. a");
    await page().keyboard.press("Enter");
    assert.equal(await value(), "1. a\n2. ");
    await setValue("- [x] done");
    await page().keyboard.press("Enter");
    assert.equal(await value(), "- [x] done\n- [ ] ");
  });

  test("Tab indents and Shift+Tab outdents", async () => {
    await setValue("a\nb", 0, 3);
    await page().keyboard.press("Tab");
    assert.equal(await value(), "\ta\n\tb");
    await page().keyboard.press("Shift+Tab");
    assert.equal(await value(), "a\nb");
  });

  test("toolbar helpers: headings cycle, prefixes toggle", async () => {
    const run = (v, fn, s = 0, e = v.length) => ev(([v, fn, s, e]) => { const t = $(".sn-editor-text"); t.value = v; t.setSelectionRange(s, e); ({ h: () => edHeading(t), q: () => edPrefix(t, "> "), n: () => edPrefix(t, "1. "), l: () => edPrefix(t, "- "), w: () => edWrap(t, "`") })[fn](); return t.value; }, [v, fn, s, e]);
    assert.equal(await run("T", "h"), "# T");
    assert.equal(await run("### T", "h"), "T");
    assert.equal(await run("a\nb", "n"), "1. a\n2. b");
    assert.equal(await run("1. a\n2. b", "n"), "a\nb");
    assert.equal(await run("- a", "q"), "> - a");
    assert.equal(await run("1. a", "l"), "- a");
    assert.equal(await run("`x`", "w"), "x");
  });

  test("[[ suggests notes and Enter inserts the link", async () => {
    await setValue("see ");
    await page().keyboard.type("[[Colo");
    await page().waitForSelector(".ac-pop .ac-item");
    await page().keyboard.press("Enter");
    assert.equal(await value(), "see [[Colosseum]]");
    noErrors();
  });

  test("the title renames the note", async () => {
    await page().fill(".sn-inline-title", "Renamed note");
    await page().press(".sn-inline-title", "Enter");
    await page().waitForFunction(() => vault.notes.has("cards/Renamed note.md"));
    assert.equal(await ev(() => editor.path), "cards/Renamed note.md");
  });

  test("Escape closes the editor and Ctrl+E toggles reading view", async () => {
    await page().focus(ta);
    await page().keyboard.press("Control+e");
    assert.equal(await ev(() => editor.mode), "read");
    await page().keyboard.press("Control+e");
    assert.equal(await ev(() => editor.mode), "edit");
    await ev(() => { UI.editorWide = false; editor.wide = true; });
    await page().focus(ta);
    await page().keyboard.press("Escape");
    assert.equal(await ev(() => editor.path), null);
  });
});

describe("live preview", () => {
  const body = "# Title\n\nPara **bold** text\n\n- [ ] one\n- [ ] two\n\nLast";
  beforeEach(async () => { await openVault({ demo: false, notes: { "cards/L.md": "---\ncolor: red\n---\n" + body, "cards/Other.md": "" } }); await ev(() => openEditor("cards/L.md", { focus: true })); });
  const ta = ".sn-editor-text.is-live";
  const value = () => ev((sel) => $(sel).value, ta);
  const lines = () => ev(() => $$("#editor .cm-line").map((l) => l.textContent));
  const caretAt = (i) => ev((i) => { const t = $(".sn-editor-text.is-live"); t.focus(); t.setSelectionRange(i); }, i);

  test("the note is one editor; away from the caret its Markdown renders in place", async () => {
    assert.equal(await value(), body);
    const ls = await lines();
    assert.equal(ls[0], "Title");
    assert.equal(ls[2], "Para bold text");
    assert.equal(await ev(() => $("#editor .cm-sn-h1")?.textContent), "Title");
    assert.equal(await ev(() => $("#editor .cm-sn-strong").textContent), "bold");
    assert.equal(await ev(() => $$("#editor .lp-task").length), 2);
    noErrors();
  });

  test("the Markdown shows where the caret is", async () => {
    await page().click("#editor .cm-sn-strong");
    assert.equal((await lines())[2], "Para **bold** text");
    const caret = await ev(() => $(".sn-editor-text.is-live").selectionStart), at = body.indexOf("**bold**");
    assert.ok(caret >= at && caret <= at + 8, `caret ${caret} inside **bold**`);
    assert.equal((await lines())[0], "Title", "other lines stay rendered");
    await caretAt(2);
    assert.equal((await lines())[0], "# Title");
    assert.equal((await lines())[2], "Para bold text");
  });

  test("Enter continues a list, and ends it on an empty item", async () => {
    await caretAt(body.indexOf("two") + 3);
    await page().keyboard.press("Enter");
    await page().keyboard.type("three");
    await page().keyboard.press("Enter");
    await page().keyboard.press("Enter");
    await page().keyboard.type("After");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("cards/L.md").raw.includes("After"));
    assert.match(await raw("cards/L.md"), /- \[ \] two\n- \[ \] three\n\nAfter\n\nLast$/);
  });

  test("a rendered checkbox ticks its own task", async () => {
    await page().click("#editor .lp-task >> nth=1");
    assert.match(await value(), /- \[ \] one\n- \[x\] two/);
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("cards/L.md").raw.includes("- [x] two"));
    noErrors();
  });

  test("selecting text shows the floating format bar, and its buttons format the selection", async () => {
    const at = body.indexOf("Para");
    await ev((at) => { const t = $(".sn-editor-text.is-live"); t.focus(); t.setSelectionRange(at, at + 4); }, at);
    await H.tick();
    assert.ok(await page().isVisible(".sn-fmtbar"));
    const box = await page().locator(".sn-fmtbar").boundingBox(), line = await page().locator("#editor .cm-line >> nth=2").boundingBox();
    assert.ok(box.y + box.height <= line.y + 4, "above the selected line");
    await page().click('.sn-fmtbar [data-act="italic"]');
    assert.match(await value(), /\n\*Para\* \*\*bold\*\* text\n/);
    assert.deepEqual(await ev(() => { const t = $(".sn-editor-text.is-live"); return [t.selectionStart, t.selectionEnd]; }), [at + 1, at + 5], "the text stays selected");
    await caretAt(at + 3);
    await H.tick();
    assert.equal(await page().locator(".sn-fmtbar").count(), 0, "gone when nothing is selected");
  });

  test("a click on a rendered link opens it, as in reading mode (Ctrl/Cmd+click: in the editor)", async () => {
    await caretAt(0);
    await page().keyboard.type("See [[Other]] ");
    await caretAt(await ev(() => $(".sn-editor-text.is-live").value.length));
    await page().click("#editor .cm-sn-wikilink", { modifiers: ["ControlOrMeta"] });
    assert.equal(await ev(() => editor.path), "cards/Other.md");
  });

  test("a callout renders as a block and opens into its Markdown when clicked", async () => {
    await ev(() => { const t = $(".sn-editor-text.is-live"); t.value = "Top\n\n> [!tip] Hint\n> inside\n\nEnd"; t.setSelectionRange(0); });
    await page().click("#editor .cm-line >> nth=0");
    assert.equal(await ev(() => $("#editor .lp-block .callout .callout-title-inner")?.textContent), "Hint");
    await page().click("#editor .lp-block .callout-content");
    assert.equal(await ev(() => !!$("#editor .lp-block .callout")), false, "the callout shows its Markdown");
    assert.ok((await lines()).includes("> [!tip] Hint"));
    noErrors();
  });
});

describe("table editing", () => {
  const body = "Intro\n\n| a | b |\n|---|:-:|\n| 1 | 22 |\n| 3 |  |";
  beforeEach(async () => { await openVault({ demo: false, notes: { "cards/T.md": body } }); await ev(() => openEditor("cards/T.md", { focus: true })); });
  const ta = ".sn-editor-text.is-live";
  const value = () => ev((sel) => $(sel).value, ta);
  const sel = () => ev(() => { const t = $(".sn-editor-text.is-live"); return t.value.slice(t.selectionStart, t.selectionEnd); });
  const text = () => ev(() => liveText());
  const cell = () => ev(() => { const el = $(".sn-cell-edit"); return el && el.contains(getSelection().anchorNode) ? getSelection().toString() || el.textContent : null; });
  const op = (text, o, row, col) => ev(([text, o, r, c]) => { const tb = findTables(text)[0], out = tableEdit(text, tb, o, r, c); return text.slice(0, out.from) + out.insert + text.slice(out.to); }, [text, o, row, col]);

  test("tables are found outside code and quotes, and cells keep escaped pipes", async () => {
    const r = await ev(() => findTables("```\n| a | b |\n|---|---|\n```\n> | q | w |\n> |---|---|\n\nx | y\n--|--\n1 | 2\nafter").map((t) => t.lines));
    assert.deepEqual(r, [["x | y", "--|--", "1 | 2"]]);
    assert.deepEqual(await ev(() => tableCells("| a\\|b | | c |")), ["a\\|b", "", "c"]);
    assert.deepEqual(await ev(() => parseTable(["| a | b | c |", "| :- | :-: | -: |", "| 1 |"])), { rows: [["a", "b", "c"], ["1", "", ""]], align: ["left", "center", "right"] });
  });

  test("formatTable lines up the columns, wide characters included", async () => {
    assert.equal(await ev(() => formatTable({ rows: [["Name", "N"], ["日本", "1"]], align: ["center", "right"] }).text), "| Name | N   |\n| :--: | --: |\n| 日本 | 1   |");
  });

  test("row and column operations", async () => {
    const t = "| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nnext";
    assert.equal(await op(t, "rowAbove", 2, 0), "| a   | b   |\n| --- | --- |\n| 1   | 2   |\n|     |     |\n| 3   | 4   |\n\nnext");
    assert.equal(await op(t, "rowUp", 2, 0), "| a   | b   |\n| --- | --- |\n| 3   | 4   |\n| 1   | 2   |\n\nnext");
    assert.equal(await op(t, "colMoveRight", 0, 0), "| b   | a   |\n| --- | --- |\n| 2   | 1   |\n| 4   | 3   |\n\nnext");
    assert.equal(await op(t, "colDelete", 1, 1), "| a   |\n| --- |\n| 1   |\n| 3   |\n\nnext");
    assert.equal(await op(t, "alignCenter", 1, 1), "| a   | b   |\n| --- | :-: |\n| 1   | 2   |\n| 3   | 4   |\n\nnext");
    assert.equal(await op(t, "sortDesc", 1, 0), "| a   | b   |\n| --- | --- |\n| 3   | 4   |\n| 1   | 2   |\n\nnext");
    assert.equal(await op("| a |\n|---|\n| x |\n| 10 |\n| 9 |\n|  |", "sortAsc", 1, 0), "| a   |\n| --- |\n| 9   |\n| 10  |\n| x   |\n|     |", "numbers as numbers, empty cells last");
    assert.equal(await op("| a |\n|---|\n| 1 |\nnext", "colDelete", 0, 0), "next", "the last column takes the table with it");
  });

  test("a clicked cell is edited in the rendered table; Tab and Enter move between cells and add rows", async () => {
    await page().click("#editor .sn-live tbody tr:first-child td:nth-child(2)");
    assert.equal(await ev(() => !!$("#editor .lp-table .sn-cell-edit")), true, "the table stays rendered");
    assert.equal(await page().textContent(".sn-cell-edit"), "22");
    assert.equal(await ev(() => cellCaret($(".sn-cell-edit"))[0]), 1, "the caret goes where you click: the middle of the centred 22");
    await ev(() => cellSetCaret($(".sn-cell-edit"), 2));
    await page().keyboard.type("3");
    assert.equal(await text(), "Intro\n\n| a   | b   |\n| --- | :-: |\n| 1   | 223 |\n| 3   |     |", "the source lines up as you type");
    await page().keyboard.press("Tab");
    assert.equal(await cell(), "3", "the next cell, selected");
    await page().keyboard.press("Shift+Tab");
    assert.equal(await cell(), "223");
    await page().keyboard.press("Tab"); await page().keyboard.press("Tab");
    await page().keyboard.type("4");
    await page().keyboard.press("Tab");
    assert.equal(await ev(() => $$("#editor .sn-live tbody tr").length), 3, "Tab in the last cell adds a row");
    await page().keyboard.type("5");
    await page().keyboard.press("Enter");
    await page().keyboard.press("Enter");
    await page().keyboard.type("After");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("cards/T.md").raw.includes("After"));
    assert.equal(await raw("cards/T.md"), "Intro\n\n| a   | b   |\n| --- | :-: |\n| 1   | 223 |\n| 3   | 4   |\n| 5   |     |\n\nAfter");
    noErrors();
  });

  test("a cell escapes pipes, saves when you leave it, and arrows leave the table", async () => {
    await page().click("#editor .sn-live tbody tr:last-child td:nth-child(2)");
    await page().keyboard.type("x|y");
    await page().keyboard.press("Escape");
    assert.equal(await ev(() => !!$(".sn-cell-edit")), false);
    assert.equal(await page().textContent("#editor .sn-live tbody tr:last-child td:nth-child(2)"), "x|y");
    await page().waitForFunction(() => vault.notes.get("cards/T.md").raw.includes("x\\|y"));
    await page().click("#editor .sn-live thead th:first-child");
    await page().keyboard.press("ArrowUp");
    assert.deepEqual(await ev(() => { const t = $(".sn-editor-text.is-live"); return [document.activeElement === t, t.selectionStart]; }), [true, 5], "up from the header goes to the end of the line above");
    noErrors();
  });

  test("macOS smart dashes don't break a table separator or a rule", async () => {
    const typed = (v) => ev((v) => {
      const t = $(".sn-editor-text.is-live");
      t.value = v; t.setSelectionRange(v.length, v.length);
      t.dispatchEvent(new InputEvent("input", { inputType: "insertReplacementText" }));
      return [t.value, t.selectionStart];
    }, v);
    assert.deepEqual(await typed("| Hello | One |\n| \u2014- | \u2014\u2014"), ["| Hello | One |\n| --- | ----", 28]);
    assert.deepEqual(await typed("\u2014-"), ["---", 3]);
    assert.deepEqual(await typed("Wait \u2014 here"), ["Wait \u2014 here", 11], "dashes in text stay");
  });

  test("Alt+arrows move rows and columns", async () => {
    await page().click("#editor .sn-live tbody tr:last-child td:first-child");
    await page().keyboard.press("Alt+ArrowUp");
    await page().keyboard.press("Alt+ArrowRight");
    assert.equal(await text(), "Intro\n\n| b   | a   |\n| :-: | --- |\n|     | 3   |\n| 22  | 1   |");
    assert.equal(await cell(), "3", "the cell moves with its row and column");
  });

  test("the + buttons and the menu of a rendered table", async () => {
    await ev(() => $("#editor .sn-table-add-row").click());
    assert.equal(await text(), "Intro\n\n| a   | b   |\n| --- | :-: |\n| 1   | 22  |\n| 3   |     |\n|     |     |");
    assert.equal(await ev(() => $(".sn-cell-edit")?.closest("tr").rowIndex), 3, "the new row is being edited");
    await page().click("#editor .sn-live tbody tr:first-child td:first-child", { button: "right" });
    await page().click(".menu-item:has-text('Delete row')");
    assert.equal(await ev(() => $$("#editor .sn-live tbody tr").length), 2);
    await page().click("#editor .sn-live thead th:first-child", { button: "right" });
    assert.equal(await page().locator(".menu-item:has-text('Delete row')").count(), 0, "the header row stays");
    await page().click(".menu-item:has-text('Add column before')");
    assert.match(await text(), /^Intro\n\n\|     \| a   \| b   \|/);
    noErrors();
  });
});

describe("rendering", () => {
  beforeEach(() => openVault({ demo: false, notes: { "cards/Target.md": "x", "cards/A.md": "" }, files: { "img/p.svg": H.SVG } }));
  const render = (md) => ev((md) => { const el = renderMarkdown(md, "cards/A.md"); document.body.append(el); return el.innerHTML; }, md);

  test("wiki links, tags, highlights, callouts, tasks and embeds", async () => {
    const html = await render("[[Target|go]] [[Missing]] #tag ==hi==\n\n> [!warning] Careful\n> body\n\n- [ ] task\n\n![[p.svg]]");
    assert.match(html, /<a data-href="Target" class="internal-link">go<\/a>/);
    assert.match(html, /internal-link is-unresolved/);
    assert.match(html, /class="tag"[^>]*>#tag</);
    assert.match(html, /<mark>hi<\/mark>/);
    assert.match(html, /callout/);
    assert.match(html, /type="checkbox"/);
    await H.page.waitForFunction(() => [...document.querySelectorAll("img")].some((i) => i.src.startsWith("blob:") && i.naturalWidth === 40));
  });

  test("code blocks get a language header, line numbers and syntax colours", async () => {
    await render('```ts\n// note\nconst a = "<b>";\n```\n\n```\nplain <i>\n```\n\n```brainfuck\n+-\n```');
    const blocks = await ev(() => [...document.querySelectorAll(".code-block")].map((b) => ({
      head: b.querySelector(".code-head").textContent,
      lines: b.querySelectorAll(".code-gutter span").length,
      code: b.querySelector("pre > code").textContent,
      tokens: [...b.querySelectorAll("code span")].map((s) => [s.className, s.textContent]),
    })));
    assert.deepEqual(blocks, [
      { head: "TSTypeScript", lines: 2, code: '// note\nconst a = "<b>";', tokens: [["tok-com", "// note"], ["tok-kw", "const"], ["tok-str", '"<b>"']] },
      { head: "Plain text", lines: 1, code: "plain <i>", tokens: [] },
      { head: "brainfuck", lines: 1, code: "+-", tokens: [] },
    ]);
  });

  test("callouts have a title bar, and no body when there is no text", async () => {
    await render("> [!tip] Full\n> body\n\n> [!note] Bare");
    assert.deepEqual(await ev(() => [...document.querySelectorAll(".callout")].map((c) => [c.dataset.callout, c.querySelector(".callout-title").textContent, c.querySelector(".callout-content")?.textContent.trim() ?? null])), [
      ["tip", "Full", "body"],
      ["note", "Bare", null],
    ]);
  });

  test("callouts with + or - fold, and their title toggles them", async () => {
    await render("> [!info]- Folded\n> hidden\n\n> [!tip]+ Open\n> shown\n\n> [!note] Plain\n> x\n\n> [!todo]- Bare");
    const state = () => ev(() => [...document.querySelectorAll(".callout")].map((c) => [c.dataset.callout, c.classList.contains("is-collapsible"), c.classList.contains("is-collapsed"), !!c.querySelector(".callout-fold")]));
    assert.deepEqual(await state(), [["info", true, true, true], ["tip", true, false, true], ["note", false, false, false], ["todo", false, false, false]]);
    await ev(() => { const el = document.querySelector(".callout").closest("div:not(.callout)"); wireRendered(el, "cards/A.md"); document.querySelector(".callout-title").click(); });
    assert.equal((await state())[0][2], false);
    // the reader's fold is kept for the note while the page is open
    await render("> [!info]- Folded\n> hidden");
    assert.equal(await ev(() => [...document.querySelectorAll(".callout")].at(-1).classList.contains("is-collapsed")), false);
  });

  test("scripts and event handlers are removed", async () => {
    const html = await render('<script>window.x=1</script><img src=x onerror="window.y=1"><a href="javascript:alert(1)">l</a>');
    assert.doesNotMatch(html, /<script|onerror|javascript:/);
    assert.deepEqual(await ev(() => [window.x, window.y]), [undefined, undefined]);
  });

  test("clicking a rendered checkbox ticks the task in the file", async () => {
    await ev(async () => { await writeRaw("cards/A.md", "- [ ] one\n- [ ] two\n"); openEditor("cards/A.md"); editor.mode = "read"; renderEditor(); });
    // a native click in the page fires the same change event (Playwright's actionability wait is flaky here)
    await H.page.waitForFunction(() => document.querySelectorAll(".sn-reading input[type=checkbox]").length === 2);
    await ev(() => document.querySelectorAll(".sn-reading input[type=checkbox]")[1].click());
    await H.page.waitForFunction(() => vault.notes.get("cards/A.md").raw === "- [ ] one\n- [x] two\n");
  });
});

describe("pasted and dropped files", () => {
  const saveIn = (note = "cards/Notes/A.md", name = "photo.png", pasted = false) => ev(([note, name, pasted]) =>
    saveAttachment(new File(["png"], name, { type: "image/png" }), note, pasted), [note, name, pasted]);
  beforeEach(() => openVault({ demo: false, time: "2026-10-29T10:11:12", notes: { "cards/Notes/A.md": "text" } }));

  test("every file goes into attachments/, without overwriting", async () => {
    assert.equal(await saveIn(), "attachments/photo.png");
    assert.equal(await saveIn("daily notes/2026-10-29.md"), "attachments/photo 1.png", "no overwrite");
  });

  test("an attachments folder with other letter case is used as it is", async () => {
    await ev(() => vault.fs.write("Attachments/old.png", "x").then(() => vault.allPaths.add("Attachments/old.png")));
    assert.equal(await saveIn(), "Attachments/photo.png");
  });

  test("pasted images get a timestamp name", async () => {
    assert.equal(await saveIn("cards/Notes/A.md", "image.png", true), "attachments/Pasted image 20261029101112.png");
  });

  test("attachFiles saves and inserts embeds at the cursor", async () => {
    await ev(() => openEditor("cards/Notes/A.md", { focus: true }));
    const v = await ev(async () => {
      const ta = $(".sn-editor-text"); ta.setSelectionRange(4, 4);
      await attachFiles(ta, [new File(["png"], "a.png", { type: "image/png" }), new File(["zip"], "b.zip")]);
      return ta.value;
    });
    assert.equal(v, "text\n![[a.png]]\n![[b.zip]]".replace("![[b.zip]]", "[[b.zip]]"));
  });
});

describe("palettes, settings, language and themes", () => {
  beforeEach(() => openVault());

  test("Ctrl+O opens a card by fuzzy name", async () => {
    await page().keyboard.press("Control+o");
    await page().keyboard.type("pont");
    await page().keyboard.press("Enter");
    assert.equal(await ev(() => board.target), "cards/Pont du Gard.md");
  });

  test("the command palette runs a command", async () => {
    await page().keyboard.press("Control+p");
    await page().keyboard.type("files");
    await page().keyboard.press("Enter");
    assert.equal(await ev(() => board.view), "files");
  });

  test("settings and keyboard shortcuts open without errors", async () => {
    await ev(() => settingsModal("cards"));
    assert.match(await page().textContent(".modal"), /Parents field/);
    await page().keyboard.press("Escape");
    await ev(() => hotkeysModal());
    assert.match(await page().textContent(".modal"), /All files in the vault/);
    noErrors();
  });

  test("settings have a tab per group, arrow keys move between them and the last tab is remembered", async () => {
    await ev(() => settingsModal("appearance"));
    const tabs = () => page().$$eval(".sn-set-tab", (b) => b.map((x) => [x.textContent, x.getAttribute("aria-selected")]));
    assert.deepEqual((await tabs()).map((x) => x[0]), ["Appearance", "Cards", "Board", "Agenda", "About"], "no Git tab outside the app");
    assert.match(await page().textContent(".sn-set-body"), /Theme/);
    assert.doesNotMatch(await page().textContent(".sn-set-body"), /Parents field/, "one group at a time");
    const height = await page().$eval(".modal", (m) => m.offsetHeight);
    await page().click(".sn-set-tab:has-text('Board')");
    assert.match(await page().textContent(".sn-set-body"), /Default depth/);
    assert.equal(await page().$eval(".modal", (m) => m.offsetHeight), height, "the dialog keeps its size between tabs");
    await page().focus(".sn-set-tab.is-active");
    await page().keyboard.press("ArrowRight");
    assert.equal((await tabs()).find((x) => x[1] === "true")[0], "Agenda");
    await page().keyboard.press("Escape");
    await ev(() => settingsModal());
    assert.equal(await page().textContent(".sn-set-tab.is-active"), "Agenda");
    await ev(() => settingsModal("about")); // already open: switches tabs instead of stacking a second dialog
    assert.equal(await page().$$eval(".modal", (m) => m.length), 1);
    noErrors();
  });

  test("About shows the version; the web page has nothing to update", async () => {
    await ev(() => settingsModal("about"));
    const body = await page().textContent(".sn-set-body");
    assert.match(body, /Supstack/);
    assert.match(body, new RegExp("Version " + (await ev(() => APP_VERSION)).replace(/\./g, "\\.") + " · web page"));
    assert.match(body, /Release notes/);
    assert.doesNotMatch(body, /Check now/, "no update check in the browser");
    assert.deepEqual(await ev(() => [isNewer("0.8.0", "0.7.1"), isNewer("v0.7.10", "0.7.9"), isNewer("1.0.0", "1.0.0"), isNewer("0.7.1", "0.8.0"), isNewer("1.0", "0.9.9")]), [true, true, false, false, true]);
    noErrors();
  });

  test("theme toggle switches to dark", async () => {
    const before = await ev(() => document.body.classList.contains("theme-dark"));
    await ev((before) => { UI.theme = before ? "light" : "dark"; applyTheme(); }, before);
    assert.equal(await ev(() => document.body.classList.contains("theme-dark")), !before);
  });

  test("the Russian interface", async () => {
    await openVault({ lang: "ru" });
    assert.match(await page().textContent(".sn-crumbs"), /Все карточки/);
    assert.match(await page().textContent("#files-btn"), /Файлы/);
    noErrors();
  });
});

describe("top bar", () => {
  const state = () => ev(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const top = $(".wb-top");
    return { fits: top.scrollWidth <= top.clientWidth, step: TOP_FIT_STEPS.filter((i) => top.classList.contains(`fit-${i}`)).length };
  });

  for (const lang of ["en", "ru"]) test(`always fits, and gets its labels back when the window widens (${lang})`, async () => {
    await openVault({ viewport: { width: 1700, height: 800 }, lang });
    assert.deepEqual(await state(), { fits: true, step: 0 });
    for (const width of [1250, 1000, 821, 700, 500, 390, 320]) {
      await H.page.setViewportSize({ width, height: 800 });
      assert.equal((await state()).fits, true, `overflows at ${width}px`);
    }
    await H.page.setViewportSize({ width: 1700, height: 800 });
    assert.equal((await state()).step, 0);
  });

  test("refits when a button's text changes", async () => {
    await openVault({ viewport: { width: 1250, height: 800 } });
    const before = (await state()).step;
    await ev(() => { $("#files-btn .wb-label").textContent = "A very long label ".repeat(6); });
    assert.ok((await state()).step > before);
  });
});

describe("sidebar", () => {
  const shown = (sel) => ev((sel) => { const el = $(sel); return !!el && getComputedStyle(el).display !== "none"; }, sel);

  test("holds search, the blue new-card button and the vault", async () => {
    await openVault({ viewport: { width: 1280, height: 800 } });
    for (const sel of [".sb-search", ".sb-new", ".sb-account"]) assert.equal(await shown(sel), true, sel);
    assert.match(await page().textContent(".sb-account"), /Demo|vault/i);
    // the sidebar runs the full height, the top bar starts to its right
    const box = await ev(() => ({ side: $(".sn-side").getBoundingClientRect().toJSON(), top: $(".wb-top").getBoundingClientRect().toJSON() }));
    assert.equal(box.side.top, 0);
    assert.ok(box.top.left >= box.side.right - 1);
    noErrors();
  });

  test("the sidebar search opens the card picker", async () => {
    await openVault();
    await page().click(".sb-search");
    assert.equal(await ev(() => !!document.activeElement?.closest("#minibuf") && document.activeElement.getAttribute("aria-label") === t("pickCard")), true);
    noErrors();
  });

  test("Settings has no style or interface font choice, and old saved choices are dropped", async () => {
    await openVault();
    await H.page.addInitScript(() => { try { localStorage.setItem("sn-ui", JSON.stringify({ lang: "en", style: "workbench", font: "plex" })); } catch { /* file:// storage */ } });
    await H.page.reload();
    assert.deepEqual(await ev(() => [UI.style, UI.font, document.body.className.includes("font-")]), [undefined, undefined, false]);
    assert.equal(await ev(() => document.body.classList.contains("sn-app")), true);
  });
});

describe("phone layout", () => {
  beforeEach(() => openVault({ viewport: { width: 390, height: 800 } }));

  test("the sidebar starts closed and the editor fills the screen", async () => {
    assert.equal(await ev(() => $("#app").classList.contains("side-closed")), true);
    await ev(() => openEditor("cards/History.md"));
    const box = await page().locator("#editor").boundingBox();
    assert.ok(box.width >= 370, `editor width ${box.width}`);
    noErrors();
  });

  test("the note's text uses the editor's width, not the desktop margins", async () => {
    await ev(() => openEditor("cards/History.md"));
    const pad = await ev(() => { const s = getComputedStyle($(".sn-editor-page")); return [parseFloat(s.paddingLeft), parseFloat(s.paddingRight)]; });
    assert.ok(pad.every((p) => p <= 16), `side padding ${pad}`);
    const box = await page().locator(".sn-editor-page .cm-content").boundingBox();
    assert.ok(box.width >= 330, `text width ${box.width}`);
  });

  test("the sidebar opens as a drawer and closes on navigation", async () => {
    await ev(() => setSide(true));
    assert.equal(await ev(() => $("#app").classList.contains("side-closed")), false);
    await ev(() => setTarget("cards/History.md"));
    assert.equal(await ev(() => $("#app").classList.contains("side-closed")), true);
  });
});
