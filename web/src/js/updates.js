/* =========================================================
   Version and updates.
   The desktop apps update themselves from GitHub Releases: the Tauri updater downloads the new
   build, checks its signature, installs it and the app restarts. Android can't replace its own APK,
   so it compares with the latest release and opens the APK download. The web page has nothing to
   install; it only shows its version.
   ========================================================= */
const APP_VERSION = "__APP_VERSION__"; // the page's own version (the apps ask Tauri for theirs); scripts/page.mjs puts package.json's here
const REPO = "RuslanGagushin/supsidian";
const RELEASES = `https://github.com/${REPO}/releases`;
const USTR = {
  en: {
    about: "About", version: "Version", web: "web page", updates: "Updates", check: "Check now", install: "Install and restart", download: "Download",
    checking: "Checking for updates…", current: "You have the latest version.", never: "Not checked yet.", lastChecked: "Last checked {time}.",
    available: "Version {v} is available.", availableAndroid: "Version {v} is available — download the APK and open it to install.",
    downloading: "Downloading version {v}… {p}", restarting: "Installed — restarting…", error: "Couldn't check for updates: {msg}",
    auto: "Check for updates automatically", autoDesc: "When the app starts and twice a day. Nothing is installed without asking.",
    availableNotice: "Supsidian {v} is available", open: "Open",
    releaseNotes: "Release notes", releaseNotesDesc: "What changed in each version, and downloads for every platform.",
    webNote: "This page is always the version it was loaded at. The Windows, macOS and Android apps keep themselves up to date.",
  },
  ru: {
    about: "О программе", version: "Версия", web: "веб-страница", updates: "Обновления", check: "Проверить", install: "Установить и перезапустить", download: "Скачать",
    checking: "Проверяем обновления…", current: "Установлена последняя версия.", never: "Ещё не проверяли.", lastChecked: "Последняя проверка: {time}.",
    available: "Доступна версия {v}.", availableAndroid: "Доступна версия {v} — скачайте APK и откройте его, чтобы установить.",
    downloading: "Скачиваем версию {v}… {p}", restarting: "Установлено — перезапускаем…", error: "Не удалось проверить обновления: {msg}",
    auto: "Проверять обновления автоматически", autoDesc: "При запуске и дважды в день. Без вашего согласия ничего не устанавливается.",
    availableNotice: "Доступна Supsidian {v}", open: "Открыть",
    releaseNotes: "Что нового", releaseNotesDesc: "Изменения в каждой версии и файлы для всех платформ.",
    webNote: "Эта страница остаётся той версией, с которой была загружена. Приложения для Windows, macOS и Android обновляются сами.",
  },
};
const ut = (k, v = {}) => (USTR[LANG]?.[k] ?? USTR.en[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));
/** state: idle | checking | current | available | installing | restarting | error. `update` is the Tauri updater's handle (desktop only). */
const upd = { state: "idle", version: "", url: "", error: "", got: 0, total: 0, update: null, view: null };
const canSelfUpdate = () => IS_NATIVE && !IS_ANDROID && !!window.__TAURI__?.updater;
async function appVersion() {
  try { if (IS_NATIVE) return await window.__TAURI__.app.getVersion(); } catch { /* older shell: the page's version */ }
  return APP_VERSION;
}
/** Is version a newer than b? Compares major.minor.patch, ignoring a leading v. */
function isNewer(a, b) {
  const p = (v) => String(v).replace(/^v/, "").split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
function setUpd(o) { Object.assign(upd, o); upd.view?.(); }
async function checkUpdate({ quiet = false } = {}) {
  if (!IS_NATIVE || ["checking", "installing", "restarting"].includes(upd.state)) return;
  setUpd({ state: "checking", error: "" });
  try {
    let found = false;
    if (canSelfUpdate()) {
      try {
        const u = await window.__TAURI__.updater.check();
        setUpd(u ? { state: "available", version: u.version, update: u, url: `${RELEASES}/tag/v${u.version}` } : { state: "current", update: null });
        found = true;
      } catch (e) { console.warn("updater: no signed update manifest, asking GitHub instead", e); }
    }
    if (!found) {
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) throw new Error("GitHub " + r.status);
      const rel = await r.json();
      const version = String(rel.tag_name || "").replace(/^v/, "");
      const apk = IS_ANDROID && (rel.assets || []).find((a) => /\.apk$/i.test(a.name));
      setUpd(isNewer(version, await appVersion()) ? { state: "available", version, update: null, url: apk?.browser_download_url || rel.html_url || RELEASES } : { state: "current", update: null });
    }
    UI.updateChecked = Date.now();
    saveUI();
  } catch (e) { setUpd({ state: "error", error: String(e?.message || e) }); }
  upd.view?.();
  if (quiet && upd.state === "available" && !upd.view) notice(ut("availableNotice", { v: upd.version }), { keep: true, action: { label: ut("open"), run: () => settingsModal("about") } });
}
async function installUpdate() {
  if (!upd.update) { openExternal(upd.url || RELEASES); return; }
  setUpd({ state: "installing", got: 0, total: 0 });
  try {
    if (editor.dirty) await saveEditor();
    await upd.update.downloadAndInstall((e) => {
      if (e.event === "Started") setUpd({ total: e.data?.contentLength || 0 });
      else if (e.event === "Progress") setUpd({ got: upd.got + (e.data?.chunkLength || 0) });
    });
    setUpd({ state: "restarting" });
    await window.__TAURI__.process.relaunch();
  } catch (e) { setUpd({ state: "error", error: String(e?.message || e) }); }
}
/** The About tab of the settings: version, updates, release notes. */
function aboutBody(item, toggle) {
  const ver = h("span", { text: APP_VERSION });
  appVersion().then((v) => (ver.textContent = v));
  const ua = navigator.userAgent;
  const platform = !IS_NATIVE ? ut("web") : IS_ANDROID ? "Android" : /Mac/i.test(ua) ? "macOS" : /Win/i.test(ua) ? "Windows" : "Linux";
  const out = [h("div", { cls: "sn-about" }, h("div", { cls: "sn-about-name", text: "Supsidian" }), h("div", { cls: "sn-about-ver" }, ut("version") + " ", ver, " · " + platform))];
  if (IS_NATIVE) {
    const btn = h("button", { cls: "wb-btn", type: "button", onClick: () => (upd.state === "available" ? installUpdate() : checkUpdate()) });
    const row = item(ut("updates"), " ", btn);
    const desc = row.querySelector(".setting-item-description");
    row.classList.add("sn-update-row");
    upd.view = () => {
      const s = upd.state, v = upd.version;
      const pct = upd.total ? Math.min(100, Math.round((upd.got / upd.total) * 100)) + "%" : "";
      desc.textContent = s === "checking" ? ut("checking") : s === "current" ? ut("current") : s === "error" ? ut("error", { msg: upd.error })
        : s === "available" ? ut(upd.update || !IS_ANDROID ? "available" : "availableAndroid", { v }) : s === "installing" ? ut("downloading", { v, p: pct })
        : s === "restarting" ? ut("restarting") : UI.updateChecked ? ut("lastChecked", { time: new Date(UI.updateChecked).toLocaleString(LANG === "ru" ? "ru-RU" : "en-US", { dateStyle: "medium", timeStyle: "short" }) }) : ut("never");
      btn.textContent = s === "available" ? ut(upd.update ? "install" : "download") : ut("check");
      btn.classList.toggle("is-cta", s === "available");
      btn.disabled = ["checking", "installing", "restarting"].includes(s);
      row.classList.toggle("is-available", s === "available");
    };
    upd.view();
    out.push(row, item(ut("auto"), ut("autoDesc"), toggle(UI.autoUpdate !== false, (v) => { UI.autoUpdate = v; saveUI(); })));
  } else out.push(h("p", { cls: "modal-text", text: ut("webNote") }));
  out.push(item(ut("releaseNotes"), ut("releaseNotesDesc"), h("button", { cls: "wb-btn", type: "button", text: st("open"), onClick: () => openExternal(RELEASES) })));
  return out;
}
// check on launch and twice a day while the app stays open
if (IS_NATIVE) {
  const autoCheck = () => { if (UI.autoUpdate !== false && upd.state !== "available") checkUpdate({ quiet: true }); };
  setTimeout(autoCheck, 8000);
  setInterval(autoCheck, 12 * 3600e3);
}


