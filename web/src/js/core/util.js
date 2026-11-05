/* =========================================================
   Small helpers for strings and paths.
   ========================================================= */

export const debounce = (fn, ms) => { let tm; const d = (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(tm); return d; };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const baseName = (p) => (p.split("/").pop() || p).replace(/\.md$/i, "");
export const dirName = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
export const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е");
