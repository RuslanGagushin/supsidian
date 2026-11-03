// Builds the single-file page web/supsidian.html from its sources in web/src/.
// web/src/page.html is the page with <!-- include: path --> where each source file goes, in order;
// a directive on a line of its own takes its line break with it. __APP_VERSION__ becomes package.json's version.
// npm test and npm run web build it first; on its own: npm run page
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(app, "web", "src");
export const PAGE = join(app, "web", "supsidian.html");

export function buildPage() {
  const { version } = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
  const html = readFileSync(join(src, "page.html"), "utf8")
    .replace(/^<!-- include: (\S+) -->\n|<!-- include: (\S+) -->/gm, (_, line, inline) => readFileSync(join(src, line ?? inline), "utf8"))
    .replace('"__APP_VERSION__"', () => JSON.stringify(version));
  writeFileSync(PAGE, html);
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = buildPage();
  console.log(`web/supsidian.html ready (${(html.length / 1024).toFixed(0)} KB)`);
}
