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
  // Har kuni bir marta (09:00 dan keyin) egasiga: banketlarda ko'p aytilgan, lekin 3D modeli yo'q taomlar (kuniga 3 tadan)
  let models = "";
  if (now.getUTCHours() >= 9) {
    try {
      const ins = await fetch(`${base}/banket_eslatma`, { method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ banket_id: 0, kind: "model:" + today, ts: Date.now() / 1000 }) });
      const got = await ins.json().catch(() => null);
      if (ins.ok && Array.isArray(got) && got.length) {
        const M = await (await fetch(new URL("/asboblar/modellar.json", request.url))).json();
        const have = new Set(M.have || []), names = M.names || {}, cnt = {};
        for (const r of rows) { let d = {}; try { d = JSON.parse(r.data || "{}"); } catch (e) {} (d.items || []).forEach(x => { if (x && x.id && names[x.id] && !have.has(x.id)) cnt[x.id] = (cnt[x.id] || 0) + 1; }); }
        // admin panelda kiritilgan banket tarixi (matn): menyudagi nomlar bo'yicha sanaymiz
        try {
          const tr = await (await fetch(`${base}/content?select=value&key=eq.priv.tarix`, { headers: H })).json();
          const T = Array.isArray(tr) && tr[0] && Array.isArray(tr[0].value) ? tr[0].value : [];
          T.forEach(t => { const txt = String(t.items || "").toLowerCase(); Object.entries(names).forEach(([id, n]) => { const key = String(n).toLowerCase().replace(/\s*\d.*$/, "").trim(); if (key.length > 3 && !have.has(id) && txt.includes(key)) cnt[id] = (cnt[id] || 0) + 1; }); });
        } catch (e) {}
        const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
        if (top.length) {
          const body = "🧩 <b>Bugungi 3D modellar</b> (banketlarda ko‘p aytilgan, lekin saytda modeli yo‘q):\n\n" +
            top.slice(0, 3).map(([id, n], i) => `${i + 1}. ${esc(names[id])} — ${n} marta`).join("\n") +
            (top.length > 3 ? `\n\nYana ${top.length - 3} ta taomning modeli yo‘q.` : "") + "\n\nRasmini Tripo’da yasab, Downloads papkasiga tashlang — saytga men qo‘yaman.";
          const owners = String(env.ADMIN_IDS || "").split(",").map(x => x.trim()).filter(Boolean);
          for (const c of owners) { try { await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: c, text: body, parse_mode: "HTML" }) }); } catch (e) {} }
          models = top.slice(0, 3).map(x => x[0]).join(",");
        }
      }
    } catch (e) { models = "xato: " + String(e.message || e).slice(0, 80); }
  }
  return json(200, { ok: true, today, tomorrow, checked: rows.length, sent, models });
}

export const onRequestGet = run;
export const onRequestPost = run;
