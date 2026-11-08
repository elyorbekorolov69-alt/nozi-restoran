// Sayt matnlari, menyu o'zgarishlari, rasm va video manzillari (Cloudflare Pages Function, manzil: /api/content).
// GET: hamma o'qiy oladi. PUT/DELETE: faqat admin (x-admin sarlavhasida parol).
import { json, sb, isAdmin } from "./_h.js";

const KEY = /^[a-z0-9_.:-]{1,80}$/i;

export const onRequestOptions = () => new Response(null, { status: 204 });

export async function onRequestGet({ env }) {
  const { base, H } = sb(env);
  try {
    const r = await fetch(`${base}/content?select=key,value`, { headers: H });
    const rows = await r.json();
    if (!r.ok || !Array.isArray(rows)) throw new Error(JSON.stringify(rows));
    const data = {}; for (const x of rows) data[x.key] = x.value;
    return json(200, { ok: true, data }, { "Cache-Control": "public, max-age=15" });
  } catch (e) { console.log("content GET:", e.message); return json(200, { ok: false, data: {} }); }
}

export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  if (!KEY.test(String(p.key || ""))) return json(400, { ok: false, error: "kalit noto‘g‘ri" });
  const val = JSON.stringify(p.value ?? null);
  if (val.length > 200000) return json(413, { ok: false, error: "juda katta" });
  const { base, H } = sb(env);
  const r = await fetch(`${base}/content?on_conflict=key`, { method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: p.key, value: p.value ?? null, updated: Date.now() / 1000 }) });
  if (!r.ok) { console.log("content PUT:", await r.text()); return json(500, { ok: false, error: "saqlanmadi" }); }
  return json(200, { ok: true });
}

export async function onRequestDelete({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!KEY.test(key)) return json(400, { ok: false, error: "kalit noto‘g‘ri" });
  const { base, H } = sb(env);
  const r = await fetch(`${base}/content?key=eq.${encodeURIComponent(key)}`, { method: "DELETE", headers: H });
  return r.ok ? json(200, { ok: true }) : json(500, { ok: false, error: "o‘chmadi" });
}
