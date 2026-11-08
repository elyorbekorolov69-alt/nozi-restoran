// Umumiy yordamchilar (boshqa funksiyalar import qiladi). O'zi alohida manzil emas.
export const json = (code, obj, extra = {}) =>
  new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sb(env) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_KEY;
  return { url, base: url + "/rest/v1", H: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" } };
}

// Admin paroli Cloudflare'da ADMIN_PASSWORD nomi bilan turadi (Secret). Brauzer uni x-admin sarlavhasida yuboradi.
export async function isAdmin(request, env) {
  const want = String(env.ADMIN_PASSWORD || "");
  const got = String(request.headers.get("x-admin") || "");
  if (want.length < 6 || !got) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(want)), crypto.subtle.digest("SHA-256", enc.encode(got))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  if (d !== 0) await new Promise(r => setTimeout(r, 600));          // tez-tez taxmin qilishni sekinlashtiradi
  return d === 0;
}

// bir IP uchun soatiga/kuniga cheklov (hits jadvali orqali)
export async function limited(env, request, kind, max, windowSec) {
  const { base, H } = sb(env);
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const now = Date.now() / 1000;
  try {
    const q = `${base}/hits?select=ts&ip=eq.${encodeURIComponent(ip)}&kind=eq.${kind}&ts=gt.${now - windowSec}`;
    const hits = await (await fetch(q, { headers: H })).json();
    if (Array.isArray(hits) && hits.length >= max) return true;
    await fetch(`${base}/hits`, { method: "POST", headers: H, body: JSON.stringify({ ip, kind, ts: now }) });
  } catch (e) { /* baza ishlamasa ham so'rovni to'xtatmaymiz */ }
  return false;
}

export async function telegram(env, chat, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) });
    const j = await r.json(); return !!j.ok;
  } catch (e) { return false; }
}

export async function toStaff(env, text) {
  const staff = String(env.STAFF_CHAT_ID || "").trim();
  if (staff && await telegram(env, staff, text)) return true;
  let ok = false;
  for (const a of String(env.ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean)) if (await telegram(env, a, text)) ok = true;
  return ok;
}
