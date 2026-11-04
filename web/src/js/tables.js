/* ---------- Tables, edited like Obsidian's: Tab and Enter move between cells, the source stays aligned in columns,
   and a menu (right click, the toolbar's table button, the + buttons on a rendered table) adds, moves, sorts, aligns and deletes rows and columns.
   A parsed table is { rows: [[cell text]], align: ["" | "left" | "center" | "right"] }; rows[0] is the header. */
import { LANG, t } from "./i18n.js";
import { $, $$, baseName, colorLabel, COLORS, h, ic, isMod, setIcon } from "./dom.js";
import { dumpYaml } from "./frontmatter.js";
import { board, editor, graph, S, UI, vault } from "./state.js";
import { cardColor, cardIcon, makeComparator } from "./vault.js";
import { txn, updateFM } from "./save.js";
import { promptAddParent, promptIcon, removeParent, setColor, templateFor } from "./actions.js";
import { Menu } from "./ui.js";
import { parentChip } from "./cards.js";
import { setTarget } from "./board.js";
import { closeEditor, editorModeline, openEditor, renderEditor, saveEditor, scheduleSave, setSaveState } from "./editor.js";
import { liveActivate, liveActivateEnd, liveTa, lpTableFill } from "./live-preview.js";
import { edSetHeading } from "./format-bar.js";
import { syncHook } from "./sync.js";
import { acKey, acUpdate, linkMention, pickAndAttach, setFocusMode, unlinkedMentions, wt } from "./completion.js";
import { orgEditorKey, orgLineIsEntry, orgToolbar } from "./org-editing.js";

