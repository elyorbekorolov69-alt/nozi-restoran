// Admin yuklagan rasm va videolar (manzil: /api/upload). Supabase Storage'dagi ochiq "media" qutisiga yoziladi.
// Chaqirish: PUT /api/upload?name=taom.jpg  (tanasi fayl baytlari, Content-Type fayl turi), sarlavha x-admin: parol
import { json, sb, isAdmin } from "./_h.js";

const OK = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" };
const MAX = 48 * 1024 * 1024;

export const onRequestOptions = () => new Response(null, { status: 204 });

export async function onRequestPut({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  const ext = OK[type];
  if (!ext) return json(415, { ok: false, error: "faqat JPG, PNG, WEBP, MP4, WEBM" });
  const len = +request.headers.get("Content-Length") || 0;
  if (len > MAX) return json(413, { ok: false, error: "fayl 48 MB dan katta" });
  const raw = new URL(request.url).searchParams.get("name") || "fayl";
  const stem = raw.replace(/\.[a-z0-9]+$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "fayl";
  const path = `${Date.now().toString(36)}-${stem}.${ext}`;
  const { url, H } = sb(env);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX) return json(413, { ok: false, error: "fayl 48 MB dan katta" });
  const r = await fetch(`${url}/storage/v1/object/media/${path}`, { method: "POST",
    headers: { apikey: H.apikey, Authorization: H.Authorization, "Content-Type": type, "x-upsert": "true", "Cache-Control": "max-age=31536000" }, body: bytes });
  if (!r.ok) { console.log("upload:", await r.text()); return json(500, { ok: false, error: "yuklanmadi" }); }
  return json(200, { ok: true, url: `${url}/storage/v1/object/public/media/${path}`, type });
}
