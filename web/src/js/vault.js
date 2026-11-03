/* =========================================================
   Vault loading and indexing
   ========================================================= */
function isMd(p) { return /\.md$/i.test(p); }
function isCard(path) {
  if (!isMd(path)) return false;
  if (S.templatesFolder && (path === S.templatesFolder || path.startsWith(S.templatesFolder + "/"))) return false;
  if (S.onlyCardsFolder && S.cardsFolder && !path.startsWith(S.cardsFolder + "/")) return false;
  return true;
}
function parseNote(path, raw, mtime) {
  const { fm: fmRaw, body } = splitNote(raw);
  let fm = {}, fmError = null;
  if (fmRaw) { try { fm = parseYaml(fmInner(fmRaw)); } catch (e) { fmError = String(e.message || e).split("\n")[0]; } }
  const created = Date.parse(fm.created ?? fm.date ?? "") || null;
  return { path, name: baseName(path), raw, fmRaw, body, fm, fmError, mtime, ctime: created || mtime, tags: noteTags(fm, body), links: noteLinks(body) };
}
function indexNames() {
  vault.byName.clear();
  for (const p of vault.notes.keys()) {
    const k = baseName(p).toLowerCase();
    (vault.byName.get(k) || vault.byName.set(k, []).get(k)).push(p);
  }
}
function addAttachment(path) {
  const k = (path.split("/").pop() || "").toLowerCase();
  const arr = vault.files.get(k) || vault.files.set(k, []).get(k);
  if (!arr.includes(path)) arr.push(path);
}
/** Obsidian-like link resolution: exact path, then by name (same folder first, then the shortest path). */
function resolveLink(linkpath, source = "") {
  if (!linkpath) return null;
  let lp = linkpath.trim().replace(/\\/g, "/");
  if (!lp) return null;
  const lower = lp.toLowerCase();
  const withMd = /\.md$/i.test(lp) ? lower : lower + ".md";
  if (lp.includes("/")) {
    const rel = (dirName(source) ? dirName(source) + "/" : "") + withMd;
    for (const p of vault.notes.keys()) { const pl = p.toLowerCase(); if (pl === withMd || pl === rel) return p; }
  }
  const cands = vault.byName.get(baseName(withMd).toLowerCase());
  if (!cands?.length) return null;
  if (lp.includes("/")) { const hit = cands.find((p) => p.toLowerCase().endsWith("/" + withMd)); if (hit) return hit; }
  if (cands.length === 1) return cands[0];
  const sameDir = cands.find((p) => dirName(p) === dirName(source));
  return sameDir || [...cands].sort((a, b) => a.length - b.length)[0];
}
function resolveAttachment(name, source) {
  let n = name.trim().replace(/\\/g, "/");
  try { n = decodeURIComponent(n); } catch { /* keep */ }
  const lower = n.toLowerCase();
  if (vault.allPaths.has(n)) return n;
  const rel = (dirName(source) ? dirName(source) + "/" : "") + n;
  if (vault.allPaths.has(rel)) return rel;
  const cands = vault.files.get(lower.split("/").pop()) || [];
  return cands.find((p) => p.toLowerCase().endsWith(lower)) || cands[0] || null;
}
/** A wikilink to a non-note file ([[doc.pdf]]): the vault file it points at, if any. */
function resolveFileLink(lp, source) {
  if (!lp || !/\.[a-z0-9]{1,8}$/i.test(lp) || /\.md$/i.test(lp)) return null;
  return resolveAttachment(lp, source);
}
async function openAttachment(path) {
  try {
    if (IS_NATIVE && vault.fs.root && !IS_ANDROID) { await TAURI.invoke("plugin:opener|open_path", { path: vault.fs.root.replace(/\/$/, "") + "/" + path }); return; }
    const url = await attachmentUrl(path);
    const a = h("a", { href: url, target: "_blank", rel: "noopener" });
    if (IS_NATIVE) a.download = baseName(path);
    document.body.append(a); a.click(); a.remove();
  } catch (e) { notice(String(e?.message || e)); }
}
function linkText(path) {
  const name = baseName(path);
  return (vault.byName.get(name.toLowerCase()) || []).length > 1 ? path.replace(/\.md$/i, "") : name;
}
function buildGraph() {
  const g = new HierarchyGraph();
  const field = S.parentsField || "parents";
  for (const n of vault.notes.values()) {
    if (!isCard(n.path)) continue;
    const parents = [], unresolved = [];
    for (const lp of parentLinkpaths(n.fm[field])) {
      const r = resolveLink(lp, n.path);
      if (r) parents.push(r); else unresolved.push(lp);
    }
    const order = parentLinkpaths(n.fm.child_order).map((lp) => resolveLink(lp, n.path)).filter(Boolean);
    const links = n.links.map((lp) => resolveLink(lp, n.path)).filter(Boolean);
    g.setNode(n.path, parents, unresolved, links, order);
  }
  return g;
}
function cardColor(path) {
  const v = vault.notes.get(path)?.fm?.color;
  if (typeof v !== "string") return null;
  const c = v.toLowerCase().trim().replace("gray", "grey");
  return COLORS.includes(c) ? c : null;
}
function cardIcon(path) { const v = vault.notes.get(path)?.fm?.icon; return typeof v === "string" && v.trim() ? v.trim() : null; }
function cardTags(path) { return (vault.notes.get(path)?.tags || []).map((x) => x.replace(/^#/, "").toLowerCase()); }
function sortInfo(path) {
  const n = vault.notes.get(path);
  const o = Number(n?.fm?.order);
  return { order: Number.isFinite(o) ? o : Number.MAX_SAFE_INTEGER, name: baseName(path), mtime: n?.mtime ?? 0, ctime: n?.ctime ?? 0 };
}
function makeComparator(mode) {
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  return (pa, pb, parent) => {
    if (mode === "manual" && parent) {
      const ia = graph.positionIn(parent, pa), ib = graph.positionIn(parent, pb);
      if (ia >= 0 || ib >= 0) {
        if (ia < 0) return 1;
        if (ib < 0) return -1;
        if (ia !== ib) return ia - ib;
      }
    }
    const a = sortInfo(pa), b = sortInfo(pb);
    switch (mode) {
      case "name": return byName(a, b);
      case "modified": return b.mtime - a.mtime || byName(a, b);
      case "created": return b.ctime - a.ctime || byName(a, b);
      default: return a.order - b.order || byName(a, b);
    }
  };
}
const manualCmp = (a, b, p) => makeComparator("manual")(a, b, p);

async function loadVault(fs) {
  if (typeof stopSync === "function") await stopSync();
  vault.fs = fs;
  vault.notes.clear(); vault.files.clear(); vault.allPaths.clear(); vault.sizes.clear(); vault.mtimes.clear();
  showLoading(true);
  try {
    const list = await fs.list();
    const md = [], others = [];
    for (const f of list) {
      vault.allPaths.add(f.path);
      if (isMd(f.path)) md.push(f);
      else { addAttachment(f.path); if (f.mtime) vault.mtimes.set(f.path, f.mtime); if (f.handle) others.push(f); }
    }
    let i = 0;
    const worker = async () => {
      while (i < md.length) {
        const f = md[i++];
        try {
          const file = f.handle ? await f.handle.getFile() : await fs.readFile(f.path);
          const raw = await file.text();
          vault.notes.set(f.path, parseNote(f.path, raw, file.lastModified || Date.now()));
          vault.sizes.set(f.path, file.size);
        } catch (e) { console.warn("read failed", f.path, e); }
      }
      while (others.length) {
        const f = others.pop();
        try { const file = await f.handle.getFile(); vault.sizes.set(f.path, file.size); if (file.lastModified) vault.mtimes.set(f.path, file.lastModified); } catch { /* gone */ }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    indexNames();
    await loadPluginData();
    applyLanguage();
    const saved = lsGet(boardKey(), null);
    Object.assign(board, {
      target: null, depth: S.defaultDepth, layout: S.defaultLayout, sort: S.defaultSort, grouped: S.defaultGrouped,
      filter: { query: "", colors: [], tags: [] }, searchOpen: false, history: [], selection: new Set(), selectMode: false, expanded: new Set(), rendered: 60,
    });
    if (saved) {
      for (const k of ["target", "depth", "layout", "sort", "grouped", "heroCollapsed", "tagView", "view"]) if (saved[k] !== undefined) board[k] = saved[k];
      if (saved.filter) board.filter = { query: saved.filter.query || "", colors: saved.filter.colors || [], tags: saved.filter.tags || [], scope: saved.filter.scope === "all" ? "all" : "here" };
      board.searchOpen = !!(board.filter.query || board.filter.colors.length || board.filter.tags.length);
      tree.expanded = new Set(saved.treeExpanded || []);
    } else tree.expanded = new Set();
    closeEditor(true);
    undoStack.length = 0;
    graph = buildGraph();
    $("#welcome")?.remove();
    renderAll();
    $("#board")?.focus();
    if (typeof syncBoot === "function") syncBoot();
    dailyCfg = null; loadDailyConfig();
  } finally { showLoading(false); }
}
const boardKey = () => "sn-board:" + (vault.fs?.kind || "") + ":" + (vault.fs?.name || "");
function persistBoard() {
  lsSet(boardKey(), {
    target: board.target, depth: board.depth, layout: board.layout, sort: board.sort, grouped: board.grouped,
    heroCollapsed: board.heroCollapsed, filter: board.filter, tagView: board.tagView || null, view: board.view || null, treeExpanded: [...tree.expanded],
  });
}
const DATA_PATH = ".obsidian/plugins/supsidian/data.json";
async function loadPluginData() {
  S = { ...DEFAULTS, ...lsGet("sn-settings:" + vault.fs.name, {}) };
  vault.pluginData = null;
  vault.hasObsidian = false;
  if (vault.fs.kind === "demo") { S.templatesFolder = S.templatesFolder || "Templates"; return; }
  try { await vault.fs.dir?.(".obsidian", false); vault.hasObsidian = !!vault.fs.dir; } catch { vault.hasObsidian = false; }
  if (vault.fs.kind === "copy") vault.hasObsidian = false;
  try {
    const text = await vault.fs.read(DATA_PATH);
    vault.pluginData = JSON.parse(text);
    for (const k of Object.keys(DEFAULTS)) if (vault.pluginData[k] !== undefined) S[k] = vault.pluginData[k];
  } catch { /* plugin not installed in this vault */ }
  if (!Array.isArray(S.pinned)) S.pinned = [];
  if (!Array.isArray(S.savedViews)) S.savedViews = [];
}
async function saveSettings() {
  lsSet("sn-settings:" + vault.fs.name, S);
  if (vault.fs.kind !== "disk" || (!vault.pluginData && !vault.hasObsidian)) return;
  try {
    let current = {};
    try { current = JSON.parse(await vault.fs.read(DATA_PATH)); } catch { /* new file */ }
    const merged = { ...current };
    for (const k of Object.keys(DEFAULTS)) merged[k] = S[k];
    await vault.fs.write(DATA_PATH, JSON.stringify(merged, null, 2));
    vault.pluginData = merged;
  } catch (e) { console.warn("settings not saved to vault", e); }
}

/* Watch for changes made elsewhere (Obsidian, sync) */
let polling = false;
async function pollChanges(force = false) {
  if (polling || !vault.fs || vault.fs.kind !== "disk") return;
  if (!force && document.visibilityState !== "visible") return;
  polling = true;
  try {
    const list = await vault.fs.list();
    const seen = new Set();
    let changed = false;
    for (const f of list) {
      seen.add(f.path);
      if (!vault.allPaths.has(f.path)) {
        vault.allPaths.add(f.path);
        if (!isMd(f.path)) { addAttachment(f.path); try { const file = await f.handle.getFile(); vault.sizes.set(f.path, file.size); vault.mtimes.set(f.path, file.lastModified || Date.now()); } catch { /* gone */ } syncHook("create", f.path); changed = true; }
      }
      if (!isMd(f.path)) continue;
      const file = await f.handle.getFile();
      const n = vault.notes.get(f.path);
      if (n && n.mtime >= file.lastModified) continue;
      const raw = await file.text();
      if (n && n.raw === raw) { n.mtime = file.lastModified; continue; }
      vault.notes.set(f.path, parseNote(f.path, raw, file.lastModified));
      vault.sizes.set(f.path, file.size);
      syncHook(n ? "modify" : "create", f.path);
      changed = true;
    }
    for (const p of [...vault.allPaths]) {
      if (seen.has(p)) continue;
      vault.allPaths.delete(p);
      vault.sizes.delete(p);
      if (!isMd(p)) { vault.mtimes.delete(p); dropAttachment(p); changed = true; }
      if (vault.notes.delete(p)) changed = true;
      syncHook("delete", p);
    }
    if (changed) {
      indexNames();
      refresh();
      if (editor.path && !editor.dirty) syncEditorFromDisk();
    }
  } catch (e) { console.warn("poll failed", e); } finally { polling = false; }
}

