// NoZi Banket AI yordamchisi (manzil: /api/agent). Faqat Banket kodi bilan kirganlar ishlatadi (x-banket).
// POST { message, history:[{r:"u"|"a",t}], menu:"id|nom|narx|bo'lim|kg\n...", state:{guests,type,hall,date,chosen:[{id,q}]} }
// Javob: { ok, reply, guests, type, add:[{id,q}], remove:[id], course:{id:"c1|c2|c3|dasturxon|desert"}, via }
// AI faqat tavsiya beradi. Narxni sayt o'zi menyudan hisoblaydi, id larni sayt tekshiradi.
// Kalitlar (Cloudflare > Variables and Secrets), bor bo'lganlari shu tartibda sinab ko'riladi:
//   ANTHROPIC_API_KEY (Claude), GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY
import { json, limited, sb } from "./_h.js";
import { verifyToken } from "./_bk.js";

export const onRequestOptions = () => new Response(null, { status: 204 });
export const onRequestGet = () => json(405, { ok: false, error: "faqat POST" });

const RULES = `Sen NoZi restorani (Samarqand) banket yordamchisisan. Vazifang: tadbir uchun taom tanlash, miqdorini belgilash, qaysi taom qaysi navbatda chiqishini aytish va narxga ta'sir qiladigan narsalarni egasidan so'rash.
QOIDALAR:
- Taomni FAQAT berilgan menyu ro'yxatidagi id bilan tanla. Id o'ylab topma. Narxni o'zing aytma, uni sayt hisoblaydi.
- Miqdor (q): tanlangan sondagi porsiya, avtomatik ko'paytirilmaydi. Kilogramm bilan hisoblanadigan taomlarda (ro'yxatda "kg" belgisi bor) q doim 1: sayt grammni mehmon soniga qarab o'zi hisoblaydi.
- Mehmon soni, tadbir turi (banket/toy), sanasi noma'lum bo'lsa, avval shuni so'ra. Soni ma'lum bo'lsa "guests" ni qaytar.
- Tushunarli bo'lmagan narsani o'zing taxmin qilma, so'ra. Bir javobda ko'pi bilan 2 ta savol ber.
- Komplekt suv (1 sok, 1 gazli ichimlik: Cola/Fanta/Pepsi, 2 Mojito, 1 gazsiz suv) uchun egasidan so'ra: bir komplektga nechta mehmon, narxi, sok turlari. Komplekt qo'shilganda so'ra: gazli (Cola/Fanta/Pepsi qaysi), gazsiz (Vico), sok turlari (Sochnaya dolina va boshqa tur), nechta mehmonga bir komplekt va komplekt narxi (Vico va Sochnaya dolina qiymati ham shunga kiradi). Javob olmasdan bu haqda narx yoki son o'ylab topma.
- Muvozanatli to'plam tuz: sovuq gazak, salat, issiq taom, asosiy taom/kabob, non, ichimlik, desert/meva. Byudjet aytilsa unga qarab tanla.
- Chiqish navbati (course): "dasturxon" (stol ustida boshidan: sovuq, salat, non, ichimlik, meva), "c1" (birinchi taom), "c2" (issiq/asosiy), "c3" (kolbasa/shashlik), "desert".
- DOIMIY TARKIB (har banketda, menyudan mos id topib "add" ga SON bilan qo'sh, so'ralmasa ham): mulatka, sirniy (pishloq) assorti, go'shtlardan assorti (kolbasa/myasnoy), yaxna, meva assorti va nonlar (buxanka, qora non, chapchak: har biri alohida). Ba'zan ovoshi salati ham qo'shiladi (byudjet yetsa).
- SALATLAR: odatda O'zbek salati (va Nozi firma salati); Majnuntol, Smak va Sezar salatlari faqat onda-sonda, byudjet va mehmon ko'p bo'lsa yoki so'ralsa qo'sh. Yuqoridagi doimiy tarkib deyarli har banketda bo'ladi.
- 1-taom (c1): tushonka yoki tanakuri yoki Toshkent mastavasi dan biri. Biri menyuda bo'lmasa, qolganidan tanla.
- 2-taom (c2/c3): HAR DOIM shashlik (Muluti shashlik yoki boshqa tur). Qozon kabob kabi boshqa taomni shashlikning o'rniga qo'yma, faqat qo'shimcha sifatida.
- Tanlangan taomlarni darrov "add" bilan qaytar: sayt ularni pastdagi ro'yxatga soni bilan o'zi qo'shadi, egasi va mijoz keyin sonini o'zgartiradi.
- Yakuniy qarorni restoran egalari qiladi. Sen faqat tavsiya berasan.
- Javobni foydalanuvchi yozgan tilda ber (o'zbek, rus, ingliz yoki tojik). Qisqa va oddiy yoz.
- NON ASSORTI: mijoz hamma nonlardan (galaoso, qora non, chapchak) tanlasa, uchalasini "add" ga qo'sh va javobda "non assorti" deb ayt.
- STOLNI BEZASH (QAT'IY QOIDALAR, buzma): joylashtirishni sayt o'zi qiladi, sen faqat "bezak" maydoniga gul soni va martini haqida yoz.
  * Katta tillarang stend FAQAT sirniy assorti va meva assortiga (2 ta sirniy + 2 ta meva bo'lsa shu 4 ta). Boshqa hech narsa unga qo'yilmaydi.
  * O'rtacha oyna stendga faqat desert. Salatlar hech qachon stendga qo'yilmaydi (stolning o'ziga yoki piyolaga). Go'shtli assorti tillarang stendga.
  * Issiq taomlar (shashlik, tushonka, tanakuri, sho'rva, ikkinchi taom, kolbasa) HECH QACHON stendga qo'yilmaydi: har mehmonning o'z tagtarelkasi ustiga bir porsiyadan qo'yiladi, oq piyola olib tashlanadi. Shashlik: har mehmonga bitta six; masalan 10 mehmonga 20 six aytilsa har biriga 2 tadan.
  * Sovuq gazaklar, nonlar, baliq, oddiy salatlar (Achchiq-chuchuk, Vinegret, Yeva, Cho'poncha, O'zbek) pastda, mehmonga yaqin, olishga oson. Baliq hech qachon ko'tarilmaydi.
  * "bezak": {"gul": bir stolga nechta gul (10 mehmonga 1, 15-20 ga 2, doira stolda 1; 0 = gulsiz), "martini": true|false (martini faqat so'ralsa)} yoki null.
FAQAT shu JSON ni qaytar, boshqa matn yozma:
{"reply":"foydalanuvchiga matn","guests":son yoki null,"type":"banket"|"toy"|null,"add":[{"id":"menyu id","q":son}],"remove":["id"],"course":{"id":"dasturxon|c1|c2|c3|desert"},"bezak":{"gul":son yoki null,"martini":true|false|null} yoki null}`;

