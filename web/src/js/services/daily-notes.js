import { vault } from "./state.js";

export let dailyCfg = null;
export const resetDailyConfig = () => { dailyCfg = null; };
export function dailyConfig() { return dailyCfg || { folder: "", format: "YYYY-MM-DD", template: "" }; }
export async function loadDailyConfig() {
  dailyCfg = { folder: "", format: "YYYY-MM-DD", template: "" };
  try { Object.assign(dailyCfg, JSON.parse(await vault.fs.read(".obsidian/daily-notes.json"))); } catch { /* defaults */ }
  dailyCfg.folder = (dailyCfg.folder || "").replace(/^\/+|\/+$/g, "");
  dailyCfg.format = dailyCfg.format || "YYYY-MM-DD";
}
