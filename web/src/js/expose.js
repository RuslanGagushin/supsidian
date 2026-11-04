// The tests (tests/harness.mjs) drive the page through its modules' exports: with window.__SN_EXPOSE__ set before
// the page loads, each export becomes a global that reads the live binding. Generated list — one line per module.
import * as m0 from "./i18n.js";
import * as m1 from "./dom.js";
import * as m2 from "./fs.js";
import * as m3 from "./frontmatter.js";
import * as m4 from "./graph.js";
import * as m5 from "./state.js";
import * as m6 from "./vault.js";
import * as m7 from "./save.js";
import * as m8 from "./actions.js";
import * as m9 from "./markdown.js";
import * as m10 from "./ui.js";
import * as m11 from "./board-model.js";
import * as m12 from "./masonry.js";
import * as m13 from "./cards.js";
import * as m14 from "./board.js";
import * as m15 from "./dnd.js";
import * as m16 from "./tree.js";
import * as m17 from "./editor.js";
import * as m18 from "./live-preview.js";
import * as m19 from "./tables.js";
import * as m20 from "./format-bar.js";
import * as m21 from "./shell.js";
import * as m22 from "./welcome.js";
import * as m23 from "./sync.js";
import * as m24 from "./completion.js";
import * as m25 from "./org.js";
import * as m26 from "./org-editing.js";
import * as m27 from "./agenda.js";
import * as m28 from "./files.js";
import * as m29 from "./native.js";
import * as m30 from "./updates.js";

export function exposeGlobals() {
  for (const ns of [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18, m19, m20, m21, m22, m23, m24, m25, m26, m27, m28, m29, m30]) {
    for (const k of Object.keys(ns)) Object.defineProperty(globalThis, k, { get: () => ns[k], configurable: true });
  }
}