const clip = (s, n) => String(s == null ? "" : s).slice(0, n);
// Summa va marosim: summani tartib bilan taqsimlash; reyting (egasi tasdiqlagan tanlovlar) tavsiyada hisobga olinadi
function budgetBlock(st) {
  let o = "";
  if (st.event) o += `\n\nMAROSIM: ${clip(st.event, 40)}. Taom va bezakni shunga mos tavsiya qil.`;
  const b = st.budget && typeof st.budget === "object" ? st.budget : null;
  if (b && +b.pp > 0) {
    const pp = Math.round(+b.pp), tot = Math.round(+b.total) || pp * (+st.guests || 1);
    o += `\n\nBUDJET: kishiga ${pp} so'm, umumiy ${tot} so'm. Summani SHU TARTIBDA taqsimla: 1) avval 1-taom (sho'rva) va 2-taom (issiq) uchun ko'proq ulush; 2) keyin salatlar (summaga qarab nechta xil); 3) non (nechta); 4) yaxna; 5) Nozi salati; 6) issiq go'shtlar (shashlik, kabob). Jami summadan oshirma, javobda necha xil salat/non qo'shganingni qisqa ayt.`;
  }
  const pop = (Array.isArray(st.pop) ? st.pop : []).slice(0, 12).filter(x => x && x.id && +x.n > 0);
  if (pop.length) o += `\n\nREYTING (mijozlar ko'p tanlagan, egasi tasdiqlagan): ${pop.map(x => clip(x.id, 40) + " (" + Math.round(+x.n) + ")").join(", ")}. Mos kelsa shularni tavsiya qil va "bu taom ko'p tanlanadi" deb ayt; bo'lmasa o'ylab topma.`;
  return o;
}
// Narx toifasi (boshliq belgilagan): har bo'limdan nechta xil taom va qaysi id lar kiradi
function tierBlock(t) {
  if (!t || typeof t !== "object" || !t.name) return "";
  const secs = (Array.isArray(t.secs) ? t.secs : []).slice(0, 12).map(c => `- bo'lim "${clip(c.sec, 20)}": ${Math.max(0, Math.min(20, +c.n || 0))} xil` +
    (Array.isArray(c.ids) && c.ids.length ? `; FAQAT shu id lardan: ${c.ids.slice(0, 60).map(x => clip(x, 40)).join(", ")}` : "; menyudan o'zing tanla") +
    (c.extra ? `; menyuda yo'q qo'shimcha: ${clip(c.extra, 160)} (id yo'q, faqat javob matnida eslat)` : "")).join("\n");
  return `\n\nTOIFA "${clip(t.name, 40)}" (${Math.round(+t.price) || 0} so'm/kishi). Faqat shu toifa tarkibidan tanla, har bo'limdan ko'rsatilgan sondagi xil taom qo'sh, boshqa taom qo'shma:\n${secs}`;
}