const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
/** [start, end) of each cell's trimmed text in a row; pipes escaped as \| stay in their cell. */
export function tableSpans(line) {
  const spans = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (line[i] === "\\") { i++; continue; }
    if (i >= line.length || line[i] === "|") { spans.push([start, Math.min(i, line.length)]); start = i + 1; }
  }
  if (/^\s*\|/.test(line)) spans.shift();
  if (spans.length > 1 && !line.slice(spans.at(-1)[0]).trim()) spans.pop();
  return spans.map(([a, b]) => { while (a < b && /\s/.test(line[a])) a++; while (b > a && /\s/.test(line[b - 1])) b--; return [a, b]; });
}
export const tableCells = (line) => tableSpans(line).map(([a, b]) => line.slice(a, b));
/** Tables in Markdown text, outside code blocks and quotes: [{ from, to, lines }], `to` at the end of the last row. */
export function findTables(text) {
  const out = [], lines = text.split("\n");
  let pos = 0, fence = null;
  const starts = lines.map((l) => { const p = pos; pos += l.length + 1; return p; });
  const row = (l) => l?.includes("|") && l.trim() && !/^\s*>/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const f = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (f) { fence = !fence ? f[1] : lines[i].trim().startsWith(fence) ? null : fence; continue; }
    if (fence || !row(lines[i]) || !row(lines[i + 1]) || !TABLE_SEP_RE.test(lines[i + 1])) continue;
    let j = i + 2;
    while (j < lines.length && row(lines[j])) j++;
    out.push({ from: starts[i], to: starts[j - 1] + lines[j - 1].length, lines: lines.slice(i, j) });
    i = j - 1;
  }
  return out;
}
export function parseTable(lines) {
  const sep = tableCells(lines[1]);
  const rows = [lines[0], ...lines.slice(2)].map(tableCells);
  const n = Math.max(sep.length, ...rows.map((r) => r.length));
  const align = Array.from({ length: n }, (_, i) => { const c = sep[i] || ""; return c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : c.startsWith(":") ? "left" : ""; });
  return { rows: rows.map((r) => Array.from({ length: n }, (_, i) => r[i] ?? "")), align };
}
/** Columns line up as on screen: wide (CJK) characters and emoji take two. */
const strWidth = (s) => [...s].reduce((w, ch) => w + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1FAFF}]/u.test(ch) ? 2 : 1), 0);
/** The table as aligned Markdown; cell(r, c) is the [start, end) of a cell's text in it. */
export function formatTable(t) {
  const w = t.align.map((a, i) => Math.max(3, ...t.rows.map((r) => strWidth(r[i]))));
  const pos = [];
  let text = "";
  t.rows.forEach((cells, r) => {
    if (r) text += "\n";
    pos[r] = [];
    text += "|";
    cells.forEach((c, i) => { text += " "; pos[r][i] = [text.length, text.length + c.length]; text += c + " ".repeat(w[i] - strWidth(c)) + " |"; });
    if (!r) text += "\n|" + t.align.map((a, i) => {
      const l = a === "left" || a === "center", rt = a === "right" || a === "center";
      return " " + (l ? ":" : "") + "-".repeat(w[i] - l - rt) + (rt ? ":" : "") + " |";
    }).join("");
  });
  return { text, cell: (r, c) => pos[Math.max(0, Math.min(r, pos.length - 1))][Math.max(0, Math.min(c, t.align.length - 1))] };
}
/** The cell at an offset in a table's text; row 0 is the header (its separator line too). */
function tableCellAt(tb, off) {
  let li = 0, start = 0;
  for (; li < tb.lines.length - 1 && off > start + tb.lines[li].length; li++) start += tb.lines[li].length + 1;
  const line = tb.lines[li], upto = Math.max(0, off - start);
  let pipes = 0;
  for (let i = 0; i < upto && i < line.length; i++) { if (line[i] === "\\") i++; else if (line[i] === "|") pipes++; }
  if (/^\s*\|/.test(line)) pipes--;
  return { row: li < 2 ? 0 : li - 1, col: Math.max(0, Math.min(pipes, parseTable(tb.lines).align.length - 1)) };
}
/** Each op changes the table and returns the cell to put the caret in ([row, col]), or "delete" for no table left. */
const TABLE_OPS = {
  rowAbove: (t, r, c) => { t.rows.splice(Math.max(1, r), 0, t.align.map(() => "")); return [Math.max(1, r), c]; },
  rowBelow: (t, r, c) => { t.rows.splice(r + 1, 0, t.align.map(() => "")); return [r + 1, c]; },
  rowUp: (t, r, c) => { if (r < 2) return [r, c]; [t.rows[r - 1], t.rows[r]] = [t.rows[r], t.rows[r - 1]]; return [r - 1, c]; },
  rowDown: (t, r, c) => { if (r < 1 || r >= t.rows.length - 1) return [r, c]; [t.rows[r + 1], t.rows[r]] = [t.rows[r], t.rows[r + 1]]; return [r + 1, c]; },
  rowDelete: (t, r, c) => { if (t.rows.length < 2) return "delete"; t.rows.splice(r, 1); return [Math.min(r, t.rows.length - 1), c]; },
  colLeft: (t, r, c) => { t.rows.forEach((x) => x.splice(c, 0, "")); t.align.splice(c, 0, ""); return [r, c]; },
  colRight: (t, r, c) => { t.rows.forEach((x) => x.splice(c + 1, 0, "")); t.align.splice(c + 1, 0, ""); return [r, c + 1]; },
  colMoveLeft: (t, r, c) => { if (c < 1) return [r, c]; for (const x of [...t.rows, t.align]) [x[c - 1], x[c]] = [x[c], x[c - 1]]; return [r, c - 1]; },
  colMoveRight: (t, r, c) => { if (c >= t.align.length - 1) return [r, c]; for (const x of [...t.rows, t.align]) [x[c + 1], x[c]] = [x[c], x[c + 1]]; return [r, c + 1]; },
  colDelete: (t, r, c) => { if (t.align.length < 2) return "delete"; t.rows.forEach((x) => x.splice(c, 1)); t.align.splice(c, 1); return [r, Math.min(c, t.align.length - 1)]; },
  alignLeft: (t, r, c) => { t.align[c] = "left"; return [r, c]; },
  alignCenter: (t, r, c) => { t.align[c] = "center"; return [r, c]; },
  alignRight: (t, r, c) => { t.align[c] = "right"; return [r, c]; },
  // sorting keeps the header and puts empty cells last; numbers sort as numbers
  sortAsc: (t, r, c) => { t.rows = [t.rows[0], ...t.rows.slice(1).sort((a, b) => !a[c] - !b[c] || a[c].localeCompare(b[c], undefined, { numeric: true, sensitivity: "base" }))]; return [r, c]; },
  sortDesc: (t, r, c) => { t.rows = [t.rows[0], ...t.rows.slice(1).sort((a, b) => !a[c] - !b[c] || b[c].localeCompare(a[c], undefined, { numeric: true, sensitivity: "base" }))]; return [r, c]; },
  format: (t, r, c) => [r, c],
};
/** TABLE_OPS[op] on table `tb` of `text`: replace [from, to) with `insert`; `sel` is the caret cell's text in the new text. */
export function tableEdit(text, tb, op, row, col) {
  const t = parseTable(tb.lines), res = TABLE_OPS[op](t, row, col);
  if (res === "delete") return { from: tb.from, to: text[tb.to] === "\n" ? tb.to + 1 : tb.to, insert: "", sel: [tb.from, tb.from] };
  const f = formatTable(t), [s, e] = f.cell(...res);
  return { from: tb.from, to: tb.to, insert: f.text, sel: [tb.from + s, tb.from + e] };
}
export function tableMenu(run, row) {
  const m = new Menu();
  m.label(wt("tblRow"));
  if (row > 0) m.add(wt("tblRowAbove"), "arrow-up-to-line", () => run("rowAbove"));
  m.add(wt("tblRowBelow"), "arrow-down-to-line", () => run("rowBelow"));
  if (row > 1) m.add(wt("tblRowUp"), "chevron-up", () => run("rowUp"));
  if (row > 0) m.add(wt("tblRowDown"), "chevron-down", () => run("rowDown"));
  if (row > 0) m.add(wt("tblRowDelete"), "trash-2", () => run("rowDelete"), { warning: true });
  m.sep().label(wt("tblCol"));
  m.add(wt("tblColLeft"), "arrow-left-to-line", () => run("colLeft"));
  m.add(wt("tblColRight"), "arrow-right-to-line", () => run("colRight"));
  m.add(wt("tblColMoveLeft"), "chevron-left", () => run("colMoveLeft"));
  m.add(wt("tblColMoveRight"), "chevron-right", () => run("colMoveRight"));
  m.add(wt("tblAlignLeft"), "align-left", () => run("alignLeft"));
  m.add(wt("tblAlignCenter"), "align-center", () => run("alignCenter"));
  m.add(wt("tblAlignRight"), "align-right", () => run("alignRight"));
  m.add(wt("tblSortAsc"), "arrow-down-a-z", () => run("sortAsc"));
  m.add(wt("tblSortDesc"), "arrow-up-z-a", () => run("sortDesc"));
  m.add(wt("tblColDelete"), "trash-2", () => run("colDelete"), { warning: true });
  m.sep().add(wt("tblFormat"), "wand-sparkles", () => run("format"));
  return m;
}
/** The table under the caret of a textarea, with the caret's cell. */
export function editorTable(ta) {
  const s = ta.selectionStart, tb = findTables(ta.value).find((x) => s >= x.from && s <= x.to);
  return tb ? { tb, ...tableCellAt(tb, s - tb.from) } : null;
}
export function editorTableOp(ta, op, at = editorTable(ta)) {
  if (!at) return;
  const out = tableEdit(ta.value, at.tb, op, at.row, at.col);
  edInsert(ta, out.from, out.to, out.insert, ...out.sel);
}
/** Table keys in the editor (true when the key was used): Tab / Shift+Tab to the next / previous cell (a new row after the last),
   Enter to the cell below (a new row after the last; on an empty last row the table ends), Shift+Enter a line break in the cell,
   Alt+arrows move the row or column. */
