/* =========================================================
   Daily notes: where today's note goes, its name and its template (the Notes tab of the settings).
   ========================================================= */
import { S } from "./state.js";

export function dailyConfig() {
  return { folder: (S.dailyFolder || "").replace(/^\/+|\/+$/g, ""), format: S.dailyFormat || "YYYY-MM-DD", template: S.dailyTemplate || "" };
}