async function callClaude(env, sys, msgs) {
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1500, system: sys, messages: msgs.map(m => ({ role: m.role, content: m.content })) }) });
  if (!r.ok) throw new Error("claude " + r.status);
  const j = await r.json(); return (j.content || []).map(c => c.text || "").join("");
}
async function callGemini(env, sys, msgs, key) {
  // Google eski modellarni o'chirib turadi, shuning uchun bir nechta nomni ketma-ket sinaymiz
  const models = [env.GEMINI_MODEL, "gemini-3.6-flash", "gemini-3.1-flash-lite"].filter((m, i, a) => m && a.indexOf(m) === i);
  let last = "";
  for (const model of models) {
    let r; try { r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST",
      headers: { "x-goog-api-key": (key || env.GEMINI_API_KEY || "").trim(), "content-type": "application/json" },
      signal: AbortSignal.timeout(14000),
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
        contents: msgs.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }) }); } catch (e) { last = model + " vaqt tugadi"; continue; }
    if (r.ok) { const j = await r.json(); console.log("gemini ok:", model); return ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(p => p.text || "").join(""); }
    let msg = ""; try { msg = ((await r.json()).error || {}).message || ""; } catch (e) {}
    last = model + " " + r.status + " " + msg.slice(0, 70);
    if (r.status === 401 || r.status === 403 || r.status === 429) break;   // kalit yoki limit muammosi, model emas
  }
  throw new Error(last);
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

// bezak: faqat ma'lum maydonlar va stend nomlari o'tadi
function bezak(z) {
  if (!z || typeof z !== "object") return null;
  const o = {};
  if (Number.isFinite(+z.gul) && z.gul !== null) o.gul = Math.max(0, Math.min(12, Math.round(+z.gul)));
  if (typeof z.martini === "boolean") o.martini = z.martini;
  return Object.keys(o).length ? o : null;
}
// "Miya": asboblar/agent-miya.md faylidagi egasi qoidalari har so'rovda promptga qo'shiladi (fayl o'zgarsa agent shuni o'qiydi)
let MIYA = "", MIYA_T = 0;
async function miya(request) {
  if (MIYA && Date.now() - MIYA_T < 300000) return MIYA;
  try { const r = await fetch(new URL("/asboblar/agent-miya.md", request.url)); if (r.ok) { MIYA = (await r.text()).slice(0, 6000); MIYA_T = Date.now(); } } catch (e) { /* fayl topilmasa asosiy qoidalar ishlayveradi */ }
  return MIYA;
}

// Banket tarixi: egasi admin panelda kiritgan oldingi banketlar (content jadvali, kalit "priv.tarix"). Mehmon soni yaqinlarini tanlab beramiz.
let TARIX = null, TARIX_T = 0;
async function tarixBlock(env, guests) {
  try {
    if (!TARIX || Date.now() - TARIX_T > 120000) {
      const { base, H } = sb(env);
      const r = await fetch(`${base}/content?select=value&key=eq.priv.tarix`, { headers: H });
      const rows = await r.json(); TARIX = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].value) ? rows[0].value : []; TARIX_T = Date.now();
    }
  } catch (e) { TARIX = TARIX || []; }
  if (!TARIX.length) return "";
  const g = +guests || 0;
  const pick = TARIX.slice().sort((a, b) => g ? Math.abs((+a.guests || 0) - g) - Math.abs((+b.guests || 0) - g) : 0).slice(0, 10);
  return "\n\nBANKET TARIXI (egasi kiritgan, haqiqatda bo'lgan banketlar; miqdorlarni mehmon soniga qarab SHULARGA o'xshatib tanla, javobda 'tarixdagi N kishilik banketga qarab' deb qisqa ayt):\n" +
    pick.map(t => `- ${clip(t.date, 12) || "sana yo'q"}, ${+t.guests || "?"} kishi${t.shape ? ", " + (t.shape === "long" ? "to'rtburchak" : "dumaloq") + " stol" : ""}, jami ${+t.total || "?"} so'm${+t.total && +t.guests ? " (kishiga " + Math.round(t.total / t.guests) + ")" : ""}: ${clip(String(t.items || "").replace(/\s*\n\s*/g, "; "), 600)}${t.note ? " [" + clip(t.note, 120) + "]" : ""}`).join("\n");
}

