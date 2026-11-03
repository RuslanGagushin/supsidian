/* =========================================================
   Writing: inline completion ([[ links, #tags, /commands), pasted and dropped files,
   daily notes, link hover previews, outline, unlinked mentions, tags, focus mode.
   Conventions follow Obsidian so notes written here look the same there.
   ========================================================= */
const WSTR = {
  en: {
    today: "Today", todayHint: "Open today's daily note",
    focus: "Focus mode", focusExit: "Exit focus mode (Esc)",
    outline: "Outline", noHeadings: "No headings in this note",
    unlinked: "Unlinked mentions", linkIt: "Link", linked: "Linked “{name}” in {note}",
    tagsSection: "Tags", readTime: "{n} min",
    slashHint: "Type / for commands",
    highlight: "Highlight",
    c_h1: "Heading 1", c_h2: "Heading 2", c_h3: "Heading 3", c_text: "Plain text",
    c_bullet: "Bulleted list", c_num: "Numbered list", c_task: "Task", c_quote: "Quote",
    c_callout: "Callout", c_code: "Code block", c_table: "Table", c_divider: "Divider",
    tblRow: "Row", tblCol: "Column", tblRowAbove: "Add row above", tblRowBelow: "Add row below", tblRowUp: "Move row up", tblRowDown: "Move row down", tblRowDelete: "Delete row",
    tblColLeft: "Add column before", tblColRight: "Add column after", tblColMoveLeft: "Move column left", tblColMoveRight: "Move column right", tblColDelete: "Delete column",
    tblAlignLeft: "Align left", tblAlignCenter: "Align center", tblAlignRight: "Align right", tblSortAsc: "Sort A → Z", tblSortDesc: "Sort Z → A", tblFormat: "Format table",
    c_link: "Link to a card", c_image: "Image or file…", c_today: "Today's date", c_now: "Current time",
    c_template: "Insert template…", c_child: "New child card from selection",
    attached: "Attached {name}", attachFailed: "Couldn't save {name}: {msg}",
    pickTemplateInsert: "Insert template", noTemplates: "No notes to use as templates",
    newTag: "new tag", newNote: "create note",
    setWriteFont: "Writing font", setWriteFontDesc: "Font of the note text in the editor and reading view.",
    wfMono: "JetBrains Mono", wfSerif: "Newsreader (serif)", wfSans: "IBM Plex Sans", wfInter: "Inter",
  },
  ru: {
    today: "Сегодня", todayHint: "Открыть ежедневную заметку на сегодня",
    focus: "Режим фокуса", focusExit: "Выйти из режима фокуса (Esc)",
    outline: "Оглавление", noHeadings: "В заметке нет заголовков",
    unlinked: "Упоминания без ссылки", linkIt: "Связать", linked: "«{name}» связано в {note}",
    tagsSection: "Теги", readTime: "{n} мин",
    slashHint: "Наберите / для команд",
    highlight: "Выделение цветом",
    c_h1: "Заголовок 1", c_h2: "Заголовок 2", c_h3: "Заголовок 3", c_text: "Обычный текст",
    c_bullet: "Маркированный список", c_num: "Нумерованный список", c_task: "Задача", c_quote: "Цитата",
    c_callout: "Выноска", c_code: "Блок кода", c_table: "Таблица", c_divider: "Разделитель",
    tblRow: "Строка", tblCol: "Столбец", tblRowAbove: "Добавить строку выше", tblRowBelow: "Добавить строку ниже", tblRowUp: "Переместить строку вверх", tblRowDown: "Переместить строку вниз", tblRowDelete: "Удалить строку",
    tblColLeft: "Добавить столбец слева", tblColRight: "Добавить столбец справа", tblColMoveLeft: "Переместить столбец влево", tblColMoveRight: "Переместить столбец вправо", tblColDelete: "Удалить столбец",
    tblAlignLeft: "По левому краю", tblAlignCenter: "По центру", tblAlignRight: "По правому краю", tblSortAsc: "Сортировать А → Я", tblSortDesc: "Сортировать Я → А", tblFormat: "Выровнять таблицу",
    c_link: "Ссылка на карточку", c_image: "Картинка или файл…", c_today: "Сегодняшняя дата", c_now: "Текущее время",
    c_template: "Вставить шаблон…", c_child: "Новая дочерняя карточка из выделения",
    attached: "Добавлено: {name}", attachFailed: "Не удалось сохранить {name}: {msg}",
    pickTemplateInsert: "Вставить шаблон", noTemplates: "Нет заметок для шаблонов",
    newTag: "новый тег", newNote: "создать заметку",
    setWriteFont: "Шрифт текста", setWriteFontDesc: "Шрифт текста заметки в редакторе и в режиме чтения.",
    wfMono: "JetBrains Mono", wfSerif: "Newsreader (с засечками)", wfSans: "IBM Plex Sans", wfInter: "Inter",
  },
};
const wt = (k, v = {}) => (WSTR[LANG]?.[k] ?? WSTR.en[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));

