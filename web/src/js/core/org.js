/* =========================================================
   Org-style TODOs and an Org-agenda for plain Markdown notes.
   No plugin format — the notes stay readable everywhere:

     ## TODO [#A] Write the report :work:
     SCHEDULED: <2026-10-29 Thu 10:00> DEADLINE: <2026-10-31 Sat -2d>

     - NEXT Call the plumber #home
       SCHEDULED: <2026-10-28 Wed +1w>
     - Dentist <2026-10-30 Fri 14:00-15:00>        ← a plain line with a date is an event
     - [ ] checkbox items count towards progress [2/5]

   Keywords: TODO NEXT WAIT | DONE CANCELLED (settings, or per note: `todo:` in frontmatter).
   Repeaters +1w ++1m .+2d, warnings -3d, CLOSED: [..] on done, tags :a:b: or #a, inherited
   from parent headings and the note's tags. `category:` in frontmatter names the agenda column.
   This module is the pure part: dates, timestamps, the line grammar, parsing a note into
   entries and the agenda's day lists. services/tasks.js applies it to the vault.
   ========================================================= */
import { tt } from "./i18n.js";
import { baseName } from "./util.js";
import { formatMoment } from "./dates.js";
import { stripCode, TAG_RE } from "./frontmatter.js";

const ODAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const opad = (n) => String(n).padStart(2, "0");
export const ohm = (min) => opad(Math.floor(min / 60)) + ":" + opad(min % 60);
export function onow() { const d = new Date(); return { dn: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5, min: d.getHours() * 60 + d.getMinutes() }; }
export const odn = (y, m, d) => Date.UTC(y, m - 1, d) / 864e5;
export function oymd(dn) { const d = new Date(dn * 864e5); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() }; }
const oDate = (dn) => { const o = oymd(dn); return new Date(o.y, o.m - 1, o.d); };
const odateStr = (dn) => { const o = oymd(dn); return `${o.y}-${opad(o.m)}-${opad(o.d)} ${ODAYS[o.w]}`; };
export function oisoWeek(dn) { const w = (oymd(dn).w + 6) % 7; const thu = dn - w + 3; const y = oymd(thu).y; const j4 = odn(y, 1, 4); const w1 = j4 - ((oymd(j4).w + 6) % 7); return 1 + Math.floor((thu - w1) / 7); }
export function oaddMonths(dn, n) { const o = oymd(dn); let mi = o.m - 1 + n; const y = o.y + Math.floor(mi / 12); mi = ((mi % 12) + 12) % 12; const last = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate(); return odn(y, mi + 1, Math.min(o.d, last)); }
function oaddUnit(dn, n, u) { switch (u) { case "w": return dn + 7 * n; case "m": return oaddMonths(dn, n); case "y": return oaddMonths(dn, 12 * n); case "h": return dn + Math.floor(n / 24); default: return dn + n; } }
const ounitDays = (n, u) => (u === "w" ? 7 * n : u === "m" ? 30 * n : u === "y" ? 365 * n : u === "h" ? Math.ceil(n / 24) : n);
export const oFmt = (dn, f) => formatMoment(oDate(dn), f);
const OTS_RE = () => /([<\[])(\d{4})-(\d{2})-(\d{2})([^>\]\n]*)([>\]])(?:--([<\[])(\d{4})-(\d{2})-(\d{2})([^>\]\n]*)([>\]]))?/g;
function orgMkTs(open, y, m, d, rest) {
  const ts = { active: open === "<", dn: odn(+y, +m, +d), time: null, end: null, rep: null, warn: null };
  for (const tok of String(rest || "").trim().split(/\s+/)) {
    let mm;
    if (!tok) continue;
    if ((mm = tok.match(/^(\d{1,2}):(\d{2})(?:-(\d{1,2}):(\d{2}))?$/))) { ts.time = +mm[1] * 60 + +mm[2]; if (mm[3]) ts.end = +mm[3] * 60 + +mm[4]; }
    else if ((mm = tok.match(/^(\.\+|\+\+|\+)(\d+)([hdwmy])$/))) ts.rep = { type: mm[1], n: +mm[2], u: mm[3] };
    else if ((mm = tok.match(/^(--?)(\d+)([hdwmy])$/))) ts.warn = { first: mm[1] === "--", n: +mm[2], u: mm[3] };
  }
  return ts;
}
export function orgTsParse(s) { const m = OTS_RE().exec(s || ""); return m ? orgMkTs(m[1], m[2], m[3], m[4], m[5]) : null; }
export function orgTsStr(ts) {
  let s = odateStr(ts.dn);
  if (ts.time != null) { s += " " + ohm(ts.time); if (ts.end != null) s += "-" + ohm(ts.end); }
  if (ts.rep) s += " " + ts.rep.type + ts.rep.n + ts.rep.u;
  if (ts.warn) s += " " + (ts.warn.first ? "--" : "-") + ts.warn.n + ts.warn.u;
  return ts.active ? "<" + s + ">" : "[" + s + "]";
}
export const orgNowTs = (active) => { const n = onow(); return orgTsStr({ active: !!active, dn: n.dn, time: n.min, end: null, rep: null, warn: null }); };
export function orgOccursOn(ts, dn) {
  if (dn === ts.dn) return true;
  if (!ts.rep || dn < ts.dn || ts.rep.n <= 0) return false;
  const { n, u } = ts.rep;
  if (u === "d" || u === "w") { const step = u === "w" ? 7 * n : n; return (dn - ts.dn) % step === 0; }
  if (u === "h") return true;
  let d = ts.dn, k = 0;
  while (d < dn && k < 3000) { k++; d = oaddUnit(ts.dn, n * k, u); }
  return d === dn;
}
const orgHasActive = (s) => /<\d{4}-\d{2}-\d{2}[^>\n]*>/.test(s);
const orgStripTs = (s) => s.replace(OTS_RE(), (m, o) => (o === "<" ? "" : m)).replace(/\s{2,}/g, " ").trim();
function orgStamps(text) {
  const out = [], re = OTS_RE();
  let m;
  while ((m = re.exec(text))) { if (m[1] === "<") out.push({ ts: orgMkTs(m[1], m[2], m[3], m[4], m[5]), endTs: m[7] ? orgMkTs(m[7], m[8], m[9], m[10], m[11]) : null }); }
  return out;
}
/** The date reader (minibuffer and capture): today, +3, -1w, ++2 (from the current date), fri, 2fri, 11-05, 5, 2026-11-05,
 *  nov 5, 5 nov, plus 14:00 or 2pm or 14:00-15:30, and a trailing repeater (+1w ++1m .+2d) or warning (-3d). */