/* Boot */
applyTheme();
applyLanguage();
const folderInput = h("input", { type: "file", id: "folder-input", webkitdirectory: true, multiple: true, style: "display:none" });
folderInput.addEventListener("change", () => loadCopy(folderInput.files));
document.body.append(folderInput);
setInterval(() => pollChanges(), 4000);
window.addEventListener("focus", () => pollChanges(true));
window.addEventListener("beforeunload", (e) => { if (editor.dirty) { saveEditor(); e.preventDefault(); } });
window.addEventListener("resize", debounce(() => { for (const m of masonries) m.relayout(false); }, 100));
window.SupsidianApp = { loadVault, HandleFS, MemoryFS, demoVault, vault, board, get graph() { return graph; } };
/** On launch, go straight back into the last vault when that needs no prompt; the welcome screen stays as the fallback. */
async function autoReopen() {
  try {
    if (IS_NATIVE) {
      const ln = lastNative();
      if (ln && (await vinvoke("exists", { root: ln.root, path: "" }))) await loadVault(new NativeFS(ln.root, ln.name));
    } else if (hasFsApi) {
      const last = await idb.get("lastVault");
      if (last && (await last.queryPermission({ mode: "readwrite" })) === "granted") await loadVault(new HandleFS(last));
    }
  } catch (e) { /* keep the welcome screen */ }
}
if (!window.__SN_NO_AUTOSTART) showWelcome().then(autoReopen);

