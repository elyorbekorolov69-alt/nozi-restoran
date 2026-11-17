// Banket kodlarini boshqarish, faqat admin uchun (manzil: /api/bkodlar). Kodlarning o'zi bazada saqlanmaydi, faqat hash.
// GET -> ro'yxat | POST {name, code} -> qo'shish | DELETE ?id=5 -> o'chirish
import { json, sb, isAdmin } from "./_h.js";
import { sha256hex, same } from "./_bk.js";

const MAXN = 10;
export const onRequestOptions = () => new Response(null, { status: 204 });

export async function onRequest({ request, env }) {
  if (!(await isAdmin(request, env))) return json(401, { ok: false, error: "parol noto‘g‘ri" });
  const { base, H } = sb(env);
  const m = request.method;
  try {
    if (m === "GET") {
      const rows = await (await fetch(`${base}/banket_kodlar?select=id,name,created,last_login&order=id.asc`, { headers: H })).json();
      return json(200, { ok: true, items: Array.isArray(rows) ? rows : [] });
    }
    if (m === "POST") {
      let p; try { p = await request.json(); } catch (e) { p = {}; }
      const name = String(p.name || "").trim().slice(0, 40), code = String(p.code || "").trim();
      if (name.length < 2) return json(400, { ok: false, error: "ism kamida 2 harf" });
      if (code.length < 4 || code.length > 40) return json(400, { ok: false, error: "kod 4–40 belgi bo‘lsin" });
      const all = await (await fetch(`${base}/banket_kodlar?select=id,name,salt,hash`, { headers: H })).json();
      if (!Array.isArray(all)) return json(500, { ok: false, error: "baza xatosi" });
      if (all.length >= MAXN) return json(400, { ok: false, error: `kodlar ${MAXN} tadan oshmasin` });
      for (const r of all) if (same(await sha256hex(r.salt + ":" + code), r.hash)) return json(400, { ok: false, error: "bunday kod allaqachon bor" });
      const salt = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, "0")).join("");
      const hash = await sha256hex(salt + ":" + code);
      const r = await fetch(`${base}/banket_kodlar`, { method: "POST", headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({ name, salt, hash, created: Date.now() / 1000 }) });
      const row = await r.json();
      if (!r.ok || !row[0]) return json(500, { ok: false, error: "saqlanmadi" });
      return json(200, { ok: true, id: row[0].id });
    }
    if (m === "DELETE") {
      const id = parseInt(new URL(request.url).searchParams.get("id"), 10);
      if (!id) return json(400, { ok: false, error: "id kerak" });
      const r = await fetch(`${base}/banket_kodlar?id=eq.${id}`, { method: "DELETE", headers: H });
      return r.ok ? json(200, { ok: true }) : json(500, { ok: false, error: "o‘chirilmadi" });
    }
  } catch (e) { console.log("bkodlar:", e.message); return json(500, { ok: false, error: "server xatosi" }); }
  return json(405, { ok: false, error: "usul mos emas" });
}