function editorTableKey(e, ta) {
  if (e.isComposing || isMod(e) || !(e.key === "Tab" || e.key === "Enter" || (e.altKey && !e.shiftKey && /^Arrow/.test(e.key)))) return false;
  if (e.key === "Enter" && ta.selectionStart !== ta.selectionEnd) return false;
  const at = editorTable(ta);
  if (!at) return false;
  e.preventDefault();
  const t = parseTable(at.tb.lines), last = t.rows.length - 1, cols = t.align.length;
  const go = (row, col, op = "format") => { editorTableOp(ta, op, { ...at, row, col }); return true; };
  if (e.altKey) return go(at.row, at.col, { ArrowUp: "rowUp", ArrowDown: "rowDown", ArrowLeft: "colMoveLeft", ArrowRight: "colMoveRight" }[e.key]);
  if (e.key === "Tab" && e.shiftKey) return at.col > 0 ? go(at.row, at.col - 1) : go(Math.max(0, at.row - 1), at.row ? cols - 1 : 0);
  if (e.key === "Tab") return at.col < cols - 1 ? go(at.row, at.col + 1) : at.row < last ? go(at.row + 1, 0) : go(at.row, 0, "rowBelow");
  if (e.shiftKey) { edInsert(ta, ta.selectionStart, ta.selectionStart, "<br>"); return true; }
  if (at.row === last && at.row > 0 && t.rows[last].every((c) => !c)) {
    // a line right under a table would be one more row, so the text goes on after a blank line
    t.rows.pop();
    const f = formatTable(t).text + "\n\n";
    edInsert(ta, at.tb.from, at.tb.to, f, at.tb.from + f.length);
    return true;
  }
  return at.row < last ? go(at.row + 1, at.col) : go(at.row, at.col, "rowBelow");
}
/** The rendered table `x` is in (a cell, a + button): its table in the document and the cell. */
export function liveTableAt(x) {
  const el = x.closest(".lp-table"), view = liveTa()?.cmView, tbl = el?.querySelector("table");
  if (!el || !view || !tbl) return null;
  const from = view.posAtDOM(el), tb = findTables(view.state.doc.toString()).find((t) => t.from === from);
  const cell = x.closest("td, th");
  return tb ? { s: 0, tb, tbl, row: cell ? cell.parentElement.rowIndex : 0, col: cell ? cell.cellIndex : 0 } : null;
}
/** Run a table op on a rendered table (`x` is in it, or x.from is where it starts); o.edit then edits the caret's cell. */
export function liveTableOp(x, op, o = {}) {
  const view = liveTa()?.cmView, at = x.from != null ? x : liveTableAt(x);
  if (!at || !view) return;
  liveCellClose({ save: false });
  const from = at.tb?.from ?? at.from, tb = findTables(view.state.doc.toString()).find((t) => t.from === from);
  if (!tb) return;
  const out = tableEdit(view.state.doc.toString(), tb, op, o.row ?? at.row, o.col ?? at.col);
  view.dispatch({ changes: { from: out.from, to: out.to, insert: out.insert }, userEvent: "input.table" });
  if (!o.edit || !out.insert) return;
  const at2 = tableCellAt({ ...tb, lines: out.insert.split("\n") }, out.sel[0] - out.from);
  liveCellOpen(out.from, at2.row, at2.col, { select: true });
}
/* ---------- A table in live preview stays rendered while it is edited, as in Obsidian: one cell at a time holds an editor
   with the cell's Markdown, and the table's text is rewritten (lined up) as you type.
   editor.cell = { el, from, to, row, col, t }: the cell's editor, the table's [from, to) in the document and the parsed table. */
