/* =========================================================
   Board view
   ========================================================= */
let lastFocused = null; // the card that had focus last (arrow keys go on from it)
const setLastFocused = (path) => { lastFocused = path; };
let sentinelObs = null;
function navEntry() {
  if (board.view === "tasks") return { tasks: true, target: board.target };
  if (board.view === "files") return { files: true, target: board.target };
  return board.tagView ? { tag: board.tagView } : board.target;
}
function leaveTagView() {
  if (!board.tagView) return;
  board.tagView = null;
  board.filter = { query: "", colors: [], tags: [], scope: "here" };
  board.searchOpen = false;
}
/** Open a tag as its own view: every card with the tag, from the whole vault. */
function openTagView(tag, push = true) {
  tag = String(tag).replace(/^#/, "").toLowerCase();
  if (board.tagView === tag) { $("#board")?.querySelector(".sn-scroll")?.scrollTo({ top: 0 }); return; }
  if (push) board.history.push(navEntry());
  if (board.history.length > 100) board.history.shift();
  board.tagView = tag;
  board.view = null;
  board.target = null;
  board.filter = { query: "", colors: [], tags: [tag], scope: "all" };
  board.searchOpen = false;
  board.selection.clear();
  board.rendered = 60;
  persistBoard();
  renderBoard(true);
  renderTree();
  if (innerWidth <= 820) setSide(false);
}
function setTarget(path, push = true) {
  if (path && !graph.has(path)) path = null;
  if (path === board.target && !board.tagView && !board.view) { $("#board")?.querySelector(".sn-scroll")?.scrollTo({ top: 0 }); return; }
  if (push) board.history.push(navEntry());
  leaveTagView();
  board.view = null;
  if (board.history.length > 100) board.history.shift();
  board.target = path;
  board.selection.clear();
  board.rendered = 60;
  persistBoard();
  renderBoard(true);
  renderTree();
  if (innerWidth <= 820) setSide(false);
}
function goBack() {
  if (!board.history.length) return;
  const p = board.history.pop();
  if (p && typeof p === "object" && p.tasks) { board.target = p.target ?? null; openTasksView(false); }
  else if (p && typeof p === "object" && p.files) { board.target = p.target ?? null; openFilesView(false); }
  else if (p && typeof p === "object") openTagView(p.tag, false);
  else { if (board.view && p === board.target) { board.view = null; persistBoard(); renderBoard(true); renderTree(); return; } setTarget(p, false); }
}
function toggleSelect(path) {
  if (board.selection.has(path)) board.selection.delete(path); else board.selection.add(path);
  $$(`.sn-card`, $("#board")).forEach((c) => c.classList.toggle("is-picked", board.selection.has(c.dataset.path)));
  renderSelbar();
}
function toggleTagFilter(tag) {
  const tags = new Set(board.filter.tags);
  if (tags.has(tag)) tags.delete(tag); else tags.add(tag);
  board.filter.tags = [...tags];
  board.searchOpen = true;
  persistBoard();
  renderBoard();
}

function renderBoard(resetScroll = false) {
  const root = $("#board");
  if (!root || !vault.fs) return;
  $("#files-btn")?.classList.toggle("is-active", board.view === "files");
  if (board.view === "tasks") { renderTasksView(root); return; }
  if (board.view === "files") { renderFilesView(root); return; }
  const oldScroll = root.querySelector(".sn-scroll");
  const scrollTop = resetScroll ? 0 : oldScroll?.scrollTop || 0;
  const active = document.activeElement;
  const focusComposer = active?.closest?.(".sn-composer") ? { value: active.value } : null;
  const focusSearch = active?.classList?.contains("sn-search-input") ? { pos: active.selectionStart } : null;
  const focusCard = active?.closest?.(".sn-card")?.dataset.path;

  if (board.target && !graph.has(board.target)) board.target = null;
  if (board.tagView && !board.filter.tags.includes(board.tagView)) board.tagView = null;
  const model = computeModel();
  root.className = "sn-board" + (board.layout === "list" ? " is-list" : "") + (board.selectMode ? " is-select-mode" : "");
  root.replaceChildren();
  masonries.length = 0;
  sentinelObs?.disconnect();

  root.append(renderToolbar());
  if (board.searchOpen) root.append(renderFilterBar(model));
  const scroll = h("div", { cls: "sn-scroll" });
  const page = h("div", { cls: "sn-page" });
  scroll.append(page);
  root.append(scroll);
  boardResize.disconnect();
  boardResize.observe(scroll);

  page.append(renderHero(model));
  const composer = renderComposer();
  const mainBlock = model.blocks[0];
  const main = new Masonry(page);
  masonries.push(main);
  main.add(composer.el);
  const cards = [];
  const addCards = (m, list) => { for (const c of list) { const el = renderCard(c.path, c.via, c.depth); m.add(el); cards.push(el); } };
  const grouped = model.blocks.length > 1;
  if (grouped) {
    addCards(main, mainBlock.cards);
    for (const b of model.blocks.slice(1)) {
      const g = h("div", { cls: "sn-group" });
      const color = cardColor(b.head);
      const headEl = h("div", { cls: "sn-group-head" });
      if (color) headEl.dataset.color = color;
      const title = h("a", { cls: "sn-group-title", href: "#" }, ic("sn-group-icon", cardIcon(b.head) || "layers", "layers"), h("span", { text: baseName(b.head) }));
      title.addEventListener("click", (e) => { e.preventDefault(); setTarget(b.head); });
      headEl.append(title, h("span", { cls: "sn-group-count", text: String(b.cards.length - 1) }));
      dnd.dropTarget(headEl, () => ({ path: b.head, parent: null, zones: ["inside"] }));
      g.append(headEl);
      page.append(g);
      const m = new Masonry(g);
      masonries.push(m);
      addCards(m, b.cards);
    }
  } else {
    const list = mainBlock.cards;
    const first = Math.min(list.length, Math.max(60, board.rendered));
    addCards(main, list.slice(0, first));
    let done = first;
    if (done < list.length) {
      const sentinel = h("div", { cls: "sn-sentinel" });
      page.append(sentinel);
      sentinelObs = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        const next = list.slice(done, done + 40);
        const start = cards.length;
        addCards(main, next);
        cards.slice(start).forEach(setupClamp);
        done += next.length;
        board.rendered = done;
        if (done >= list.length) { sentinelObs.disconnect(); sentinel.remove(); }
      }, { root: scroll, rootMargin: "600px" });
      sentinelObs.observe(sentinel);
    }
  }
  cards.forEach(setupClamp);
  if (!model.shown.length) page.append(h("div", { cls: "sn-empty", text: model.active ? t("noMatches") : t("noCards") }));
  const notes = [];
  if (model.all.skippedRepeats && !model.active) notes.push(t("repeatsSkipped", { n: model.all.skippedRepeats }));
  if (model.truncated) notes.push(t("truncatedNote", { n: S.maxCards }));
  if (notes.length) page.append(h("div", { cls: "sn-footnote", text: notes.join(" · ") }));
  root.append(h("div", { id: "selbar-host" }));
  board.lastModel = model;
  root.append(boardModeline(model));
  renderSelbar();
  scroll.scrollTop = scrollTop;

  board.sig = boardSig(model);
  board.cardSigs = new Map(cards.map((el) => [el.dataset.path, cardSig(el.dataset.path)]));
  board.heroSig = heroSig();
  if (board.flashPath) {
    const el = $(`.sn-card[data-path="${CSS.escape(board.flashPath)}"]`, root);
    if (el) { el.classList.add("is-new"); el.scrollIntoView({ block: "nearest" }); }
    board.flashPath = null;
  }
  if (focusComposer) { composer.input.value = focusComposer.value; composer.input.focus(); composer.grow(); }
  else if (focusSearch) { const si = $(".sn-search-input", root); si?.focus(); si?.setSelectionRange(focusSearch.pos, focusSearch.pos); }
  else if (focusCard) $(`.sn-card[data-path="${CSS.escape(focusCard)}"]`, root)?.focus({ preventScroll: true });
}

