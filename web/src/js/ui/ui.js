/* =========================================================
   UI: menus, modals, notices
   ========================================================= */
import { t } from "../core/i18n.js";
import { colorLabel, COLORS, norm } from "../core/util.js";
import { vault } from "../services/state.js";
import { undo } from "../services/save.js";
import { $, $$, allIconNames, h, ic } from "./dom.js";

export let openMenuEl = null;
export function closeMenu() { openMenuEl?.remove(); openMenuEl = null; }
export class Menu {
  constructor() { this.items = []; }
  add(title, iconName, onClick, o = {}) { this.items.push({ title, icon: iconName, onClick, ...o }); return this; }
  sep() { if (this.items.length && this.items[this.items.length - 1] !== "sep") this.items.push("sep"); return this; }
  label(text) { this.items.push({ label: text }); return this; }
  colors(current, onPick) { this.items.push({ colors: true, current, onPick }); return this; }
  showAt(x, y) {
    closeMenu();
    const m = h("div", { cls: "menu", role: "menu" });
    const items = this.items.filter((it, i, a) => !(it === "sep" && (i === 0 || i === a.length - 1)));
    for (const it of items) {
      if (it === "sep") { m.append(h("div", { cls: "menu-separator" })); continue; }
      if (it.label) { m.append(h("div", { cls: "menu-label", text: it.label })); continue; }
      if (it.colors) {
        const row = h("div", { cls: "menu-colors" });
        for (const c of [null, ...COLORS]) {
          const d = h("button", { cls: "sn-color-dot" + (c ? "" : " is-none") + (c === it.current ? " is-active" : ""), title: colorLabel(c), "aria-label": colorLabel(c), type: "button" });
          if (c) d.dataset.color = c;
          d.addEventListener("click", () => { closeMenu(); it.onPick(c); });
          row.append(d);
        }
        m.append(row);
        continue;
      }
      const row = h("div", { cls: "menu-item" + (it.warning ? " is-warning" : "") + (it.disabled ? " is-disabled" : ""), role: "menuitem" },
        it.icon ? ic("menu-item-icon", it.icon) : h("span", { cls: "menu-item-icon" }), h("span", { cls: "menu-item-title", text: it.title }),
        it.checked ? ic("menu-item-check", "check") : null);
      row.addEventListener("click", (e) => { e.stopPropagation(); closeMenu(); it.onClick?.(e); });
      m.append(row);
    }
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, y + r.height > innerHeight - 8 ? y - r.height : y) + "px";
    openMenuEl = m;
  }
  showAtEvent(e) {
    e.preventDefault?.(); e.stopPropagation?.();
    if (e.clientX || e.clientY) this.showAt(e.clientX, e.clientY);
    else { const r = (e.currentTarget || e.target).getBoundingClientRect(); this.showAt(r.left, r.bottom + 4); }
  }
  showBelow(el) { const r = el.getBoundingClientRect(); this.showAt(r.left, r.bottom + 4); }
}
document.addEventListener("mousedown", (e) => { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }, true);
window.addEventListener("blur", closeMenu);
window.addEventListener("resize", closeMenu);