/* ---------- moment-style date formatting (Obsidian's daily notes and templates use it) */
function formatMoment(d, fmt) {
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const loc = LANG === "ru" ? "ru-RU" : "en-US";
  const month = (style) => new Intl.DateTimeFormat(loc, { month: style }).format(d);
  const monthGen = (style) => { // Russian needs the genitive form next to a day number ("28 октября")
    if (LANG !== "ru") return month(style);
    const parts = new Intl.DateTimeFormat(loc, { day: "numeric", month: style }).formatToParts(d);
    return parts.find((p) => p.type === "month")?.value || month(style);
  };
  const wd = (style) => new Intl.DateTimeFormat(loc, { weekday: style }).format(d);
  const week = (() => { const t0 = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = t0.getUTCDay() || 7; t0.setUTCDate(t0.getUTCDate() + 4 - day); const y0 = new Date(Date.UTC(t0.getUTCFullYear(), 0, 1)); return Math.ceil(((t0 - y0) / 86400000 + 1) / 7); })();
  const hasDay = /D/.test(fmt);
  const tokens = {
    YYYY: () => d.getFullYear(), YY: () => pad(d.getFullYear() % 100), Q: () => Math.floor(d.getMonth() / 3) + 1,
    MMMM: () => (hasDay ? monthGen("long") : month("long")), MMM: () => (hasDay ? monthGen("short") : month("short")).replace(/\.$/, ""),
    MM: () => pad(d.getMonth() + 1), M: () => d.getMonth() + 1,
    DDDD: () => pad(Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000), 3), DD: () => pad(d.getDate()), Do: () => (LANG === "ru" ? d.getDate() + "-е" : d.getDate() + (["th", "st", "nd", "rd"][((d.getDate() % 100) - 20) % 10] || ["th", "st", "nd", "rd"][d.getDate() % 100] || "th")), D: () => d.getDate(),
    dddd: () => wd("long"), ddd: () => wd("short"), dd: () => wd("narrow"), d: () => d.getDay(), E: () => d.getDay() || 7,
    WW: () => pad(week), W: () => week, ww: () => pad(week), w: () => week, gggg: () => d.getFullYear(), GGGG: () => d.getFullYear(),
    HH: () => pad(d.getHours()), H: () => d.getHours(), hh: () => pad(d.getHours() % 12 || 12), h: () => d.getHours() % 12 || 12,
    mm: () => pad(d.getMinutes()), m: () => d.getMinutes(), ss: () => pad(d.getSeconds()), s: () => d.getSeconds(),
    A: () => (d.getHours() < 12 ? "AM" : "PM"), a: () => (d.getHours() < 12 ? "am" : "pm"), X: () => Math.floor(d / 1000), x: () => +d,
  };
  const re = /\[([^\]]*)\]|YYYY|YY|Q|MMMM|MMM|MM|M|DDDD|DD|Do|D|dddd|ddd|dd|d|E|WW|W|ww|w|gggg|GGGG|HH|H|hh|h|mm|m|ss|s|A|a|X|x/g;
  return fmt.replace(re, (m, lit) => (lit !== undefined ? lit : String(tokens[m]())));
}

