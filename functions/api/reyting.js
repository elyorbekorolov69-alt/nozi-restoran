// Taom reytingi (Cloudflare Pages Function, manzil: /api/reyting).
// GET  -> { ok, taom: { id: son } }   (ochiq, faqat sonlar)
// POST -> faqat bot chaqiradi: sarlavha x-reyting = REYTING_KEY. { items:[{id,q}], key } egasi tasdiqlaganda ball qo'shadi.
// Kalitlar: SUPABASE_URL, SUPABASE_SERVICE_KEY, REYTING_KEY (Cloudflare Variables and Secrets)
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const sb = env => ({ base: String(env.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1",
  H: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" } });

export async function onRequestGet({ env }) {
  try {
    const { base, H } = sb(env);
    const r = await fetch(`${base}/taom_reyting?select=id,n&order=n.desc&limit=300`, { headers: H });
    const rows = await r.json(); if (!r.ok) throw new Error("db");
    const taom = {}; rows.forEach(x => { if (x.id && x.n > 0) taom[x.id] = x.n; });
    return json(200, { ok: true, taom });
  } catch (e) { return json(200, { ok: true, taom: {} }); }
}

export async function onRequestPost({ request, env }) {
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  if (!env.REYTING_KEY || request.headers.get("x-reyting") !== env.REYTING_KEY) return json(401, { ok: false });
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 120).map(x => String((x && x.id) || "").slice(0, 40)).filter(Boolean);
  if (!items.length) return json(400, { ok: false });
  try {
    const { base, H } = sb(env);
    const r = await fetch(`${base}/rpc/reyting_qosh`, { method: "POST", headers: H, body: JSON.stringify({ ids: [...new Set(items)] }) });
    if (!r.ok) throw new Error("db");
    return json(200, { ok: true, n: items.length });
  } catch (e) { return json(500, { ok: false }); }
}
