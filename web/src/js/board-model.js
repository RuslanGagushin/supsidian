/* =========================================================
   Board model (port of src/views/board/model.ts)
   ========================================================= */
import { norm } from "./dom.js";
import { groupByTopLevel } from "./graph.js";
import { board, graph, S, vault } from "./state.js";
import { cardColor, cardTags, makeComparator } from "./vault.js";

export function filterActive(f) { return !!f.query.trim() || f.colors.length > 0 || f.tags.length > 0; }
export function computeModel() {
  const cmp = makeComparator(board.sort);
  const f = board.filter;
  const active = filterActive(f);
  // While searching, look through every level below the target (or the whole vault)
  const scopeTarget = active && f.scope === "all" ? null : board.target;
  const all = graph.collect(scopeTarget, active ? 0 : board.depth, cmp);
  const total = active || board.depth === 0 ? all.cards.length : graph.collect(board.target, 0, cmp).cards.length;
  const tokens = norm(f.query).split(/\s+/).filter(Boolean);
  const colorSet = new Set(f.colors), tagSet = new Set(f.tags);
  const visible = active ? all.cards.filter((c) => {
    if (colorSet.size && !colorSet.has(cardColor(c.path) ?? "none")) return false;
    if (tagSet.size && !cardTags(c.path).some((x) => tagSet.has(x))) return false;
    if (tokens.length) { const n = vault.notes.get(c.path); const txt = norm(n.name + "\n" + n.raw); if (!tokens.every((w) => txt.includes(w))) return false; }
    return true;
  }) : all.cards;
  const truncated = visible.length > S.maxCards;
  const shown = truncated ? visible.slice(0, S.maxCards) : visible;
  const blocks = [];
  if (board.grouped && board.depth !== 1 && !active) {
    const { loose, groups } = groupByTopLevel(shown);
    blocks.push({ head: null, cards: loose });
    for (const g of groups) blocks.push({ head: g.head.path, cards: [g.head, ...g.members] });
  } else blocks.push({ head: null, cards: shown });
  return { all, total, active, tokens, shown, truncated, blocks, cmp };
}

