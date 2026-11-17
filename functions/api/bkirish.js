// Banket kodi bilan kirish (manzil: /api/bkirish).
// POST {code}  -> kod to'g'ri bo'lsa {ok:true, token, name}. Token 12 soat amal qiladi.
// GET  (sarlavha x-banket: token) -> token hali amalda bo'lsa {ok:true, name}.
import { json, sb, limited } from "./_h.js";
import { sha256hex, same, signToken, verifyToken, hasSecret } from "./_bk.js";

const TTL = 12 * 3600;
export const onRequestOptions = () => new Response(null, { status: 204 });

export async function onRequestGet({ request, env }) {
  const t = await verifyToken(env, request.headers.get("x-banket"));
  return t ? json(200, { ok: true, name: t.n }) : json(401, { ok: false });
}

export async function onRequestPost({ request, env }) {
  if (!hasSecret(env)) return json(503, { ok: false, error: "server sozlanmagan (ADMIN_PASSWORD yo‘q)" });
  if (await limited(env, request, "bkirish", 10, 3600)) return json(429, { ok: false, error: "juda ko‘p urinish, 1 soatdan keyin qayta urinib ko‘ring" });
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  const code = String(p.code || "").trim();
  if (code.length < 4 || code.length > 40) return json(401, { ok: false, error: "kod noto‘g‘ri" });
  const { base, H } = sb(env);
  let rows;
  try { rows = await (await fetch(`${base}/banket_kodlar?select=id,name,salt,hash`, { headers: H })).json(); } catch (e) { rows = null; }
  if (!Array.isArray(rows)) return json(500, { ok: false, error: "server xatosi" });
  let hit = null;
  for (const r of rows) {                                   // hammasini tekshiradi (vaqt farqi bilmasin)
    const h = await sha256hex(r.salt + ":" + code);
    if (same(h, r.hash)) hit = r;
  }
  if (!hit) { await new Promise(r => setTimeout(r, 700)); return json(401, { ok: false, error: "kod noto‘g‘ri" }); }
  const now = Date.now() / 1000;
  await fetch(`${base}/banket_kodlar?id=eq.${hit.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ last_login: now }) }).catch(() => {});
  const token = await signToken(env, { id: hit.id, n: hit.name, exp: Math.floor(now) + TTL });
  return json(200, { ok: true, token, name: hit.name });
}