/* ---------- caret position inside a textarea (mirror element) */
function caretRect(ta, pos) {
  if (ta.cmView) {
    const c = ta.cmView.coordsAtPos(pos) || ta.cmView.coordsAtPos(pos, -1), r = ta.getBoundingClientRect();
    return c ? { left: c.left, top: c.top, height: c.bottom - c.top } : { left: r.left, top: r.top, height: parseFloat(getComputedStyle(ta).lineHeight) || 20 };
  }
  const cs = getComputedStyle(ta);
  const div = document.createElement("div");
  for (const p of ["boxSizing", "width", "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderLeftWidth", "borderRightWidth", "tabSize", "textTransform", "wordSpacing", "textIndent", "fontVariantLigatures"]) div.style[p] = cs[p];
  const nowrap = cs.whiteSpace === "pre";
  Object.assign(div.style, { position: "absolute", visibility: "hidden", whiteSpace: nowrap ? "pre" : "pre-wrap", overflowWrap: nowrap ? "normal" : "break-word", top: "0", left: "-9999px" });
  div.textContent = ta.value.slice(0, pos);
  const mark = document.createElement("span");
  mark.textContent = ta.value.slice(pos) || ".";
  div.append(mark);
  document.body.append(div);
  const r = ta.getBoundingClientRect();
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6;
  const out = { left: r.left + mark.offsetLeft - ta.scrollLeft, top: r.top + mark.offsetTop - ta.scrollTop, height: lh };
  div.remove();
  return out;
}

