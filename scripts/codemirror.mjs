// Bundles CodeMirror 6 (scripts/codemirror-entry.js) into web/supsidian.html as an inline script that sets window.CM.
// Run after changing the entry or the @codemirror/@lezer versions: npm run codemirror
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = join(app, "web", "supsidian.html");
const out = await build({ entryPoints: [join(app, "scripts", "codemirror-entry.js")], bundle: true, minify: true, format: "iife", globalName: "CM", target: "es2020", write: false, legalComments: "none" });
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const versions = ["@codemirror/state", "@codemirror/view", "@codemirror/commands", "@codemirror/language", "@lezer/markdown"].map((p) => `${p} ${JSON.parse(readFileSync(join(app, "node_modules", p, "package.json"))).version}`).join(", ");
const block = `<!-- codemirror:start -->\n<script>/*! CodeMirror 6 (MIT) · ${versions} · bundled by scripts/codemirror.mjs */\n${js}</script>\n<!-- codemirror:end -->`;
let html = readFileSync(page, "utf8");
const re = /<!-- codemirror:start -->[\s\S]*?<!-- codemirror:end -->/;
if (re.test(html)) html = html.replace(re, () => block);
else {
  // first run: before the page's own script, after the bundled libraries
  const at = html.indexOf("<script>\n/* Supsidian Standalone");
  if (at < 0) throw new Error("couldn't find where the page's own script starts");
  html = html.slice(0, at) + block + "\n" + html.slice(at);
}
writeFileSync(page, html);
console.log(`CodeMirror: ${(js.length / 1024).toFixed(0)} KB into web/supsidian.html`);