export async function onRequestPost({ request, env }) {
  if (!(await verifyToken(env, request.headers.get("x-banket")))) return json(401, { ok: false, error: "Banket kodi kerak" });
  if (await limited(env, request, "agent", 60, 3600)) return json(429, { ok: false, error: "juda ko‘p so‘rov, birozdan keyin urinib ko‘ring" });
  let p; try { p = await request.json(); } catch (e) { p = {}; }
  const message = clip(p.message, 1200).trim();
  if (!message) return json(400, { ok: false, error: "xabar bo‘sh" });
  const menu = clip(p.menu, 14000), st = p.state && typeof p.state === "object" ? p.state : {};
  const sys = RULES + (await miya(request) ? "\n\nEGASINING QOIDALARI (miya, doim bajar):\n" + MIYA : "") + "\n\nMENYU (id|nom|narx so'm|bo'lim|kg belgisi):\n" + menu +
    "\n\nHOZIRGI HOLAT: mehmonlar " + (+st.guests || "noma'lum") + ", tur " + clip(st.type, 20) + ", zal " + clip(st.hall, 40) + ", sana " + clip(st.date, 12) +
    ", tanlanganlar: " + clip(JSON.stringify(Array.isArray(st.chosen) ? st.chosen.slice(0, 80) : []), 1500) + tierBlock(st.tier) + budgetBlock(st) + await tarixBlock(env, st.guests);
  const msgs = [];
  (Array.isArray(p.history) ? p.history.slice(-8) : []).forEach(h => { if (h && h.t) msgs.push({ role: h.r === "a" ? "assistant" : "user", content: clip(h.t, 800) }); });
  msgs.push({ role: "user", content: message });
  // bir xil rolli ketma-ket xabarlarni birlashtirish (ba'zi AI lar talab qiladi)
  const merged = []; msgs.forEach(m => { const l = merged[merged.length - 1]; if (l && l.role === m.role) l.content += "\n" + m.content; else merged.push({ ...m }); });
  if (merged[0] && merged[0].role !== "user") merged.shift();

  const chain = [["claude", env.ANTHROPIC_API_KEY, callClaude], ["gemini", env.GEMINI_API_KEY, callGemini], ["gemini2", env.GEMINI_API_KEY_2, (e, x, y) => callGemini(e, x, y, e.GEMINI_API_KEY_2)], ["groq", env.GROQ_API_KEY, callGroq], ["openrouter", env.OPENROUTER_API_KEY, callOR]].filter(c => c[1]);
  if (!chain.length) return json(200, { ok: false, error: "AI kaliti sozlanmagan (Cloudflare’da GEMINI_API_KEY qo‘shing)" });
  const fails = [];
  for (const [via, , fn] of chain) {
    try {
      const o = parse(await fn(env, sys, merged));
      return json(200, { ok: true, via, reply: clip(o.reply, 1500), guests: Number.isFinite(+o.guests) && +o.guests >= 1 ? Math.round(+o.guests) : null,
        type: o.type === "toy" || o.type === "banket" ? o.type : null,
        add: (Array.isArray(o.add) ? o.add : []).slice(0, 40).map(x => ({ id: clip(x && x.id, 40), q: Math.max(1, Math.min(40, Math.round(+(x && x.q) || 1))) })),
        remove: (Array.isArray(o.remove) ? o.remove : []).slice(0, 40).map(x => clip(x, 40)),
        course: o.course && typeof o.course === "object" ? o.course : {},
        bezak: bezak(o.bezak) });
    } catch (e) { console.log("agent:", e.message); fails.push(via + ": " + clip(e.message, 110)); }
  }
  // sabab (faqat AI nomi va xato kodi, kalit emas): masalan "gemini: gemini-2.5-flash 404"
  return json(200, { ok: false, error: "AI hozir javob bermadi, qayta urinib ko‘ring", detail: fails });
}
