/* =========================================================
   Card rendering (port of src/views/CardRenderer.ts)
   ========================================================= */
import { LANG, t, tt } from "../core/i18n.js";
import { baseName, norm } from "../core/util.js";
import { openExternal } from "../services/native.js";
import { board, editor, graph, S, vault } from "../services/state.js";
import { cardColor, cardIcon, linkText } from "../services/vault.js";
import { cardTaskProgress } from "../services/tasks.js";
import { $, h, ic, iconBtn, isMod } from "./dom.js";
import { echo, Menu, notice, promptModal } from "./ui.js";
import { renderMarkdown, wireRendered } from "./markdown.js";
import { createCard, deleteCards, obsidianUri, promptAddParent, promptIcon, promptMove, promptRemoveParent, promptTemplate, removeParent, setChildTemplate, templateFor, togglePin } from "./actions.js";
import { openTagView, setLastFocused, setTarget, toggleSelect } from "./board.js";
import { dnd } from "./dnd.js";
import { openEditor } from "./editor.js";

export function cardBodyText(path) { return (vault.notes.get(path)?.body || "").replace(/^\s+/, ""); }
export function formatDate(ms) {
  const diff = Date.now() - ms;
  const rtf = new Intl.RelativeTimeFormat(LANG, { numeric: "auto" });
  if (diff < 60_000) return rtf.format(0, "second");
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), "minute");
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), "hour");
  return new Date(ms).toLocaleDateString(LANG, { day: "numeric", month: "short", year: "numeric" });
}
export function parentChip(parentPath, onRemove) {
  const chip = h("a", { cls: "sn-chip", href: "#", title: parentPath });
  const c = cardColor(parentPath);
  if (c) chip.dataset.color = c;
  chip.append(ic("sn-chip-icon", cardIcon(parentPath) || "layers", "layers"), h("span", { text: baseName(parentPath) }));
  chip.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (isMod(e)) openEditor(parentPath); else setTarget(parentPath); });
  if (onRemove) {
    const x = ic("sn-chip-x", "x");
    x.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onRemove(); });
    chip.append(x);
  }
  return chip;
}
export function renderBody(el, path, limit) {
  let text = cardBodyText(path);
  if (!text.trim()) { el.classList.add("is-empty"); return; }
  let truncated = false;
  if (limit > 0 && text.length > limit) {
    const cut = text.lastIndexOf("\n", limit);
    text = text.slice(0, cut > limit * 0.5 ? cut : limit).trimEnd();
    truncated = true;
  }
  renderMarkdown(text, path, { into: el });
  if (truncated) el.classList.add("is-truncated");
  if (board.filter.query.trim()) highlight(el, norm(board.filter.query).split(/\s+/).filter(Boolean));
}
function highlight(root, tokens) {
  if (!tokens.length) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const txt = node.nodeValue, low = norm(txt);
    const ranges = [];
    for (const w of tokens) { let i = low.indexOf(w); while (i >= 0) { ranges.push([i, i + w.length]); i = low.indexOf(w, i + w.length); } }
    if (!ranges.length) continue;
    ranges.sort((a, b) => a[0] - b[0]);
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const [a, b] of ranges) { if (a < pos) continue; frag.append(txt.slice(pos, a), h("mark", { cls: "sn-mark", text: txt.slice(a, b) })); pos = b; }
    frag.append(txt.slice(pos));
    node.replaceWith(frag);
  }
}
export function renderCard(path, via, depth = 1) {
  const card = h("div", { cls: "sn-card", tabindex: "-1" });
  card.dataset.path = path;
  card.dataset.via = via ?? "";
  card.dataset.lv = String(((depth || 1) - 1) % 8 + 1);
  card.dataset.depth = String(depth || 1);
  const color = cardColor(path);
  if (color) card.dataset.color = color;
  if (board.selection.has(path)) card.classList.add("is-picked");
  if (editor.path === path) card.classList.add("is-editing");

  const head = h("div", { cls: "sn-card-head" });
  const iconName = cardIcon(path);
  if (iconName) head.append(ic("sn-card-icon", iconName, "file-text"));
  const title = h("a", { cls: "sn-card-title", href: "#", text: baseName(path) });
  title.addEventListener("click", (e) => {
    e.preventDefault();
    if (e.shiftKey || board.selectMode) return;
    e.stopPropagation();
    if (isMod(e)) openEditor(path); else setTarget(path);
  });
  head.append(title);
  const kids = graph.childrenOf(path).length;
  if (kids) head.append(h("button", { cls: "sn-kids", type: "button", text: String(kids), title: t("childCards", { n: kids }), onClick: (e) => { e.stopPropagation(); setTarget(path); } }));
  const add = iconBtn("plus", t("addChild"), async (e) => { e.stopPropagation(); const title = await promptModal(t("addChild") + " → " + baseName(path)); if (title) createCard(title, path); }, "sn-card-edit sn-card-add");
  const edit = iconBtn("pencil", t("edit"), (e) => { e.stopPropagation(); openEditor(path, { wide: isMod(e), focus: true }); }, "sn-card-edit");
  head.append(add, edit);
  card.append(head);

  const parents = graph.parentsOf(path).filter((p) => graph.has(p));
  if (via && parents.includes(via)) { parents.splice(parents.indexOf(via), 1); parents.unshift(via); }
  const unresolved = graph.unresolvedParentsOf(path);
  if (parents.length || unresolved.length) {
    const chips = h("div", { cls: "sn-chips" });
    for (const p of parents) chips.append(parentChip(p));
    for (const u of unresolved) chips.append(h("span", { cls: "sn-chip is-missing", title: t("parentMissing") }, ic("sn-chip-icon", "alert-triangle"), h("span", { text: u })));
    card.append(chips);
  }

  const body = h("div", { cls: "sn-card-body markdown-rendered" });
  wireRendered(body, path);
  const expanded = board.expanded.has(path);
  renderBody(body, path, expanded ? 0 : S.previewLength);
  card.append(body);

  const tags = vault.notes.get(path)?.tags || [];
  if (tags.length) {
    const row = h("div", { cls: "sn-tags" });
    for (const tg of tags) row.append(h("span", { cls: "sn-tag", text: tg, onClick: (e) => { e.stopPropagation(); openTagView(tg); } }));
    card.append(row);
  }

  const foot = h("div", { cls: "sn-card-foot" });
  const mtime = vault.notes.get(path)?.mtime || 0;
  const prog = cardTaskProgress(path);
  foot.append(h("div", { cls: "sn-foot-meta" }, h("span", { text: formatDate(mtime), title: t("modifiedAt", { date: new Date(mtime).toLocaleString(LANG) }) }),
    prog ? h("span", { cls: "sn-task-prog" + (prog.done === prog.n ? " is-complete" : ""), title: tt("progress", prog) }, ic("", "square-check"), h("span", { text: `${prog.done}/${prog.n}` })) : null));
  const actions = h("div", { cls: "sn-foot-actions" });
  const backlinks = graph.backlinksOf(path);
  if (backlinks.length) {
    const b = h("button", { cls: "clickable-icon sn-count", type: "button", title: t("backlinks", { names: backlinks.map(baseName).join(", ") }) }, ic("", "quote"), h("span", { text: String(backlinks.length) }));
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = new Menu();
      for (const p of backlinks) m.add(baseName(p), cardIcon(p) || "file-text", (ev) => (isMod(ev) ? openEditor(p) : setTarget(p)));
      m.showAtEvent(e);
    });
    actions.append(b);
  }
  actions.append(iconBtn("more-horizontal", t("more"), (e) => { e.stopPropagation(); cardMenu(path, via).showAtEvent(e); }));
  foot.append(actions);
  card.append(foot);

  card.addEventListener("contextmenu", (e) => cardMenu(path, via).showAtEvent(e));
  card.addEventListener("click", (e) => {
    if (e.target.closest("a, button, input, .sn-card-more-btn")) { if (!(e.shiftKey || board.selectMode)) return; }
    if (e.shiftKey || board.selectMode) { e.preventDefault(); toggleSelect(path); return; }
    if (getSelection()?.toString()) return;
    card.focus({ preventScroll: true });
    if (editor.path && editor.path !== path) openEditor(path, { focus: false });
  });
  card.addEventListener("dblclick", (e) => {
    if (e.target.closest("a, button, input") || e.shiftKey || board.selectMode) return;
    e.preventDefault();
    openEditor(path, { focus: true });
  });
  card.addEventListener("focus", () => { setLastFocused(path); echo(t("cardHint", { name: baseName(path) }), { hint: true }); });
  attachLongPress(card, (ev) => cardMenu(path, via).showAtEvent(ev));
  dnd.draggable(card, () => ({ child: path, from: via }));
  dnd.dropTarget(card, () => ({ path, parent: via }));
  return card;
}
export function setupClamp(card) {
  const body = $(".sn-card-body", card);
  const path = card.dataset.path;
  const max = S.cardMaxHeight;
  if (!body || body.classList.contains("is-empty")) return;
  const cutByLength = () => body.classList.contains("is-truncated");
  if (max <= 0 && !cutByLength()) return;
  let expanded = board.expanded.has(path);
  const btn = h("button", { cls: "sn-card-more-btn", type: "button" });
  body.after(btn);
  if (max > 0) body.style.setProperty("--sn-card-max-h", `${max}px`);
  const update = () => {
    body.classList.toggle("is-clamped", !expanded && max > 0);
    const overflow = max > 0 && body.scrollHeight > max + 8;
    const need = expanded || overflow || cutByLength();
    btn.style.display = need ? "" : "none";
    body.classList.toggle("is-faded", !expanded && (overflow || cutByLength()));
    btn.textContent = expanded ? t("showLess") : t("showMore");
  };
  btn.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    expanded = !expanded;
    if (expanded) board.expanded.add(path); else board.expanded.delete(path);
    if (expanded && cutByLength()) { body.classList.remove("is-truncated"); renderBody(body, path, 0); }
    update();
    if (!expanded) card.scrollIntoView({ block: "nearest" });
  });
  update();
  body.addEventListener("load", update, true);
}
export function attachLongPress(el, open) {
  let timer = null, start = null;
  const cancel = () => { clearTimeout(timer); timer = null; start = null; };
  el.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return cancel();
    const tc = e.touches[0];
    start = { x: tc.clientX, y: tc.clientY };
    timer = setTimeout(() => { if (start) open(new MouseEvent("contextmenu", { clientX: start.x, clientY: start.y })); timer = null; }, 550);
  }, { passive: true });
  el.addEventListener("touchmove", (e) => { const tc = e.touches[0]; if (start && tc && Math.hypot(tc.clientX - start.x, tc.clientY - start.y) > 10) cancel(); }, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchcancel", cancel);
}
export function cardMenu(path, via = null) {
  const m = new Menu();
  m.add(t("menuOpenOnBoard"), "layout-dashboard", () => setTarget(path));
  m.add(t("menuEdit"), "pencil", () => openEditor(path));
  m.add(t("menuEditWide"), "maximize-2", () => openEditor(path, { wide: true }));
  if (vault.fs.kind === "disk") m.add(t("menuOpenObsidian"), "external-link", () => openExternal(obsidianUri(path)));
  m.sep();
  m.add(t("menuNewChild"), "plus", async () => { const title = await promptModal(t("menuNewChild")); if (title) createCard(title, path); });
  const tpl = templateFor(path);
  m.add(tpl ? t("menuChangeTemplate", { name: baseName(tpl) }) : t("menuSetTemplate"), "layout-template", () => promptTemplate(path));
  if (tpl) m.add(t("menuRemoveTemplate"), "x", () => setChildTemplate(path, null));
  m.add(t("menuAddParent"), "git-merge", () => promptAddParent([path]));
  m.add(t("menuMoveTo"), "folder-input", () => promptMove([{ child: path, from: via ?? graph.parentsOf(path)[0] ?? null }]));
  if (via && graph.parentsOf(path).includes(via)) m.add(t("menuRemoveFrom", { name: baseName(via) }), "unlink", () => removeParent(path, via));
  else if (graph.parentsOf(path).length || graph.unresolvedParentsOf(path).length) m.add(t("menuRemoveParent"), "unlink", () => promptRemoveParent(path));
  m.add(t("menuIcon"), "smile", () => promptIcon([path]));
  m.sep();
  m.add(S.pinned.includes(path) ? t("unpin") : t("pin"), S.pinned.includes(path) ? "pin-off" : "pin", () => togglePin(path));
  m.add(t("menuCopyLink"), "link", () => { navigator.clipboard?.writeText(`[[${linkText(path)}]]`); notice(t("linkCopied")); });
  m.sep();
  m.add(t("menuDelete"), "trash-2", () => deleteCards([path]), { warning: true });
  return m;
}