/* ---------- inline completion popup: [[links, #tags, /commands */
const ac = { el: null, ta: null, type: null, start: 0, items: [], sel: 0, query: "" };
function acClose() { ac.el?.remove(); ac.el = null; ac.type = null; ac.ta = null; }
function acDetect(ta) {
  if (ta.selectionStart !== ta.selectionEnd || editor.mode === "read") return null;
  const pos = ta.selectionStart;
  const before = ta.value.slice(Math.max(0, pos - 120), pos);
  const line = before.slice(before.lastIndexOf("\n") + 1);
  let m = /\[\[([^\[\]\n|#^]*)$/.exec(line);
  if (m) return { type: "link", start: pos - m[1].length - 2, query: m[1] };
  m = /(^|[\s(])#([\p{L}\p{N}_/-]*)$/u.exec(line);
  if (m && !/^#{1,6}$/.test(line.trim())) return { type: "tag", start: pos - m[2].length - 1, query: m[2] };
  m = /(^|\s)\/([\p{L}\p{N}-]{0,24})$/u.exec(line);
  if (m && editor.mode !== "source") return { type: "slash", start: pos - m[2].length - 1, query: m[2] };
  return null;
}
function slashCommands() {
  const L = (k) => wt(k);
  return [
    { id: "h1", title: L("c_h1"), icon: "heading-1", note: "#", keywords: "h1 heading title" },
    { id: "h2", title: L("c_h2"), icon: "heading-2", note: "##", keywords: "h2 heading" },
    { id: "h3", title: L("c_h3"), icon: "heading-3", note: "###", keywords: "h3 heading" },
    { id: "text", title: L("c_text"), icon: "pilcrow", keywords: "paragraph text plain" },
    { id: "bullet", title: L("c_bullet"), icon: "list", note: "-", keywords: "bullet list ul" },
    { id: "num", title: L("c_num"), icon: "list-ordered", note: "1.", keywords: "numbered ordered list ol" },
    { id: "task", title: L("c_task"), icon: "square-check", note: "[ ]", keywords: "task todo checkbox" },
    { id: "quote", title: L("c_quote"), icon: "quote", note: ">", keywords: "quote blockquote" },
    { id: "callout", title: L("c_callout"), icon: "message-square-warning", note: "> [!note]", keywords: "callout note tip warning admonition" },
    { id: "code", title: L("c_code"), icon: "code-2", note: "```", keywords: "code block snippet" },
    { id: "table", title: L("c_table"), icon: "table", note: "| |", keywords: "table grid" },
    { id: "divider", title: L("c_divider"), icon: "minus", note: "---", keywords: "divider hr rule line" },
    { id: "link", title: L("c_link"), icon: "link", note: "[[", keywords: "link wikilink card note" },
    { id: "image", title: L("c_image"), icon: "image-plus", keywords: "image picture photo file attach upload" },
    { id: "today", title: L("c_today"), icon: "calendar", note: formatMoment(new Date(), "YYYY-MM-DD"), keywords: "date today day" },
    { id: "now", title: L("c_now"), icon: "clock", note: formatMoment(new Date(), "HH:mm"), keywords: "time now clock" },
    { id: "template", title: L("c_template"), icon: "layout-template", keywords: "template snippet" },
  ];
}
function acItems(d) {
  const q = d.query.trim();
  if (d.type === "slash") return slashCommands().map((c) => ({ ...c, s: fuzzyScore(q, c.title + " " + c.keywords) })).filter((c) => c.s > 0).sort((a, b) => (q ? b.s - a.s : 0)).slice(0, 12);
  if (d.type === "tag") {
    const counts = new Map();
    for (const n of vault.notes.values()) for (const tg of n.tags) { const k = tg.slice(1); counts.set(k, (counts.get(k) || 0) + 1); }
    const cur = vault.notes.get(editor.path);
    if (cur) for (const tg of cur.tags) { const k = tg.slice(1); if (k === q) counts.set(k, (counts.get(k) || 1) - 1); }
    let list = [...counts].filter(([, n]) => n > 0).map(([k, n]) => ({ value: k, title: "#" + k, note: String(n), icon: "hash", s: fuzzyScore(q, k) })).filter((x) => x.s > 0);
    list.sort((a, b) => (q ? b.s - a.s : 0) || Number(b.note) - Number(a.note));
    list = list.slice(0, 10);
    if (q && !list.some((x) => x.value.toLowerCase() === q.toLowerCase())) list.push({ value: q, title: "#" + q, note: wt("newTag"), icon: "plus" });
    return list;
  }
  // links: cards and other notes, recent first when no query; headings with "Note#"
  const all = [...vault.notes.values()].map((n) => ({ value: n.path, title: n.name, note: dirName(n.path), icon: cardIcon(n.path) || "file-text", color: cardColor(n.path), mtime: n.mtime }));
  let list;
  if (!q) list = all.filter((x) => x.value !== editor.path).sort((a, b) => b.mtime - a.mtime).slice(0, 10);
  else list = all.map((x) => ({ ...x, s: fuzzyScore(q, x.title + " " + x.note) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.mtime - a.mtime).slice(0, 10);
  if (q && !all.some((x) => norm(x.title) === norm(q))) list.push({ create: q, title: q, note: wt("newNote"), icon: "file-plus" });
  return list;
}
function acUpdate(ta) {
  const d = acDetect(ta);
  if (!d) return acClose();
  const items = acItems(d);
  if (!items.length && d.type !== "link") return acClose();
  const same = ac.el && ac.type === d.type && ac.start === d.start;
  Object.assign(ac, { ta, type: d.type, start: d.start, query: d.query, items, sel: same ? Math.min(ac.sel, Math.max(0, items.length - 1)) : 0 });
  acRender();
}
function acRender() {
  if (!ac.el) { ac.el = h("div", { cls: "ac-pop", role: "listbox" }); document.body.append(ac.el); }
  const el = ac.el;
  el.replaceChildren();
  if (ac.type === "slash") el.append(h("div", { cls: "ac-head", text: "/" + (ac.query || "") }));
  if (!ac.items.length) el.append(h("div", { cls: "ac-empty", text: t("noResults") }));
  ac.items.forEach((it, i) => {
    const row = h("div", { cls: "ac-item" + (i === ac.sel ? " is-selected" : ""), role: "option" },
      ic("ac-icon", it.icon || "file-text", "file-text"), h("span", { cls: "ac-title", text: it.title }), it.note ? h("span", { cls: "ac-note", text: it.note }) : null);
    if (it.color) row.dataset.color = it.color;
    row.addEventListener("mousedown", (e) => { e.preventDefault(); ac.sel = i; acPick(); });
    row.addEventListener("mousemove", () => { if (ac.sel !== i) { ac.sel = i; el.querySelectorAll(".ac-item").forEach((r, j) => r.classList.toggle("is-selected", j === i)); } });
    el.append(row);
  });
  const r = caretRect(ac.ta, ac.start);
  const w = 300, hgt = Math.min(el.scrollHeight, 320);
  let left = Math.min(r.left, innerWidth - w - 8), top = r.top + r.height + 4;
  if (top + hgt > innerHeight - 8) top = Math.max(8, r.top - hgt - 4);
  Object.assign(el.style, { left: Math.max(8, left) + "px", top: top + "px" });
  el.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
}
/** Called first in the editor's keydown: true when the popup consumed the key. */
function acKey(e) {
  if (!ac.el) return false;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const n = ac.items.length;
    if (n) ac.sel = (ac.sel + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    acRender();
    return true;
  }
  if ((e.key === "Enter" || e.key === "Tab") && ac.items.length) { e.preventDefault(); acPick(); return true; }
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); acClose(); return true; }
  return false;
}
async function acPick() {
  const it = ac.items[ac.sel];
  const ta = ac.ta;
  const { type, start } = ac;
  acClose();
  if (!it || !ta) return;
  const end = ta.selectionStart;
  if (type === "link") {
    const target = it.create ? sanitizeTitle(it.create) : linkText(it.value);
    const close = ta.value.slice(end, end + 2) === "]]" ? 2 : 0;
    edInsert(ta, start, end + close, `[[${target}]]`);
    if (it.create && !resolveLink(target, editor.path)) createCard(target, null).then(() => {});
  } else if (type === "tag") {
    const after = ta.value[end];
    edInsert(ta, start, end, `#${it.value}` + (after === " " || after === "\t" ? "" : " "));
  } else {
    edInsert(ta, start, end, "");
    await runSlash(it.id, ta);
  }
}
async function runSlash(id, ta) {
  const s = ta.selectionStart;
  const v = ta.value;
  const ls = v.lastIndexOf("\n", s - 1) + 1;
  let le = v.indexOf("\n", s); if (le < 0) le = v.length;
  const line = v.slice(ls, le);
  const bare = line.replace(/^(\s*)(#{1,6} |[-*+] \[[ xX]\] |[-*+] |\d+[.)] |> )/, "$1");
  const setLine = (prefix) => { const ind = /^\s*/.exec(bare)[0]; const txt = ind + prefix + bare.slice(ind.length); edInsert(ta, ls, le, txt, ls + txt.length); };
  const insertBlock = (text, caretOffset) => {
    const pre = line.trim() ? "\n" : "";
    const at = line.trim() ? le : ls;
    const from = line.trim() ? le : ls, to = line.trim() ? le : le;
    edInsert(ta, from, to, pre + text, at + pre.length + caretOffset);
  };
  switch (id) {
    case "h1": return setLine("# ");
    case "h2": return setLine("## ");
    case "h3": return setLine("### ");
    case "text": return setLine("");
    case "bullet": return setLine("- ");
    case "num": return setLine("1. ");
    case "task": return setLine("- [ ] ");
    case "quote": return setLine("> ");
    case "callout": return insertBlock("> [!note] \n> ", 10);
    case "code": return insertBlock("```\n\n```\n", 4);
    case "table": { const tbl = `| ${t("untitled")} | |\n| --- | --- |\n|  |  |\n`; return insertBlock(tbl, 2); }
    case "divider": return insertBlock("---\n", 4);
    case "link": edInsert(ta, s, s, "[["); return acUpdate(ta);
    case "today": return edInsert(ta, s, s, formatMoment(new Date(), dailyConfig().format || "YYYY-MM-DD"));
    case "now": return edInsert(ta, s, s, formatMoment(new Date(), "HH:mm"));
    case "image": return pickAndAttach(ta);
    case "template": return insertTemplate(ta);
  }
}
async function insertTemplate(ta) {
  const pool = [...vault.notes.keys()].filter((p) => p !== editor.path && (!S.templatesFolder || p.startsWith(S.templatesFolder + "/")));
  if (!pool.length) { notice(wt("noTemplates")); return; }
  const caret = ta.selectionStart;
  const pick = await suggestModal({ placeholder: wt("pickTemplateInsert"), items: pool.map((p) => ({ value: p, title: baseName(p), icon: "layout-template", note: dirName(p) })) });
  ta.focus();
  if (!pick) return;
  const body = fillTemplate(vault.notes.get(pick.value).body.replace(/^\n+/, ""), baseName(editor.path), new Date());
  edInsert(ta, caret, caret, body);
}

/* ---------- pasted and dropped files are saved as attachments (Obsidian's "Files and links" settings) */
async function attachmentFolderFor(notePath) {
  let cfg = {};
  try { cfg = JSON.parse(await vault.fs.read(".obsidian/app.json")); } catch { /* defaults */ }
  const setting = (cfg.attachmentFolderPath ?? "/").trim();
  const here = dirName(notePath);
  if (setting === "/" || setting === "") return "";
  if (setting === "./" || setting === ".") return here;
  if (setting.startsWith("./")) return [here, setting.slice(2)].filter(Boolean).join("/").replace(/\/+$/, "");
  return setting.replace(/^\/+|\/+$/g, "");
}
async function saveAttachment(file, notePath, pasted) {
  const folder = await attachmentFolderFor(notePath);
  const ext = (file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".") + 1) : (file.type.split("/")[1] || "png").replace("jpeg", "jpg")).toLowerCase();
  const stem = pasted || !file.name ? `Pasted image ${formatMoment(new Date(), "YYYYMMDDHHmmss")}` : file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|#^[\]]/g, " ").trim() || "file";
  let path = (folder ? folder + "/" : "") + `${stem}.${ext}`, i = 1;
  while (vault.allPaths.has(path)) path = (folder ? folder + "/" : "") + `${stem} ${i++}.${ext}`;
  const buf = await file.arrayBuffer();
  await vault.fs.write(path, buf);
  vault.allPaths.add(path);
  vault.sizes.set(path, buf.byteLength);
  vault.mtimes.set(path, Date.now());
  addAttachment(path);
  syncHook("create", path);
  return path;
}
async function attachFiles(ta, files, pasted = false) {
  if (!editor.path || !files.length) return;
  let pos = ta.selectionStart, end = ta.selectionEnd;
  const parts = [];
  for (const f of files) {
    try {
      const p = await saveAttachment(f, editor.path, pasted);
      const name = p.split("/").pop();
      const unique = (vault.files.get(name.toLowerCase()) || []).length <= 1;
      const ref = unique ? name : p;
      parts.push(/^image\//.test(f.type) || IMG_EXT.test(p) || /\.pdf$/i.test(p) ? `![[${ref}]]` : `[[${ref}]]`);
      notice(wt("attached", { name }));
    } catch (e) { notice(wt("attachFailed", { name: f.name || "file", msg: e.message || e })); }
  }
  if (!parts.length) return;
  const v = ta.value;
  const block = parts.some((x) => x.startsWith("!"));
  // embeds go on their own line; plain file links stay inline
  const pre = pos > 0 && v[pos - 1] !== "\n" ? (block ? "\n" : v[pos - 1] === " " ? "" : " ") : "";
  const post = block && end < v.length && v[end] !== "\n" ? "\n" : "";
  edInsert(ta, pos, end, pre + parts.join(block ? "\n" : " ") + post);
  refresh({ keepEditor: true });
}
function pickAndAttach(ta) {
  const input = h("input", { type: "file", multiple: true, style: "display:none" });
  input.addEventListener("change", () => { attachFiles(ta, [...input.files]); input.remove(); });
  document.body.append(input);
  input.click();
}
function wireEditorFiles(ta) {
  ta.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    attachFiles(ta, files, files.every((f) => /^image\//.test(f.type) && (!f.name || f.name === "image.png")));
  });
  ta.addEventListener("dragover", (e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); ta.classList.add("is-file-over"); } });
  ta.addEventListener("dragleave", () => ta.classList.remove("is-file-over"));
  ta.addEventListener("drop", (e) => {
    ta.classList.remove("is-file-over");
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    ta.focus();
    attachFiles(ta, files);
  });
}

/* ---------- daily notes (Obsidian core plugin settings in .obsidian/daily-notes.json) */
let dailyCfg = null;
function dailyConfig() { return dailyCfg || { folder: "", format: "YYYY-MM-DD", template: "" }; }
async function loadDailyConfig() {
  dailyCfg = { folder: "", format: "YYYY-MM-DD", template: "" };
  try { Object.assign(dailyCfg, JSON.parse(await vault.fs.read(".obsidian/daily-notes.json"))); } catch { /* defaults */ }
  dailyCfg.folder = (dailyCfg.folder || "").replace(/^\/+|\/+$/g, "");
  dailyCfg.format = dailyCfg.format || "YYYY-MM-DD";
}
async function openToday() {
  if (!vault.fs) return;
  if (!dailyCfg) await loadDailyConfig();
  const cfg = dailyConfig();
  const now = new Date();
  const name = formatMoment(now, cfg.format);
  const path = (cfg.folder ? cfg.folder + "/" : "") + name + ".md";
  if (!vault.notes.has(path)) {
    let body = "";
    if (cfg.template) {
      const tp = resolveLink(cfg.template.replace(/\.md$/i, ""), "");
      if (tp && vault.notes.has(tp)) body = fillTemplate(vault.notes.get(tp).raw, name.split("/").pop(), now);
    }
    await txn(null, async () => { await writeRaw(path, body); return t("cardCreated", { name: name.split("/").pop() }); });
  }
  openEditor(path, { focus: true });
}

/* ---------- link hover preview (like Obsidian's page preview) */
const hp = { timer: null, el: null, for: null, hideTimer: null };
function hpHide() { clearTimeout(hp.timer); hp.el?.remove(); hp.el = null; hp.for = null; }
function hpTargetPath(a) {
  if (a.classList.contains("internal-link")) {
    const lp = extractLinkpath(`[[${a.dataset.href || a.textContent}]]`);
    const src = a.closest("[data-path]")?.dataset.path || editor.path || "";
    return resolveLink(lp, src);
  }
  if (a.classList.contains("sn-chip") && a.title && vault.notes.has(a.title)) return a.title;
  return null;
}
function hpShow(a, path) {
  const n = vault.notes.get(path);
  if (!n) return;
  hp.el?.remove();
  const body = h("div", { cls: "hp-body markdown-rendered" });
  const text = n.body.replace(/^\s+/, "");
  const cut = text.length > 1400 ? text.slice(0, text.lastIndexOf("\n", 1400) > 600 ? text.lastIndexOf("\n", 1400) : 1400) + "\n\n…" : text;
  renderMarkdown(cut || "", path, { into: body });
  wireRendered(body, path);
  const color = cardColor(path);
  const pop = h("div", { cls: "hp-pop" },
    h("div", { cls: "hp-head" }, ic("hp-icon", cardIcon(path) || "file-text", "file-text"), h("span", { cls: "hp-title", text: n.name }), h("span", { cls: "hp-path", text: dirName(path) })),
    text ? body : h("div", { cls: "hp-empty", text: t("emptyBody") }));
  if (color) pop.dataset.color = color;
  pop.addEventListener("mouseenter", () => clearTimeout(hp.hideTimer));
  pop.addEventListener("mouseleave", () => { hp.hideTimer = setTimeout(hpHide, 250); });
  pop.addEventListener("click", (e) => { if (!e.target.closest("a")) { hpHide(); openEditor(path, { focus: true }); } });
  document.body.append(pop);
  const r = a.getBoundingClientRect();
  const w = pop.offsetWidth, hh = pop.offsetHeight;
  let left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 6);
  Object.assign(pop.style, { left: left + "px", top: top + "px" });
  hp.el = pop; hp.for = a;
}
document.addEventListener("mouseover", (e) => {
  const a = e.target.closest?.("a.internal-link, a.sn-chip");
  if (!a || a === hp.for || dnd.drag || openMenuEl || matchMedia("(hover: none)").matches) return;
  const path = hpTargetPath(a);
  if (!path) return;
  clearTimeout(hp.timer); clearTimeout(hp.hideTimer);
  hp.timer = setTimeout(() => { if (a.isConnected && a.matches(":hover")) hpShow(a, path); }, 550);
  a.addEventListener("mouseleave", () => { clearTimeout(hp.timer); if (hp.for === a) hp.hideTimer = setTimeout(hpHide, 250); }, { once: true });
});
document.addEventListener("mousedown", (e) => { if (hp.el && !hp.el.contains(e.target)) hpHide(); }, true);
window.addEventListener("scroll", () => hpHide(), true);

/* ---------- outline of the open note */
function noteHeadings(text) {
  const out = [];
  let inCode = false, pos = 0;
  for (const line of text.split("\n")) {
    if (/^(```|~~~)/.test(line)) inCode = !inCode;
    const m = !inCode && /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2], offset: pos });
    pos += line.length + 1;
  }
  return out;
}
function outlineMenu(anchor) {
  const n = vault.notes.get(editor.path);
  if (!n) return;
  let ta = $(".sn-editor-text");
  const live = editor.mode === "edit" && editor.live;
  const text = live ? liveText() : ta ? ta.value : n.body;
  const hs = noteHeadings(text);
  const m = new Menu();
  if (!hs.length) m.add(wt("noHeadings"), null, null, { disabled: true });
  const min = Math.min(...hs.map((x) => x.level));
  hs.forEach((hd, i) => m.add(" ".repeat(hd.level - min) + hd.text, `heading-${Math.min(hd.level, 6)}`, () => {
    if (live) {
      liveActivate(hd.offset);
      const sc = $(".sn-editor-scroll"), lt = liveTa();
      if (sc && lt) sc.scrollTop += caretRect(lt, lt.selectionStart).top - sc.getBoundingClientRect().top - 60;
      editorModeline();
    } else if (ta) {
      ta.focus();
      ta.setSelectionRange(hd.offset, hd.offset);
      const r = caretRect(ta, hd.offset);
      const sc = $(".sn-editor-scroll");
      if (sc) sc.scrollTop += r.top - sc.getBoundingClientRect().top - 60;
      editorModeline();
    } else {
      $$("#editor .sn-reading :is(h1,h2,h3,h4,h5,h6)")[i]?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }));
  m.showBelow(anchor);
}

/* ---------- unlinked mentions: notes that name this note without linking it */
function unlinkedMentions(path) {
  const name = baseName(path);
  if (name.length < 3) return [];
  const back = new Set(graph.backlinksOf(path));
  const needle = norm(name);
  const out = [];
  for (const n of vault.notes.values()) {
    if (n.path === path || back.has(n.path)) continue;
    if (n.links.some((lp) => resolveLink(lp, n.path) === path)) continue;
    const body = norm(stripCode(n.body).replace(/\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)/g, " "));
    const i = body.indexOf(needle);
    if (i < 0) continue;
    const before = body[i - 1], after = body[i + needle.length];
    if ((before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after))) continue;
    out.push(n.path);
    if (out.length >= 20) break;
  }
  return out;
}
async function linkMention(source, target) {
  const n = vault.notes.get(source);
  if (!n) return;
  const name = baseName(target);
  const { fm, body } = splitNote(n.raw);
  // first plain occurrence outside code and existing links
  const masked = body.replace(CODE_RE, (m) => " ".repeat(m.length)).replace(/\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\)/g, (m) => " ".repeat(m.length));
  const nameN = name.replace(/ё/g, "е").replace(/Ё/g, "Е");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${nameN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu");
  const m = re.exec(masked.replace(/ё/gi, (c) => (c === "Ё" ? "Е" : "е")));
  if (!m) return;
  const found = body.slice(m.index, m.index + name.length);
  const link = found === name ? `[[${linkText(target)}]]` : `[[${linkText(target)}|${found}]]`;
  await txn(wt("linked", { name, note: baseName(source) }), () => writeRaw(source, fm + body.slice(0, m.index) + link + body.slice(m.index + name.length)));
}

/* ---------- tags in the sidebar */
function tagsSection(box) {
  const counts = new Map();
  for (const p of graph.nodes) for (const tg of cardTags(p)) counts.set(tg, (counts.get(tg) || 0) + 1);
  if (!counts.size) return;
  const open = UI.tagsOpen !== false;
  const head = h("div", { cls: "sn-tree-section is-toggle" + (open ? " is-open" : "") }, ic("sn-sec-caret", "chevron-down"), h("span", { text: wt("tagsSection") }), h("span", { cls: "sn-sec-count", text: String(counts.size) }));
  head.addEventListener("click", () => { UI.tagsOpen = !open; saveUI(); renderTree(); });
  box.append(head);
  if (!open) return;
  const wrap = h("div", { cls: "sn-tag-cloud" });
  for (const [tg, n] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 40)) {
    const on = board.tagView === tg;
    const b = h("button", { cls: "sn-tag-pill" + (on ? " is-on" : ""), type: "button", title: `#${tg} · ${n}` }, h("span", { text: "#" + tg }), h("span", { cls: "n", text: String(n) }));
    b.addEventListener("click", () => { if (on) goBack(); else openTagView(tg); });
    wrap.append(b);
  }
  box.append(wrap);
}

/* ---------- focus mode: only the note (or the board), no chrome */
function setFocusMode(on) {
  UI.focus = on;
  saveUI();
  $("#app")?.classList.toggle("focus-mode", on);
  if (on && editor.path && !editor.wide) { editor.wide = true; $("#app").classList.add("editor-wide"); renderEditor(); setTimeout(() => $(".sn-editor-text")?.focus(), 0); }
  if (!on && editor.wide && editor.focusWide) { editor.wide = false; $("#app").classList.remove("editor-wide"); renderEditor(); }
  editor.focusWide = on;
  for (const m of masonries) m.relayout(false);
  if (on) notice(wt("focusExit"));
}


