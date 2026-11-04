/* =========================================================
   App shell
   ========================================================= */
import { LANG, setLang, t } from "./i18n.js";
import { $, h, ic, iconBtn } from "./dom.js";
import { board, editor, graph, S, saveUI, setGraph, tree, UI, vault } from "./state.js";
import { buildGraph, loadVault, persistBoard, saveSettings } from "./vault.js";
import { undo } from "./save.js";
import { createCard, quickOpen, saveCurrentView, togglePin } from "./actions.js";
import { defaultEcho, echo, Menu, minibufPick, notice, openLayer, promptModal } from "./ui.js";
import { masonries } from "./masonry.js";
import { goBack, patchBoard, renderBoard, setTarget, toggleSearch } from "./board.js";
import { renderTree, renderTreeSoft, revealInTree } from "./tree.js";
import { closeEditor, openEditor, renderEditor, syncEditorFromDisk } from "./editor.js";
import { renderEditorProps } from "./tables.js";
import { pickVault, showWelcome } from "./welcome.js";
import { runSync, st, stopSync, sync, syncAvailable, syncButton, syncSettingsBody, syncSettingsModal } from "./sync.js";
import { openToday, outlineMenu, setFocusMode, wt } from "./completion.js";
import { ORG_DEFAULT_KW, orgCache, tt } from "./org.js";
import { ft, orgFoldNote } from "./org-editing.js";
import { openTasksView, orgCapture, renderTasksButton, tasksButton } from "./agenda.js";
import { filesButton, fvt, openFilesView } from "./files.js";
import { aboutBody, upd, ut } from "./updates.js";

