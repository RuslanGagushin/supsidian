/* =========================================================
   App state
   ========================================================= */
import { lsGet, lsSet } from "./dom.js";
import { HierarchyGraph } from "./graph.js";

export const DEFAULTS = {
  pinned: [], savedViews: [], language: "auto", parentsField: "parents", cardsFolder: "", onlyCardsFolder: false,
  templatesFolder: "", defaultDepth: 1, defaultLayout: "columns", defaultSort: "manual", defaultGrouped: false,
  outlineSort: "manual", previewLength: 600, cardMaxHeight: 360, maxCards: 1000,
};
export const UI = Object.assign({ theme: "auto", sideW: 280, editorW: 560, sideOpen: true, lang: "auto" }, lsGet("sn-ui", {}));
delete UI.style; delete UI.font; // retired settings
export const saveUI = () => lsSet("sn-ui", UI);

export const vault = {
  fs: null,
  notes: new Map(), // path -> note
  byName: new Map(), // lower basename -> [md paths]
  files: new Map(), // lower filename -> [paths] (attachments)
  allPaths: new Set(),
  sizes: new Map(), // path -> bytes (for the sync size limit)
  mtimes: new Map(), // attachment path -> last modified (for the Files view)
  pluginData: null, // parsed data.json (null — no plugin folder)
  hasObsidian: false,
};
export const S = { ...DEFAULTS }; // card settings (shared with the plugin when possible)
/** Settings of a newly opened vault: the defaults, then `saved`. */
export function resetSettings(saved) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, DEFAULTS, saved); }
export let graph = new HierarchyGraph();
export const setGraph = (g) => { graph = g; };
export const board = {
  target: null, depth: 1, layout: "columns", sort: "manual", grouped: false,
  filter: { query: "", colors: [], tags: [] }, searchOpen: false, heroCollapsed: false,
  history: [], selection: new Set(), selectMode: false, expanded: new Set(), rendered: 60,
};
export const tree = { expanded: new Set() };
export const editor = { path: null, mode: "edit", dirty: false, saving: false, wide: false, propsCollapsed: true };
export const undoStack = [];

