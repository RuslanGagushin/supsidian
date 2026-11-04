/* =========================================================
   Board model (port of src/views/board/model.ts)
   ========================================================= */
import { norm } from "./util.js";
import { groupByTopLevel } from "./graph.js";

export function filterActive(f) { return !!f.query.trim() || f.colors.length > 0 || f.tags.length > 0; }
/**
 * The cards the board shows. `view` is the board's state ({ target, depth, grouped, filter }); `cards` says what the
 * vault knows of a card: cmp (sort order), colorOf(path), tagsOf(path), textOf(path) (searched), maxCards.
 */
export function computeModel(graph, view, { cmp, colorOf, tagsOf, textOf, maxCards }) {
  const f = view.filter;
  const active = filterActive(f);
  // While searching, look through every level below the target (or the whole vault)
  const scopeTarget = active && f.scope === "all" ? null : view.target;
  const all = graph.collect(scopeTarget, active ? 0 : view.depth, cmp);
  const total = active || view.depth === 0 ? all.cards.length : graph.collect(view.target, 0, cmp).cards.length;
  const tokens = norm(f.query).split(/\s+/).filter(Boolean);
  const colorSet = new Set(f.colors), tagSet = new Set(f.tags);
  const visible = active ? all.cards.filter((c) => {
    if (colorSet.size && !colorSet.has(colorOf(c.path) ?? "none")) return false;
    if (tagSet.size && !tagsOf(c.path).some((x) => tagSet.has(x))) return false;
    if (tokens.length) { const txt = norm(textOf(c.path)); if (!tokens.every((w) => txt.includes(w))) return false; }
    return true;
  }) : all.cards;
  const truncated = visible.length > maxCards;
  const shown = truncated ? visible.slice(0, maxCards) : visible;
  const blocks = [];
  if (view.grouped && view.depth !== 1 && !active) {
    const { loose, groups } = groupByTopLevel(shown);
    blocks.push({ head: null, cards: loose });
    for (const g of groups) blocks.push({ head: g.head.path, cards: [g.head, ...g.members] });
  } else blocks.push({ head: null, cards: shown });
  return { all, total, active, tokens, shown, truncated, blocks, cmp };
}
