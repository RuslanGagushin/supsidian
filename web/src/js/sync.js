/* =========================================================
   Git sync — the vault folder is a git repository; syncing commits local changes,
   merges the remote branch and pushes (the work is done by the native "vault" plugin).
   Files changed on both sides keep this device's text; the other side is saved next to it
   as "name (conflict …).md". On Android the repository is a clone in the app's private
   storage that is mirrored to and from the picked folder.
   Settings (remote, access token…) are saved in the repository's own .git/config, which is
   never pushed, so they stay with the vault folder; this app keeps a copy for vaults
   that are not repositories yet.
   ========================================================= */
const GIT_DEFAULTS = { remote: "", branch: "main", username: "git", token: "", authorName: "", authorEmail: "", auto: true, minutes: 5 };
let SS = { ...GIT_DEFAULTS };
const sync = { crash: "", busy: false, last: null, error: "", report: null, timer: null, debounce: null, dirty: false, info: null };

const SYNC_STR = {
  en: {
    unavailable: "Git sync works in the Supstack app with a vault folder opened from disk.",
    unavailableShort: "no sync",
    noRemote: "Git: set up a remote", noRemoteShort: "set up git",
    syncing: "Git: syncing…", syncingShort: "syncing…",
    synced: "Git: synced {time}", failed: "Git: {msg}", failedShort: "sync failed",
    panel: "Git sync", syncNow: "Sync now", open: "Open", settingsRow: "Git sync", settingsRowDesc: "Remote repository, access token and automatic sync.",
    cmdNow: "Sync now", cmdSettings: "Settings",
    remote: "Remote URL", remoteDesc: "HTTPS address of the repository, e.g. https://github.com/you/notes.git",
    branch: "Branch", username: "Username", usernameDesc: "Any name works with a GitHub token; GitLab uses oauth2.",
    token: "Access token", tokenDesc: "A personal access token with write access to the repository. Saved in the vault's .git folder, which is never pushed.",
    authorName: "Commit author", authorEmail: "Commit email",
    auto: "Sync automatically", autoDesc: "After edits and every few minutes while the app is open.", minutes: "Every (minutes)",
    pulled: "received changes", pushed: "sent changes", upToDate: "nothing new",
    conflicts: "{n} file(s) changed on both sides — your text stayed, the other version was saved next to it.",
    conflictsNotice: "Sync conflicts: {n} (see “conflict” files)",
    note: "Add a .gitignore to keep files out of the repository. The first sync creates one for .obsidian workspace files and .trash.",
    never: "Not synced yet",
    crashed: "The last sync stopped unexpectedly — automatic sync is paused. Details are in the Git panel.",
    crashNote: "The previous sync did not finish. Last steps: {steps}",
  },
  ru: {
    unavailable: "Git-синхронизация работает в приложении Supstack с папкой хранилища, открытой с диска.",
    unavailableShort: "без синхр.",
    noRemote: "Git: укажите репозиторий", noRemoteShort: "настроить git",
    syncing: "Git: синхронизация…", syncingShort: "синхр…",
    synced: "Git: синхронизировано {time}", failed: "Git: {msg}", failedShort: "ошибка синхр.",
    panel: "Git-синхронизация", syncNow: "Синхронизировать", open: "Открыть", settingsRow: "Git-синхронизация", settingsRowDesc: "Репозиторий, токен доступа и автосинхронизация.",
    cmdNow: "Синхронизировать", cmdSettings: "Настройки",
    remote: "Адрес репозитория", remoteDesc: "HTTPS-адрес, например https://github.com/you/notes.git",
    branch: "Ветка", username: "Имя пользователя", usernameDesc: "С токеном GitHub подойдёт любое имя; для GitLab — oauth2.",
    token: "Токен доступа", tokenDesc: "Персональный токен с правом записи в репозиторий. Хранится в папке .git хранилища, которая никуда не отправляется.",
    authorName: "Автор коммитов", authorEmail: "Почта для коммитов",
    auto: "Синхронизировать автоматически", autoDesc: "После правок и раз в несколько минут, пока приложение открыто.", minutes: "Каждые (минут)",
    pulled: "получены изменения", pushed: "отправлены изменения", upToDate: "ничего нового",
    conflicts: "Файлов, изменённых с обеих сторон: {n} — ваш текст остался, другая версия сохранена рядом.",
    conflictsNotice: "Конфликтов при синхронизации: {n} (файлы «conflict»)",
    note: "Чтобы исключить файлы из репозитория, добавьте .gitignore. Первая синхронизация создаёт его для рабочих файлов .obsidian и .trash.",
    never: "Ещё не синхронизировано",
    crashed: "Прошлая синхронизация оборвалась — автосинхронизация приостановлена. Подробности в панели Git.",
    crashNote: "Прошлая синхронизация не завершилась. Последние шаги: {steps}",
  },
};
const st = (k, v = {}) => (SYNC_STR[LANG]?.[k] ?? SYNC_STR.en[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (v[x] !== undefined ? String(v[x]) : m));
const syncAvailable = () => !!(IS_NATIVE && vault.fs?.native);
const gitKey = () => "sn-git:" + vault.fs.root;
const gitConfigured = () => !!SS.remote.trim();

function loadSyncSettings(saved) { SS = { ...GIT_DEFAULTS, ...(lsGet(gitKey(), {}) || {}), ...(saved || {}) }; }
function saveSyncSettings() { lsSet(gitKey(), SS); saveRepoSettings(); scheduleAuto(); syncChanged(); }
/** Writes the settings into the repository's .git/config (creating the repository once there is a remote). */
async function saveRepoSettings() {
  const settings = { remote: SS.remote.trim(), branch: SS.branch.trim(), username: SS.username.trim(), token: SS.token,
    authorName: SS.authorName.trim(), authorEmail: SS.authorEmail.trim(), auto: !!SS.auto, minutes: Math.max(1, Number(SS.minutes) || 5) };
  try { await vinvoke("git_save_settings", { root: vault.fs.root, settings }); }
  catch (e) { notice(st("failed", { msg: String(e?.message || e) })); }
}

/** Local edits: schedule a sync soon after the last one. */
function syncHook() {
  if (!syncAvailable()) return;
  sync.dirty = true;
  if (!SS.auto || !gitConfigured()) return;
  clearTimeout(sync.debounce);
  sync.debounce = setTimeout(() => runSync({ quiet: true }), 30000);
}
function scheduleAuto() {
  clearInterval(sync.timer);
  sync.timer = null;
  if (syncAvailable() && SS.auto && gitConfigured()) sync.timer = setInterval(() => runSync({ quiet: true }), Math.max(1, Number(SS.minutes) || 5) * 60000);
}
async function syncBoot() {
  if (!syncAvailable()) { syncChanged(); return; }
  loadSyncSettings();
  sync.last = null; sync.error = ""; sync.report = null; sync.dirty = false;
  sync.crash = "";
  try {
    const info = await vinvoke("git_info", { root: vault.fs.root });
    sync.crash = info.previousCrash || "";
    if (info.settings) { loadSyncSettings(info.settings); lsSet(gitKey(), SS); }
    else {
      // a vault that is already a repository: take its remote
      if (!SS.remote && info.remote) { SS.remote = info.remote; if (info.branch) SS.branch = info.branch; }
      // settings from before they were kept in the repository move there
      if (gitConfigured()) { lsSet(gitKey(), SS); await saveRepoSettings(); }
    }
  } catch { /* not a repository yet */ }
  scheduleAuto();
  syncChanged();
  // after a crash, wait for the user instead of crashing again at every launch
  if (sync.crash) notice(st("crashed"));
  else if (SS.auto && gitConfigured()) runSync({ quiet: true });
}
async function stopSync() {
  clearInterval(sync.timer); clearTimeout(sync.debounce);
  sync.timer = sync.debounce = null;
  if (sync.dirty && gitConfigured() && !sync.busy && syncAvailable()) await runSync({ quiet: true });
}
async function runSync({ quiet = false } = {}) {
  if (sync.busy || !syncAvailable()) return;
  if (!gitConfigured()) { if (!quiet) syncSettingsModal(); return; }
  sync.busy = true; sync.error = ""; sync.crash = "";
  syncChanged();
  try {
    if (editor.dirty) await saveEditor();
    sync.dirty = false;
    const r = await vinvoke("git_sync", { root: vault.fs.root, config: {
      remote: SS.remote.trim(), branch: SS.branch.trim() || "main", username: SS.username.trim(), token: SS.token,
      authorName: SS.authorName.trim(), authorEmail: SS.authorEmail.trim() } });
    sync.report = r; sync.last = Date.now();
    if (r.pulled || r.conflicts.length) await pollChanges(true);
    if (r.conflicts.length) notice(st("conflictsNotice", { n: r.conflicts.length }));
    else if (!quiet) notice(st("synced", { time: new Date(sync.last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }));
  } catch (e) {
    sync.error = String(e?.message || e);
    if (!quiet) notice(st("failed", { msg: sync.error }));
  } finally { sync.busy = false; syncChanged(); }
}

/* ---------- status button */
function syncStatus() {
  if (!syncAvailable()) return { text: st("unavailable"), short: st("unavailableShort"), icon: "cloud-off", state: "off" };
  if (sync.busy) return { text: st("syncing"), short: st("syncingShort"), icon: "refresh-cw", state: "busy", spin: true };
  if (sync.crash) return { text: st("crashed"), short: st("failedShort"), icon: "alert-triangle", state: "warn" };
  if (sync.error) return { text: st("failed", { msg: sync.error }), short: st("failedShort"), icon: "alert-triangle", state: "warn" };
  if (!gitConfigured()) return { text: st("noRemote"), short: st("noRemoteShort"), icon: "git-branch", state: "warn" };
  if (!sync.last) return { text: st("never"), short: st("never"), icon: "git-branch", state: "off" };
  const time = new Date(sync.last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return { text: st("synced", { time }), short: time, icon: "check", state: sync.report?.conflicts?.length ? "warn" : "ok" };
}
function syncChanged() { renderSyncButton(); if (sync.panel) renderSyncPanel(); }
function renderSyncButton() {
  const b = $("#sync-btn");
  if (!b) return;
  const s = syncStatus();
  b.className = `wb-btn wb-sync is-${s.state}` + (s.spin ? " is-spin" : "");
  b.title = s.text;
  b.replaceChildren(ic("wb-sync-icon", s.icon, "refresh-cw"), h("span", { cls: "wb-label", text: s.short }));
}
function syncButton() {
  const b = h("button", { id: "sync-btn", type: "button", cls: "wb-btn wb-sync" });
  b.addEventListener("click", () => openSyncPanel());
  setTimeout(renderSyncButton, 0);
  return b;
}

/* ---------- panel: status, sync now, settings */
function openSyncPanel() { if (!syncAvailable()) { notice(st("unavailable")); return; } syncSettingsModal(); }
function renderSyncPanel() { sync.panel?.render(); }
function syncSettingsModal() {
  if (!syncAvailable()) { notice(st("unavailable")); return; }
  settingsModal("sync");
}
/** The Git tab of the settings: status, sync now, remote and access. `item` and `toggle` are the settings' row builders. */
function syncSettingsBody(item, toggle) {
  const text = (key, ph, type = "text", after) => { const i = h("input", { type, placeholder: ph || "", spellcheck: "false", autocomplete: "off" }); i.value = String(SS[key] ?? ""); i.addEventListener("change", () => { SS[key] = type === "number" ? Number(i.value) || GIT_DEFAULTS[key] : i.value.trim(); saveSyncSettings(); after?.(); }); return i; };
  const status = h("div", { cls: "sn-sync-status" });
  const result = h("p", { cls: "sn-sync-note" });
  const syncBtn = h("button", { cls: "mod-cta", type: "button", text: st("syncNow"), onClick: async () => { await runSync(); } });
  const render = () => {
    const s = syncStatus();
    status.className = `sn-sync-status is-${s.state}` + (s.spin ? " is-spin" : "");
    status.replaceChildren(ic("", s.icon), h("span", { text: s.text }));
    const r = sync.report;
    result.textContent = sync.crash && !sync.busy ? st("crashNote", { steps: sync.crash }) : !r ? "" : r.conflicts.length ? st("conflicts", { n: r.conflicts.length }) : [r.pulled && st("pulled"), r.pushed && st("pushed")].filter(Boolean).join(", ") || st("upToDate");
    syncBtn.disabled = sync.busy;
  };
  sync.panel = { render };
  render();
  return [status, result,
    item(st("remote"), st("remoteDesc"), text("remote", "https://github.com/you/notes.git")),
    item(st("branch"), null, text("branch", "main")),
    item(st("username"), st("usernameDesc"), text("username", "git")),
    item(st("token"), st("tokenDesc"), text("token", "", "password")),
    item(st("authorName"), null, text("authorName", "Supstack")),
    item(st("authorEmail"), null, text("authorEmail", "you@example.com")),
    item(st("auto"), st("autoDesc"), toggle(SS.auto, (v) => { SS.auto = v; saveSyncSettings(); })),
    item(st("minutes"), null, text("minutes", "5", "number")),
    h("p", { cls: "sn-sync-note", text: st("note") }),
    h("div", { cls: "modal-buttons" }, syncBtn)];
}