let echoTimer = null, mbBusy = false, pendingEcho = null;
export function defaultEcho() {
  if (vault.fs?.kind === "demo") return t("demoBanner");
  if (vault.fs?.kind === "copy") return t("volatileBanner");
  return ""; // the line stays hidden until there is a message
}
export function echo(text, o = {}) {
  const mb = $("#minibuf");
  if (!mb) return false;
  if (mbBusy) { pendingEcho = [text, o]; return true; }
  clearTimeout(echoTimer);
  const isHint = o.hint || text === defaultEcho();
  mb.replaceChildren(h("span", { cls: "echo" + (isHint ? " is-hint" : ""), text, title: text }));
  mb.classList.toggle("is-blank", !text && !o.undo && !o.action);
  if (o.undo) mb.append(h("button", { cls: "wb-btn mini", type: "button", onClick: () => undo() }, t("undo"), h("kbd", { text: "C-z" })));
  if (o.action) mb.append(h("button", { cls: "wb-btn mini", type: "button", text: o.action.label, onClick: () => { echo(defaultEcho(), { keep: true }); o.action.run(); } }));
  if (!isHint) { mb.classList.remove("flash"); void mb.offsetWidth; mb.classList.add("flash"); }
  if (o.hint) echoTimer = setTimeout(() => echo(defaultEcho(), { keep: true }), 7000);
  else if (!o.keep && !isHint) echoTimer = setTimeout(() => echo(defaultEcho(), { keep: true }), o.undo ? 9000 : 6000);
  return true;
}
export function mbBegin() { clearTimeout(echoTimer); mbBusy = true; modalStack++; $("#minibuf")?.classList.remove("is-blank"); }
export function mbEnd() {
  mbBusy = false; modalStack--;
  const pe = pendingEcho; pendingEcho = null;
  if (pe) echo(...pe); else echo(defaultEcho(), { keep: true });
}
/** Emacs-style completing read in the minibuffer. */
export function minibufPick({ placeholder, items, allowCreate = false, limit = 200 }) {
  return new Promise((resolve) => {
    const mb = $("#minibuf");
    mbBegin();
    const input = h("input", { type: "text", spellcheck: "false", autocomplete: "off", "aria-label": placeholder });
    const comp = h("ul", { cls: "comp", role: "listbox" });
    const count = h("span", { cls: "preview" });
    mb.replaceChildren(h("span", { cls: "mb-prompt", text: placeholder.replace(/[….]+$/, "") + ":" }), input, count, comp);
    let shown = [], sel = 0, done = false;
    const outside = (e) => { if (!mb.contains(e.target)) finish(undefined); };
    const finish = (v) => { if (done) return; done = true; document.removeEventListener("mousedown", outside, true); mbEnd(); resolve(v); };
    document.addEventListener("mousedown", outside, true);
    const mark = () => { [...comp.children].forEach((li, i) => li.classList.toggle("on", i === sel)); comp.children[sel]?.scrollIntoView({ block: "nearest" }); };
    const draw = () => {
      const q = input.value.trim();
      let list = items.map((it) => ({ it, s: fuzzyScore(q, it.title + " " + (it.keywords || "")) })).filter((x) => x.s > 0);
      if (q) list.sort((a, b) => b.s - a.s);
      shown = list.slice(0, limit).map((x) => x.it);
      if (allowCreate && q && !items.some((it) => norm(it.title) === norm(q))) shown.push({ create: q, title: t("createNew", { name: q }), icon: "plus" });
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      comp.replaceChildren(...shown.map((it, i) => {
        const li = h("li", { cls: i === sel ? "on" : "", role: "option" }, it.icon ? ic("comp-icon", it.icon, "file-text") : null, h("span", { cls: "comp-title", text: it.title }), it.note ? h("span", { cls: "comp-note", text: it.note }) : null);
        if (it.color) li.dataset.color = it.color;
        li.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); finish(it); });
        return li;
      }));
      if (!shown.length) comp.append(h("li", { cls: "is-empty", text: t("noResults") }));
      count.textContent = shown.length ? `[${shown.length}]` : "";
      mark();
    };
    input.addEventListener("input", () => { sel = 0; draw(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === "Tab") { e.preventDefault(); if (shown[sel] && !shown[sel].create) { input.value = shown[sel].title; draw(); } }
      else if (e.key === "Enter") { e.preventDefault(); if (shown[sel]) finish(shown[sel]); }
      else if (e.key === "Escape" || (e.ctrlKey && e.key === "g")) { e.preventDefault(); e.stopPropagation(); finish(undefined); }
    });
    draw();
    input.focus();
    setTimeout(() => input.focus(), 0);
  });
}
export function minibufRead(label, value = "") {
  return new Promise((resolve) => {
    const mb = $("#minibuf");
    mbBegin();
    const input = h("input", { type: "text", spellcheck: "false", autocomplete: "off", "aria-label": label });
    input.value = value;
    mb.replaceChildren(h("span", { cls: "mb-prompt", text: label + ":" }), input, h("span", { cls: "preview", text: "RET ok · C-g cancel" }));
    let done = false;
    const outside = (e) => { if (!mb.contains(e.target)) finish(null); };
    const finish = (v) => { if (done) return; done = true; document.removeEventListener("mousedown", outside, true); mbEnd(); resolve(v); };
    document.addEventListener("mousedown", outside, true);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(input.value.trim() || null); }
      else if (e.key === "Escape" || (e.ctrlKey && e.key === "g")) { e.preventDefault(); e.stopPropagation(); finish(null); }
    });
    input.focus(); input.select();
    setTimeout(() => { if (document.activeElement !== input) input.focus(); }, 0);
  });
}
export function notice(text, o = {}) {
  if (echo(String(text).replace(/\n/g, " · "), o)) return;
  let box = $(".notice-container");
  if (!box) document.body.append((box = h("div", { cls: "notice-container" })));
  const n = h("div", { cls: "notice" }, h("span", { text }));
  if (o.undo) n.append(h("button", { cls: "sn-undo-btn", text: t("undo"), onClick: () => { n.remove(); undo(); } }));
  if (o.action) n.append(h("button", { cls: "sn-undo-btn", text: o.action.label, onClick: () => { n.remove(); o.action.run(); } }));
  n.addEventListener("click", (e) => { if (e.target === n || e.target.tagName === "SPAN") n.remove(); });
  box.append(n);
  setTimeout(() => n.remove(), o.action ? 12000 : o.undo ? 6000 : 3500);
}

