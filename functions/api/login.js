// Admin kirishi (manzil: /api/login). Parol Cloudflare'dagi ADMIN_PASSWORD bilan solishtiriladi.
import { json, isAdmin } from "./_h.js";

export const onRequestOptions = () => new Response(null, { status: 204 });
export async function onRequestPost({ request, env }) {
  if (String(env.ADMIN_PASSWORD || "").length < 6) return json(503, { ok: false, error: "ADMIN_PASSWORD hali Cloudflare’da kiritilmagan" });
  return (await isAdmin(request, env)) ? json(200, { ok: true }) : json(401, { ok: false, error: "parol noto‘g‘ri" });
}
