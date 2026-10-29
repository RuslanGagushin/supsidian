// Puts the single-file app into dist/index.html for Tauri, with pdf.js beside it in dist/pdfjs/.
// - Inside the full supsidian repository: rebuilds ../standalone/supsidian.html (when its dependencies
//   are installed) and keeps a copy in web/supsidian.html.
// - When the app folder is on its own (for example its own GitHub repository): uses web/supsidian.html.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const standalone = join(app, "..", "standalone");
const bundled = join(app, "web", "supsidian.html");
let html = bundled;

if (existsSync(join(standalone, "build.mjs"))) {
  if (existsSync(join(standalone, "node_modules"))) {
    console.log("Building standalone/supsidian.html …");
    execSync("node build.mjs", { cwd: standalone, stdio: "inherit" });
  }
  if (existsSync(join(standalone, "supsidian.html"))) {
    html = join(standalone, "supsidian.html");
    mkdirSync(dirname(bundled), { recursive: true });
    copyFileSync(html, bundled); // keep the app's own copy current
  }
}
if (!existsSync(html)) {
  console.error("No page to package: web/supsidian.html is missing.");
  process.exit(1);
}
mkdirSync(join(app, "dist"), { recursive: true });
copyFileSync(html, join(app, "dist", "index.html"));
// pdf.js for PDF embeds on webviews without a PDF viewer of their own (Android); the page finds it at ./pdfjs/
const pdfjs = join(app, "node_modules", "pdfjs-dist", "legacy", "build");
if (existsSync(pdfjs)) {
  mkdirSync(join(app, "dist", "pdfjs"), { recursive: true });
  for (const f of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(join(pdfjs, f), join(app, "dist", "pdfjs", f));
} else console.warn("pdfjs-dist is not installed: PDF embeds on Android will load pdf.js from the CDN.");
console.log(`dist/index.html ready (from ${html === bundled ? "web/supsidian.html" : "standalone/supsidian.html"})`);
