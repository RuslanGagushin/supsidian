/* =========================================================
   Writing notes + undo
   ========================================================= */
import { t } from "../core/i18n.js";
import { baseName } from "../core/util.js";
import { dumpYaml, splitNote } from "../core/frontmatter.js";
import { editor, undoStack, vault } from "./state.js";
import { indexNames, parseNote } from "./vault.js";
import { syncHook } from "./sync.js";
import { notice } from "../ui/ui.js";
import { saveEditor, syncEditorFromDisk } from "../ui/editor.js";
import { refresh } from "../ui/shell.js";

let currentTxn = null; // the open txn(): notes it changes keep their text from before, for undo
export async function writeRaw(path, raw, { silentEditor = false, fromSync = false } = {}) {
  if (!fromSync && currentTxn && !currentTxn.before.has(path)) currentTxn.before.set(path, vault.notes.get(path)?.raw ?? null);
  let mtime;
  try { mtime = await vault.fs.write(path, raw); }
  catch (e) { notice(t("writeFailed", { name: baseName(path), msg: e.message || e })); throw e; }
  const isNew = !vault.notes.has(path);
  vault.notes.set(path, parseNote(path, raw, mtime || Date.now()));
  vault.allPaths.add(path);
  vault.sizes.set(path, raw.length);
  if (isNew) indexNames();
  if (!fromSync) syncHook(isNew ? "create" : "modify", path);
  if (!silentEditor && editor.path === path && !editor.dirty) syncEditorFromDisk();
}
export async function updateFM(path, fn) {
  if (editor.path === path && editor.dirty) await saveEditor();
  const n = vault.notes.get(path);
  if (!n) return;
  if (n.fmError) { notice(t("fmError", { msg: n.fmError })); return; }
  const fm = structuredClone(n.fm);
  fn(fm);
  const { body } = splitNote(n.raw);
  const keys = Object.keys(fm);
  const raw = (keys.length ? "---\n" + dumpYaml(fm) + "---\n" : "") + body;
  if (raw !== n.raw) await writeRaw(path, raw);
}
export async function removeNote(path, { fromSync = false } = {}) {
  if (!fromSync && currentTxn && !currentTxn.before.has(path)) currentTxn.before.set(path, vault.notes.get(path)?.raw ?? null);
  await vault.fs.remove(path);
  vault.notes.delete(path);
  vault.allPaths.delete(path);
  vault.sizes.delete(path);
  indexNames();
  if (!fromSync) syncHook("delete", path);
}
export async function txn(label, fn) {
  const tx = { label: "", before: new Map() };
  currentTxn = tx;
  try { const l = await fn(tx); tx.label = l ?? label; }
  finally { currentTxn = null; }
  refresh();
  if (tx.before.size) {
    undoStack.push(tx);
    if (undoStack.length > 20) undoStack.shift();
    if (tx.label) notice(tx.label, { undo: true });
  } else if (tx.label) notice(tx.label);
}
export async function undo() {
  const tx = undoStack.pop();
  if (!tx) { notice(t("nothingToUndo")); return; }
  for (const [path, raw] of tx.before) {
    if (raw === null) { if (vault.notes.has(path)) await removeNote(path); }
    else await writeRaw(path, raw);
  }
  indexNames();
  refresh();
  notice(t("undone", { label: tx.label.split("\n")[0] }));
}