const OMON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ORU_MON = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const OWD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ORU_WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
export function orgReadDate(str, base) {
  const T = onow().dn;
  if (base == null) base = T;
  let s = String(str).trim().toLowerCase().replace(/ё/g, "е");
  let time = null, end = null, rep = null, warn = null, m;
  for (let guard = 0; guard < 2; guard++) {
    if ((m = s.match(/\s(\.\+|\+\+|\+)(\d+)([hdwmy])$/)) && s.slice(0, m.index).trim()) { rep = { type: m[1], n: +m[2], u: m[3] }; s = s.slice(0, m.index).trim(); }
    if ((m = s.match(/\s(--?)(\d+)([hdwmy])$/)) && s.slice(0, m.index).trim()) { warn = { first: m[1] === "--", n: +m[2], u: m[3] }; s = s.slice(0, m.index).trim(); }
  }
  if ((m = s.match(/(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?/))) { time = +m[1] * 60 + +m[2]; if (m[3]) end = +m[3] * 60 + +m[4]; s = s.replace(m[0], " ").trim(); }
  else if ((m = s.match(/\b(\d{1,2})\s*(am|pm)\b/))) { let hh = +m[1] % 12; if (m[2] === "pm") hh += 12; time = hh * 60; s = s.replace(m[0], " ").trim(); }
  if (time != null && (time >= 1440 || (end != null && end >= 1440))) return null;
  const wdIndex = (w) => { let i = OWD.findIndex((x) => w.startsWith(x)); if (i < 0) i = ORU_WD.findIndex((x) => w.startsWith(x)); return i; };
  const monIndex = (w) => { let i = OMON.findIndex((x) => w.startsWith(x)); if (i < 0) i = ORU_MON.findIndex((x) => w.startsWith(x.slice(0, 3))); return i; };
  let dn;
  if (!s || s === "." || s === "today" || s === "сегодня") dn = s ? T : base;
  else if (s === "tomorrow" || s === "завтра") dn = T + 1;
  else if (s === "yesterday" || s === "вчера") dn = T - 1;
  else if ((m = s.match(/^([+-]{1,2})\s*(\d+)\s*([dwmyдн]?)$/))) { const u = { "д": "d", "н": "w" }[m[3]] || m[3] || "d"; const n = +m[2] * (m[1][0] === "-" ? -1 : 1); dn = oaddUnit(m[1].length === 2 ? base : T, n, u); }
  else if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) dn = odn(+m[1], +m[2], +m[3]);
  else if ((m = s.match(/^(\d{1,2})[-.\/](\d{1,2})$/))) { const y = oymd(T).y; const [mo, d] = s.includes(".") ? [+m[2], +m[1]] : [+m[1], +m[2]]; dn = odn(y, mo, d); if (dn < T) dn = odn(y + 1, mo, d); }
  else if ((m = s.match(/^(\d{1,2})$/))) { const o = oymd(T); dn = odn(o.y, o.m, +m[1]); if (dn < T) dn = oaddMonths(odn(o.y, o.m, 1), 1) + (+m[1] - 1); }
  else if ((m = s.match(/^(\d?)\s*([a-zа-я]{2,})$/)) && wdIndex(m[2]) >= 0 && monIndex(m[2]) < 0) { const wd = wdIndex(m[2]); let d = T; while (oymd(d).w !== wd) d++; const k = parseInt(m[1], 10); if (k > 1) d += (k - 1) * 7; dn = d; }
  else if ((m = s.match(/^([a-zа-я]{3,})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/)) || (m = s.match(/^(\d{1,2})\s+([a-zа-я]{3,})\.?(?:\s+(\d{4}))?$/))) {
    let mon, d;
    if (/^\d/.test(m[1])) { d = +m[1]; mon = monIndex(m[2]); } else { mon = monIndex(m[1]); d = +m[2]; }
    if (mon < 0) return null;
    const y = m[3] ? +m[3] : oymd(T).y;
    dn = odn(y, mon + 1, d);
    if (!m[3] && dn < T) dn = odn(y + 1, mon + 1, d);
  } else return null;
  if (!Number.isFinite(dn)) return null;
  return { dn, time, end, rep, warn };
}
export const ORG_DEFAULT_KW = "TODO NEXT WAIT | DONE CANCELLED";
const orgKwCache = new Map();
export function orgParseKw(str) {
  if (orgKwCache.has(str)) return orgKwCache.get(str);
  const clean = (x) => x.trim().split(/[\s,]+/).filter(Boolean).map((w) => w.replace(/\(.*\)$/, ""));
  const parts = String(str).split("|");
  const todo = clean(parts[0] || "");
  let done = parts.length > 1 ? clean(parts[1]) : [];
  if (parts.length < 2 && todo.length > 1) done = [todo.pop()];
  const set = todo.length || done.length ? { todo, done, all: [...todo, ...done] } : orgParseKw(ORG_DEFAULT_KW);
  orgKwCache.set(str, set);
  return set;
}
/** The TODO keywords of a note: its frontmatter `todo:`, else `fallback` (the settings). */
export function orgSet(note, fallback = ORG_DEFAULT_KW) {
  const v = note?.fm?.todo ?? note?.fm?.TODO;
  const s = Array.isArray(v) ? v.join(" ") : typeof v === "string" && v.trim() ? v : fallback || ORG_DEFAULT_KW;
  return orgParseKw(s);
}
export function orgKwClass(kw, set) {
  if (!kw) return "";
  if (set.done.includes(kw)) return /^(CANCEL|KILL|ОТМЕН)/i.test(kw) ? "cancel" : "done";
  if (/^(NEXT|STARTED|DOING|PROG|IN-PROGRESS|СЕЙЧАС|ДЕЛАЮ)/i.test(kw)) return "next";
  if (kw === set.todo[0] || /^TODO$/i.test(kw)) return "todo";
  return "wait";
}
const OHEAD_RE = /^(#{1,6})([ \t]+)(.*)$/;
const OITEM_RE = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)(?:\[([ xX\/-])\](?:[ \t]+|$))?(.*)$/;
export const OPLAN_RE = /^[ \t]*(SCHEDULED|DEADLINE|CLOSED):/;
export const oIndentW = (s) => s.replace(/\t/g, "    ").length;
export function orgLine(line) {
  if (line == null) return null;
  line = line.replace(/\r$/, "");
  let m = OHEAD_RE.exec(line);
  if (m) return { type: "h", level: m[1].length, indent: 0, prefix: m[1] + " ", box: null, rest: m[3], cont: "" };
  m = OITEM_RE.exec(line);
  if (m) {
    const box = m[4] ?? null;
    return { type: "li", level: 0, indent: oIndentW(m[1]), prefix: m[1] + m[2] + " " + (box != null ? `[${box}] ` : ""), box, rest: m[5], cont: m[1] + " ".repeat(m[2].length + 1), lead: m[1], marker: m[2] };
  }
  return null;
}
export function orgHead(rest, set) {
  const o = { kw: null, pri: null, title: "", tags: [] };
  rest = String(rest || "").replace(/\s+$/, "");
  let mm = rest.match(/^(\S+)(?:[ \t]+|$)([\s\S]*)$/);
  if (mm && set.all.includes(mm[1])) { o.kw = mm[1]; rest = mm[2]; }
  mm = rest.match(/^\[#([A-Z0-9])\](?:[ \t]+|$)([\s\S]*)$/);
  if (mm) { o.pri = mm[1]; rest = mm[2]; }
  mm = rest.match(/^([\s\S]*?)(?:^|[ \t]+)(:(?:[\p{L}\p{N}_@#%-]+:)+)$/u);
  if (mm) { o.tags = mm[2].split(":").filter(Boolean); rest = mm[1]; }
  o.title = rest.trim();
  return o;
}
export function orgBuild(info, o) {
  let s = info.prefix;
  const parts = [];
  if (o.kw) parts.push(o.kw);
  if (o.pri) parts.push(`[#${o.pri}]`);
  if (o.title) parts.push(o.title);
  if (o.tags?.length) parts.push(":" + o.tags.join(":") + ":");
  return s + parts.join(" ");
}
export function orgPlanMap(line) {
  const map = {}, re = /(SCHEDULED|DEADLINE|CLOSED):[ \t]*([<\[][^>\]\n]*[>\]])/g;
  let m;
  while ((m = re.exec(line || ""))) map[m[1]] = m[2];
  return map;
}
export function orgSetPlanning(lines, li, key, val) {
  const info = orgLine(lines[li]);
  const pl = li + 1;
  const has = pl < lines.length && OPLAN_RE.test(lines[pl]);
  const map = has ? orgPlanMap(lines[pl]) : {};
  if (val == null) delete map[key]; else map[key] = val;
  const parts = ["CLOSED", "DEADLINE", "SCHEDULED"].filter((k) => map[k]).map((k) => `${k}: ${map[k]}`);
  const ind = has ? /^[ \t]*/.exec(lines[pl])[0] : info?.cont || "";
  if (!parts.length) { if (has) lines.splice(pl, 1); return; }
  const txt = ind + parts.join(" ");
  if (has) lines[pl] = txt; else lines.splice(pl, 0, txt);
}
function orgShiftRep(ts) {
  const r = ts.rep, T = onow().dn;
  let n = ts.dn;
  if (r.type === "+") n = oaddUnit(n, r.n, r.u);
  else if (r.type === "++") { let k = 0; do { n = oaddUnit(n, r.n, r.u); k++; } while (n <= T && k < 5000); }
  else n = oaddUnit(T, r.n, r.u);
  return { ...ts, dn: n };
}
/** Repeating entries move to their next date instead of closing. Returns the message or null. */
function orgRepeat(lines, li) {
  const plan = li + 1 < lines.length && OPLAN_RE.test(lines[li + 1]) ? orgPlanMap(lines[li + 1]) : {};
  const s = plan.SCHEDULED && orgTsParse(plan.SCHEDULED), d = plan.DEADLINE && orgTsParse(plan.DEADLINE);
  if (!(s?.rep || d?.rep)) return null;
  const ns = s?.rep ? orgShiftRep(s) : null, nd = d?.rep ? orgShiftRep(d) : null;
  if (nd) orgSetPlanning(lines, li, "DEADLINE", orgTsStr(nd));
  if (ns) orgSetPlanning(lines, li, "SCHEDULED", orgTsStr(ns));
  return tt("repeats", { when: ns ? "SCHEDULED: " + orgTsStr(ns) : "DEADLINE: " + orgTsStr(nd) });
}
export function orgSetState(lines, li, kw, set) {
  const info = orgLine(lines[li]);
  if (!info) return null;
  const o = orgHead(info.rest, set);
  const from = o.kw;
  const wasDone = set.done.includes(from), isDone = set.done.includes(kw);
  o.kw = kw;
  lines[li] = orgBuild(info, o);
  let msg = kw ? tt("stateTo", { kw }) : tt("kwRemoved");
  if (isDone && !wasDone) {
    const r = orgRepeat(lines, li);
    if (r) { o.kw = from && !set.done.includes(from) ? from : set.todo[0]; lines[li] = orgBuild(info, o); msg = r; }
    else orgSetPlanning(lines, li, "CLOSED", orgNowTs());
  } else if (!isDone && wasDone) orgSetPlanning(lines, li, "CLOSED", null);
  return msg;
}
export function orgSetBox(lines, li, checked) {
  const info = orgLine(lines[li]);
  if (!info || info.box == null) return null;
  const set = (ch) => { lines[li] = info.lead + info.marker + " " + `[${ch}]` + (info.rest ? " " + info.rest : " "); };
  if (checked) {
    const r = orgRepeat(lines, li);
    if (r) return r;
    set("x");
    if (li + 1 < lines.length && OPLAN_RE.test(lines[li + 1])) orgSetPlanning(lines, li, "CLOSED", orgNowTs());
    return tt("stateTo", { kw: "[x]" });
  }
  set(" ");
  if (li + 1 < lines.length && OPLAN_RE.test(lines[li + 1])) orgSetPlanning(lines, li, "CLOSED", null);
  return tt("stateTo", { kw: "[ ]" });
}
export function orgNextKw(set, kw, dir) { const seq = [null, ...set.all]; let i = seq.indexOf(kw); if (i < 0) i = 0; return seq[(i + dir + seq.length) % seq.length]; }
export function orgSetPriority(lines, li, set, dir, explicit) {
  const info = orgLine(lines[li]);
  if (!info) return null;
  const o = orgHead(info.rest, set);
  let p;
  if (explicit !== undefined) p = explicit;
  else if (dir > 0) p = o.pri == null ? "A" : o.pri === "A" ? null : String.fromCharCode(o.pri.charCodeAt(0) - 1);
  else p = o.pri == null ? "C" : o.pri === "C" ? null : String.fromCharCode(o.pri.charCodeAt(0) + 1);
  o.pri = p;
  lines[li] = orgBuild(info, o);
  return p ? tt("priTo", { p }) : tt("priRemoved");
}
export function orgSetTags(lines, li, set, tags) {
  const info = orgLine(lines[li]);
  if (!info) return null;
  const o = orgHead(info.rest, set);
  o.tags = tags;
  lines[li] = orgBuild(info, o);
  return tags.length ? tt("tagsSet") : tt("tagsRemoved");
}
/** Move a date by n days: SCHEDULED / DEADLINE on the planning line, else the first active timestamp on the line. */
export function orgShift(lines, li, kind, days) {
  const key = kind === "dead" ? "DEADLINE" : kind === "sched" ? "SCHEDULED" : null;
  if (key) {
    const map = li + 1 < lines.length && OPLAN_RE.test(lines[li + 1]) ? orgPlanMap(lines[li + 1]) : {};
    const ts = orgTsParse(map[key]);
    if (!ts) return null;
    const n = orgTsStr({ ...ts, dn: ts.dn + days });
    orgSetPlanning(lines, li, key, n);
    return tt("planSet", { key, ts: n });
  }
  const m = /<(\d{4})-(\d{2})-(\d{2})([^>\n]*)>/.exec(lines[li]);
  if (!m) return null;
  const ts = orgMkTs("<", m[1], m[2], m[3], m[4]);
  ts.dn += days;
  lines[li] = lines[li].replace(m[0], orgTsStr(ts));
  return tt("stampTo", { ts: orgTsStr(ts) });
}
export const orgCache = new Map();
export function orgParse(note, set = orgSet(note)) {
  const c = orgCache.get(note.path);
  if (c && c.raw === note.raw && c.set === set) return c.list;
  const lines = note.raw.split("\n");
  const ftRaw = note.fm?.tags;
  const fileTags = (Array.isArray(ftRaw) ? ftRaw : typeof ftRaw === "string" ? ftRaw.split(/[,\s]+/) : []).map((x) => String(x).replace(/^#/, "")).filter(Boolean);
  const category = String(note.fm?.category || note.name || baseName(note.path));
  const list = [];
  let i = 0;
  if (/^---\s*$/.test(lines[0] || "")) { for (i = 1; i < lines.length; i++) if (/^(---|\.\.\.)\s*$/.test(lines[i])) { i++; break; } }
  const hstack = [], istack = [];
  let inCode = false, last = null, plainHead = null;
  const closeItems = (minIndent, at) => { while (istack.length && istack[istack.length - 1].indent >= minIndent) { const x = istack.pop(); if (x.entry) x.entry.secEnd = at; } };
  const owner = () => {
    for (let k = istack.length - 1; k >= 0; k--) if (istack[k].entry?.kw) return istack[k].entry;
    for (let k = hstack.length - 1; k >= 0; k--) if (hstack[k].entry?.kw) return hstack[k].entry;
    return null;
  };
  const mk = (kind, info, o, li) => {
    const anc = [...fileTags];
    for (const x of hstack) anc.push(...x.tags);
    for (const x of istack) anc.push(...x.tags);
    const inline = [...stripCode(o.title).matchAll(TAG_RE)].map((x) => x[2]);
    const all = [], seen = new Set();
    for (const tg of [...anc, ...o.tags, ...inline]) { const k = tg.toLowerCase(); if (!seen.has(k)) { seen.add(k); all.push(tg); } }
    const own = new Set([...o.tags, ...inline].map((x) => x.toLowerCase()));
    const e = {
      key: note.path + "\u0000" + li, path: note.path, line: li, raw: lines[li], kind, level: info?.level || 0, indent: info?.indent || 0,
      kw: o.kw, pri: o.pri, title: orgStripTs(o.title) || o.title, fullTitle: o.title, tags: o.tags, alltags: all, inherited: all.filter((x) => !own.has(x.toLowerCase())),
      set, category, done: set.done.includes(o.kw), cls: orgKwClass(o.kw, set), isTodo: !!o.kw, box: null,
      sched: null, dead: null, closed: null, stamps: orgStamps(o.title), cbTotal: 0, cbDone: 0, secEnd: lines.length,
      outline: hstack.map((x) => x.title).filter(Boolean),
    };
    list.push(e);
    return e;
  };
  for (; i < lines.length; i++) {
    const L = lines[i].replace(/\r$/, "");
    if (/^\s*(```|~~~)/.test(L)) { inCode = !inCode; last = null; continue; }
    if (inCode) continue;
    if (!last && plainHead && plainHead.li === i - 1 && OPLAN_RE.test(L)) {
      last = mk(plainHead.info.type === "h" ? "hl" : "item", plainHead.info, plainHead.o, plainHead.li);
      if (plainHead.slot) plainHead.slot.entry = last;
    }
    if (last && last.line === i - 1 && OPLAN_RE.test(L)) {
      const map = orgPlanMap(L);
      last.sched = orgTsParse(map.SCHEDULED); last.dead = orgTsParse(map.DEADLINE); last.closed = orgTsParse(map.CLOSED);
      last.planLine = i;
      continue;
    }
    last = null; plainHead = null;
    if (!L.trim()) continue;
    const info = orgLine(L);
    if (info?.type === "h") {
      closeItems(0, i);
      while (hstack.length && hstack[hstack.length - 1].level >= info.level) { const x = hstack.pop(); if (x.entry) x.entry.secEnd = i; }
      const o = orgHead(info.rest, set);
      const e = o.kw ? mk("hl", info, o, i) : orgHasActive(o.title) ? mk("event", info, o, i) : null;
      const slot = { level: info.level, tags: o.tags, title: orgStripTs(o.title), entry: e };
      hstack.push(slot);
      last = e;
      if (!e) plainHead = { info, o, li: i, slot };
      continue;
    }
    if (info?.type === "li") {
      closeItems(info.indent, i);
      const o = orgHead(info.rest, set);
      let e = null;
      if (info.box != null && !o.kw) {
        const own = owner();
        if (own) { own.cbTotal++; if (/[xX]/.test(info.box)) own.cbDone++; }
        e = mk("box", info, o, i);
        e.box = info.box; e.isTodo = true; e.nested = !!own;
        e.done = /[xX-]/.test(info.box); e.cls = info.box === "-" ? "cancel" : e.done ? "done" : "todo";
      } else if (o.kw) e = mk("item", info, o, i);
      else if (orgHasActive(o.title)) e = mk("event", info, o, i);
      const slot = { indent: info.indent, tags: o.tags, entry: e };
      istack.push(slot);
      last = e;
      if (!e) plainHead = { info, o, li: i, slot };
      continue;
    }
    const ind = oIndentW(/^[ \t]*/.exec(L)[0]);
    if (istack.length && ind <= istack[istack.length - 1].indent) closeItems(ind, i);
    if (orgHasActive(L)) mk("event", null, { ...orgHead(L.trim(), { all: [] }), kw: null, pri: null }, i);
  }
  orgCache.set(note.path, { raw: note.raw, set, list });
  return list;
}
export const orgSkip = (e) => e.alltags.some((x) => x.toUpperCase() === "ARCHIVE");
export function orgStats(all) {
  const T = onow().dn;
  let open = 0, overdue = 0, today = 0;
  for (const e of all) {
    if (orgSkip(e) || e.done || e.kind === "event" || (e.kind === "box" && !e.sched && !e.dead)) continue;
    if (e.isTodo) open++;
    const d = Math.min(e.dead?.active ? e.dead.dn : Infinity, e.sched?.active ? e.sched.dn : Infinity);
    if (d < T) overdue++; else if (d === T) today++;
  }
  return { open, overdue, today };
}
export const orgPriRank = (e) => (e.pri ? 4 - Math.min(3, e.pri.charCodeAt(0) - 64) : 2);
const orgWarnDays = (ts) => (ts.warn ? ounitDays(ts.warn.n, ts.warn.u) : 14);
/** The agenda lines of day `dn` (today is T); `log` adds the entries closed that day. */
export function orgDayEntries(dn, all, T, { log = false } = {}) {
  const out = [];
  for (const e of all) {
    if (orgSkip(e)) continue;
    const push = (kind, label, ts, x) => out.push({ e, kind, label, dn, time: ts?.time ?? null, end: ts?.end ?? null, rank: 5, ...x });
    const d = e.dead;
    if (d?.active) {
      if (orgOccursOn(d, dn) && (dn === d.dn || (dn >= T && !e.done))) push("dead", tt("lDeadline"), d, { rank: 1 });
      else if (dn === T && !e.done) { const diff = d.dn - T; if (diff < 0) push("dead", tt("lAgo", { n: -diff }), null, { overdue: true, rank: 0 }); else if (diff > 0 && diff <= orgWarnDays(d)) push("dead", tt("lIn", { n: diff }), null, { rank: 2, soon: diff }); }
    }
    const s = e.sched;
    if (s?.active) {
      if (orgOccursOn(s, dn) && (dn === s.dn || (dn >= T && !e.done))) push("sched", tt("lScheduled"), s, { rank: 3 });
      else if (dn === T && !e.done && s.dn < T) push("sched", tt("lSchedX", { n: T - s.dn + 1 }), null, { overdue: true, rank: 4 });
    }
    for (const st of e.stamps) {
      const a = st.ts, b = st.endTs;
      if (b) { if (dn >= a.dn && dn <= b.dn) push("ts", `(${dn - a.dn + 1}/${b.dn - a.dn + 1}):`, dn === a.dn ? a : dn === b.dn && b.time != null ? { time: b.time } : null, { rank: 5 }); }
      else if (orgOccursOn(a, dn) && (dn === a.dn || dn >= T)) push("ts", "", a, { rank: 5 });
    }
    if (log && e.closed && e.closed.dn === dn) push("closed", tt("lClosed"), e.closed, { rank: 6 });
  }
  out.sort((a, b) => {
    const at = a.time != null, bt = b.time != null;
    if (at !== bt) return at ? -1 : 1;
    if (at && a.time !== b.time) return a.time - b.time;
    return a.rank - b.rank || orgPriRank(b.e) - orgPriRank(a.e) || (a.soon || 0) - (b.soon || 0);
  });
  return out;
}
export function orgWithGrid(ents) {
  const timed = ents.filter((x) => x.time != null), untimed = ents.filter((x) => x.time == null);
  const rows = [...timed];
  for (const g of [8, 10, 12, 14, 16, 18, 20].map((x) => x * 60)) if (!timed.some((x) => x.time === g)) rows.push({ grid: true, time: g });
  rows.push({ grid: true, now: true, time: onow().min });
  rows.sort((a, b) => a.time - b.time || (a.grid ? 1 : 0) - (b.grid ? 1 : 0) || (a.now ? 1 : 0) - (b.now ? 1 : 0));
  return [...rows, ...untimed];
}
