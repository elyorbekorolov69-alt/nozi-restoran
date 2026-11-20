// YouTube videolar ro'yxati (Cloudflare Pages Function, manzil: /api/video).
// GET  -> { ok, videos:[{id, yt}] }     (ochiq)
// POST -> faqat bot: sarlavha x-reyting = REYTING_KEY. { url } qo'shadi, { del: id } o'chiradi.
const LIMIT = 15;   // eng ko'pi bilan shuncha video; to'lgach eskisini o'chirmaguncha yangisi qo'shilmaydi
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sb = env => ({ base: String(env.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1",
  H: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" } });
export const ytId = u => { const m = String(u || "").trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/); return m ? m[1] : (/^[\w-]{11}$/.test(String(u || "").trim()) ? String(u).trim() : ""); };

export async function onRequestGet({ env }) {
  try {
    const { base, H } = sb(env);
    const r = await fetch(`${base}/yt_video?select=id,yt&order=id.desc&limit=50`, { headers: H });
    const rows = await r.json(); if (!r.ok) throw new Error("db");
    return json(200, { ok: true, videos: rows });
  } catch (e) { return json(200, { ok: true, videos: [] }); }
}

export async function onRequestPost({ request, env }) {
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  if (!env.REYTING_KEY || request.headers.get("x-reyting") !== env.REYTING_KEY) return json(401, { ok: false });
  try {
    const { base, H } = sb(env);
    if (p.del) {
      const r = await fetch(`${base}/yt_video?id=eq.${Math.round(+p.del) || 0}`, { method: "DELETE", headers: H });
      return json(r.ok ? 200 : 500, { ok: r.ok });
    }
    const yt = ytId(p.url);
    if (!yt) return json(400, { ok: false, error: "havola tushunarsiz" });
    const dup = await (await fetch(`${base}/yt_video?select=id&yt=eq.${yt}`, { headers: H })).json();
    if (Array.isArray(dup) && dup.length) return json(200, { ok: true, yt, dup: true });
    const all = await (await fetch(`${base}/yt_video?select=id`, { headers: H })).json();
    if (Array.isArray(all) && all.length >= LIMIT) return json(409, { ok: false, full: true, limit: LIMIT, error: "limit to'lgan" });
    const r = await fetch(`${base}/yt_video`, { method: "POST", headers: H, body: JSON.stringify({ yt, created: Date.now() / 1000 }) });
    return json(r.ok ? 200 : 500, { ok: r.ok, yt });
  } catch (e) { return json(500, { ok: false }); }
}
