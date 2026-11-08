// Sharh qoldirgan mehmonga sovg'a kodi (manzil: /api/kod). Kod 1% chegirma beradi, admin tekshiradi.
//  POST  (hamma): {email} Gmail ga bitta kod beradi (har Gmail ga faqat bir marta).
//  GET   (admin): ?code=NZ-XXXXX holatini ko'rsatadi; kodsiz oxirgi 40 ta kod ro'yxati.
//  PATCH (admin): {code} kodni ishlatilgan deb belgilaydi.
import { json, esc, sb, isAdmin, limited, toStaff } from "./_h.js";

const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";                      // 0/O, 1/I/L kabi adashadigan belgilarsiz
const norm = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^NZ/, "");
const pretty = c => "NZ-" + c;

export const onRequestOptions = () => new Response(null, { status: 204 });

// Gmail ni yagona shaklga keltiramiz: nuqtalar va +belgi e'tiborga olinmaydi (a.b+x@gmail.com = ab@gmail.com)
function gmail(e) {
  const m = String(e || "").trim().toLowerCase().match(/^([a-z0-9._+-]{3,64})@(gmail\.com|googlemail\.com)$/);
  if (!m) return "";
  const u = m[1].split("+")[0].replace(/\./g, "");
  return u.length >= 3 ? u + "@gmail.com" : "";
}

export async function onRequestPost({ request, env }) {
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  const email = gmail(p.email);
  if (!email) return json(400, { ok: false, error: "Gmail manzilini to‘g‘ri yozing, masalan ismingiz@gmail.com" });
  const { base, H } = sb(env);
  // shu Gmail ga kod avval berilgan bo'lsa, yangisini bermaymiz: o'sha kodni qaytaramiz
  const ex = await fetch(`${base}/kodlar?select=code,used&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: H });
  const exr = await ex.json().catch(() => null);
  if (!ex.ok || !Array.isArray(exr)) return json(500, { ok: false, error: "server xatosi" });
  if (exr[0]) {
    if (exr[0].used) return json(409, { ok: false, error: "Bu Gmail uchun kod avval berilgan va ishlatilgan. Qayta berilmaydi." });
    return json(200, { ok: true, code: pretty(exr[0].code), again: true });
  }
  // umumiy Wi-Fi bitta IP bo'lishi mumkin, shuning uchun IP chegarasi kengroq; asosiy to'siq Gmail
  if (await limited(env, request, "kod", 5, 86400)) return json(429, { ok: false, error: "bugun juda ko‘p urinish bo‘ldi" });
  for (let t = 0; t < 5; t++) {
    const raw = crypto.getRandomValues(new Uint8Array(5));
    const c = [...raw].map(b => ABC[b % ABC.length]).join("");
    const r = await fetch(`${base}/kodlar`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ code: c, email, created: Date.now() / 1000, used: false }) });
    if (r.ok) {
      // xodimlar guruhiga xabar: kassir sharhni tekshirib qo'yishi uchun
      try { await toStaff(env, `⭐ <b>Sharh qoldirdim deb kod oldi</b>

Gmail: ${esc(email)}
Kod: <b>${pretty(c)}</b>

Google xaritada sharhni tekshiring, topilsa ${"1%"} chegirma bering.`); } catch (e) { console.log("staff:", e); }
      return json(200, { ok: true, code: pretty(c) });
    }
    const body = await r.text();
    if (r.status === 409 && /email/.test(body)) { // ikki so'rov bir vaqtda kelgan
      return json(409, { ok: false, error: "Bu Gmail uchun kod allaqachon berilgan. Sahifani yangilang." });
    }
    if (r.status !== 409) { console.log("kod POST:", body); break; }
  }
  return json(500, { ok: false, error: "kod berilmadi" });
}

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  const { base, H } = sb(env);
  const code = norm(new URL(request.url).searchParams.get("code"));
  const q = code ? `code=eq.${code}` : "order=created.desc&limit=40";
  const r = await fetch(`${base}/kodlar?select=code,email,created,used,used_at&${q}`, { headers: H });
  const rows = await r.json();
  if (!r.ok || !Array.isArray(rows)) return json(500, { ok: false, error: "server xatosi" });
  const view = x => ({ code: pretty(x.code), created: x.created, used: !!x.used, used_at: x.used_at || null, email: x.email || "" });
  if (code) return json(200, { ok: true, found: rows.length > 0, item: rows[0] ? view(rows[0]) : null });
  return json(200, { ok: true, items: rows.map(view) });
}

export async function onRequestPatch({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  const code = norm(p.code);
  if (code.length !== 5) return json(400, { ok: false, error: "kod noto‘g‘ri" });
  const { base, H } = sb(env);
  // faqat hali ishlatilmagan kodni belgilaymiz: ikki marta chegirma berilmasin
  const r = await fetch(`${base}/kodlar?code=eq.${code}&used=eq.false`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ used: true, used_at: Date.now() / 1000 }) });
  const rows = await r.json();
  if (!r.ok) return json(500, { ok: false, error: "server xatosi" });
  return json(200, { ok: true, marked: Array.isArray(rows) && rows.length > 0 });
}
