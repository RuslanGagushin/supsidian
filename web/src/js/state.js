/* =========================================================
   App state
   ========================================================= */
const DEFAULTS = {
  pinned: [], savedViews: [], language: "auto", parentsField: "parents", cardsFolder: "", onlyCardsFolder: false,
  templatesFolder: "", defaultDepth: 1, defaultLayout: "columns", defaultSort: "manual", defaultGrouped: false,
  outlineSort: "manual", previewLength: 600, cardMaxHeight: 360, maxCards: 1000,
};
const UI = Object.assign({ theme: "auto", sideW: 280, editorW: 560, sideOpen: true, lang: "auto" }, lsGet("sn-ui", {}));
delete UI.style; delete UI.font; // retired settings
const saveUI = () => lsSet("sn-ui", UI);

const vault = {
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
const S = { ...DEFAULTS }; // card settings (shared with the plugin when possible)
/** Settings of a newly opened vault: the defaults, then `saved`. */
function resetSettings(saved) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, DEFAULTS, saved); }
let graph = new HierarchyGraph();
const setGraph = (g) => { graph = g; };
const board = {
  target: null, depth: 1, layout: "columns", sort: "manual", grouped: false,
  filter: { query: "", colors: [], tags: [] }, searchOpen: false, heroCollapsed: false,
  history: [], selection: new Set(), selectMode: false, expanded: new Set(), rendered: 60,
};
const tree = { expanded: new Set() };
const editor = { path: null, mode: "edit", dirty: false, saving: false, wide: false, propsCollapsed: true };
const undoStack = [];