function boardSig(model) {
  return JSON.stringify([board.target, board.depth, board.layout, board.sort, board.grouped, board.searchOpen, board.selectMode, board.filter, board.lang = LANG,
    model.blocks.map((b) => [b.head, b.cards.map((c) => `${c.path}|${c.via ?? ""}|${c.depth}`)]), model.total, model.all.skippedRepeats, model.truncated, graph.ancestry(board.target || "", makeComparator("manual"))]);
}
function cardSig(path) {
  const n = vault.notes.get(path);
  return [n?.raw, n?.mtime, graph.childrenOf(path).length, graph.backlinksOf(path).length, graph.unresolvedParentsOf(path).join(","),
    graph.parentsOf(path).map((p) => `${p}:${cardIcon(p)}:${cardColor(p)}`).join(","), board.selection.has(path), editor.path === path, board.expanded.has(path)].join("\u0001");
}
function heroSig() { const p = board.target; return p ? [vault.notes.get(p)?.raw, graph.parentsOf(p).join(","), board.heroCollapsed].join("\u0001") : ""; }
/** Update the board after a note change: replace only the cards that changed, keep scroll, focus and layout. */
function patchBoard() {
  if (board.view === "tasks") { renderBoard(); return; }
  if (board.view === "files") { if ($(".fv-list")) fvRenderList(); else renderBoard(); return; }
  const root = $("#board");
  if (!root || !root.querySelector(".sn-scroll") || board.flashPath) return renderBoard();
  if (board.target && !graph.has(board.target)) return renderBoard();
  const model = computeModel();
  if (boardSig(model) !== board.sig) return renderBoard();
  const focused = document.activeElement?.closest?.(".sn-card")?.dataset.path;
  for (const el of $$(".sn-card", root)) {
    const p = el.dataset.path;
    const sig = cardSig(p);
    if (board.cardSigs.get(p) === sig) continue;
    const fresh = renderCard(p, el.dataset.via || null, Number(el.dataset.depth) || 1);
    for (const m of masonries) { const i = m.items.indexOf(el); if (i >= 0) m.items[i] = fresh; }
    el.replaceWith(fresh);
    setupClamp(fresh);
    board.cardSigs.set(p, sig);
    if (focused === p) fresh.focus({ preventScroll: true });
  }
  const hs = heroSig();
  if (hs !== board.heroSig) { $(".sn-hero", root)?.replaceWith(renderHero(model)); board.heroSig = hs; }
  board.lastModel = model;
  $("#board > .modeline")?.replaceWith(boardModeline(model));
}
function renderToolbar() {
  const bar = h("div", { cls: "sn-topbar" });
  const cmp = makeComparator("manual");
  const nav = h("div", { cls: "sn-nav" });
  const backBtn = iconBtn("arrow-left", t("back"), () => goBack());
  backBtn.disabled = !board.history.length;
  const target = board.target;
  const parents = target ? graph.parentsOf(target).filter((p) => graph.has(p)).sort((a, b) => cmp(a, b)) : [];
  const upBtn = iconBtn("arrow-up", t("toParent"), (e) => {
    if (!target) return;
    if (parents.length <= 1) return setTarget(parents[0] ?? null);
    const m = new Menu();
    for (const p of parents) m.add(baseName(p), cardIcon(p) || "layers", () => setTarget(p));
    m.showBelow(e.currentTarget);
  });
  upBtn.disabled = !target;
  nav.append(backBtn, upBtn);
  bar.append(nav);

  const crumbs = h("div", { cls: "sn-crumbs" });
  const crumb = (path, current) => {
    const a = h("a", { cls: "sn-crumb" + (current ? " is-current" : ""), href: "#" }, ic("sn-crumb-icon", path ? cardIcon(path) || "layers" : "home", "layers"), h("span", { text: path ? baseName(path) : t("allCards") }));
    a.addEventListener("click", (e) => { e.preventDefault(); setTarget(path); });
    if (!current) dnd.dropTarget(a, () => ({ path, parent: null, zones: ["inside"], root: !path }));
    crumbs.append(a);
  };
  crumb(null, !target && !board.tagView);
  if (board.tagView) {
    crumbs.append(h("span", { cls: "sn-crumb-sep", text: "/" }));
    crumbs.append(h("span", { cls: "sn-crumb is-current is-tag" }, ic("sn-crumb-icon", "hash"), h("span", { text: board.tagView })));
  }
  if (target) {
    for (const p of graph.ancestry(target, cmp)) { crumbs.append(h("span", { cls: "sn-crumb-sep", text: "/" })); crumb(p, false); }
    crumbs.append(h("span", { cls: "sn-crumb-sep", text: "/" }));
    crumb(target, true);
  }
  bar.append(crumbs);

  const tools = h("div", { cls: "sn-tools" });
  const seg = h("div", { cls: "sn-seg", title: t("depth") }, ic("sn-seg-icon", "list-tree"));
  for (const [v, label] of [[1, "1"], [2, "2"], [3, "3"], [0, "∞"]]) {
    const b = h("button", { cls: "clickable-icon" + (v === board.depth ? " is-active" : ""), type: "button", text: label, title: `${t("depth")}: ${label}` });
    b.addEventListener("click", () => { board.depth = v; board.rendered = 60; persistBoard(); renderBoard(); });
    seg.append(b);
  }
  tools.append(seg);
  const sb = iconBtn("search", t("searchAndFilters"), () => toggleSearch());
  if (filterActive(board.filter)) sb.classList.add("is-active");
  tools.append(sb);
  const sel = iconBtn("check-square", board.selectMode ? t("selectModeOff") : t("selectMode"), () => { board.selectMode = !board.selectMode; if (!board.selectMode) board.selection.clear(); renderBoard(); }, "sn-desktop-optional sn-hide-narrow");
  if (board.selectMode) sel.classList.add("is-active");
  tools.append(sel);
  tools.append(iconBtn("bookmark-plus", t("saveView"), () => saveCurrentView(), "sn-hide-narrow"));
  const opts = h("div", { cls: "sn-seg" });
  const sortOpts = [["manual", t("sortManual"), "list-ordered"], ["name", t("sortName"), "arrow-down-a-z"], ["modified", t("sortModified"), "clock"], ["created", t("sortCreated"), "calendar-plus"]];
  opts.append(iconBtn(sortOpts.find(([v]) => v === board.sort)?.[2] || "arrow-up-down", t("sorting"), (e) => {
    const m = new Menu();
    for (const [v, label, icn] of sortOpts) m.add(label, icn, () => { board.sort = v; persistBoard(); renderBoard(); }, { checked: v === board.sort });
    m.showBelow(e.currentTarget);
  }));
  const gb = iconBtn("group", board.depth === 1 ? t("groupByParentDisabled") : t("groupByParent"), () => { board.grouped = !board.grouped; persistBoard(); renderBoard(); });
  if (board.grouped && board.depth !== 1) gb.classList.add("is-active");
  gb.disabled = board.depth === 1;
  opts.append(gb);
  tools.append(opts);
  const lay = h("div", { cls: "sn-seg" });
  for (const [v, icn, label] of [["columns", "layout-grid", t("layoutColumns")], ["list", "rows-3", t("layoutList")]]) {
    const b = iconBtn(icn, label, () => { board.layout = v; persistBoard(); renderBoard(); });
    if (v === board.layout) b.classList.add("is-active");
    lay.append(b);
  }
  tools.append(lay);
  bar.append(tools);
  return bar;
}
function toggleSearch(open) {
  board.searchOpen = open ?? !board.searchOpen;
  if (!board.searchOpen) board.filter = { query: "", colors: [], tags: [] };
  persistBoard();
  renderBoard();
  if (board.searchOpen) $(".sn-search-input")?.focus();
}
const applyQuery = debounce(() => { persistBoard(); renderBoard(); }, 160);
function renderFilterBar(model) {
  const bar = h("div", { cls: "sn-filterbar" });
  const input = h("input", { cls: "sn-search-input", type: "text", placeholder: t("searchPlaceholder"), value: board.filter.query, spellcheck: "false" });
  input.addEventListener("input", () => { board.filter.query = input.value; applyQuery(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (input.value) { input.value = ""; board.filter.query = ""; applyQuery(); } else toggleSearch(false); }
    if (e.key === "Enter") { e.preventDefault(); $(".sn-board .sn-masonry .sn-card")?.focus(); }
  });
  bar.append(h("div", { cls: "sn-search" }, ic("sn-search-icon", "search"), input));
  const scope = h("div", { cls: "sn-seg sn-scope" });
  for (const [v, label] of [["here", t("scopeHere")], ["all", t("scopeAll")]]) {
    const cur = board.filter.scope === "all" ? "all" : "here";
    const b = h("button", { cls: "clickable-icon" + (cur === v ? " is-active" : ""), type: "button", text: label });
    b.addEventListener("click", () => { board.filter.scope = v; persistBoard(); renderBoard(); $(".sn-search-input")?.focus(); });
    scope.append(b);
  }
  bar.append(scope);
  const present = new Set(model.all.cards.map((c) => cardColor(c.path) ?? "none"));
  const colorBox = h("div", { cls: "sn-color-filter" });
  for (const c of [...COLORS, "none"]) {
    if (!present.has(c) && !board.filter.colors.includes(c)) continue;
    const d = h("button", { cls: "sn-color-dot" + (c === "none" ? " is-none" : "") + (board.filter.colors.includes(c) ? " is-active" : ""), type: "button", title: colorLabel(c === "none" ? null : c) });
    if (c !== "none") d.dataset.color = c;
    d.addEventListener("click", () => {
      const s = new Set(board.filter.colors);
      if (s.has(c)) s.delete(c); else s.add(c);
      board.filter.colors = [...s]; persistBoard(); renderBoard();
    });
    colorBox.append(d);
  }
  if (present.size > 1 || board.filter.colors.length) bar.append(colorBox);
  const tagCounts = new Map();
  for (const c of model.all.cards) for (const tg of cardTags(c.path)) tagCounts.set(tg, (tagCounts.get(tg) || 0) + 1);
  const tb = h("button", { cls: "clickable-icon sn-filter-btn" + (board.filter.tags.length ? " is-active" : ""), type: "button" }, ic("", "tag"), h("span", { text: t("tags") }));
  if (!tagCounts.size && !board.filter.tags.length) tb.disabled = true;
  tb.addEventListener("click", (e) => {
    const m = new Menu();
    if (!tagCounts.size) m.add(t("noTags"), null, null, { disabled: true });
    for (const [tg, n] of [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) m.add(`#${tg}  ·  ${n}`, "hash", () => toggleTagFilter(tg), { checked: board.filter.tags.includes(tg) });
    m.showBelow(e.currentTarget);
  });
  bar.append(tb);
  for (const tg of board.filter.tags) bar.append(h("button", { cls: "clickable-icon sn-filter-chip", type: "button", onClick: () => toggleTagFilter(tg) }, h("span", { text: "#" + tg }), ic("sn-filter-chip-x", "x")));
  bar.append(h("div", { cls: "sn-spacer" }));
  if (filterActive(board.filter)) bar.append(h("button", { cls: "clickable-icon", type: "button", text: t("clear"), onClick: () => { board.filter = { query: "", colors: [], tags: [], scope: board.filter.scope }; persistBoard(); renderBoard(); $(".sn-search-input")?.focus(); } }));
  bar.append(iconBtn("x", t("close"), () => toggleSearch(false)));
  return bar;
}
function renderHero(model) {
  const target = board.target;
  const hero = h("div", { cls: "sn-hero" });
  if (target) {
    const c = cardColor(target);
    if (c) hero.dataset.color = c;
    dnd.dropTarget(hero, () => ({ path: target, parent: null, zones: ["inside"] }));
  }
  const tv = board.tagView;
  if (tv) hero.classList.add("is-tag");
  hero.append(ic("sn-hero-badge", tv ? "hash" : target ? cardIcon(target) || "layers" : "home", "layers"));
  hero.append(h("div", { cls: "sn-hero-title-row" }, h("h1", { cls: "sn-hero-title", text: tv ? "#" + tv : target ? baseName(target) : t("allCards") })));
  const tools = h("div", { cls: "sn-hero-tools" });
  if (target) {
    tools.append(iconBtn("pencil", t("edit"), (e) => openEditor(target, { wide: isMod(e) })));
    tools.append(iconBtn("more-horizontal", t("more"), (e) => cardMenu(target, null).showBelow(e.currentTarget)));
    const parents = graph.parentsOf(target).filter((p) => graph.has(p));
    if (parents.length) hero.append(h("div", { cls: "sn-chips sn-hero-chips" }, parents.map((p) => parentChip(p))));
    const desc = h("div", { cls: "sn-hero-desc markdown-rendered" + (board.heroCollapsed ? " is-collapsed" : "") });
    desc.addEventListener("dblclick", (e) => { if (!e.target.closest("a, button, input")) openEditor(target); });
    wireRendered(desc, target);
    renderBody(desc, target, 0);
    hero.append(desc);
  }
  hero.append(tools);
  const foot = h("div", { cls: "sn-hero-foot" });
  const shown = model.shown.length, total = model.total;
  const count = total === shown && !model.active ? t("cardsCount", { n: total }) : t("cardsOf", { shown, n: total });
  const onlyTag = tv && !board.filter.query.trim() && !board.filter.colors.length && board.filter.tags.length === 1;
  foot.append(h("span", { cls: "sn-hero-count", text: onlyTag ? t("cardsCount", { n: shown }) : model.active ? t("filteredSuffix", { count }) : count }));
  if (target && cardBodyText(target).trim()) {
    const tg = iconBtn(board.heroCollapsed ? "chevron-down" : "chevron-up", board.heroCollapsed ? t("expandDescription") : t("collapseDescription"), () => {
      board.heroCollapsed = !board.heroCollapsed;
      persistBoard();
      $(".sn-hero-desc", hero)?.classList.toggle("is-collapsed", board.heroCollapsed);
      setIcon(tg, board.heroCollapsed ? "chevron-down" : "chevron-up");
    });
    foot.append(tg);
  }
  hero.append(foot);
  return hero;
}
function renderComposer() {
  const box = h("div", { cls: "sn-composer" });
  const ta = h("textarea", { rows: "1", placeholder: t("composerPlaceholder") });
  box.append(ta, h("div", { cls: "sn-composer-hint", text: t("composerHint") }));
  const grow = () => { ta.style.height = ""; if (ta.value) { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; } };
  ta.addEventListener("input", grow);
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { ta.value = ""; grow(); ta.blur(); $("#board").focus(); return; }
    if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    const text = ta.value.trim();
    if (!text) return;
    const [first, ...rest] = text.split("\n");
    ta.value = ""; grow();
    createCard(first, board.target, rest.join("\n").trim(), undefined, { tags: board.tagView ? [board.tagView] : [] }).then(() => setTimeout(() => $(".sn-composer textarea")?.focus(), 0));
  });
  return { el: box, input: ta, grow };
}
function boardModeline(model) {
  const sp = (cls, text) => h("span", { cls, text });
  const name = board.tagView ? "#" + board.tagView : board.target ? baseName(board.target) : t("allCards");
  const sortName = { manual: "manual", name: "a-z", modified: "modified", created: "newest" }[board.sort] || board.sort;
  return h("div", { cls: "modeline" },
    sp("dim", board.selection.size ? "-:**-" : "-:---"), sp("hi", name), sp("", board.tagView ? "(Tag)" : "(Board)"),
    sp("dim", `depth:${board.depth === 0 ? "∞" : board.depth}`), sp("dim", board.layout), sp("dim", `sort:${sortName}`),
    board.grouped && board.depth !== 1 ? sp("dim", "grouped") : null,
    filterActive(board.tagView ? { ...board.filter, tags: board.filter.tags.filter((x) => x !== board.tagView) } : board.filter) ? sp("hi", "filter") : null,
    sp("grow", ""),
    board.selection.size ? sp("hi", t("selected", { n: board.selection.size })) : null,
    sp("", board.tagView ? `${model.shown.length}` : model.active || model.shown.length !== model.total ? `${model.shown.length}/${model.total}` : `${model.total}`));
}
function renderSelbar() {
  const ml = $("#board > .modeline");
  if (ml && board.lastModel) ml.replaceWith(boardModeline(board.lastModel));
  const host = $("#selbar-host");
  if (!host) return;
  host.replaceChildren();
  const sel = [...board.selection].filter((p) => graph.has(p));
  if (!sel.length) return;
  const bar = h("div", { cls: "sn-selbar" }, h("span", { cls: "sn-selbar-count", text: t("selected", { n: sel.length }) }));
  const btn = (icn, label, fn, warn) => { const b = h("button", { cls: "clickable-icon sn-selbar-btn" + (warn ? " is-warning" : ""), type: "button" }, ic("", icn), h("span", { text: label })); b.addEventListener("click", fn); bar.append(b); };
  const viaOf = (p) => $(`.sn-card[data-path="${CSS.escape(p)}"]`)?.dataset.via || null;
  btn("palette", t("color"), (e) => { const m = new Menu(); m.colors(null, (c) => setColor(sel, c)); m.showBelow(e.currentTarget); });
  btn("smile", t("icon"), () => promptIcon(sel));
  btn("git-merge", t("selAddParent"), () => promptAddParent(sel));
  btn("folder-input", t("selMove"), () => promptMove(sel.map((p) => ({ child: p, from: viaOf(p) }))));
  if (board.target) btn("unlink", t("selRemoveFrom"), () => dropCards(sel.filter((p) => graph.parentsOf(p).includes(board.target)).map((p) => ({ child: p, from: board.target })), null, true, null));
  btn("trash-2", t("selDelete"), () => deleteCards(sel), true);
  bar.append(iconBtn("x", t("selClear"), () => { board.selection.clear(); renderBoard(); }));
  host.append(bar);
}