export function applyTheme() {
  const dark = UI.theme === "dark" || (UI.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.body.classList.toggle("theme-dark", dark);
  document.body.classList.toggle("theme-light", !dark);
  document.body.classList.toggle("write-serif", UI.writeFont === "serif");
  document.body.classList.toggle("write-sans", UI.writeFont === "sans");
  document.body.classList.toggle("write-inter", UI.writeFont === "inter");
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
export function applyLanguage() {
  const pref = UI.lang !== "auto" ? UI.lang : S.language && S.language !== "auto" ? S.language : (navigator.language || "en").slice(0, 2);
  setLang(pref);
  document.documentElement.lang = LANG;
}
export function setSide(open) {
  UI.sideOpen = open;
  saveUI();
  $("#app").classList.toggle("side-closed", !open);
  for (const m of masonries) m.relayout(false);
}
export function showLoading(on) {
  $(".sn-loading")?.remove();
  if (on) document.body.append(h("div", { cls: "sn-loading" }, ic("sn-spin", "loader-2"), h("span", { text: t("indexing") })));
}
let refreshQueued = false;
export function refresh(o = {}) {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    setGraph(buildGraph());
    patchBoard();
    renderTreeSoft();
    renderTasksButton();
    if (editor.path) {
      if (!vault.notes.has(editor.path)) renderEditor();
      else if (!o.keepEditor && !editor.dirty) syncEditorFromDisk();
      else renderEditorProps();
    }
  });
}
function commandList() {
  const c = [];
  const add = (title, icon, run, key) => c.push({ title, icon, note: key || "", run });
  add(t("openShort") + "…", "search", quickOpen, "C-o");
  add(wt("todayHint"), "calendar-days", openToday, "C-S-d");
  add(tt("tasksHint"), "calendar-check", () => openTasksView(true, "agenda"), "C-S-k");
  add(`${tt("tasks")}: ${tt("vTodo")}`, "list-todo", () => openTasksView(true, "todo"));
  add(`${tt("tasks")}: ${tt("vMatch")}`, "tags", () => openTasksView(true, "match"));
  add(`${tt("tasks")}: ${tt("vSearch")}`, "search", () => openTasksView(true, "search"));
  add(tt("capTitle") + "…", "plus-circle", () => orgCapture());
  add(fvt("files"), "paperclip", () => openFilesView(), "C-S-e");
  if (editor.path) { add(ft("foldAll"), "chevrons-down-up", () => orgFoldNote(true)); add(ft("unfoldAll"), "chevrons-up-down", () => orgFoldNote(false)); }
  add(UI.focus ? wt("focusExit") : wt("focus"), "focus", () => setFocusMode(!UI.focus), "C-S-f");
  if (editor.path) add(wt("outline"), "table-of-contents", () => outlineMenu($("#editor .sn-editor-head") || document.body));
  add(t("newCard"), "plus", async () => { const title = await promptModal(t("newCard")); if (title) createCard(title, board.target, "", undefined, { open: true }); });
  if (board.target) add(t("cmdEditTarget"), "pencil", () => openEditor(board.target, { focus: true }));
  if (board.target) add(t("toParent"), "arrow-up", () => { const ps = graph.parentsOf(board.target).filter((p) => graph.has(p)); setTarget(ps[0] ?? null); }, "M-↑");
  add(t("back"), "arrow-left", goBack, "M-←");
  add(t("allCards"), "home", () => setTarget(null));
  add(t("searchAndFilters").replace(/ \(.*\)$/, ""), "search", () => toggleSearch(true), "C-f");
  for (const d of [1, 2, 3, 0]) add(t("cmdDepth", { d: d || "∞" }), "list-tree", () => { board.depth = d; persistBoard(); renderBoard(); });
  add(t("cmdLayout", { l: t("layoutColumns") }), "layout-grid", () => { board.layout = "columns"; persistBoard(); renderBoard(); });
  add(t("cmdLayout", { l: t("layoutList") }), "rows-3", () => { board.layout = "list"; persistBoard(); renderBoard(); });
  for (const [v, k] of [["manual", "sortManual"], ["name", "sortName"], ["modified", "sortModified"], ["created", "sortCreated"]]) add(t("cmdSort", { s: t(k) }), "arrow-up-down", () => { board.sort = v; persistBoard(); renderBoard(); });
  add(t("groupByParent"), "group", () => { board.grouped = !board.grouped; persistBoard(); renderBoard(); });
  add(board.selectMode ? t("selectModeOff") : t("selectMode"), "check-square", () => { board.selectMode = !board.selectMode; if (!board.selectMode) board.selection.clear(); renderBoard(); });
  add(t("saveView"), "bookmark-plus", saveCurrentView);
  if (board.target) add(S.pinned.includes(board.target) ? t("unpin") : t("pin"), "pin", () => togglePin(board.target));
  add(t("revealCurrent"), "crosshair", () => revealInTree(board.target));
  add(t("collapseAll"), "chevrons-down-up", () => { tree.expanded.clear(); persistBoard(); renderTree(); });
  add(t("toggleSidebar"), "panel-left", () => setSide($("#app").classList.contains("side-closed")), "C-\\");
  add(t("toggleTheme"), "sun-moon", () => { const dark = document.body.classList.contains("theme-dark"); UI.theme = dark ? "light" : "dark"; saveUI(); applyTheme(); });
  add(t("undo"), "undo-2", undo, "C-z");
  if (vault.fs.kind === "disk") add(t("reload"), "refresh-cw", async () => { await loadVault(vault.fs); notice(t("vaultReloaded")); });
  add(t("openOther"), "folder-open", pickVault);
  add(t("settings"), "settings", settingsModal);
  add(t("hotkeys"), "keyboard", hotkeysModal, "?");
  if (syncAvailable()) {
    add("Git: " + st("cmdNow"), "git-branch", () => runSync());
    add("Git: " + st("cmdSettings"), "settings-2", syncSettingsModal);
  }
  return c;
}
export async function commandPalette() {
  const pick = await minibufPick({ placeholder: t("cmdPalette"), items: commandList() });
  if (pick) pick.run();
}
export function wbBtn(iconName, label, onClick, cls = "", kbd = null) {
  const b = h("button", { cls: "wb-btn " + cls, type: "button", title: label }, iconName ? ic("", iconName) : null, h("span", { cls: "wb-label", text: label }), kbd ? h("kbd", { text: kbd }) : null);
  if (onClick) b.addEventListener("click", onClick);
  return b;
}
/* The bar's width depends on the language, the vault name and the sync status, so it is measured, not guessed from the window width */
export const TOP_FIT_STEPS = [1, 2, 3];
function fitTopBar(top) {
  for (const i of TOP_FIT_STEPS) top.classList.remove(`fit-${i}`);
  for (const i of TOP_FIT_STEPS) { if (top.scrollWidth <= top.clientWidth) break; top.classList.add(`fit-${i}`); }
}
let topBarWatch = null;
function watchTopBar(top) {
  topBarWatch?.();
  const fit = () => fitTopBar(top);
  const resize = new ResizeObserver(fit), changes = new MutationObserver(fit);
  resize.observe(top);
  changes.observe(top, { childList: true, subtree: true, characterData: true });
  document.fonts?.ready.then(() => { if (top.isConnected) fit(); });
  topBarWatch = () => { resize.disconnect(); changes.disconnect(); };
}
export function renderAll() {
  applyLanguage();
  const app = $("#app");
  app.replaceChildren();
  app.classList.toggle("side-closed", !UI.sideOpen || innerWidth <= 820);
  app.classList.toggle("focus-mode", !!UI.focus);
  document.documentElement.style.setProperty("--side-w", UI.sideW + "px");
  document.documentElement.style.setProperty("--editor-w", UI.editorW + "px");
  const vaultMenu = (e) => {
    const m = new Menu();
    if (vault.fs.kind === "disk") m.add(t("reload"), "refresh-cw", async () => { await loadVault(vault.fs); notice(t("vaultReloaded")); });
    m.add(t("openOther"), "folder-open", () => pickVault());
    m.add(t("closeVault"), "log-out", async () => { closeEditor(); await stopSync(); vault.fs = null; showWelcome(); });
    m.showBelow(e.currentTarget);
  };
  const newCard = async () => { const title = await promptModal(t("newCard")); if (title) createCard(title, board.target, "", undefined, { open: true }); };
  const top = h("div", { cls: "wb-top" },
    iconBtn("panel-left", t("toggleSidebar"), () => setSide($("#app").classList.contains("side-closed")), "wb-icon"),
    h("div", { cls: "wb-spacer" }),
    syncButton(),
    tasksButton(),
    filesButton(),
    iconBtn("sun-moon", t("toggleTheme"), () => { const dark = document.body.classList.contains("theme-dark"); UI.theme = dark ? "light" : "dark"; saveUI(); applyTheme(); }, "wb-icon wb-theme"),
    iconBtn("settings", t("settings"), () => settingsModal(), "wb-icon"));
  // search, the new-card button and the vault live in the sidebar
  const search = h("button", { cls: "sb-search", type: "button", title: t("openShort") + " · Ctrl+O" }, ic("", "search"), h("span", { text: t("searchShort") }));
  search.addEventListener("click", () => quickOpen());
  const sideHead = h("div", { cls: "sb-head" }, search,
    h("div", { cls: "sb-actions" },
      wbBtn("plus", t("newShort"), newCard, "sb-new"),
      iconBtn("calendar-days", wt("today"), () => openToday(), "sb-round"),
      iconBtn("terminal", t("commands") + " · Ctrl+P", () => commandPalette(), "sb-round")));
  const account = h("button", { cls: "sb-account", type: "button", title: vault.fs.name },
    h("span", { cls: "sb-avatar", text: (vault.fs.name || "S").trim().charAt(0).toUpperCase() }), h("span", { cls: "sb-account-name", text: vault.fs.name }), ic("wb-caret", "chevron-down"));
  account.addEventListener("click", vaultMenu);
  const side = h("div", { cls: "sn-side" }, sideHead, h("div", { cls: "sn-outline", id: "tree" }), h("div", { cls: "sb-foot" }, account));
  const sideRes = h("div", { cls: "sn-resizer is-side" });
  makeResizer(sideRes, (dx, start) => { UI.sideW = Math.max(180, Math.min(520, start + dx)); document.documentElement.style.setProperty("--side-w", UI.sideW + "px"); }, () => UI.sideW);
  const main = h("div", { cls: "sn-main win" }, h("div", { cls: "sn-board-host" }, h("div", { id: "board", cls: "sn-board", tabindex: "0" })));
  const edRes = h("div", { cls: "sn-resizer is-editor" });
  makeResizer(edRes, (dx, start) => { UI.editorW = Math.max(340, Math.min(innerWidth - 440 - (document.getElementById("app").classList.contains("side-closed") ? 0 : UI.sideW), start - dx)); document.documentElement.style.setProperty("--editor-w", UI.editorW + "px"); }, () => UI.editorW);
  const ed = h("div", { cls: "sn-editor win", id: "editor" });
  const scrim = h("div", { cls: "sn-side-scrim", onClick: () => setSide(false) });
  const frame = h("div", { cls: "wb-frame" }, side, scrim, sideRes, main, edRes, ed);
  app.append(top, frame, h("div", { cls: "minibuf", id: "minibuf" }));
  watchTopBar(top);
  echo(defaultEcho(), { keep: true });
  renderTree();
  renderBoard(true);
}
function makeResizer(el, onMove, getStart) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const x0 = e.clientX, start = getStart();
    el.classList.add("is-dragging");
    el.setPointerCapture(e.pointerId);
    const move = (ev) => { onMove(ev.clientX - x0, start); for (const m of masonries) m.relayout(false); };
    const up = () => { el.classList.remove("is-dragging"); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); saveUI(); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
}
/** Settings, one tab per group. `tab` picks the tab (the last one used otherwise); with the dialog open it just switches to it. */
let settingsOpen = null;
export function settingsModal(tab) {
  if (settingsOpen) { settingsOpen(tab); return; }
  const panel = h("div", { cls: "modal mod-settings" });
  const leaveTab = () => { sync.panel = null; upd.view = null; };
  const close = openLayer(panel, () => { leaveTab(); settingsOpen = null; renderAll(); if (editor.path) openEditor(editor.path, { keepCaret: true }); });
  const item = (name, desc, control) => h("div", { cls: "setting-item" }, h("div", { cls: "setting-item-info" }, h("div", { cls: "setting-item-name", text: name }), desc ? h("div", { cls: "setting-item-description", text: desc }) : null), h("div", { cls: "setting-item-control" }, control));
  const select = (value, options, onChange) => { const s = h("select", {}, options.map(([v, l]) => h("option", { value: v, text: l, selected: String(v) === String(value) }))); s.addEventListener("change", () => onChange(s.value)); return s; };
  const text = (value, ph, onChange, type = "text") => { const i = h("input", { type, value: String(value ?? ""), placeholder: ph || "" }); i.addEventListener("change", () => onChange(i.value)); return i; };
  const toggle = (value, onChange) => { const c = h("div", { cls: "checkbox-container" + (value ? " is-enabled" : "") }); c.addEventListener("click", () => { c.classList.toggle("is-enabled"); onChange(c.classList.contains("is-enabled")); }); return c; };
  const save = () => { saveSettings(); setGraph(buildGraph()); };
  const storedIn = () => h("p", { cls: "modal-text sn-set-note", text: vault.fs.kind === "disk" && (vault.pluginData || vault.hasObsidian) ? t("settingsShared") : t("settingsLocal") });
  const tabs = [
    ["appearance", t("sectionAppearance"), "palette", () => [
      item(t("setLanguage"), null, select(UI.lang, [["auto", "Auto"], ["en", "English"], ["ru", "Русский"]], (v) => { UI.lang = v; saveUI(); applyLanguage(); close(); settingsModal("appearance"); })),
      item(t("setTheme"), null, select(UI.theme, [["auto", t("themeAuto")], ["light", t("themeLight")], ["dark", t("themeDark")]], (v) => { UI.theme = v; saveUI(); applyTheme(); })),
      item(wt("setWriteFont"), wt("setWriteFontDesc"), select(UI.writeFont || "mono", [["mono", wt("wfMono")], ["serif", wt("wfSerif")], ["sans", wt("wfSans")], ["inter", wt("wfInter")]], (v) => { UI.writeFont = v; saveUI(); applyTheme(); })),
    ]],
    ["cards", t("sectionCards"), "layers", () => [
      item(t("setParentsField"), t("setParentsFieldDesc"), text(S.parentsField, "parents", (v) => { S.parentsField = v.trim() || "parents"; save(); })),
      item(t("setCardsFolder"), t("setCardsFolderDesc"), text(S.cardsFolder, "Cards", (v) => { S.cardsFolder = v.trim().replace(/\/+$/, ""); save(); })),
      item(t("setOnlyFolder"), t("setOnlyFolderDesc"), toggle(S.onlyCardsFolder, (v) => { S.onlyCardsFolder = v; save(); })),
      item(t("setTemplatesFolder"), t("setTemplatesFolderDesc"), text(S.templatesFolder, "Templates", (v) => { S.templatesFolder = v.trim().replace(/\/+$/, ""); save(); })),
      storedIn(),
    ]],
    ["board", t("sectionBoard"), "layout-grid", () => [
      item(t("setDefaultDepth"), null, select(S.defaultDepth, [[1, "1"], [2, "2"], [3, "3"], [0, "∞"]], (v) => { S.defaultDepth = Number(v); save(); })),
      item(t("setDefaultLayout"), null, select(S.defaultLayout, [["columns", t("layoutColumns")], ["list", t("layoutList")]], (v) => { S.defaultLayout = v; save(); })),
      item(t("setDefaultSort"), null, select(S.defaultSort, [["manual", t("sortManual")], ["name", t("sortName")], ["modified", t("sortModified")], ["created", t("sortCreated")]], (v) => { S.defaultSort = v; save(); })),
      item(t("setPreview"), t("setPreviewDesc"), text(S.previewLength, "600", (v) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) { S.previewLength = Math.floor(n); save(); } }, "number")),
      item(t("setCardHeight"), t("setCardHeightDesc"), text(S.cardMaxHeight, "360", (v) => { const n = Number(v); if (Number.isFinite(n) && n >= 0) { S.cardMaxHeight = Math.floor(n); save(); } }, "number")),
      item(t("setMaxCards"), null, text(S.maxCards, "1000", (v) => { const n = Number(v); if (Number.isFinite(n) && n > 0) { S.maxCards = Math.floor(n); save(); } }, "number")),
      storedIn(),
    ]],
    ["agenda", tt("sectionAgenda"), "calendar-check", () => [
      item(tt("setKeywords"), tt("setKeywordsDesc"), text(UI.todoKeywords || ORG_DEFAULT_KW, ORG_DEFAULT_KW, (v) => { UI.todoKeywords = v.trim() || ORG_DEFAULT_KW; saveUI(); orgCache.clear(); })),
    ]],
    syncAvailable() && ["sync", "Git", "git-branch", () => syncSettingsBody(item, toggle)],
    ["about", ut("about"), "info", () => aboutBody(item, toggle)],
  ].filter(Boolean);
  const bar = h("div", { cls: "sn-set-tabs", role: "tablist" });
  const body = h("div", { cls: "sn-set-body", role: "tabpanel" });
  const buttons = new Map();
  const show = (id) => {
    const tb = tabs.find((x) => x[0] === id) || tabs[0];
    leaveTab();
    body.replaceChildren(...tb[3]().flat());
    body.scrollTop = 0;
    for (const [k, b] of buttons) { b.classList.toggle("is-active", k === tb[0]); b.setAttribute("aria-selected", String(k === tb[0])); b.tabIndex = k === tb[0] ? 0 : -1; }
    buttons.get(tb[0]).scrollIntoView?.({ block: "nearest", inline: "nearest" });
    if (UI.settingsTab !== tb[0]) { UI.settingsTab = tb[0]; saveUI(); }
  };
  for (const [id, label, icon] of tabs) {
    const b = h("button", { cls: "sn-set-tab", type: "button", role: "tab", onClick: () => show(id) }, ic("sn-set-tab-icon", icon), h("span", { text: label }));
    buttons.set(id, b);
    bar.append(b);
  }
  // arrow keys move between tabs, as in other tab lists
  bar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.findIndex((x) => x[0] === UI.settingsTab), n = tabs.length;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : n - 1)) % n][0];
    show(next);
    buttons.get(next).focus();
  });
  panel.append(iconBtn("x", t("close"), () => close(), "modal-close"), h("div", { cls: "modal-title", text: t("settings") }), bar, body);
  settingsOpen = (id) => show(id || UI.settingsTab);
  show(tab || UI.settingsTab);
}
export function hotkeysModal() {
  const panel = h("div", { cls: "modal" });
  const close = openLayer(panel);
  const kb = (...keys) => h("span", {}, keys.map((k, i) => [i ? " " : "", h("kbd", { cls: "sn-k", text: k })]));
  const rows = [[kb("Ctrl", "P"), t("k_palette")], [kb("Alt", "X"), t("k_palette")], [kb("click"), t("k_click")], [kb("dbl-click"), t("k_dbl")],
    [kb("←", "↑", "→", "↓"), t("k_arrows")], [kb("Enter"), t("k_enter")], [kb("Alt", "↑"), t("k_parent")], [kb("Alt", "←"), t("k_back")], [kb("Shift", "Enter"), t("k_shiftEnter")], [kb("Ctrl", "Enter"), t("k_modEnter")],
    [kb("Space"), t("k_space")], [kb("Shift", "click"), t("k_shiftClick")], [kb("Delete"), t("k_delete")], [kb("a…z"), t("k_type")], [kb("Ctrl", "F"), t("k_find")],
    [kb("Ctrl", "A"), t("k_selectAll")], [kb("Ctrl", "Z"), t("k_undo")], [kb("Ctrl", "O"), t("k_open")], [kb("Esc"), t("k_esc")], [kb("Ctrl", "Alt"), t("k_drag")],
    [kb("[["), t("k_link")], [kb("Ctrl", "L"), t("k_link")], [kb("Ctrl", "E"), t("k_reading")],
    [kb("/"), wt("slashHint")], [kb("#"), wt("tagsSection")], [kb("Ctrl", "Shift", "D"), wt("todayHint")], [kb("Ctrl", "Shift", "F"), wt("focus")],
    [kb("Ctrl", "Shift", "K"), tt("tasksHint")], [kb("Ctrl", "Shift", "E"), fvt("filesHint")], [kb("Ctrl", "Enter"), LANG === "ru" ? "TODO: следующее состояние / отметить чекбокс (в редакторе)" : "Next TODO state / tick a checkbox (in the editor)"],
    [kb("C-c", "…"), tt("keysEditor")], [kb(LANG === "ru" ? "агенда" : "agenda"), tt("keysAgenda")]];
  panel.append(iconBtn("x", t("close"), () => close(), "modal-close"), h("div", { cls: "modal-title", text: t("hotkeys") }),
    h("table", { cls: "sn-kbd-table" }, rows.map(([k, d]) => h("tr", {}, h("td", {}, k), h("td", { text: d })))));
}

