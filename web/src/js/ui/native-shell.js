import { LANG } from "../core/i18n.js";
import { lsSet } from "../services/storage.js";
import { NativeFS, vinvoke } from "../services/native.js";
import { loadVault } from "../services/vault.js";
import { notice } from "./ui.js";

export async function nativePick() {
  try {
    const r = await vinvoke("pick", {});
    if (!r) return;
    lsSet("sn-native-last", r);
    await loadVault(new NativeFS(r.root, r.name));
  } catch (e) { notice(String(e?.message || e)); }
}
export async function nativeReopen(r) {
  try {
    if (!(await vinvoke("exists", { root: r.root, path: "" }))) throw new Error((LANG === "ru" ? "Нет доступа к папке: " : "Can't reach the folder: ") + r.name);
    await loadVault(new NativeFS(r.root, r.name));
  } catch (e) { notice(String(e?.message || e)); }
}
