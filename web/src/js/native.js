/* =========================================================
   Native app shell (Tauri on Windows, macOS and Android).
   The page stays the same; only file access goes through the app's
   "vault" plugin instead of the browser's File System Access API.
   ========================================================= */
const TAURI = window.__TAURI__?.core || null;
const IS_NATIVE = !!TAURI;
const IS_ANDROID = IS_NATIVE && /Android/i.test(navigator.userAgent);
const vinvoke = (cmd, args) => TAURI.invoke("plugin:vault|" + cmd, args);
const NSTR = {
  en: { openFolder: "Open vault folder", appNote: "Pick the folder of an Obsidian vault. Notes are read and written in place, so Obsidian sees every change.", appNoteAndroid: "Pick your vault folder (for example Documents/Obsidian/MyVault). Android asks once for access to that folder." },
  ru: { openFolder: "Открыть папку хранилища", appNote: "Выберите папку хранилища Obsidian. Заметки читаются и сохраняются прямо в ней, Obsidian видит все изменения.", appNoteAndroid: "Выберите папку хранилища (например, Documents/Obsidian/MyVault). Android один раз спросит доступ к этой папке." },
};
const nt = (k) => NSTR[LANG]?.[k] ?? NSTR.en[k];

function b64ToBytes(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
function bytesToB64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }

/** Same interface as HandleFS, backed by the native plugin. `root` is a folder path (desktop) or a content:// tree URI (Android). */
class NativeFS {
  constructor(root, name) { this.root = root; this.name = name; this.kind = "disk"; this.native = true; }
  async list() {
    const items = await vinvoke("list", { root: this.root });
    return items.map((it) => ({ path: it.path, mtime: it.mtime, size: it.size, handle: { getFile: async () => this.lazyFile(it) } }));
  }
  /** Metadata now, contents only when asked — polling compares mtimes without reading every note. */
  lazyFile(it) {
    return { name: it.path.split("/").pop(), lastModified: it.mtime, size: it.size, text: () => this.read(it.path), arrayBuffer: async () => (await this.readFile(it.path)).arrayBuffer() };
  }
  async readFile(path) {
    const r = await vinvoke("read", { root: this.root, path, binary: true });
    return new File([b64ToBytes(r.data)], path.split("/").pop(), { lastModified: r.mtime });
  }
  async read(path) { return (await vinvoke("read", { root: this.root, path, binary: false })).data; }
  async exists(path) { return vinvoke("exists", { root: this.root, path }); }
  async dir(path) { if (!(await this.exists(path))) throw new Error("not found: " + path); return path; }
  async write(path, data) {
    if (typeof data === "string") return vinvoke("write", { root: this.root, path, text: data, base64: null });
    let bytes;
    if (data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
    else if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    else bytes = new TextEncoder().encode(String(data));
    return vinvoke("write", { root: this.root, path, text: null, base64: bytesToB64(bytes) });
  }
  async remove(path) { await vinvoke("remove", { root: this.root, path }); }
  async listDir(path) { return vinvoke("list_dir", { root: this.root, path }); }
  async removeDir(path) { await vinvoke("remove_dir", { root: this.root, path }); }
}

const lastNative = () => lsGet("sn-native-last", null);
async function nativePick() {
  try {
    const r = await vinvoke("pick", {});
    if (!r) return;
    lsSet("sn-native-last", r);
    await loadVault(new NativeFS(r.root, r.name));
  } catch (e) { notice(String(e?.message || e)); }
}
async function nativeReopen(r) {
  try {
    if (!(await vinvoke("exists", { root: r.root, path: "" }))) throw new Error((LANG === "ru" ? "Нет доступа к папке: " : "Can't reach the folder: ") + r.name);
    await loadVault(new NativeFS(r.root, r.name));
  } catch (e) { notice(String(e?.message || e)); }
}
/** Open links outside the app (browser, obsidian://). */
function openExternal(url) {
  if (IS_NATIVE) TAURI.invoke("plugin:opener|open_url", { url }).catch((e) => notice(String(e?.message || e)));
  else location.href = url;
}
if (IS_NATIVE) {
  document.documentElement.classList.add("is-native");
  if (IS_ANDROID) document.documentElement.classList.add("is-android");
  // links with target=_blank would silently do nothing inside the app window
  document.addEventListener("click", (e) => {
    const a = e.target.closest?.("a[href]");
    if (!a || a.hasAttribute("download")) return;
    const href = a.getAttribute("href") || "";
    if (/^(https?|mailto|tel|obsidian):/i.test(href)) { e.preventDefault(); openExternal(href); }
  }, true);
  // Android back button: close what's open, then go back, then leave the app
  if (IS_ANDROID) {
    history.replaceState({ sn: 0 }, "");
    history.pushState({ sn: 1 }, "");
    addEventListener("popstate", () => {
      const consumed = (() => {
        if (document.querySelector(".modal-bg")) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true; }
        if (typeof openMenuEl !== "undefined" && openMenuEl) { closeMenu(); return true; }
        if (!vault.fs) return false;
        if (UI.focus) { setFocusMode(false); return true; }
        if (editor.path) { closeEditor(); return true; }
        if (!$("#app").classList.contains("side-closed") && innerWidth <= 820) { setSide(false); return true; }
        if (board.history.length) { goBack(); return true; }
        return false;
      })();
      if (consumed) history.pushState({ sn: 1 }, "");
      else history.back();
    });
  }
}


