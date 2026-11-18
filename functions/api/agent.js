// NoZi Banket AI yordamchisi (manzil: /api/agent). Faqat Banket kodi bilan kirganlar ishlatadi (x-banket).
// POST { message, history:[{r:"u"|"a",t}], menu:"id|nom|narx|bo'lim|kg\n...", state:{guests,type,hall,date,chosen:[{id,q}]} }
// Javob: { ok, reply, guests, type, add:[{id,q}], remove:[id], course:{id:"c1|c2|c3|dasturxon|desert"}, via }
// AI faqat tavsiya beradi. Narxni sayt o'zi menyudan hisoblaydi, id larni sayt tekshiradi.
// Kalitlar (Cloudflare > Variables and Secrets), bor bo'lganlari shu tartibda sinab ko'riladi:
//   ANTHROPIC_API_KEY (Claude), GEMINI_API_KEY (+ zaxira GEMINI_API_KEY_2), GROQ_API_KEY, OPENROUTER_API_KEY
import { json, limited } from "./_h.js";
import { verifyToken } from "./_bk.js";

export const onRequestOptions = () => new Response(null, { status: 204 });
export const onRequestGet = () => json(405, { ok: false, error: "faqat POST" });

const RULES = `Sen NoZi restorani (Samarqand) banket yordamchisisan. Vazifang: tadbir uchun taom tanlash, miqdorini belgilash, qaysi taom qaysi navbatda chiqishini aytish va narxga ta'sir qiladigan narsalarni egasidan so'rash.
QOIDALAR:
- Taomni FAQAT berilgan menyu ro'yxatidagi id bilan tanla. Id o'ylab topma. Narxni o'zing aytma, uni sayt hisoblaydi.
- Miqdor (q): tanlangan sondagi porsiya, avtomatik ko'paytirilmaydi. Kilogramm bilan hisoblanadigan taomlarda (ro'yxatda "kg" belgisi bor) q doim 1: sayt grammni mehmon soniga qarab o'zi hisoblaydi.
- Mehmon soni, tadbir turi (banket/toy), sanasi noma'lum bo'lsa, avval shuni so'ra. Soni ma'lum bo'lsa "guests" ni qaytar.
- Tushunarli bo'lmagan narsani o'zing taxmin qilma, so'ra. Bir javobda ko'pi bilan 2 ta savol ber.
- Komplekt suv (1 sok, 1 gazli ichimlik: Cola/Fanta/Pepsi, 2 Mojito, 1 gazsiz suv) uchun egasidan so'ra: bir komplektga nechta mehmon, narxi, sok turlari. Javob olmasdan bu haqda narx yoki son o'ylab topma.
- Muvozanatli to'plam tuz: sovuq gazak, salat, issiq taom, asosiy taom/kabob, non, ichimlik, desert/meva. Byudjet aytilsa unga qarab tanla.
- Chiqish navbati (course): "dasturxon" (stol ustida boshidan: sovuq, salat, non, ichimlik, meva), "c1" (birinchi taom), "c2" (issiq/asosiy), "c3" (kolbasa/shashlik), "desert".
- Yakuniy qarorni restoran egalari qiladi. Sen faqat tavsiya berasan.
- Javobni foydalanuvchi yozgan tilda ber (o'zbek, rus, ingliz yoki tojik). Qisqa va oddiy yoz.
FAQAT shu JSON ni qaytar, boshqa matn yozma:
{"reply":"foydalanuvchiga matn","guests":son yoki null,"type":"banket"|"toy"|null,"add":[{"id":"menyu id","q":son}],"remove":["id"],"course":{"id":"dasturxon|c1|c2|c3|desert"}}`;

const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

