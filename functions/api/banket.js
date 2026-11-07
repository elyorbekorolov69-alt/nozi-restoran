// Saytdagi Banket so'rovi (Cloudflare Pages Function, manzil: /api/banket).
// Bazaga Supabase REST orqali yozadi va NoZi xodimlariga Telegramda yuboradi.
// Kalitlar kodda emas, Cloudflare sozlamalarida (Variables and Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, BOT_TOKEN, STAFF_CHAT_ID, ADMIN_IDS, BOT_USERNAME
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json" } });

export const onRequestOptions = () => new Response(null, { status: 204 });
export const onRequestGet = () => json(405, { ok: false, error: "faqat POST" });

export async function onRequestPost({ request, env }) {
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  if (p.website) return json(200, { ok: true, id: 0, link: "" });
  const digits = String(p.phone || "").replace(/\D/g, "");
  if (String(p.text || "").trim().length < 20 || digits.length < 9) return json(400, { ok: false, error: "so‘rov to‘liq emas" });

  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1";
  const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" };
  const ip = request.headers.get("CF-Connecting-IP") || "?";
  const now = Date.now() / 1000;
  const data = {};
  for (const k of ["name", "phone", "date", "time", "guests", "hall", "total", "lang"]) data[k] = String(p[k] ?? "").slice(0, 300);
  const text = String(p.text).slice(0, 3500);

  let id, code;
  try {
    const q = `${base}/hits?select=ts&ip=eq.${encodeURIComponent(ip)}&kind=eq.banket&ts=gt.${now - 3600}`;
    const hits = await (await fetch(q, { headers: H })).json();
    if (Array.isArray(hits) && hits.length >= 5) return json(429, { ok: false, error: "juda ko‘p so‘rov, keyinroq urinib ko‘ring" });
    await fetch(`${base}/hits`, { method: "POST", headers: H, body: JSON.stringify({ ip, kind: "banket", ts: now }) });
    await fetch(`${base}/hits?ts=lt.${now - 86400}`, { method: "DELETE", headers: H });

    code = [...crypto.getRandomValues(new Uint8Array(3))].map(b => b.toString(16).padStart(2, "0")).join("");
    const r = await fetch(`${base}/banket`, { method: "POST", headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ source: "sayt", chat_id: null, code, data: JSON.stringify(data), text, created: now }) });
    const row = await r.json();
    if (!r.ok || !row[0]) throw new Error(JSON.stringify(row));
    id = row[0].id;
  } catch (e) { console.log("Baza xatosi:", e.message); return json(500, { ok: false, error: "server xatosi" }); }

  let shown = text;
  while (esc(shown).length > 3000) shown = shown.slice(0, Math.floor(shown.length * 0.8));
  if (shown !== text) shown += "\n…(matn qisqartirildi)";
  const body = `🌐 <b>Saytdan so‘rov #${id}</b>\n\n<pre>${esc(shown)}</pre>\n\nHolat: 🆕 Yangi`;
  const kb = { inline_keyboard: [[{ text: "✅ Tasdiqlash", callback_data: `st:${id}:ok` }, { text: "❌ Rad etish", callback_data: `st:${id}:no` }],
                                  [{ text: "📞 Bog‘lanildi", callback_data: `st:${id}:call` }]] };
  const send = async chat => {
    try {
      const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat, text: body, parse_mode: "HTML", reply_markup: kb, disable_web_page_preview: true }) });
      const j = await r.json(); return j.ok ? j.result : null;
    } catch (e) { return null; }
  };
  let delivered = false;
  const staff = String(env.STAFF_CHAT_ID || "").trim();
  if (staff) {
    const s = await send(staff);
    if (s) { delivered = true; await fetch(`${base}/banket?id=eq.${id}`, { method: "PATCH", headers: H, body: JSON.stringify({ group_msg: s.message_id }) }).catch(() => {}); }
  }
  if (!delivered) for (const a of String(env.ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean)) if (await send(a)) delivered = true;

  const bot = String(env.BOT_USERNAME || "").replace(/^@/, "");
  return json(200, { ok: true, id, link: bot ? `https://t.me/${bot}?start=b${id}_${code}` : "" });
}
