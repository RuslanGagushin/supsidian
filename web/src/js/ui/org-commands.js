/* =========================================================
   Org entries changed from the agenda and the editor's commands: TODO state, priority,
   SCHEDULED / DEADLINE and tags, each an undoable edit of the note (core/org.js does the text).
   ========================================================= */
import { tt } from "../core/i18n.js";
import { orgNextKw, orgSetBox, orgSetPlanning, orgSetPriority, orgSetState, orgSetTags, orgTsStr } from "../core/org.js";
import { board, editor, vault } from "../services/state.js";
import { txn, writeRaw } from "../services/save.js";
import { todoSet } from "../services/tasks.js";
import { $ } from "./dom.js";
import { echo, minibufPick, minibufRead } from "./ui.js";
import { saveEditor } from "./editor.js";
import { orgAskDate } from "./org-editing.js";

/* ---------- calendar arithmetic on day numbers (local calendar dates) */

/* ---------- timestamps: <2026-10-28 Wed 10:00-11:00 +1w -2d>  (active)  [..] (inactive) */


/* ---------- keywords */

/* ---------- line grammar */

/* ---------- parsing a note into entries (cached per text) */

/* ---------- editing entries in notes (undoable, synced) */
export async function orgEdit(e, fn) {
  if (editor.path === e.path && editor.dirty) await saveEditor();
  const n = vault.notes.get(e.path);
  if (!n) return false;
  const lines = n.raw.split("\n");
  let li = e.line;
  if (lines[li] !== e.raw) { li = lines.indexOf(e.raw); if (li < 0) { echo(tt("lost")); return false; } }
  const msg = fn(lines, li, todoSet(n));
  if (msg == null || msg === false) return false;
  await txn(String(msg).slice(0, 90), () => writeRaw(e.path, lines.join("\n")));
  return true;
}
export const orgCycle = (e, dir = 1) => (e.kind === "box" ? orgEdit(e, (L, li) => orgSetBox(L, li, !e.done)) : e.kind === "event" ? false : orgEdit(e, (L, li, set) => orgSetState(L, li, orgNextKw(set, e.kw, dir), set)));
export const orgPri = (e, dir, explicit) => (e.kind === "event" ? false : orgEdit(e, (L, li, set) => orgSetPriority(L, li, set, dir, explicit)));
export const orgRefocus = () => { if (board.view === "tasks" && !document.activeElement?.closest?.(".sn-editor, input, textarea")) setTimeout(() => $(".ag-body")?.focus({ preventScroll: true }), 0); };
export async function orgPickState(e) {
  if (e.kind === "event") return;
  if (e.kind === "box") return orgCycle(e);
  const it = await minibufPick({ placeholder: tt("pickState"), items: [...e.set.all.map((k) => ({ title: k, kw: k, icon: e.set.done.includes(k) ? "check" : "circle" })), { title: "—", kw: null, icon: "x" }] });
  if (it) await orgEdit(e, (L, li, set) => orgSetState(L, li, it.kw, set));
  orgRefocus();
}
export async function orgPickPriority(cur) {
  const it = await minibufPick({ placeholder: tt("priority"), items: [["A", "chevrons-up"], ["B", "chevron-up"], ["C", "chevron-down"], ["—", "minus"]].map(([p, icon]) => ({ title: p, icon, p: p === "—" ? null : p, note: cur === p ? "●" : "" })) });
  return it ? it.p : undefined;
}
export async function orgPlanEntry(e, key) {
  const cur = key === "SCHEDULED" ? e.sched : e.dead;
  const r = await orgAskDate(key === "SCHEDULED" ? tt("schedule") : tt("deadline"), cur);
  orgRefocus();
  if (r === undefined) return;
  await orgEdit(e, (L, li) => {
    if (r === null) { orgSetPlanning(L, li, key, null); return tt("planRemoved", { key }); }
    const ts = orgTsStr({ active: true, dn: r.dn, time: r.time, end: r.end, rep: r.rep || cur?.rep || null, warn: r.warn || cur?.warn || null });
    orgSetPlanning(L, li, key, ts);
    return tt("planSet", { key, ts });
  });
}
export async function orgTagsEntry(e) {
  if (e.kind === "event") return;
  const v = await minibufRead(tt("tags"), e.tags.length ? ":" + e.tags.join(":") + ":" : "");
  orgRefocus();
  if (v == null && !e.tags.length) return;
  const tags = String(v || "").split(/[:\s,]+/).map((x) => x.replace(/^#/, "")).filter(Boolean);
  await orgEdit(e, (L, li, set) => orgSetTags(L, li, set, tags));
}