async function callClaude(env, sys, msgs) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1500, system: sys, messages: msgs.map(m => ({ role: m.role, content: m.content })) }) });
  if (!r.ok) throw new Error("claude " + r.status);
  const j = await r.json(); return (j.content || []).map(c => c.text || "").join("");
}
async function callGemini(env, sys, msgs, key) {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST",
    headers: { "x-goog-api-key": key || env.GEMINI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
      contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }) });
  if (!r.ok) throw new Error("gemini " + r.status);
  const j = await r.json(); return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || "").join("");
}
async function callOpenAIish(url, key, model, sys, msgs, extra = {}) {
  const r = await fetch(url, { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json", ...extra },
    body: JSON.stringify({ model, temperature: 0.4, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, ...msgs] }) });
  if (!r.ok) throw new Error(model + " " + r.status);
  const j = await r.json(); return (((j.choices || [])[0] || {}).message || {}).content || "";
}
const callGroq = (env, sys, msgs) => callOpenAIish("https://api.groq.com/openai/v1/chat/completions", env.GROQ_API_KEY, env.GROQ_MODEL || "llama-3.3-70b-versatile", sys, msgs);
const callOR = (env, sys, msgs) => callOpenAIish("https://openrouter.ai/api/v1/chat/completions", env.OPENROUTER_API_KEY, env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001", sys, msgs);

function parse(txt) {
  let t = String(txt || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("json yo'q");
  return JSON.parse(t.slice(a, b + 1));
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyToken(env, request.headers.get("x-banket")))) return json(401, { ok: false, error: "Banket kodi kerak" });
  if (await limited(env, request, "agent", 60, 3600)) return json(429, { ok: false, error: "juda ko‘p so‘rov, birozdan keyin urinib ko‘ring" });
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  const message = clip(p.message, 1200).trim();
  if (!message) return json(400, { ok: false, error: "xabar bo‘sh" });
  const menu = clip(p.menu, 14000), st = p.state && typeof p.state === "object" ? p.state : {};
  const sys = RULES + "\n\nMENYU (id|nom|narx so'm|bo'lim|kg belgisi):\n" + menu +
    "\n\nHOZIRGI HOLAT: mehmonlar " + (+st.guests || "noma'lum") + ", tur " + clip(st.type, 20) + ", zal " + clip(st.hall, 40) + ", sana " + clip(st.date, 12) +
    ", tanlanganlar: " + clip(JSON.stringify(Array.isArray(st.chosen) ? st.chosen.slice(0, 80) : []), 1500);
  const msgs = [];
  (Array.isArray(p.history) ? p.history.slice(-8) : []).forEach(h => { if (h && h.t) msgs.push({ role: h.r === "a" ? "assistant" : "user", content: clip(h.t, 800) }); });
  msgs.push({ role: "user", content: message });
  // bir xil rolli ketma-ket xabarlarni birlashtirish (ba'zi AI lar talab qiladi)
  const merged = []; msgs.forEach(m => { const l = merged[merged.length - 1]; if (l && l.role === m.role) l.content += "\n" + m.content; else merged.push({ ...m }); });
  if (merged[0] && merged[0].role !== "user") merged.shift();

  const chain = [["claude", env.ANTHROPIC_API_KEY, callClaude], ["gemini", env.GEMINI_API_KEY, callGemini], ["gemini2", env.GEMINI_API_KEY_2, (e, a, b) => callGemini(e, a, b, e.GEMINI_API_KEY_2)], ["groq", env.GROQ_API_KEY, callGroq], ["openrouter", env.OPENROUTER_API_KEY, callOR]].filter(c => c[1]);
  if (!chain.length) return json(503, { ok: false, error: "AI kaliti sozlanmagan (Cloudflare’da GEMINI_API_KEY qo‘shing)" });
  for (const [via, , fn] of chain) {
    try {
      const o = parse(await fn(env, sys, merged));
      return json(200, { ok: true, via, reply: clip(o.reply, 1500), guests: Number.isFinite(+o.guests) && +o.guests >= 1 ? Math.round(+o.guests) : null,
        type: o.type === "toy" || o.type === "banket" ? o.type : null,
        add: (Array.isArray(o.add) ? o.add : []).slice(0, 40).map(x => ({ id: clip(x && x.id, 40), q: Math.max(1, Math.min(40, Math.round(+(x && x.q) || 1))) })),
        remove: (Array.isArray(o.remove) ? o.remove : []).slice(0, 40).map(x => clip(x, 40)),
        course: o.course && typeof o.course === "object" ? o.course : {} });
    } catch (e) { console.log("agent:", e.message); }
  }
  return json(502, { ok: false, error: "AI hozir javob bermadi, qayta urinib ko‘ring" });
}
