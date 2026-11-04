/* Supstack Standalone — Supernotes-style cards for an Obsidian vault, in one HTML file.
   Port of the Supsidian plugin: the same frontmatter model (parents / child_order / order /
   color / icon / child_template), the same board, tree, drag & drop, multi-select and undo.
   Entry point: scripts/page.mjs bundles it (esbuild) into the page; modules run in this order. */
import "./i18n.js";
import "./dom.js";
import "./fs.js";
import "./frontmatter.js";
import "./graph.js";
import "./state.js";
import "./vault.js";
import "./save.js";
import "./actions.js";
import "./markdown.js";
import "./ui.js";
import "./board-model.js";
import "./masonry.js";
import "./cards.js";
import "./board.js";
import "./dnd.js";
import "./tree.js";
import "./editor.js";
import "./live-preview.js";
import "./tables.js";
import "./format-bar.js";
import "./keyboard.js";
import "./shell.js";
import "./welcome.js";
import "./sync.js";
import "./completion.js";
import "./org.js";
import "./org-editing.js";
import "./agenda.js";
import "./files.js";
import "./native.js";
import "./updates.js";
import { exposeGlobals } from "./expose.js";

if (window.__SN_EXPOSE__) exposeGlobals();
