// The app in use: board, navigation, search, tags, editor, autocomplete, rendering, pasted files, palettes, settings, themes and phones.
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { openVault, ev, raw } from "./harness.mjs";
import * as H from "./harness.mjs";

const page = () => H.page;
// cards in reading order (the masonry DOM is in column order); checks that each one is on the page too
const titles = () => ev(() => {
  const shown = computeModel().shown.map((c) => c.path);
  const onPage = new Set([...document.querySelectorAll("#board .sn-masonry .sn-card")].map((c) => c.dataset.path));
  return shown.filter((p) => onPage.has(p)).map((p) => p.replace(/^Cards\/|\.md$/g, ""));
});
const noErrors = () => assert.equal(H.errors.length, 0, H.errors.map((e) => e.stack || e).join("\n"));

describe("tables and fonts", () => {
  beforeEach(() => openVault());

  test("a table fills the note width, keeps its column alignment and scrolls when too wide", async () => {
    const r = await ev(() => {
      const el = renderMarkdown("| Month | Km |\n| :--- | :-: |\n| Oct | 980 |\n", "x.md");
      el.classList.add("markdown-rendered");
      el.style.width = "500px";
      document.body.append(el);
      const wrap = el.querySelector(".sn-table-wrap"), css = (s) => getComputedStyle(el.querySelector(s)).textAlign;
      const wide = renderMarkdown(`| ${"word ".repeat(0)}${Array(40).fill("Longheaderword").join(" | ")} |\n|${" --- |".repeat(40)}\n`, "x.md");
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

  test("Inter works as the interface font and as the writing font, and is embedded for Cyrillic too", async () => {
    const r = await ev(async () => {
      const family = (s) => getComputedStyle(document.body).getPropertyValue(s).trim();
      UI.font = "inter"; UI.writeFont = "sans"; applyTheme();
      const iface = { ui: getComputedStyle(document.body).fontFamily, sans: document.body.classList.contains("font-sans") };
      const reading = h("div", { cls: "sn-reading" });
      document.body.append(reading);
      const plexText = getComputedStyle(reading).fontFamily;
      UI.font = "mono"; UI.writeFont = "inter"; applyTheme();
      const interText = getComputedStyle(reading).fontFamily;
      const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Inter").length;
      return { iface, plexText, interText, faces, family: family("--font-inter") };
    });
    assert.match(r.iface.ui, /^"?Inter/);
    assert.ok(r.iface.sans);
    assert.match(r.plexText, /^"?IBM Plex Sans/, "IBM Plex Sans for writing stays Plex under an Inter interface");
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
    await ev(() => setTarget("Cards/Roman Empire.md"));
    assert.deepEqual(await titles(), ["Colosseum", "Aqueducts"], "child_order");
    assert.match(await page().textContent(".sn-crumbs"), /All cards.*History.*Roman Empire/);
    await page().keyboard.press("Alt+ArrowUp");
    assert.equal(await ev(() => board.target), "Cards/History.md");
    await page().keyboard.press("Alt+ArrowLeft");
    assert.equal(await ev(() => board.target), "Cards/Roman Empire.md");
    noErrors();
  });

  test("depth ∞ over a parent cycle finishes", async () => {
    await ev(() => { board.depth = 0; setTarget("Cards/Cycle A.md"); });
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
    await page().waitForFunction(() => vault.notes.has("Fresh idea.md"));
    noErrors();
  });

  test("select mode and Delete with several cards selected", async () => {
    await ev(() => { board.selection = new Set(["Cards/Knowledge.md", "Cards/Draft thoughts.md"]); renderBoard(); });
    assert.match(await page().textContent(".sn-selbar"), /2 selected/);
    await page().focus('#board .sn-card[data-path="Cards/Knowledge.md"]');
    await page().keyboard.press("Delete");
    await page().click(".modal .mod-warning");
    await page().waitForFunction(() => !vault.notes.has("Cards/Knowledge.md") && !vault.notes.has("Cards/Draft thoughts.md"));
    await page().keyboard.press("Control+z");
    await page().waitForFunction(() => vault.notes.has("Cards/Knowledge.md") && vault.notes.has("Cards/Draft thoughts.md"));
  });
});

describe("editor", () => {
  beforeEach(async () => { await openVault({ demo: false, notes: { "Note.md": "---\ncolor: red\n---\nHello\n", "Colosseum.md": "", "Cola.md": "", "pic.md": "" } }); await ev(() => openEditor("Note.md", { focus: true })); });
  const ta = ".sn-editor-text";
  const value = () => page().inputValue(ta);
  const setValue = (v, s = v.length, e = s) => ev(([v, s, e]) => { const t = $(".sn-editor-text"); t.value = v; t.setSelectionRange(s, e); t.focus(); }, [v, s, e]);

  test("typing saves the body and keeps the frontmatter", async () => {
    await page().focus(ta);
    await page().keyboard.press("End");
    await ev(() => { const t = $(".sn-editor-text"); t.setSelectionRange(t.value.length, t.value.length); });
    await page().keyboard.type("World");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("Note.md").raw.includes("World"));
    assert.equal(await raw("Note.md"), "---\ncolor: red\n---\nHello\nWorld");
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
    assert.equal(await value(), "- one\n");
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
    await page().waitForFunction(() => vault.notes.has("Renamed note.md"));
    assert.equal(await ev(() => editor.path), "Renamed note.md");
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
  beforeEach(async () => { await openVault({ demo: false, notes: { "L.md": "---\ncolor: red\n---\n" + body } }); await ev(() => openEditor("L.md", { focus: true })); });
  const ta = ".sn-editor-text.is-live";
  const value = () => page().inputValue(ta);
  const blocks = () => ev(() => $$("#editor .sn-live-block").map((b) => b.firstElementChild?.tagName));

  test("the other blocks are rendered while one is edited", async () => {
    assert.equal(await value(), "Last");
    assert.deepEqual(await blocks(), ["H1", "P", "UL"]);
    assert.equal(await ev(() => $("#editor .sn-live strong").textContent), "bold");
  });

  test("clicking a rendered block edits it, with the caret where it was clicked", async () => {
    await page().click("#editor .sn-live strong");
    assert.equal(await value(), "Para **bold** text");
    const caret = await ev(() => $(".sn-editor-text.is-live").selectionStart);
    assert.ok(caret >= 7 && caret <= 13, `caret ${caret} inside **bold**`);
    assert.deepEqual(await blocks(), ["H1", "UL", "P"]);
  });

  test("Enter on an empty line renders the block and starts a new one", async () => {
    await page().keyboard.type(" *end*");
    await page().keyboard.press("Enter");
    await page().keyboard.press("Enter");
    assert.equal(await value(), "");
    assert.equal(await ev(() => $$("#editor .sn-live-block em").length), 1);
    await page().keyboard.type("New");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("L.md").raw.endsWith("New"));
    assert.equal(await raw("L.md"), "---\ncolor: red\n---\n" + body + " *end*\n\nNew");
  });

  test("Enter ends a list on an empty item, and again starts a new block", async () => {
    await page().click("#editor .sn-live ul li:last-child", { position: { x: 200, y: 5 } });
    await ev(() => { const t = $(".sn-editor-text.is-live"); t.setSelectionRange(t.value.length, t.value.length); });
    for (const k of ["Enter", "Enter", "Enter"]) await page().keyboard.press(k);
    assert.equal(await value(), "");
    await page().keyboard.type("After");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("L.md").raw.includes("After"));
    assert.match(await raw("L.md"), /- \[ \] two\n\nAfter\n\nLast$/);
  });

  test("arrows move between blocks and Backspace joins with the block above", async () => {
    await ev(() => $(".sn-editor-text.is-live").setSelectionRange(0, 0));
    await page().keyboard.press("ArrowUp");
    assert.equal(await value(), "- [ ] one\n- [ ] two");
    await page().keyboard.press("ArrowDown");
    assert.equal(await value(), "Last");
    await ev(() => $(".sn-editor-text.is-live").setSelectionRange(0, 0));
    await page().keyboard.press("Backspace");
    assert.equal(await value(), "- [ ] one\n- [ ] two\nLast");
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("L.md").raw.endsWith("two\nLast"));
  });

  test("selecting text shows the floating format bar, and its buttons format the selection", async () => {
    await page().click("#editor .sn-live strong");
    await H.tick(); // the click's own mouseup check runs first
    await ev(() => { const t = $(".sn-editor-text.is-live"); t.setSelectionRange(0, 4); t.dispatchEvent(new Event("select")); });
    assert.ok(await page().isVisible(".sn-fmtbar"));
    const box = await page().locator(".sn-fmtbar").boundingBox(), tab = await page().locator(ta).boundingBox();
    assert.ok(box.y + box.height <= tab.y + 4, "above the selected line");
    await page().click('.sn-fmtbar [data-act="italic"]');
    assert.equal(await value(), "*Para* **bold** text");
    assert.deepEqual(await ev(() => { const t = $(".sn-editor-text.is-live"); return [t.selectionStart, t.selectionEnd]; }), [1, 5], "the text stays selected");
    assert.ok(await ev(() => $('.sn-fmtbar [data-act="italic"]').classList.contains("is-active")));
    await ev(() => { const t = $(".sn-editor-text.is-live"); t.setSelectionRange(3, 3); t.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowLeft" })); });
    assert.equal(await page().locator(".sn-fmtbar").count(), 0, "gone when nothing is selected");
  });

  test("moveBlock moves a block before or after another and keeps the blank lines", async () => {
    const mv = (b, from, to, after) => ev(([b, f, t, a]) => moveBlock(b, f, t, a), [b, from, to, after]);
    const b = "A\n\nB\n\n\nC";
    assert.equal(await mv(b, 0, 3, true), "B\n\nA\n\n\nC", "first block down");
    assert.equal(await mv(b, 7, 0, false), "C\n\n\nA\n\nB", "last block to the top");
    assert.equal(await mv(b, 3, 7, true), "A\n\n\nC\n\nB");
    assert.equal(await mv(b, 3, 0, true), null, "already there");
  });

  test("dragging a block's handle moves the block in the file", async () => {
    await ev(() => $("#editor .sn-live-block:nth-child(1)").dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    const handle = page().locator("#editor .sn-live-block").first().locator(".sn-live-handle");
    const hb = await handle.boundingBox(), list = await page().locator("#editor .sn-live ul").boundingBox();
    await page().mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page().mouse.down();
    await page().mouse.move(hb.x + 4, list.y + list.height - 3, { steps: 6 });
    assert.ok(await ev(() => !!$("#editor .is-drop-after")), "the drop line shows");
    await page().mouse.up();
    assert.deepEqual(await blocks(), ["P", "UL", "H1", "P"]);
    await page().keyboard.press("Control+s");
    await page().waitForFunction(() => vault.notes.get("L.md").raw.includes("two\n\n# Title"));
    assert.equal(await raw("L.md"), "---\ncolor: red\n---\nPara **bold** text\n\n- [ ] one\n- [ ] two\n\n# Title\n\nLast");
    noErrors();
  });

  test("a rendered checkbox ticks its own task", async () => {
    await ev(() => $$("#editor .sn-live input[type=checkbox]")[1].click());
    await page().waitForFunction(() => vault.notes.get("L.md").raw.includes("- [x] two"));
    assert.match(await raw("L.md"), /- \[ \] one/);
    noErrors();
  });
});

describe("rendering", () => {
  beforeEach(() => openVault({ demo: false, notes: { "Target.md": "x", "A.md": "" }, files: { "img/p.svg": H.SVG } }));
  const render = (md) => ev((md) => { const el = renderMarkdown(md, "A.md"); document.body.append(el); return el.innerHTML; }, md);

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

  test("scripts and event handlers are removed", async () => {
    const html = await render('<script>window.x=1</script><img src=x onerror="window.y=1"><a href="javascript:alert(1)">l</a>');
    assert.doesNotMatch(html, /<script|onerror|javascript:/);
    assert.deepEqual(await ev(() => [window.x, window.y]), [undefined, undefined]);
  });

  test("clicking a rendered checkbox ticks the task in the file", async () => {
    await ev(async () => { await writeRaw("A.md", "- [ ] one\n- [ ] two\n"); openEditor("A.md"); editor.mode = "read"; renderEditor(); });
    // a native click in the page fires the same change event (Playwright's actionability wait is flaky here)
    await H.page.waitForFunction(() => document.querySelectorAll(".sn-reading input[type=checkbox]").length === 2);
    await ev(() => document.querySelectorAll(".sn-reading input[type=checkbox]")[1].click());
    await H.page.waitForFunction(() => vault.notes.get("A.md").raw === "- [ ] one\n- [x] two\n");
  });
});

describe("pasted and dropped files", () => {
  const saveIn = (setting, note = "Notes/A.md", name = "photo.png", pasted = false) => ev(async ([setting, note, name, pasted]) => {
    if (setting != null) await vault.fs.write(".obsidian/app.json", JSON.stringify({ attachmentFolderPath: setting }));
    return saveAttachment(new File(["png"], name, { type: "image/png" }), note, pasted);
  }, [setting, note, name, pasted]);
  beforeEach(() => openVault({ demo: false, time: "2026-10-29T10:11:12", notes: { "Notes/A.md": "text" } }));

  test("Obsidian's attachment folder setting decides where files go", async () => {
    assert.equal(await saveIn(null), "photo.png", "default: vault root");
    assert.equal(await saveIn("./"), "Notes/photo.png");
    assert.equal(await saveIn("./assets"), "Notes/assets/photo.png");
    assert.equal(await saveIn("Files/"), "Files/photo.png");
    assert.equal(await saveIn("Files/"), "Files/photo 1.png", "no overwrite");
  });

  test("pasted images get Obsidian's timestamp name", async () => {
    assert.equal(await saveIn("/", "Notes/A.md", "image.png", true), "Pasted image 20261029101112.png");
  });

  test("attachFiles saves and inserts embeds at the cursor", async () => {
    await ev(() => openEditor("Notes/A.md", { focus: true }));
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
    assert.equal(await ev(() => board.target), "Cards/Pont du Gard.md");
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
    assert.match(body, /Supsidian/);
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

describe("top bar (Workbench style)", () => {
  const state = () => ev(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const top = $(".wb-top");
    return { fits: top.scrollWidth <= top.clientWidth, step: TOP_FIT_STEPS.filter((i) => top.classList.contains(`fit-${i}`)).length, brand: getComputedStyle($(".wb-brand")).display !== "none" };
  });

  for (const lang of ["en", "ru"]) test(`always fits, and gets its details back when the window widens (${lang})`, async () => {
    await openVault({ viewport: { width: 1700, height: 800 }, lang, style: "workbench" });
    assert.deepEqual(await state(), { fits: true, step: 0, brand: true });
    for (const width of [1250, 1100, 1000, 850, 821, 700, 500, 390, 320]) {
      await H.page.setViewportSize({ width, height: 800 });
      assert.equal((await state()).fits, true, `overflows at ${width}px`);
    }
    await H.page.setViewportSize({ width: 1700, height: 800 });
    assert.equal((await state()).step, 0);
  });

  test("drops the details before the logo, and the logo before the labels", async () => {
    await openVault({ viewport: { width: 1100, height: 800 }, style: "workbench" });
    assert.equal((await state()).brand, true);
    await H.page.setViewportSize({ width: 850, height: 800 });
    assert.deepEqual(await state(), { fits: true, step: 3, brand: false });
  });

  test("refits when a button's text changes", async () => {
    await openVault({ viewport: { width: 1250, height: 800 } });
    const before = (await state()).step;
    await ev(() => { $("#files-btn .wb-label").textContent = "A very long label ".repeat(6); });
    assert.ok((await state()).step > before);
  });
});

describe("Evernote style", () => {
  const shown = (sel) => ev((sel) => { const el = $(sel); return !!el && getComputedStyle(el).display !== "none"; }, sel);

  test("is the default: search, the green new-card button and the vault are in the sidebar", async () => {
    await openVault({ viewport: { width: 1280, height: 800 } });
    assert.equal(await ev(() => document.body.classList.contains("style-evernote")), true);
    for (const sel of [".ev-search", ".ev-new", ".ev-account"]) assert.equal(await shown(sel), true, sel);
    for (const sel of [".wb-brand", ".wb-top .wb-new", ".wb-top .wb-open"]) assert.equal(await shown(sel), false, sel);
    assert.match(await page().textContent(".ev-account"), /Demo|vault/i);
    // the sidebar runs the full height, the top bar starts to its right
    const box = await ev(() => ({ side: $(".sn-side").getBoundingClientRect().toJSON(), top: $(".wb-top").getBoundingClientRect().toJSON() }));
    assert.equal(box.side.top, 0);
    assert.ok(box.top.left >= box.side.right - 1);
    noErrors();
  });

  test("the sidebar search opens the card picker", async () => {
    await openVault();
    await page().click(".ev-search");
    assert.equal(await ev(() => !!document.activeElement?.closest("#minibuf") && document.activeElement.getAttribute("aria-label") === t("pickCard")), true);
    noErrors();
  });

  test("the top bar fits at every width", async () => {
    await openVault({ viewport: { width: 1700, height: 800 } });
    for (const width of [1250, 1000, 821, 700, 390, 320]) {
      await H.page.setViewportSize({ width, height: 800 });
      assert.equal(await ev(async () => { await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); const top = $(".wb-top"); return top.scrollWidth <= top.clientWidth; }), true, `overflows at ${width}px`);
    }
  });

  test("Settings switches to the Workbench style and back", async () => {
    await openVault();
    await ev(() => { UI.style = "workbench"; applyTheme(); });
    assert.equal(await shown(".ev-side-head"), false);
    assert.equal(await shown(".wb-brand"), true);
    await ev(() => { UI.style = "evernote"; applyTheme(); });
    assert.equal(await shown(".ev-side-head"), true);
  });
});

describe("phone layout", () => {
  beforeEach(() => openVault({ viewport: { width: 390, height: 800 } }));

  test("the sidebar starts closed and the editor fills the screen", async () => {
    assert.equal(await ev(() => $("#app").classList.contains("side-closed")), true);
    await ev(() => openEditor("Cards/History.md"));
    const box = await page().locator("#editor").boundingBox();
    assert.ok(box.width >= 370, `editor width ${box.width}`);
    noErrors();
  });

  test("the sidebar opens as a drawer and closes on navigation", async () => {
    await ev(() => setSide(true));
    assert.equal(await ev(() => $("#app").classList.contains("side-closed")), false);
    await ev(() => setTarget("Cards/History.md"));
    assert.equal(await ev(() => $("#app").classList.contains("side-closed")), true);
  });
});
