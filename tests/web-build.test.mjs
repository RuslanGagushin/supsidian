// scripts/web.mjs: puts the page into dist/ for Tauri, with pdf.js beside it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

test("the page's APP_VERSION and the app's version match package.json", () => {
  const version = JSON.parse(readFileSync(at("package.json"), "utf8")).version;
  assert.match(readFileSync(at("web/supsidian.html"), "utf8"), new RegExp(`const APP_VERSION = "${version.replace(/\./g, "\\.")}"`));
  assert.equal(JSON.parse(readFileSync(at("src-tauri/tauri.conf.json"), "utf8")).version, version);
});

test("the updater checks this repository's latest release and has a signing key", () => {
  const conf = JSON.parse(readFileSync(at("src-tauri/tauri.conf.json"), "utf8"));
  assert.match(conf.plugins.updater.endpoints[0], /^https:\/\/github\.com\/RuslanGagushin\/supsidian\/releases\/latest\/download\/latest\.json$/);
  assert.match(Buffer.from(conf.plugins.updater.pubkey, "base64").toString(), /minisign public key/);
});

test("scripts/updater-manifest.mjs lists the signed Windows and macOS bundles in latest.json", () => {
  const out = mkdtempSync(join(tmpdir(), "sn-release-"));
  const put = (p, text) => { mkdirSync(dirname(join(out, p)), { recursive: true }); writeFileSync(join(out, p), text); };
  put("Supsidian-Windows/nsis/Supsidian_0.8.0_x64-setup.exe", "exe");
  put("Supsidian-Windows/nsis/Supsidian_0.8.0_x64-setup.exe.sig", "WINSIG\n");
  put("Supsidian-Windows/msi/Supsidian_0.8.0_x64_en-US.msi", "msi");
  put("Supsidian-macOS/macos/Supsidian.app.tar.gz", "tgz");
  put("Supsidian-macOS/macos/Supsidian.app.tar.gz.sig", "MACSIG");
  put("Supsidian-Android/app-universal-release.apk", "apk");
  execFileSync(process.execPath, ["scripts/updater-manifest.mjs", out, "v0.8.0", "you/repo"], { cwd: app });
  const m = JSON.parse(readFileSync(join(out, "latest.json"), "utf8"));
  assert.equal(m.version, "0.8.0");
  assert.deepEqual(m.platforms["windows-x86_64"], { signature: "WINSIG", url: "https://github.com/you/repo/releases/download/v0.8.0/Supsidian_0.8.0_x64-setup.exe" });
  assert.deepEqual(m.platforms["darwin-aarch64"], { signature: "MACSIG", url: "https://github.com/you/repo/releases/download/v0.8.0/Supsidian.app.tar.gz" });
  assert.deepEqual(m.platforms["darwin-x86_64"], m.platforms["darwin-aarch64"]);
  // unsigned builds: nothing to offer, no manifest
  const bare = mkdtempSync(join(tmpdir(), "sn-release-"));
  writeFileSync(join(bare, "Supsidian_0.8.0_x64-setup.exe"), "exe");
  execFileSync(process.execPath, ["scripts/updater-manifest.mjs", bare, "v0.8.0", "you/repo"], { cwd: app, stdio: "pipe" });
  assert.ok(!existsSync(join(bare, "latest.json")));
});