export let modalStack = 0;
export function openLayer(panel, onClose) {
  const bg = h("div", { cls: "modal-bg" });
  const close = (v) => { bg.remove(); panel.remove(); modalStack--; document.removeEventListener("keydown", onKey, true); onClose?.(v); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(undefined); } };
  bg.addEventListener("mousedown", () => close(undefined));
  document.addEventListener("keydown", onKey, true);
  document.body.append(bg, panel);
  modalStack++;
  return close;
}
export function fuzzyScore(q, text) {
  if (!q) return 1;
  const s = norm(text);
  const words = norm(q).split(/\s+/).filter(Boolean);
  let score = 0;
  for (const w of words) {
    const i = s.indexOf(w);
    if (i < 0) {
      let j = 0;
      for (const ch of s) if (ch === w[j]) j++;
      if (j < w.length) return 0;
      score += 0.2;
    } else score += i === 0 ? 3 : /[\s/_-]/.test(s[i - 1]) ? 2 : 1;
  }
  return score;
}
/** Obsidian-style suggest modal. items: [{value,title,icon,color,note}] */
export function suggestModal({ placeholder, items, allowCreate = false, grid = false, render, limit = 200, hint = false, current }) {
  if (!grid && $("#minibuf")) return minibufPick({ placeholder, items, allowCreate, limit });
  return new Promise((resolve) => {
    const input = h("input", { cls: "prompt-input", type: "text", placeholder, spellcheck: "false" });
    const results = h("div", { cls: "prompt-results" + (grid ? " icon-grid" : "") });
    const panel = h("div", { cls: "prompt" }, h("div", { cls: "prompt-input-row" }, input), results,
      h("div", { cls: "prompt-instructions" },
        h("span", {}, h("kbd", { text: "↑↓" }), t("navigate")), h("span", {}, h("kbd", { text: "↵" }), t("choose")), h("span", {}, h("kbd", { text: "esc" }), t("dismiss"))));
    let shown = [], sel = 0;
    const close = openLayer(panel, (v) => resolve(v));
    const choose = (i) => { const it = shown[i]; if (it) close(it); };
    const draw = () => {
      const q = input.value.trim();
      shown = items.map((it) => ({ it, s: fuzzyScore(q, it.title + " " + (it.keywords || "")) })).filter((x) => x.s > 0);
      if (q) shown.sort((a, b) => b.s - a.s);
      shown = shown.slice(0, limit).map((x) => x.it);
      if (allowCreate && q && !items.some((it) => norm(it.title) === norm(q))) shown.push({ create: q, title: t("createNew", { name: q }), icon: "plus" });
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      results.replaceChildren();
      if (!shown.length) results.append(h("div", { cls: "suggestion-empty", text: t("noResults") }));
      shown.forEach((it, i) => {
        const row = render ? render(it) : h("div", { cls: "suggestion-item" },
          it.icon ? ic("suggestion-icon", it.icon) : null, h("span", { cls: "suggestion-title", text: it.title }), it.note ? h("span", { cls: "suggestion-note", text: it.note }) : null);
        row.classList.add("suggestion-item");
        if (current !== undefined && it.value === current) row.classList.add("is-current");
        if (it.color) row.dataset.color = it.color;
        if (i === sel) row.classList.add("is-selected");
        row.addEventListener("mousemove", () => { if (sel !== i) { sel = i; mark(); } });
        row.addEventListener("click", () => choose(i));
        results.append(row);
      });
    };
    const mark = () => { $$(".suggestion-item", results).forEach((r, i) => r.classList.toggle("is-selected", i === sel)); $$(".suggestion-item", results)[sel]?.scrollIntoView({ block: "nearest" }); };
    input.addEventListener("input", () => { sel = 0; draw(); });
    input.addEventListener("keydown", (e) => {
      const cols = grid ? Math.max(1, Math.round(results.clientWidth / 122)) : 1;
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(shown.length - 1, sel + cols); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - cols); mark(); }
      else if (grid && e.key === "ArrowRight" && input.selectionStart === input.value.length) { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); mark(); }
      else if (grid && e.key === "ArrowLeft" && input.selectionStart === 0) { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(sel); }
    });
    draw();
    setTimeout(() => input.focus(), 0);
  });
}
export async function iconModal(current) {
  const names = allIconNames();
  const items = [{ value: null, title: t("noIcon"), icon: "circle-slash" }, ...names.map((n) => ({ value: n, title: n, icon: n }))];
  const pick = await suggestModal({
    placeholder: t("pickIcon"), items, grid: true, limit: 160, current,
    render: (it) => h("div", { cls: "suggestion-item", title: it.title }, ic("suggestion-icon", it.icon), h("span", { cls: "suggestion-title", text: it.title })),
  });
  return pick ? pick.value : undefined;
}
export function promptModal(title, value = "") {
  if ($("#minibuf")) return minibufRead(title, value);
  return new Promise((resolve) => {
    const input = h("input", { type: "text", value, style: "width:100%" });
    const ok = h("button", { cls: "mod-cta", text: "OK" });
    const panel = h("div", { cls: "modal" }, h("div", { cls: "modal-title", text: title }), input,
      h("div", { cls: "modal-buttons" }, h("button", { text: t("close"), onClick: () => close(null) }), ok));
    const close = openLayer(panel, (v) => resolve(v ?? null));
    ok.addEventListener("click", () => close(input.value.trim() || null));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); close(input.value.trim() || null); } });
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}
export function confirmModal(title, text, okText) {
  return new Promise((resolve) => {
    const ok = h("button", { cls: "mod-warning", text: okText });
    const panel = h("div", { cls: "modal" }, h("div", { cls: "modal-title", text: title }), h("p", { cls: "modal-text", text }),
      h("div", { cls: "modal-buttons" }, h("button", { text: t("close"), onClick: () => close(false) }), ok));
    const close = openLayer(panel, (v) => resolve(!!v));
    ok.addEventListener("click", () => close(true));
    setTimeout(() => ok.focus(), 0);
  });
}

