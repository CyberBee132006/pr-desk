
export function copy_text(t) { return navigator.clipboard.writeText(t).then(() => true, () => false); }
export function ls_get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
export function ls_set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
export function ls_del(k) { try { localStorage.removeItem(k); } catch (e) {} }
export function today_iso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
export function now_hm() {
  const d = new Date(); const p = (n) => String(n).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes());
}
export function now_iso() { return new Date().toISOString(); }
export function now_ms() { return Date.now(); }
export function inner_width() { return window.innerWidth; }
export function location_host() { return location.hostname; }
export function location_path() { return location.pathname; }
const VAAD = new TextEncoder().encode("pr-desk-vault-v1");
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function vfetch() {
  try { const r = await fetch("vault.json?_=" + Date.now(), { cache: "no-store" }); return r.ok ? await r.json() : null; }
  catch (e) { return null; }
}
async function vopen(V, key) {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(V.iv), additionalData: VAAD }, key, b64(V.data));
  return new TextDecoder().decode(plain);
}
// "none" (no vault on this site), "locked" (need passphrase), or "ok:<json>"
export async function vault_auto() {
  const V = await vfetch();
  if (!V) return "none";
  let saved = ""; try { saved = localStorage.getItem("pr_vkey") || ""; } catch (e) {}
  if (!saved) return "locked";
  try {
    const key = await crypto.subtle.importKey("raw", b64(saved), "AES-GCM", false, ["decrypt"]);
    return "ok:" + await vopen(V, key);
  } catch (e) { try { localStorage.removeItem("pr_vkey"); } catch (_) {} return "locked"; }
}
// "ok:<json>" or "bad"
export async function vault_unlock(pass, remember) {
  const V = await vfetch();
  if (!V) return "bad";
  try {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(V.salt), iterations: V.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
    const out = await vopen(V, key);
    if (remember) {
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
      try { localStorage.setItem("pr_vkey", btoa(String.fromCharCode(...raw))); } catch (e) {}
    }
    return "ok:" + out;
  } catch (e) { return "bad"; }
}
export function vault_lock() { try { localStorage.removeItem("pr_vkey"); } catch (e) {} }
// Media from the repo -> object URL (cached). tok empty = same-site static copy.
const MEDIA = new Map();
export async function media_url(url, tok) {
  if (MEDIA.has(url)) return MEDIA.get(url);
  try {
    const h = tok ? { Authorization: "Bearer " + tok, Accept: "application/vnd.github.raw+json" } : {};
    const r = await fetch(url, { headers: h, cache: "no-cache" });
    if (!r.ok) return "";
    const u = URL.createObjectURL(await r.blob());
    MEDIA.set(url, u);
    return u;
  } catch (e) { return ""; }
}
export function bytes_b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
// One-tap posting. Phones with Web Share get the image + text in the share sheet
// (pick X / LinkedIn there). Otherwise: open the composer with the text filled in,
// copy the text and download the visual so it's ready to attach.
export async function post_to(platform, text, mediaUrl, mediaName) {
  // mediaUrl / mediaName may hold several files, one per line (carousel slides, in order).
  const urls = (mediaUrl || "").split("\n").filter(Boolean);
  const names = (mediaName || "").split("\n");
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    try { const b = await (await fetch(urls[i])).blob(); files.push(new File([b], names[i] || `post-${i + 1}.png`, { type: b.type || "image/png" })); } catch (e) {}
  }
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && files.length && navigator.canShare && navigator.canShare({ files, text })) {
    try { await navigator.share({ files, text }); return "shared"; } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
  }
  try { await navigator.clipboard.writeText(text); } catch (e) {}
  // Text is on the clipboard; Instagram has no web composer (post from the phone share sheet).
  const u = platform === "linkedin" ? "https://www.linkedin.com/feed/?shareActive=true&text=" + encodeURIComponent(text)
    : platform === "medium" ? "https://medium.com/new-story"
    : platform === "instagram" ? "https://www.instagram.com/"
    : "https://x.com/intent/post?text=" + encodeURIComponent(text);
  window.open(u, "_blank", "noopener");
  if (files.length) save_many(urls.join("\n"), names.join("\n"));
  return files.length ? "opened+downloaded" : "opened";
}
// Save several files one after another (browsers drop clicks fired at the same instant).
export function save_many(hrefs, names) {
  const h = hrefs.split("\n").filter(Boolean), n = names.split("\n");
  h.forEach((href, i) => setTimeout(() => save_as(href, n[i] || `slide-${i + 1}.png`), i * 400));
}
// Reminders. While the dashboard is open, fire a notification at each time.
const TIMERS = [];
export function notif_state() { return ("Notification" in window) ? Notification.permission : "unsupported"; }
export async function notif_ask() { if (!("Notification" in window)) return "unsupported"; return await Notification.requestPermission(); }
export function remind_clear() { while (TIMERS.length) clearTimeout(TIMERS.pop()); }
export function remind_at(ms, title, body) {
  const d = ms - Date.now();
  if (d <= 0 || d > 2147483000 || !("Notification" in window) || Notification.permission !== "granted") return;
  TIMERS.push(setTimeout(async () => {
    try { const r = await navigator.serviceWorker?.getRegistration(); if (r) { r.showNotification(title, { body, tag: title }); return; } } catch (e) {}
    try { new Notification(title, { body }); } catch (e) {}
  }, d));
}
export function ist_ms(date, hm) { return Date.parse(date + "T" + hm + ":00+05:30"); }
export function download_text(text, name, type) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// Theme: "auto" | "light" | "dark"
export function theme_apply(t) { const r = document.documentElement; if (t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t); try { localStorage.setItem("pr_theme", t); } catch (e) {} }
// Share target: the service worker stores a share (text/url/image) and redirects to ?share=1.
export async function take_share() {
  if (!new URLSearchParams(location.search).has("share")) return "";
  history.replaceState(null, "", location.pathname);
  try {
    const c = await caches.open("pr-share"); const r = await c.match("share"); if (!r) return "";
    const j = await r.json(); await c.delete("share");
    if (j.image) { const ir = await c.match("share-image"); if (ir) { j.imageUrl = URL.createObjectURL(await ir.blob()); } await c.delete("share-image"); }
    return JSON.stringify(j);
  } catch (e) { return ""; }
}
export async function url_bytes(u) { try { return new Uint8Array(await (await fetch(u)).arrayBuffer()); } catch (e) { return new Uint8Array(); } }
// Medium desk: paste / drop / pick images straight into the draft; each becomes
// ![name](blob:…) at the cursor and is uploaded to the repo on save.
export function blog_paste_setup(id) {
  const el = document.getElementById(id); if (!el || el.__p) return; el.__p = 1;
  window.__blobType = window.__blobType || {};
  const ins = (f) => { const u = URL.createObjectURL(f); window.__blobType[u] = f.type || "image/png";
    const md = `\n![${(f.name || "screenshot").replace(/[\[\]]/g, "")}](${u})\n`;
    el.setRangeText(md, el.selectionStart, el.selectionEnd, "end"); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const imgs = (l) => [...(l || [])].filter((f) => f.type.startsWith("image/"));
  el.addEventListener("paste", (e) => { const fs = imgs(e.clipboardData && e.clipboardData.files); if (fs.length) { e.preventDefault(); fs.forEach(ins); } });
  el.addEventListener("drop", (e) => { const fs = imgs(e.dataTransfer && e.dataTransfer.files); if (fs.length) { e.preventDefault(); fs.forEach(ins); } });
  el.__ins = ins;
}
export function blog_pick(inputId, areaId) { const i = document.getElementById(inputId), el = document.getElementById(areaId); if (!i || !el || !el.__ins) return; [...i.files].forEach((f) => el.__ins(f)); i.value = ""; }
export function blob_type(u) { return (window.__blobType || {})[u] || "image/png"; }
export async function copy_html(html, text) { try { await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]); return "ok"; } catch (e) { try { await navigator.clipboard.writeText(text); return "text"; } catch (e2) { return ""; } } }
export function file_pick(id) { const el = document.getElementById(id); return el && el.files && el.files[0] ? URL.createObjectURL(el.files[0]) : ""; }
export function file_type(id) { const el = document.getElementById(id); return el && el.files && el.files[0] ? (el.files[0].type || "") : ""; }
export function save_as(href, name) { const a = document.createElement("a"); a.href = href; a.download = name; a.click(); }
export function download_png(svg, name) {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = 2400; c.height = 1350;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, 2400, 1350);
    URL.revokeObjectURL(url);
    c.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };
  img.src = url;
}
