// Anonim fikr (manzil: /api/fikr). Xodimlar guruhiga Telegramda yuboriladi.
import { json, esc, sb, limited, toStaff } from "./_h.js";

export const onRequestOptions = () => new Response(null, { status: 204 });

export async function onRequestPost({ request, env }) {
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  if (p.website) return json(200, { ok: true });                       // robotlar uchun tuzoq
  const text = String(p.text || "").trim().slice(0, 1500);
  if (text.length < 5) return json(400, { ok: false, error: "fikr juda qisqa" });
  if (await limited(env, request, "fikr", 4, 3600)) return json(429, { ok: false, error: "juda ko‘p yuborildi, keyinroq urinib ko‘ring" });
  const { base, H } = sb(env);
  fetch(`${base}/fikr`, { method: "POST", headers: H, body: JSON.stringify({ text, created: Date.now() / 1000 }) }).catch(() => {});
  const stol = Math.min(99, parseInt(p.stol, 10) || 0);
  const ok = await toStaff(env, `💬 <b>Anonim fikr</b>${stol ? ` · ${stol}-stol` : ""}\n\n${esc(text)}`);
  return ok ? json(200, { ok: true }) : json(502, { ok: false, error: "yuborib bo‘lmadi" });
}
