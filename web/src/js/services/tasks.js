import { orgCache, orgParse } from "../core/org.js";
import { vault } from "./state.js";

export function orgAll() {
  const out = [];
  for (const n of vault.notes.values()) { if (n.raw.length > 400000) continue; out.push(...orgParse(n)); }
  for (const p of orgCache.keys()) if (!vault.notes.has(p)) orgCache.delete(p);
  return out;
}
/** Card footer: TODO entries and checkboxes in this note. */
export function cardTaskProgress(path) {
  const n = vault.notes.get(path);
  if (!n) return null;
  const es = orgParse(n).filter((x) => x.isTodo && x.cls !== "cancel");
  return es.length ? { done: es.filter((x) => x.done).length, n: es.length } : null;
}