export const cellCaret = (el) => {
  const sel = getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return [el.textContent.length, el.textContent.length];
  const r = sel.getRangeAt(0), pre = document.createRange();
  pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  const s = pre.toString().length;
  return [s, s + r.toString().length];
};
export function cellSetCaret(el, s, e = s) {
  const node = el.firstChild || el.appendChild(document.createTextNode("")), n = node.length;
  const r = document.createRange();
  r.setStart(node, Math.min(s, n)); r.setEnd(node, Math.min(e, n));
  getSelection().removeAllRanges(); getSelection().addRange(r);
}
/** The rendered table at document offset `from`, and one of its cells. */
function liveTableEl(from) { const view = liveTa()?.cmView; return view ? $$("#editor .lp-table").find((el) => view.posAtDOM(el) === from) || null : null; }
const liveCellAt = (from, row, col) => liveTableEl(from)?.querySelector("table")?.rows[row]?.cells[col] || null;
/** Edit one cell of a rendered table: o.caret puts the caret at that offset in the cell's text, o.select selects it all, o.atStart / the default the end. */
export function liveCellOpen(from, row, col, o = {}) {
  const view = liveTa()?.cmView;
  if (!view) return null;
  liveCellClose({ save: false });
  const tb = findTables(view.state.doc.toString()).find((x) => x.from === from), td = tb && liveCellAt(from, row, col);
  if (!td) return null;
  const t = parseTable(tb.lines), text = t.rows[row][col];
  const el = h("span", { cls: "sn-cell-edit", spellcheck: "true", text });
  el.contentEditable = "plaintext-only";
  if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
  td.replaceChildren(el);
  td.classList.add("is-editing");
  editor.cell = { el, from, to: tb.to, row, col, t };
  el.addEventListener("input", liveCellInput);
  el.addEventListener("keydown", liveCellKeys);
  el.addEventListener("blur", () => setTimeout(() => { if (editor.cell?.el === el && document.activeElement !== el) liveCellClose(); }, 0));
  el.focus({ preventScroll: true });
  cellSetCaret(el, o.select ? 0 : o.atStart ? 0 : o.caret ?? text.length, o.select ? text.length : o.atStart ? 0 : o.caret ?? text.length);
  editorModeline(); updateEdToolbar();
  return el;
}
/** The cell's text into the note: pipes are escaped, line breaks become <br>. */
function liveCellInput() {
  const c = editor.cell;
  if (!c) return;
  c.t.rows[c.row][c.col] = c.el.textContent.replace(/\r?\n/g, "<br>").replace(/\\?\|/g, (m) => (m.length > 1 ? m : "\\|"));
  liveCellWrite(formatTable(c.t).text);
  editor.dirty = true; setSaveState(); scheduleSave();
  syncHook("modify", editor.path, 250);
}
/** Replace the table's text in the document; the table widget keeps its DOM while the cell is edited. */
function liveCellWrite(text) {
  const c = editor.cell, view = liveTa()?.cmView;
  view.dispatch({ changes: { from: c.from, to: c.to, insert: text } });
  c.to = c.from + text.length;
}
/** Close the cell editor: its table renders again. */
function liveCellClose(o = {}) {
  const c = editor.cell, view = liveTa()?.cmView;
  editor.cell = null;
  const el = c?.el.closest(".lp-table");
  if (!el?.isConnected || !view) return;
  lpTableFill(el, view.state.sliceDoc(c.from, c.to));
  if (o.save !== false && editor.dirty) saveEditor();
}
/** Move the cell editor to another cell after op (TABLE_OPS) on the table; the table renders with the change. */
function liveCellGo(row, col, op = "format", o = {}) {
  const c = editor.cell;
  const res = TABLE_OPS[op](c.t, row, col);
  liveCellWrite(formatTable(c.t).text);
  if (op !== "format") { editor.dirty = true; setSaveState(); scheduleSave(); }
  liveCellClose({ save: false });
  liveCellOpen(c.from, ...res, o);
}
/** Leave the table for the nearest line with text above (up) or below it (down); o.newLine starts a new paragraph right under the table
   (after a blank line: a line right under a table would be one more row), as does going down from a table at the end of the note. */
function liveCellLeave(down, o = {}) {
  const c = editor.cell, ta = liveTa(), view = ta?.cmView;
  liveCellClose({ save: false });
  if (!view) return;
  const doc = view.state.doc, near = (n, step) => { while (n >= 1 && n <= doc.lines && !doc.line(n).text.trim()) n += step; return n >= 1 && n <= doc.lines ? doc.line(n) : null; };
  if (!down) { const l = near(doc.lineAt(c.from).number - 1, -1); if (l) liveActivate(l.to); return; }
  const l = !o.newLine && near(doc.lineAt(c.to).number + 1, 1);
  if (l) { liveActivate(l.from); return; }
  ta.focus({ preventScroll: true }); // first: CodeMirror reads the browser's caret when it gets the focus
  view.dispatch({ changes: { from: c.to, insert: "\n\n" }, selection: { anchor: c.to + 2 }, userEvent: "input.table" });
  editorModeline(); updateEdToolbar();
}
/** Keys in a cell: Tab / Shift+Tab and Enter move on as in the source (a new row after the last; Enter on an empty last row ends the table),
   Shift+Enter a <br>, arrows at the edge of the text go to the next cell or out of the table, Alt+arrows move the row or column, Escape stops editing. */
