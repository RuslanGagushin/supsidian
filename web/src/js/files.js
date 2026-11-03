/* =========================================================
   Files: every attachment in the vault,
   with a preview, the notes that use it, rename (links follow) and delete.
   ========================================================= */
const FVSTR = {
  en: {
    files: "Files", filesHint: "All files in the vault", total: "Total size: {size}", search: "Search files…",
    kAll: "All", kImages: "Images", kPdf: "PDF", kMedia: "Media", kOther: "Other", unused: "Unused", unusedHint: "Only files no note links to",
    sort: "Sort", sName: "By name", sSize: "Largest first", sModified: "Recently modified first", sType: "By type", sFolder: "By folder",
    open: "Open", download: "Download", goToNote: "Go to note", usedIn: ["In {n} note", "In {n} notes"], notUsed: "Not used in any note",
    rename: "Rename…", renameTitle: "Rename file", copyLink: "Copy embed link", linkCopied: "Link copied", reveal: "Show in folder",
    delete: "Delete file", confirmTitle: "Delete file", confirm: "Delete “{name}”? It goes to the vault trash (.trash).",
    confirmUsed: ["Delete “{name}”? It goes to the vault trash (.trash). {n} note links to it, that link will break.", "Delete “{name}”? It goes to the vault trash (.trash). {n} notes link to it, those links will break."],
    deleted: "Deleted “{name}” (copy in .trash)", renamed: "Renamed to “{name}”", renamedLinks: ["Renamed to “{name}”, updated {n} note", "Renamed to “{name}”, updated {n} notes"],
    exists: "A file named “{name}” already exists here", upload: "Add files", uploaded: ["Added {n} file", "Added {n} files"],
    empty: "No files in this vault yet. Paste or drop files into a note, or use Add files.", noMatch: "No files match.",
    pickNote: "Open which note?", noPreview: "No preview for this file type", select: "Select a file to preview it",
    root: "vault root", modified: "Modified {date}", failed: "Couldn't {what}: {msg}",
  },
  ru: {
    files: "Файлы", filesHint: "Все файлы хранилища", total: "Всего: {size}", search: "Поиск файлов…",
    kAll: "Все", kImages: "Картинки", kPdf: "PDF", kMedia: "Медиа", kOther: "Прочие", unused: "Без ссылок", unusedHint: "Только файлы, на которые не ссылается ни одна заметка",
    sort: "Сортировка", sName: "По имени", sSize: "Сначала большие", sModified: "Недавно изменённые", sType: "По типу", sFolder: "По папке",
    open: "Открыть", download: "Скачать", goToNote: "К заметке", usedIn: ["В {n} заметке", "В {n} заметках", "В {n} заметках"], notUsed: "Не используется в заметках",
    rename: "Переименовать…", renameTitle: "Переименовать файл", copyLink: "Копировать ссылку-вставку", linkCopied: "Ссылка скопирована", reveal: "Показать в папке",
    delete: "Удалить файл", confirmTitle: "Удаление файла", confirm: "Удалить «{name}»? Файл попадёт в корзину хранилища (.trash).",
    confirmUsed: ["Удалить «{name}»? Файл попадёт в корзину (.trash). На него ссылается {n} заметка — ссылка перестанет работать.", "Удалить «{name}»? Файл попадёт в корзину (.trash). На него ссылаются {n} заметки — ссылки перестанут работать.", "Удалить «{name}»? Файл попадёт в корзину (.trash). На него ссылаются {n} заметок — ссылки перестанут работать."],
    deleted: "Удалено: «{name}» (копия в .trash)", renamed: "Переименовано в «{name}»", renamedLinks: ["Переименовано в «{name}», обновлена {n} заметка", "Переименовано в «{name}», обновлено {n} заметки", "Переименовано в «{name}», обновлено {n} заметок"],
    exists: "Файл «{name}» здесь уже есть", upload: "Добавить файлы", uploaded: ["Добавлен {n} файл", "Добавлено {n} файла", "Добавлено {n} файлов"],
    empty: "В хранилище пока нет файлов. Вставьте или перетащите файл в заметку или нажмите «Добавить файлы».", noMatch: "Нет подходящих файлов.",
    pickNote: "Какую заметку открыть?", noPreview: "Для этого типа файлов нет предпросмотра", select: "Выберите файл для предпросмотра",
    root: "корень хранилища", modified: "Изменён {date}", failed: "Не удалось ({what}): {msg}",
  },
};
const fvt = (k, v = {}) => {
  let s = FVSTR[LANG]?.[k] ?? FVSTR.en[k] ?? k;
  if (Array.isArray(s)) s = s[Math.min(pluralIndex(v.n ?? 0), s.length - 1)];
  return s.replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));
};
const FV = Object.assign({ kind: "all", sort: "name", unused: false }, lsGet("sn-files", {}), { query: "", sel: null, refs: null });
const saveFV = () => lsSet("sn-files", { kind: FV.kind, sort: FV.sort, unused: FV.unused });
const fileExt = (p) => (/\.([^./]+)$/.exec(p)?.[1] || "").toLowerCase();
const fileName = (p) => p.split("/").pop();
const MEDIA_EXT = /\.(mp3|wav|m4a|ogg|oga|flac|webm|mp4|m4v|mov|ogv|3gp|mkv)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|ogv|webm|mkv)$/i;
const TEXT_EXT = /\.(txt|csv|tsv|json|ya?ml|xml|log|ini|toml|js|ts|css|html?|canvas|base|org|tex|sh|py)$/i;
function fileKind(p) { return IMG_EXT.test(p) ? "images" : PDF_EXT.test(p) ? "pdf" : MEDIA_EXT.test(p) ? "media" : "other"; }
function fileIcon(p) {
  const k = fileKind(p);
  if (k === "images") return "image";
  if (k === "pdf") return "file-text";
  if (k === "media") return VIDEO_EXT.test(p) ? "file-video" : "file-audio";
  if (/\.(zip|rar|7z|tar|gz|tgz)$/i.test(p)) return "file-archive";
  if (/\.(xlsx?|ods|csv|tsv)$/i.test(p)) return "file-spreadsheet";
  if (TEXT_EXT.test(p)) return "file-code";
  return "file";
}
function fmtSize(b) {
  if (b == null) return "";
  if (b < 1024) return b + " B";
  const u = ["KB", "MB", "GB"]; let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return (b < 10 ? b.toFixed(1) : Math.round(b)) + " " + u[i];
}
function allAttachments() { return [...vault.allPaths].filter((p) => !isMd(p)); }
function dropAttachment(path) {
  const k = fileName(path).toLowerCase();
  const arr = vault.files.get(k);
  if (arr) { const i = arr.indexOf(path); if (i >= 0) arr.splice(i, 1); if (!arr.length) vault.files.delete(k); }
  const u = blobUrls.get(path);
  if (u) { blobUrls.delete(path); u.then((x) => URL.revokeObjectURL(x)).catch(() => {}); }
}
/* links to files in a note: [[file.pdf]], ![[img.png|300]], ![alt](folder/img%20one.png) */
const FILE_WIKI_RE = /(!?\[\[)([^\]|#\n]+)([^\]\n]*\]\])/g;
const FILE_MD_RE = /(!?\[[^\]\n]*\]\()(<[^>\n]+>|[^)\s]+)((?:\s+"[^"\n]*")?\))/g;
function fileTarget(lp, source, md) {
  let s = lp.trim();
  if (md) { s = s.replace(/^<|>$/g, ""); if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; s = s.split("#")[0]; }
  if (!s || isMd(s) || !/\.[a-z0-9]{1,8}$/i.test(s)) return null;
  return resolveAttachment(s, source);
}
/** path of every attachment -> notes that link to it */
function attachmentRefs() {
  const out = new Map();
  const add = (f, p) => { const arr = out.get(f) || out.set(f, []).get(f); if (!arr.includes(p)) arr.push(p); };
  for (const n of vault.notes.values()) {
    const raw = stripCode(n.raw);
    for (const m of raw.matchAll(FILE_WIKI_RE)) { const f = fileTarget(m[2], n.path, false); if (f) add(f, n.path); }
    for (const m of raw.matchAll(FILE_MD_RE)) { const f = fileTarget(m[2], n.path, true); if (f) add(f, n.path); }
  }
  return out;
}
async function moveVaultFile(from, to) {
  const file = await vault.fs.readFile(from); // a Blob keeps its type (the demo vault serves it as is)
  if (from.toLowerCase() === to.toLowerCase()) { // case-only rename on a case-insensitive disk: go through a temporary name
    const tmp = to + ".sn-tmp-" + Date.now().toString(36);
    await vault.fs.write(tmp, file); await vault.fs.remove(from); await vault.fs.write(to, await vault.fs.readFile(tmp)); await vault.fs.remove(tmp);
  } else { await vault.fs.write(to, file); await vault.fs.remove(from); }
  return file.size;
}
/** Rename an attachment in its folder and rewrite the links to it in every note. */
async function renameAttachment(path, newName) {
  let clean = String(newName).replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
  if (!clean) return path;
  const ext = fileExt(path);
  if (ext && fileExt(clean) !== ext && !/\.[a-z0-9]{1,8}$/i.test(clean)) clean += "." + ext;
  const newPath = (dirName(path) ? dirName(path) + "/" : "") + clean;
  if (newPath === path) return path;
  if ([...vault.allPaths].some((p) => p.toLowerCase() === newPath.toLowerCase() && p.toLowerCase() !== path.toLowerCase())) { notice(fvt("exists", { name: clean })); return path; }
  if (editor.dirty) await saveEditor();
  // new note texts, worked out while the links still resolve to the old path
  const refs = attachmentRefs().get(path) || [];
  const unique = !(vault.files.get(clean.toLowerCase()) || []).some((p) => p !== path);
  const wikiRef = unique ? clean : newPath;
  const mdRef = newPath.replace(/ /g, "%20");
  const rewrites = [];
  for (const rp of refs) {
    const n = vault.notes.get(rp);
    const raw = n.raw
      .replace(FILE_WIKI_RE, (m, a, lp, rest) => (fileTarget(lp, rp, false) === path ? a + wikiRef + rest : m))
      .replace(FILE_MD_RE, (m, a, lp, rest) => (fileTarget(lp, rp, true) === path ? a + (lp.startsWith("<") ? `<${newPath}>` : mdRef) + rest : m));
    if (raw !== n.raw) rewrites.push([rp, raw]);
  }
  let size;
  try { size = await moveVaultFile(path, newPath); }
  catch (e) { notice(fvt("failed", { what: fvt("rename").replace("…", ""), msg: e.message || e })); return path; }
  const mtime = vault.mtimes.get(path);
  vault.allPaths.delete(path); vault.sizes.delete(path); vault.mtimes.delete(path); dropAttachment(path);
  vault.allPaths.add(newPath); vault.sizes.set(newPath, size); if (mtime) vault.mtimes.set(newPath, mtime); addAttachment(newPath);
  syncHook("rename", newPath, path);
  for (const [rp, raw] of rewrites) await writeRaw(rp, raw);
  if (FV.sel === path) FV.sel = newPath;
  refresh();
  if (board.view === "files") renderBoard();
  notice(rewrites.length ? fvt("renamedLinks", { name: clean, n: rewrites.length }) : fvt("renamed", { name: clean }));
  return newPath;
}
async function deleteAttachment(path) {
  const refs = attachmentRefs().get(path) || [];
  const name = fileName(path);
  const ok = await confirmModal(fvt("confirmTitle"), refs.length ? fvt("confirmUsed", { name, n: refs.length }) : fvt("confirm", { name }), fvt("delete"));
  if (!ok) return;
  try {
    if (vault.fs.kind === "disk") {
      const ext = fileExt(name), stem = ext ? name.slice(0, -ext.length - 1) : name;
      let tp = ".trash/" + name, i = 1;
      while (await vault.fs.exists(tp)) tp = `.trash/${stem} ${i++}${ext ? "." + ext : ""}`;
      await vault.fs.write(tp, await vault.fs.readFile(path));
    }
    await vault.fs.remove(path);
  } catch (e) { notice(fvt("failed", { what: fvt("delete").toLowerCase(), msg: e.message || e })); return; }
  if (vault.fs.files instanceof Map) vault.fs.files.delete(path);
  vault.allPaths.delete(path); vault.sizes.delete(path); vault.mtimes.delete(path); dropAttachment(path);
  syncHook("delete", path);
  if (FV.sel === path) FV.sel = null;
  refresh();
  if (board.view === "files") renderBoard();
  notice(fvt("deleted", { name }));
}
function uploadAttachments() {
  const input = h("input", { type: "file", multiple: true, style: "display:none" });
  input.addEventListener("change", async () => {
    const files = [...input.files]; input.remove();
    let n = 0, last = null;
    for (const f of files) {
      try { last = await saveAttachment(f, editor.path || board.target || "", false); vault.mtimes.set(last, Date.now()); n++; }
      catch (e) { notice(wt("attachFailed", { name: f.name || "file", msg: e.message || e })); }
    }
    if (!n) return;
    FV.sel = last; FV.kind = "all"; FV.unused = false; FV.query = "";
    renderBoard();
    notice(fvt("uploaded", { n }));
  });
  document.body.append(input);
  input.click();
}
async function downloadAttachment(path) {
  try {
    const a = h("a", { href: await attachmentUrl(path), download: fileName(path) });
    document.body.append(a); a.click(); a.remove();
  } catch (e) { notice(String(e?.message || e)); }
}
function copyAttachmentLink(path) {
  const name = fileName(path);
  const ref = (vault.files.get(name.toLowerCase()) || []).length > 1 ? path : name;
  navigator.clipboard?.writeText(IMG_EXT.test(path) || PDF_EXT.test(path) ? `![[${ref}]]` : `[[${ref}]]`);
  notice(fvt("linkCopied"));
}
async function goToAttachmentNote(path, anchor) {
  const refs = FV.refs?.get(path) || attachmentRefs().get(path) || [];
  if (!refs.length) return;
  const open = (p) => { if (innerWidth <= 820) FV.sel = null; openEditor(p, { focus: false }); };
  if (refs.length === 1) { open(refs[0]); return; }
  const m = new Menu();
  m.label(fvt("pickNote"));
  for (const p of refs) m.add(baseName(p), cardIcon(p) || "file-text", () => open(p));
  if (anchor) m.showBelow(anchor); else m.showAt(innerWidth / 2 - 100, innerHeight / 3);
}
async function promptRenameAttachment(path) {
  const v = await promptModal(fvt("renameTitle"), fileName(path));
  if (v) await renameAttachment(path, v);
}
function attachmentMenu(path, anchor) {
  const m = new Menu();
  const refs = FV.refs?.get(path) || [];
  m.add(fvt("open"), "external-link", () => openAttachment(path));
  if (refs.length) m.add(fvt("goToNote"), "file-symlink", () => goToAttachmentNote(path, anchor));
  m.add(fvt("rename"), "pencil", () => promptRenameAttachment(path));
  m.add(fvt("copyLink"), "link", () => copyAttachmentLink(path));
  m.add(fvt("download"), "download", () => downloadAttachment(path));
  if (IS_NATIVE && vault.fs.root && !IS_ANDROID) m.add(fvt("reveal"), "folder-open", () => TAURI.invoke("plugin:opener|reveal_item_in_dir", { path: vault.fs.root.replace(/\/$/, "") + "/" + path }).catch((e) => notice(String(e?.message || e))));
  m.sep();
  m.add(fvt("delete"), "trash-2", () => deleteAttachment(path), { warning: true });
  return m;
}

function openFilesView(push = true) {
  if (board.view === "files") { renderBoard(); return; }
  if (push) { board.history.push(navEntry()); if (board.history.length > 100) board.history.shift(); }
  if (board.tagView) leaveTagView();
  board.view = "files";
  board.selection.clear();
  persistBoard();
  renderBoard(true);
  renderTree();
  if (innerWidth <= 820) setSide(false);
  setTimeout(() => $(".fv-list")?.focus({ preventScroll: true }), 0);
}
function filesButton() {
  const b = wbBtn("paperclip", fvt("files"), () => (board.view === "files" ? goBack() : openFilesView()), "wb-files");
  b.id = "files-btn";
  b.title = fvt("filesHint") + " · Ctrl+Shift+E";
  b.classList.toggle("is-active", board.view === "files");
  return b;
}
function fvRows() {
  const q = norm(FV.query.trim());
  const rows = [];
  for (const p of allAttachments()) {
    if (FV.kind !== "all" && fileKind(p) !== FV.kind) continue;
    if (FV.unused && FV.refs.get(p)?.length) continue;
    if (q && !norm(p).includes(q) && !(FV.refs.get(p) || []).some((n) => norm(baseName(n)).includes(q))) continue;
    rows.push(p);
  }
  const byName = (a, b) => fileName(a).localeCompare(fileName(b), undefined, { numeric: true, sensitivity: "base" });
  const cmp = {
    name: byName,
    size: (a, b) => (vault.sizes.get(b) || 0) - (vault.sizes.get(a) || 0) || byName(a, b),
    modified: (a, b) => (vault.mtimes.get(b) || 0) - (vault.mtimes.get(a) || 0) || byName(a, b),
    type: (a, b) => fileExt(a).localeCompare(fileExt(b)) || byName(a, b),
    folder: (a, b) => dirName(a).localeCompare(dirName(b), undefined, { numeric: true, sensitivity: "base" }) || byName(a, b),
  }[FV.sort] || byName;
  return rows.sort(cmp);
}
function renderFilesView(root) {
  const oldList = root.querySelector(".fv-list");
  const scroll = oldList?.scrollTop || 0;
  const focus = document.activeElement === oldList || !!document.activeElement?.closest?.(".fv-row") ? "list" : document.activeElement?.classList?.contains("fv-search") ? "search" : null;
  root.className = "sn-board is-files";
  root.replaceChildren();
  masonries = [];
  $("#files-btn")?.classList.toggle("is-active", true);

  const bar = h("div", { cls: "sn-topbar" });
  const back = iconBtn("arrow-left", t("back"), () => goBack()); back.disabled = !board.history.length;
  bar.append(h("div", { cls: "sn-nav" }, back));
  const crumbs = h("div", { cls: "sn-crumbs" });
  const home = h("a", { cls: "sn-crumb", href: "#" }, ic("sn-crumb-icon", "home"), h("span", { text: t("allCards") }));
  home.addEventListener("click", (e) => { e.preventDefault(); setTarget(null); });
  crumbs.append(home, h("span", { cls: "sn-crumb-sep", text: "/" }), h("span", { cls: "sn-crumb is-current" }, ic("sn-crumb-icon", "paperclip"), h("span", { text: fvt("files") })));
  bar.append(crumbs);
  bar.append(h("div", { cls: "sn-tools" }, h("button", { cls: "wb-btn", type: "button", title: fvt("upload"), onClick: () => uploadAttachments() }, ic("", "upload"), h("span", { cls: "wb-label", text: fvt("upload") }))));
  root.append(bar);

  const listPane = h("div", { cls: "fv-pane" });
  const prevPane = h("div", { cls: "fv-preview" });
  const wrap = h("div", { cls: "fv" + (FV.sel ? " has-sel" : "") }, listPane, prevPane);
  root.append(wrap);

  // head: count, total size, search, kinds, sort
  const head = h("div", { cls: "fv-head" });
  const search = h("input", { type: "search", cls: "fv-search", placeholder: fvt("search"), spellcheck: "false", "aria-label": fvt("search") });
  search.value = FV.query;
  search.addEventListener("input", debounce(() => { FV.query = search.value; fvRenderList(); }, 120));
  search.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); const l = $(".fv-list"); l?.focus(); if (!FV.sel || !l?.querySelector(".fv-row.sel")) fvSelect(l?.querySelector(".fv-row")?.dataset.path); }
    else if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = ""; FV.query = ""; fvRenderList(); }
  });
  const seg = h("div", { cls: "sn-seg fv-kinds", role: "tablist" });
  for (const [k, l] of [["all", "kAll"], ["images", "kImages"], ["pdf", "kPdf"], ["media", "kMedia"], ["other", "kOther"]]) {
    const b = h("button", { cls: "clickable-icon" + (FV.kind === k ? " is-active" : ""), type: "button", text: fvt(l), role: "tab", "aria-selected": String(FV.kind === k) });
    b.addEventListener("click", () => { FV.kind = k; saveFV(); $$(".fv-kinds .clickable-icon").forEach((x) => x.classList.toggle("is-active", x === b)); fvRenderList(); });
    seg.append(b);
  }
  const unused = h("button", { cls: "fchip fv-unused" + (FV.unused ? " inc" : ""), type: "button", text: fvt("unused"), title: fvt("unusedHint"), "aria-pressed": String(FV.unused) });
  unused.addEventListener("click", () => { FV.unused = !FV.unused; saveFV(); unused.classList.toggle("inc", FV.unused); unused.setAttribute("aria-pressed", String(FV.unused)); fvRenderList(); });
  const sortBtn = iconBtn("arrow-up-down", fvt("sort"), (e) => {
    const m = new Menu();
    for (const [v, k] of [["name", "sName"], ["modified", "sModified"], ["size", "sSize"], ["type", "sType"], ["folder", "sFolder"]]) m.add(fvt(k), null, () => { FV.sort = v; saveFV(); fvRenderList(); }, { checked: FV.sort === v });
    m.showBelow(e.currentTarget);
  }, "fv-sort");
  head.append(h("div", { cls: "fv-title" }, h("b", { text: fvt("files") }), h("span", { cls: "fv-count" }), h("span", { cls: "fv-total" })),
    h("div", { cls: "fv-search-row" }, search, sortBtn), h("div", { cls: "fv-filters" }, seg, unused));
  const list = h("div", { cls: "fv-list", tabindex: "0", role: "listbox", "aria-label": fvt("files") });
  list.addEventListener("keydown", fvListKey);
  listPane.append(head, list);
  fvRenderList();
  list.scrollTop = scroll;
  fvRenderPreview();
  if (focus === "list") list.focus({ preventScroll: true });
  else if (focus === "search") { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
}
/** Rebuild the list and counts only — the preview (and a PDF in it) stays as it is. */
function fvRenderList() {
  const list = $(".fv-list");
  if (!list) return;
  FV.refs = attachmentRefs();
  const all = allAttachments();
  if (FV.sel && !vault.allPaths.has(FV.sel)) { FV.sel = null; fvRenderPreview(); }
  $(".fv-count").textContent = String(all.length);
  $(".fv-total").textContent = fvt("total", { size: fmtSize(all.reduce((s, p) => s + (vault.sizes.get(p) || 0), 0)) });
  const rows = fvRows();
  const sc = list.scrollTop;
  list.replaceChildren();
  if (!rows.length) { list.append(h("div", { cls: "fv-empty", text: all.length ? fvt("noMatch") : fvt("empty") })); return; }
  const frag = document.createDocumentFragment();
  for (const p of rows) {
    const refs = FV.refs.get(p) || [];
    const sub = refs.length ? baseName(refs[0]) + (refs.length > 1 ? ` +${refs.length - 1}` : "") : dirName(p) || fvt("root");
    const row = h("div", { cls: "fv-row" + (p === FV.sel ? " sel" : "") + (refs.length ? "" : " is-unused"), role: "option", "aria-selected": String(p === FV.sel), dataset: { path: p }, title: p },
      ic("fv-icon", fileIcon(p)),
      h("div", { cls: "fv-row-main" },
        h("div", { cls: "fv-row-name" }, h("span", { cls: "fv-name", text: fileName(p) }), h("span", { cls: "fv-size", text: fmtSize(vault.sizes.get(p)) })),
        h("div", { cls: "fv-row-sub" }, refs.length ? ic("fv-sub-icon", "file-text") : ic("fv-sub-icon", "folder"), h("span", { text: sub }))),
      iconBtn("more-horizontal", t("more"), (e) => { e.stopPropagation(); fvSelect(p); attachmentMenu(p, e.currentTarget).showBelow(e.currentTarget); }, "fv-more"));
    row.addEventListener("click", () => fvSelect(p));
    row.addEventListener("dblclick", () => openAttachment(p));
    row.addEventListener("contextmenu", (e) => { fvSelect(p); attachmentMenu(p).showAtEvent(e); });
    attachLongPress(row, (ev) => { fvSelect(p); attachmentMenu(p).showAtEvent(ev); });
    frag.append(row);
  }
  list.append(frag);
  list.scrollTop = sc;
}
function fvSelect(p, scroll = false) {
  if (!p) return;
  const changed = FV.sel !== p;
  FV.sel = p;
  $$(".fv-row").forEach((r) => { const on = r.dataset.path === p; r.classList.toggle("sel", on); r.setAttribute("aria-selected", String(on)); if (on && scroll) r.scrollIntoView({ block: "nearest" }); });
  $(".fv")?.classList.add("has-sel");
  if (changed) fvRenderPreview();
}
function fvListKey(e) {
  if (isMod(e) || e.altKey) return;
  const rows = $$(".fv-row");
  const i = rows.findIndex((r) => r.dataset.path === FV.sel);
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (e.key === "ArrowDown" || e.key === "j") { stop(); fvSelect(rows[Math.min(rows.length - 1, i + 1)]?.dataset.path, true); }
  else if (e.key === "ArrowUp" || e.key === "k") { stop(); if (i <= 0) $(".fv-search")?.focus(); else fvSelect(rows[i - 1]?.dataset.path, true); }
  else if (e.key === "Home") { stop(); fvSelect(rows[0]?.dataset.path, true); }
  else if (e.key === "End") { stop(); fvSelect(rows[rows.length - 1]?.dataset.path, true); }
  else if (!FV.sel) { if (e.key === "/") { stop(); $(".fv-search")?.focus(); } }
  else if (e.key === "Enter") { stop(); openAttachment(FV.sel); }
  else if (e.key === "F2" || e.key === "r") { stop(); promptRenameAttachment(FV.sel); }
  else if (e.key === "Delete" || e.key === "Backspace") { stop(); deleteAttachment(FV.sel); }
  else if (e.key === "g") { stop(); goToAttachmentNote(FV.sel, $(".fv-goto")); }
  else if (e.key === "/") { stop(); $(".fv-search")?.focus(); }
  else if (e.key === "Escape" && innerWidth <= 820) { stop(); FV.sel = null; $(".fv")?.classList.remove("has-sel"); }
}
function fvRenderPreview() {
  const pane = $(".fv-preview");
  if (!pane) return;
  const p = FV.sel;
  pane.replaceChildren();
  if (!p || !vault.allPaths.has(p)) { pane.append(h("div", { cls: "fv-placeholder" }, ic("", "paperclip"), h("span", { text: fvt("select") }))); return; }
  const refs = FV.refs?.get(p) || [];
  const close = iconBtn("arrow-left", t("back"), () => { FV.sel = null; $(".fv")?.classList.remove("has-sel"); $$(".fv-row.sel").forEach((r) => r.classList.remove("sel")); }, "fv-close");
  const crumb = h("div", { cls: "fv-crumb" }, h("span", { cls: "fv-crumb-folder", text: dirName(p) || fvt("root") }), h("span", { cls: "sn-crumb-sep", text: "/" }),
    h("span", { cls: "fv-crumb-name", text: fileName(p), title: fvt("rename").replace("…", ""), onClick: () => promptRenameAttachment(p) }));
  const goto = h("button", { cls: "mod-cta fv-goto", type: "button", disabled: !refs.length, title: refs.length ? refs.map(baseName).join(", ") : fvt("notUsed") }, ic("", "file-symlink"), h("span", { text: fvt("goToNote") }));
  goto.addEventListener("click", (e) => goToAttachmentNote(p, e.currentTarget));
  const tools = h("div", { cls: "fv-ptools" },
    iconBtn("download", fvt("download"), () => downloadAttachment(p)),
    iconBtn("external-link", fvt("open"), () => openAttachment(p)),
    goto,
    iconBtn("more-horizontal", t("more"), (e) => attachmentMenu(p, e.currentTarget).showBelow(e.currentTarget)));
  const meta = [fileExt(p).toUpperCase(), fmtSize(vault.sizes.get(p)), vault.mtimes.get(p) ? fvt("modified", { date: formatDate(vault.mtimes.get(p)) }) : "",
    refs.length ? fvt("usedIn", { n: refs.length }) : fvt("notUsed")].filter(Boolean).join(" · ");
  const body = h("div", { cls: "fv-pbody" });
  pane.append(h("div", { cls: "fv-phead" }, close, crumb, tools), h("div", { cls: "fv-meta", text: meta }), body);
  const fail = (e) => body.replaceChildren(h("div", { cls: "fv-placeholder", text: String(e?.message || e) }));
  const generic = () => body.replaceChildren(h("div", { cls: "fv-placeholder" }, ic("fv-big", fileIcon(p)), h("span", { text: fvt("noPreview") }),
    h("button", { cls: "wb-btn", type: "button", onClick: () => openAttachment(p) }, ic("", "external-link"), h("span", { text: fvt("open") }))));
  const kind = fileKind(p);
  if (kind === "images") attachmentUrl(p).then((u) => body.append(h("img", { cls: "fv-img", src: u, alt: fileName(p) }))).catch(fail);
  else if (kind === "pdf") {
    const view = h("div", { cls: "sn-pdf-view fv-pdf" });
    body.append(view);
    if (hasPdfViewer()) attachmentUrl(p).then((u) => view.append(h("iframe", { src: `${u}#view=FitH`, title: fileName(p) }))).catch((e) => pdfMessage(view, e));
    else renderPdfPages(view, h("span"), p, 1);
  } else if (kind === "media") attachmentUrl(p).then((u) => body.append(h(VIDEO_EXT.test(p) ? "video" : "audio", { cls: "fv-media", src: u, controls: true }))).catch(fail);
  else if (TEXT_EXT.test(p) && (vault.sizes.get(p) || 0) < 512 * 1024) vault.fs.read(p).then((s) => body.append(h("pre", { cls: "fv-text", text: s }))).catch(fail);
  else generic();
}


