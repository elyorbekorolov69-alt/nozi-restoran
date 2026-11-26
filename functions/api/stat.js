// Oddiy statistika (manzil: /api/stat). Shaxsiy ma'lumot yig'ilmaydi: faqat hodisa nomi va vaqti.
// POST {e}: sayt hodisani yozadi. GET: faqat admin, oxirgi 1 / 7 / 30 kunlik sonlar.
import { json, sb, isAdmin } from "./_h.js";

export const EVENTS = ["kirish", "menyu", "taom3d", "banket", "agent", "banket_yubor", "reklamalar", "kartochka"];

export const onRequestOptions = () => new Response(null, { status: 204 });

export async function onRequestPost({ request, env }) {
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  const e = String(p.e || "");
  if (!EVENTS.includes(e)) return json(400, { ok: false });
  const { base, H } = sb(env);
  const ip = request.headers.get("CF-Connecting-IP") || "?", now = Date.now() / 1000;
  try {
    // bir IP soatiga 300 tadan ko'p hodisa yozolmaydi (soxta sonlarni to'xtatadi)
    const r = await fetch(`${base}/hits?select=ts&ip=eq.${encodeURIComponent(ip)}&kind=like.st:*&ts=gt.${now - 3600}&limit=300`, { headers: H });
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length >= 300) return json(200, { ok: true });
    await fetch(`${base}/hits`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ ip, kind: "st:" + e, ts: now }) });
    if (Math.random() < 0.02) await fetch(`${base}/hits?kind=like.st:*&ts=lt.${now - 32 * 86400}`, { method: "DELETE", headers: H });   // 32 kundan eskisi tozalanadi
  } catch (err) { /* statistika ishlamasa ham sayt to'xtamaydi */ }
  return json(200, { ok: true });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  const { base, H } = sb(env);
  const now = Date.now() / 1000, W = { d1: 86400, d7: 7 * 86400, d30: 30 * 86400 };
  const count = async (e, sec) => {
    try {
      const r = await fetch(`${base}/hits?select=ts&kind=eq.st:${e}&ts=gt.${now - sec}`, { method: "HEAD", headers: { ...H, Prefer: "count=exact", Range: "0-0" } });
      const m = /\/(\d+)/.exec(r.headers.get("content-range") || "");
      return m ? Number(m[1]) : 0;
    } catch (err) { return 0; }
  };
  const out = {};
  await Promise.all(EVENTS.flatMap(e => Object.entries(W).map(async ([k, s]) => { (out[e] = out[e] || {})[k] = await count(e, s); })));
  return json(200, { ok: true, stat: out });
}
