// scripts/web.mjs: puts the page into dist/ for Tauri, with pdf.js beside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const at = (p) => new URL("../" + p, import.meta.url);

test("dist/index.html is the page, pdf.js is next to it", () => {
  const out = execFileSync(process.execPath, ["scripts/web.mjs"], { cwd: app, encoding: "utf8" });
  assert.match(out, /dist\/index\.html ready/);
  // in the full repository the page comes from ../standalone; here it is web/supsidian.html
  const source = existsSync(at("../standalone/supsidian.html")) ? at("../standalone/supsidian.html") : at("web/supsidian.html");
  assert.ok(readFileSync(at("dist/index.html")).equals(readFileSync(source)));
  for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) assert.ok(existsSync(at("dist/pdfjs/" + f)), f);
});

test("the page loads pdf.js from ./pdfjs/ before the CDN, at the installed version", () => {
  const page = readFileSync(at("web/supsidian.html"), "utf8");
  const version = JSON.parse(readFileSync(at("node_modules/pdfjs-dist/package.json"), "utf8")).version;
  assert.match(page, new RegExp(`const PDFJS_VERSION = "${version.replace(/\./g, "\\.")}"`), "PDFJS_VERSION matches package.json's pdfjs-dist");
  assert.match(page, /\.\/pdfjs\//);
});
