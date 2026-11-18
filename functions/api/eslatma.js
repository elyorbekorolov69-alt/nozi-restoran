// Banket eslatmalari (Cloudflare Pages Function, manzil: /api/eslatma?key=CRON_SECRET).
// Tashqi bepul "cron" xizmati (masalan cron-job.org) buni har soatda chaqiradi.
// Banketdan 1 kun oldin va banket kuni ertalab (Toshkent vaqti bilan 08:00 dan keyin) xodimlar guruhiga xabar yuboradi.
// Har eslatma bitta marta ketadi: banket_eslatma jadvalidagi (id, tur) takrorlanmaydi.
// Sozlamalar: SUPABASE_URL, SUPABASE_SERVICE_KEY, BOT_TOKEN, STAFF_CHAT_ID, ADMIN_IDS, CRON_SECRET
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { "Content-Type": "application/json" } });

const tashkent = (ms = Date.now()) => new Date(ms + 5 * 3600 * 1000);          // UTC+5, yozgi vaqt yo'q
const ymd = d => d.toISOString().slice(0, 10);

async function run({ request, env }) {
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!env.CRON_SECRET || key !== env.CRON_SECRET) return json(401, { ok: false, error: "kalit noto‘g‘ri" });
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1";
  const H = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_KEY, "Content-Type": "application/json" };
  const now = tashkent();
  const today = ymd(now), tomorrow = ymd(tashkent(Date.now() + 86400000));
  const morning = now.getUTCHours() >= 8;

  const since = Date.now() / 1000 - 200 * 86400;
  const rows = await (await fetch(`${base}/banket?select=id,data,text,status&created=gt.${since}&order=id.desc&limit=500`, { headers: H })).json();
  if (!Array.isArray(rows)) return json(500, { ok: false, error: "baza xatosi" });

  const targets = [];
  const staff = String(env.STAFF_CHAT_ID || "").trim();
  const chats = staff ? [staff] : String(env.ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
  const sent = [];
  for (const r of rows) {
    if (r.status === "no") continue;                                               // rad etilganlarga eslatma yo'q
    let d = {}; try { d = JSON.parse(r.data || "{}"); } catch (e) {}
    const date = String(d.date || "");
    let kind = "";
    if (date === tomorrow) kind = "1kun";
    else if (date === today && morning) kind = "kuni";
    if (!kind) continue;
    // avval belgilaymiz: takror yozuv bo'lsa, xabar yuborilmaydi
    const ins = await fetch(`${base}/banket_eslatma`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ banket_id: r.id, kind, ts: Date.now() / 1000 }) });
    const got = await ins.json().catch(() => null);
    if (!ins.ok || !Array.isArray(got) || !got.length) continue;
    const head = kind === "1kun" ? "⏰ <b>Ertaga banket!</b>" : "🔔 <b>Bugun banket!</b>";
    let shown = String(r.text || "").slice(0, 3000);
    const body = `${head}  (#${r.id})\n\n<pre>${esc(shown)}</pre>`;
    for (const c of chats) {
      try {
        await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: c, text: body, parse_mode: "HTML", disable_web_page_preview: true }) });
      } catch (e) {}
    }
    sent.push(`${r.id}:${kind}`);
  }
  return json(200, { ok: true, today, tomorrow, checked: rows.length, sent });
}

export const onRequestGet = run;
export const onRequestPost = run;