function liveCellKeys(e) {
  const c = editor.cell;
  if (!c || e.isComposing) return;
  const take = () => { e.preventDefault(); e.stopPropagation(); };
  const last = c.t.rows.length - 1, cols = c.t.align.length, len = c.el.textContent.length, [s, en] = cellCaret(c.el);
  if (isMod(e)) {
    const k = e.key.toLowerCase();
    if (k === "s") { take(); saveEditor(); }
    else if (k === "b" || k === "i") {
      take();
      const mark = k === "b" ? "**" : "*", v = c.el.textContent;
      c.el.textContent = v.slice(0, s) + mark + v.slice(s, en) + mark + v.slice(en);
      cellSetCaret(c.el, s + mark.length, en + mark.length);
      liveCellInput();
    }
    return;
  }
  if (e.altKey && !e.shiftKey && /^Arrow/.test(e.key)) { take(); liveCellGo(c.row, c.col, { ArrowUp: "rowUp", ArrowDown: "rowDown", ArrowLeft: "colMoveLeft", ArrowRight: "colMoveRight" }[e.key], { caret: s }); return; }
  if (e.altKey) return;
  if (e.key === "Escape") { take(); liveCellClose(); return; }
  if (e.key === "Tab") {
    take();
    if (e.shiftKey) { if (c.col > 0) liveCellGo(c.row, c.col - 1, "format", { select: true }); else if (c.row > 0) liveCellGo(c.row - 1, cols - 1, "format", { select: true }); return; }
    if (c.col < cols - 1) liveCellGo(c.row, c.col + 1, "format", { select: true });
    else if (c.row < last) liveCellGo(c.row + 1, 0, "format", { select: true });
    else liveCellGo(c.row, 0, "rowBelow", { select: true });
    return;
  }
  if (e.key === "Enter") {
    take();
    if (e.shiftKey) { document.execCommand("insertText", false, "<br>"); return; }
    if (c.row === last && c.row > 0 && c.t.rows[last].every((x) => !x)) {
      // an empty last row: it goes, and the text goes on in a new block under the table
      c.t.rows.pop();
      liveCellWrite(formatTable(c.t).text);
      editor.dirty = true; setSaveState(); scheduleSave();
      liveCellLeave(true, { newLine: true });
      return;
    }
    if (c.row < last) liveCellGo(c.row + 1, c.col, "format", { select: true }); else liveCellGo(c.row, c.col, "rowBelow", { select: true });
    return;
  }
  if (s !== en || e.shiftKey) return;
  if (e.key === "ArrowLeft" && s === 0 && (c.col > 0 || c.row > 0)) { take(); liveCellGo(c.col ? c.row : c.row - 1, c.col ? c.col - 1 : cols - 1); }
  else if (e.key === "ArrowRight" && s === len && (c.col < cols - 1 || c.row < last)) { take(); liveCellGo(c.col < cols - 1 ? c.row : c.row + 1, c.col < cols - 1 ? c.col + 1 : 0, "format", { atStart: true }); }
  else if (e.key === "ArrowUp") { take(); if (c.row > 0) liveCellGo(c.row - 1, c.col); else liveCellLeave(false); }
  else if (e.key === "ArrowDown") { take(); if (c.row < last) liveCellGo(c.row + 1, c.col); else liveCellLeave(true); }
}
/** In live preview a rendered table gets + buttons for a new row (below) and a new column (on the right). */
export function liveTableButtons(el) {
  for (const wrap of $$(".sn-table-wrap", el)) {
    if (wrap.closest("blockquote, .callout")) continue;
    const host = h("div", { cls: "sn-table-host" });
    const add = (cls, title, fn) => { const b = h("button", { type: "button", cls, title, "aria-label": title }, ic("", "plus")); b.addEventListener("click", (e) => { e.stopPropagation(); fn(b); }); return b; };
    wrap.replaceWith(host);
    host.append(wrap,
      add("sn-table-add-row", wt("tblRowBelow"), (b) => liveTableOp(b, "rowBelow", { row: host.querySelector("table").rows.length - 1, col: 0, edit: true })),
      add("sn-table-add-col", wt("tblColRight"), (b) => liveTableOp(b, "colRight", { row: 0, col: host.querySelector("table").rows[0].cells.length - 1, edit: true })));
  }
}
export function renderEditorProps() {
  const path = editor.path;
  const n = vault.notes.get(path);
  const host = $("#editor-props");
  const foot = $("#editor-foot");
  if (!n) return;
  const field = S.parentsField;
  if (host && !n.fmError) {
    host.replaceChildren();
    const props = h("div", { cls: "sn-props" + (editor.propsCollapsed ? " is-collapsed" : "") });
    const ph = h("div", { cls: "sn-props-head" }, ic("", "chevron-down"), h("span", { text: t("properties") }));
    ph.addEventListener("click", () => { editor.propsCollapsed = !editor.propsCollapsed; props.classList.toggle("is-collapsed", editor.propsCollapsed); });
    props.append(ph);
    const row = (iconName, key, ...val) => h("div", { cls: "sn-prop" }, h("div", { cls: "sn-prop-key" }, ic("", iconName), h("span", { text: key })), h("div", { cls: "sn-prop-val" }, ...val));
    // parents
    const pv = [];
    for (const p of graph.parentsOf(path).filter((x) => graph.has(x))) pv.push(parentChip(p, () => removeParent(path, p)));
    for (const u of graph.unresolvedParentsOf(path)) { const c = h("span", { cls: "sn-chip is-missing", title: t("parentMissing") }, ic("sn-chip-icon", "alert-triangle"), h("span", { text: u })); const x = ic("sn-chip-x", "x"); x.addEventListener("click", () => removeParent(path, u)); c.append(x); pv.push(c); }
    const addP = ic("sn-prop-add", "plus"); addP.title = t("menuAddParent"); addP.addEventListener("click", () => promptAddParent([path]));
    props.append(row("git-fork", field, ...pv, addP));
    // color
    const cur = cardColor(path);
    const dots = [null, ...COLORS].map((c) => { const d = h("button", { cls: "sn-color-dot" + (c ? "" : " is-none") + (c === cur ? " is-active" : ""), type: "button", title: colorLabel(c) }); if (c) d.dataset.color = c; d.addEventListener("click", () => setColor([path], c)); return d; });
    props.append(row("palette", "color", ...dots));
    // icon
    const icn = cardIcon(path);
    const ip = h("span", { cls: "sn-icon-pick" + (icn ? "" : " is-empty") }, ic("", icn || "circle-dashed", "circle-dashed"), h("span", { text: icn || t("noIcon") }));
    if (cur) ip.dataset.color = cur;
    ip.addEventListener("click", () => promptIcon([path]));
    props.append(row("smile", "icon", ip));
    // tags (frontmatter)
    const fmTags = Array.isArray(n.fm.tags) ? n.fm.tags.flat().map(String) : typeof n.fm.tags === "string" ? n.fm.tags.split(/[,\s]+/).filter(Boolean) : [];
    const tagVals = fmTags.map((tg) => {
      const c = h("span", { cls: "sn-tag" }, "#" + tg.replace(/^#/, ""));
      const x = ic("sn-chip-x", "x");
      x.addEventListener("click", () => txn(null, () => updateFM(path, (fm) => { const l = fmTags.filter((y) => y !== tg); if (l.length) fm.tags = l; else delete fm.tags; })));
      c.append(x);
      return c;
    });
    const tagIn = h("input", { cls: "sn-prop-input", type: "text", placeholder: t("addTag") });
    tagIn.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== ",") return;
      e.preventDefault();
      const v = tagIn.value.trim().replace(/^#/, "").replace(/\s+/g, "-");
      if (!v) return;
      txn(null, () => updateFM(path, (fm) => { fm.tags = [...new Set([...fmTags, v])]; })).then(() => $("#editor-props .sn-prop-input")?.focus());
    });
    props.append(row("tags", "tags", ...tagVals, tagIn));
    // template
    const tpl = templateFor(path);
    if (tpl) props.append(row("layout-template", "child_template", h("a", { cls: "sn-chip", href: "#", onClick: (e) => { e.preventDefault(); openEditor(tpl); } }, ic("sn-chip-icon", "layout-template"), h("span", { text: baseName(tpl) }))));
    // others
    const known = new Set([field, "color", "icon", "tags", "child_template"]);
    const others = Object.entries(n.fm).filter(([k]) => !known.has(k));
    for (const [k, v] of others) {
      const txt = typeof v === "object" && v !== null ? dumpYaml(v).trim() : String(v);
      props.append(row(k === "child_order" ? "list-ordered" : k === "order" ? "hash" : "text", k, h("span", { cls: "sn-prop-other", text: txt, title: t("otherProps") })));
    }
    host.append(props);
  }
  if (foot) {
    foot.replaceChildren();
    const kids = graph.has(path) ? graph.sortedChildren(path, makeComparator(board.sort)) : [];
    const back = graph.backlinksOf(path);
    const unlinked = unlinkedMentions(path);
    if (!kids.length && !back.length && !unlinked.length) return;
    const box = h("div", { cls: "sn-editor-foot" });
    if (kids.length) box.append(h("h4", { text: `${t("children")} · ${kids.length}` }), h("div", { cls: "sn-chips" }, kids.map((k) => { const c = parentChip(k); c.onclick = (e) => { e.preventDefault(); if (isMod(e)) setTarget(k); else openEditor(k); }; return c; })));
    if (back.length) box.append(h("h4", { text: `${t("linkedMentions")} · ${back.length}` }), h("div", { cls: "sn-chips" }, back.map((k) => { const c = parentChip(k); c.onclick = (e) => { e.preventDefault(); openEditor(k); }; return c; })));
    if (unlinked.length) {
      box.append(h("h4", { text: `${wt("unlinked")} · ${unlinked.length}` }));
      const list = h("div", { cls: "sn-unlinked" });
      for (const u of unlinked) {
        const c = parentChip(u); c.onclick = (e) => { e.preventDefault(); openEditor(u); };
        list.append(h("div", { cls: "sn-unlinked-row" }, c, h("button", { cls: "wb-btn mini", type: "button", onClick: () => linkMention(u, path) }, ic("", "link"), wt("linkIt"))));
      }
      box.append(list);
    }
    foot.append(box);
  }
}
export function editorKeys(e) {
  const ta = e.target;
  if (acKey(e)) return;
  if (orgEditorKey(e, ta)) return;
  const { selectionStart: s, selectionEnd: en, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  const replace = (from, to, text, caretFrom, caretTo) => {
    if (ta.cmView) ta.setRangeText(text, from, to, "end");
    else { ta.setSelectionRange(from, to); document.execCommand("insertText", false, text) || (ta.setRangeText(text, from, to, "end")); }
    if (caretFrom != null) ta.setSelectionRange(caretFrom, caretTo ?? caretFrom);
    ta.dispatchEvent(new Event("input"));
  };
  if (e.key === "Escape" && UI.focus) { e.preventDefault(); e.stopPropagation(); setFocusMode(false); return; }
  if (e.key === "Escape") {
    e.preventDefault(); e.stopPropagation(); saveEditor(); ta.blur();
    if (innerWidth <= 820 || editor.wide) closeEditor();
    else $(`#board .sn-card[data-path="${CSS.escape(editor.path)}"]`)?.focus();
    return;
  }
  if (isMod(e) && e.key.toLowerCase() === "s") { e.preventDefault(); saveEditor(); return; }
  if (editorTableKey(e, ta)) return;
  if (isMod(e) && e.key.toLowerCase() === "l") { e.preventDefault(); edLinkStart(ta); return; }
  if (isMod(e) && (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "i")) {
    e.preventDefault();
    const mark = e.key.toLowerCase() === "b" ? "**" : "*";
    const sel = value.slice(s, en);
    replace(s, en, mark + sel + mark, s + mark.length, en + mark.length);
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    const blockEnd = value.indexOf("\n", en - (en > s && value[en - 1] === "\n" ? 1 : 0));
    const end = blockEnd < 0 ? value.length : blockEnd;
    const lines = value.slice(lineStart, end).split("\n");
    const out = e.shiftKey ? lines.map((l) => l.replace(/^(\t| {1,4})/, "")) : lines.map((l) => "\t" + l);
    const text = out.join("\n");
    const delta = out[0].length - lines[0].length;
    replace(lineStart, end, text, Math.max(lineStart, s + delta), lineStart + text.length - (end - en));
    return;
  }
  if (e.key === "Enter" && !e.shiftKey && !isMod(e) && s === en && !e.isComposing) {
    const line = value.slice(lineStart, s);
    const m = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/.exec(line);
    if (!m) return;
    e.preventDefault();
    // an empty item ends the list; the text goes on after a blank line (a line right under the list would join its last item)
    if (line.trim() === m[0].trim()) { const after = lineStart > 0 && /^\s*([-*+]|\d+[.)])\s/.test(value.slice(value.lastIndexOf("\n", lineStart - 2) + 1, lineStart - 1)) ? "\n" : ""; replace(lineStart, s, after, lineStart + after.length); return; }
    let marker = m[2];
    if (/^\d+/.test(marker)) marker = parseInt(marker, 10) + 1 + marker.slice(-1);
    replace(s, s, "\n" + m[1] + marker + m[3] + (m[4] ? "[ ] " : ""));
  }
}
export async function toggleReading() {
  if (editor.dirty) await saveEditor();
  editor.mode = editor.mode === "read" ? "edit" : "read";
  renderEditor();
  if (editor.mode === "edit") $(".sn-editor-text")?.focus();
  else $("#editor .sn-reading")?.setAttribute("tabindex", "-1"), $("#editor .sn-reading")?.focus();
}
/** Insert into the editor through the browser so Ctrl+Z keeps working. */
export function edInsert(ta, from, to, text, selFrom, selTo) {
  ta.focus();
  if (ta.cmView) ta.cmView.dispatch({ changes: { from, to, insert: text }, selection: selFrom != null ? { anchor: selFrom, head: selTo ?? selFrom } : { anchor: from + text.length } });
  else {
    ta.setSelectionRange(from, to);
    if (!document.execCommand("insertText", false, text)) ta.setRangeText(text, from, to, "end");
    if (selFrom != null) ta.setSelectionRange(selFrom, selTo ?? selFrom);
  }
  ta.dispatchEvent(new Event("input"));
}
export function edLinkStart(ta) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  if (e > s) return edInsert(ta, s, e, `[[${value.slice(s, e)}]]`);
  edInsert(ta, s, s, "[[]]", s + 2);
  acUpdate(ta);
}
export function edWrap(ta, mark, close = mark) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e);
  if (sel.startsWith(mark) && sel.endsWith(close) && sel.length >= mark.length + close.length) return edInsert(ta, s, e, sel.slice(mark.length, sel.length - close.length), s, e - mark.length - close.length);
  edInsert(ta, s, e, mark + sel + close, s + mark.length, e + mark.length);
}
export function edLines(ta, fn) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const a = value.lastIndexOf("\n", s - 1) + 1;
  let b = value.indexOf("\n", e > s && value[e - 1] === "\n" ? e - 1 : e); if (b < 0) b = value.length;
  const lines = value.slice(a, b).split("\n");
  const out = fn(lines).join("\n");
  edInsert(ta, a, b, out, a + out.length, a + out.length);
}
const LIST_RE = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;
export function edPrefix(ta, prefix) {
  edLines(ta, (lines) => {
    const all = lines.every((l) => !l.trim() || l.replace(/^\s*/, "").startsWith(prefix.replace(/\d+/, "")) || (prefix === "1. " && /^\s*\d+[.)] /.test(l)));
    return lines.map((l, i) => {
      if (!l.trim() && lines.length > 1) return l;
      const ind = /^\s*/.exec(l)[0];
      const rest = l.slice(ind.length);
      if (all) return ind + rest.replace(prefix === "1. " ? /^\d+[.)] / : new RegExp("^" + prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "");
      const clean = prefix === "> " ? rest : rest.replace(LIST_RE, "");
      return ind + (prefix === "1. " ? `${i + 1}. ` : prefix) + clean;
    });
  });
}
export function edHeading(ta) {
  edLines(ta, (lines) => lines.map((l) => {
    const m = /^(#{1,6}) /.exec(l);
    const lvl = m ? m[1].length : 0;
    const body = m ? l.slice(m[0].length) : l;
    return lvl >= 3 ? body : "#".repeat(lvl + 1) + " " + body;
  }));
}
export function renderEdToolbar() {
  const bar = h("div", { cls: "sn-ed-toolbar", role: "toolbar", "aria-label": "Formatting" });
  const ta = () => $(".sn-editor-text");
  const group = () => { const g = h("div", { cls: "sn-tb-group" }); bar.append(g); return g; };
  const btn = (g, icon, title, fn, key) => {
    const x = h("button", { type: "button", cls: "sn-tb-btn", title: key ? `${title} (${key})` : title, "aria-label": title, dataset: { act: icon } });
    setIcon(x, icon);
    x.addEventListener("mousedown", (e) => e.preventDefault()); // keep the caret in the text
    x.addEventListener("click", (e) => { const el = ta() || (editor.mode === "edit" ? liveActivateEnd() : null); if (el) fn(el, e); });
    g.append(x);
    return x;
  };
  const sep = () => bar.append(h("span", { cls: "sn-tb-sep", "aria-hidden": "true" }));
  let g = group();
  btn(g, "heading", t("tbHeading"), (el, e) => {
    const lvl = edLineState(el).heading;
    const m = new Menu();
    for (const [n, icon, label] of [[1, "heading-1", wt("c_h1")], [2, "heading-2", wt("c_h2")], [3, "heading-3", wt("c_h3")], [0, "pilcrow", wt("c_text")]])
      m.add(label, icon, () => { el.focus(); edSetHeading(el, n); }, { checked: lvl === n });
    m.showBelow(e.currentTarget);
  });
  sep(); g = group();
  btn(g, "bold", t("tbBold").replace(/ \(.*\)$/, ""), (el) => edWrap(el, "**"), "Ctrl+B");
  btn(g, "italic", t("tbItalic").replace(/ \(.*\)$/, ""), (el) => edWrap(el, "*"), "Ctrl+I");
  btn(g, "strikethrough", t("tbStrike"), (el) => edWrap(el, "~~"));
  btn(g, "highlighter", "Highlight", (el) => edWrap(el, "=="));
  btn(g, "code", t("tbCode"), (el) => edWrap(el, "`"));
  sep(); g = group();
  btn(g, "link", t("tbLink").replace(/ \(.*\)$/, ""), (el) => edLinkStart(el), "[[ · Ctrl+L");
  btn(g, "image-plus", wt("c_image"), (el) => pickAndAttach(el));
  sep(); g = group();
  btn(g, "list", t("tbList"), (el) => edPrefix(el, "- "));
  btn(g, "list-ordered", t("tbNum"), (el) => edPrefix(el, "1. "));
  btn(g, "list-checks", t("tbTask"), (el) => edPrefix(el, "- [ ] "));
  btn(g, "text-quote", t("tbQuote"), (el) => edPrefix(el, "> "));
  btn(g, "table", wt("c_table"), (el, e) => {
    const at = editorTable(el);
    if (at) { tableMenu((op) => editorTableOp(el, op, at), at.row).showBelow(e.currentTarget); return; }
    const s0 = el.selectionStart, v = el.value, pre = s0 > 0 && v[s0 - 1] !== "\n" ? "\n\n" : "";
    const f = formatTable({ rows: [["", ""], ["", ""]], align: ["", ""] });
    edInsert(el, s0, el.selectionEnd, pre + f.text + "\n", s0 + pre.length + f.cell(0, 0)[0]);
  });
  sep(); g = group();
  orgToolbar(btn, g);
  sep(); g = group();
  btn(g, "square-code", t("tbBlock"), (el) => { const { selectionStart: s, selectionEnd: e, value } = el; const sel = value.slice(s, e); const pre = s > 0 && value[s - 1] !== "\n" ? "\n" : ""; edInsert(el, s, e, `${pre}\`\`\`\n${sel}\n\`\`\`\n`, s + pre.length + 4, s + pre.length + 4 + sel.length); });
  bar.append(h("span", { cls: "grow" }));
  const ins = h("button", { type: "button", cls: "sn-tb-insert", title: wt("slashHint") }, ic("sn-tb-insert-icon", "plus"), h("span", { cls: "sn-tb-insert-label", text: LANG === "ru" ? "Вставить" : "Insert" }), h("kbd", { text: "/" }));
  ins.addEventListener("mousedown", (e) => e.preventDefault());
  ins.addEventListener("click", () => {
    const el = ta() || (editor.mode === "edit" ? liveActivateEnd() : null); if (!el) return;
    el.focus();
    const s0 = el.selectionStart, v = el.value;
    const needSpace = s0 > 0 && !/\s/.test(v[s0 - 1]);
    edInsert(el, s0, el.selectionEnd, (needSpace ? " " : "") + "/");
    acUpdate(el);
  });
  bar.append(ins);
  return bar;
}
/** Formatting at the caret, for the toolbar's active states. */
export function edLineState(ta) {
  const v = ta.value, s = ta.selectionStart;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  let le = v.indexOf("\n", s); if (le < 0) le = v.length;
  const line = v.slice(ls, le), before = v.slice(ls, s);
  const hm = /^(#{1,6}) /.exec(line);
  const odd = (re) => ((before.match(re) || []).length % 2) === 1;
  const noBold = before.replace(/\*\*/g, "");
  return {
    heading: hm ? hm[1].length : 0,
    list: /^\s*[-*+] (?!\[[ xX]\] )/.test(line), num: /^\s*\d+[.)] /.test(line), task: /^\s*[-*+] \[[ xX]\] /.test(line), quote: /^\s*> /.test(line),
    bold: odd(/\*\*/g), italic: ((noBold.match(/\*/g) || []).length % 2) === 1,
    strikethrough: odd(/~~/g), highlighter: odd(/==/g), code: ((before.replace(/```/g, "").match(/`/g) || []).length % 2) === 1,
  };
}
export function updateEdToolbar() {
  const ta = $(".sn-editor-text"), bar = $("#editor .sn-ed-toolbar");
  if (!ta || !bar) return;
  const st = edLineState(ta);
  const map = { heading: st.heading > 0, bold: st.bold, italic: st.italic, strikethrough: st.strikethrough, highlighter: st.highlighter, code: st.code, list: st.list, "list-ordered": st.num, "list-checks": st.task, "text-quote": st.quote, "list-todo": orgLineIsEntry(ta) };
  for (const b of bar.querySelectorAll(".sn-tb-btn")) {
    const on = !!map[b.dataset.act];
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-pressed", String(on));
  }
  const hb = bar.querySelector('[data-act="heading"]');
  if (hb) setIcon(hb, st.heading ? `heading-${Math.min(st.heading, 6)}` : "heading");
}
