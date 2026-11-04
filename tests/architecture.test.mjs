// The page's modules come in three layers (see web/src/js/main.js); each may use only the layers before it:
//   core/      pure logic — imports only core/, touches neither the DOM nor the browser's storage, window or app state
//   services/  state, vault, files, sync — imports core/ and services/, never ui/, and does not touch the DOM
//   ui/        everything on screen — may import anything
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const JS = fileURLToPath(new URL("../web/src/js/", import.meta.url));
const modules = readdirSync(JS, { recursive: true }).filter((f) => f.endsWith(".js")).map((f) => f.split(sep).join("/"));
const layer = (f) => (f.includes("/") ? f.split("/")[0] : "entry");
/** The source without comments and string contents, so only code is checked. */
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
  .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
const importsOf = (f) => [...readFileSync(join(JS, f), "utf8").matchAll(/^import\s[^;]*?from\s+"(\.[^"]+)";|^import\s+"(\.[^"]+)";/gm)]
  .map((m) => relative(JS, join(dirname(join(JS, f)), m[1] ?? m[2])).split(sep).join("/"));

const ALLOWED = { core: ["core"], services: ["core", "services"], ui: ["core", "services", "ui"] };

for (const [name, allowed] of Object.entries(ALLOWED)) {
  test(`${name}/ imports only from ${allowed.map((l) => l + "/").join(", ")}`, () => {
    const bad = modules.filter((f) => layer(f) === name).flatMap((f) => importsOf(f).filter((d) => !allowed.includes(layer(d))).map((d) => `${f} → ${d}`));
    assert.deepEqual(bad, []);
  });
}

test("core/ uses no DOM, browser storage, window or page libraries", () => {
  const banned = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|location|matchMedia|getComputedStyle|requestAnimationFrame|CM|marked|DOMPurify)\b/;
  const bad = modules.filter((f) => layer(f) === "core").flatMap((f) => code(readFileSync(join(JS, f), "utf8")).split("\n").map((l, i) => [l, i]).filter(([l]) => banned.test(l.replace(/\.\s*[\w$]+/g, ""))).map(([l, i]) => `${f}:${i + 1}: ${l.trim().slice(0, 80)}`));
  assert.deepEqual(bad, []);
});

test("services/ never touches the DOM", () => {
  const banned = /\b(document|getComputedStyle|requestAnimationFrame|matchMedia|CM|DOMPurify)\b/;
  const bad = modules.filter((f) => layer(f) === "services").flatMap((f) => code(readFileSync(join(JS, f), "utf8")).split("\n").map((l, i) => [l, i]).filter(([l]) => banned.test(l.replace(/\.\s*[\w$]+/g, ""))).map(([l, i]) => `${f}:${i + 1}: ${l.trim().slice(0, 80)}`));
  assert.deepEqual(bad, []);
});

test("every module is under core/, services/ or ui/ (main.js and expose.js aside)", () => {
  assert.deepEqual(modules.filter((f) => layer(f) === "entry").sort(), ["expose.js", "main.js"]);
});

test("js/expose.js lists every module that exports anything", () => {
  const listed = new Set([...readFileSync(join(JS, "expose.js"), "utf8").matchAll(/^import \* as \w+ from "\.\/([^"]+)";/gm)].map((m) => m[1]));
  const exporting = modules.filter((f) => layer(f) !== "entry" && /^export /m.test(readFileSync(join(JS, f), "utf8")));
  assert.deepEqual(exporting.filter((f) => !listed.has(f)), []);
});
