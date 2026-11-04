/* =========================================================
   Org TODOs of the vault: core/org.js applied to the notes, with the TODO keywords from the settings.
   ========================================================= */
import { orgCache, orgParse, orgSet } from "../core/org.js";
import { UI, vault } from "./state.js";

/** The TODO keywords that apply in a note (its `todo:` frontmatter, else the settings). */
export const todoSet = (note) => orgSet(note, UI.todoKeywords);
/** The TODO entries, checkboxes and events in a note. */
export const orgEntries = (note) => orgParse(note, todoSet(note));
export function orgAll() {
  const out = [];
  for (const n of vault.notes.values()) { if (n.raw.length > 400000) continue; out.push(...orgEntries(n)); }
  for (const p of orgCache.keys()) if (!vault.notes.has(p)) orgCache.delete(p);
  return out;
}
/** Card footer: TODO entries and checkboxes in this note. */
export function cardTaskProgress(path) {
  const n = vault.notes.get(path);
  if (!n) return null;
  const es = orgEntries(n).filter((x) => x.isTodo && x.cls !== "cancel");
  return es.length ? { done: es.filter((x) => x.done).length, n: es.length } : null;
}
