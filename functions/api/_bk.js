// Banket bo'limi qulfi uchun yordamchilar (boshqa funksiyalar import qiladi). O'zi alohida manzil emas.
// Imzo kaliti: Cloudflare'da BANKET_SECRET (bo'lmasa ADMIN_PASSWORD ishlatiladi).
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = s => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

export async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function same(a, b) {                       // vaqtga bog'liq bo'lmagan taqqoslash
  a = String(a); b = String(b);
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const secret = env => String(env.BANKET_SECRET || env.ADMIN_PASSWORD || "");
async function hmacKey(env) {
  return crypto.subtle.importKey("raw", enc.encode("banket:" + secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
export const hasSecret = env => secret(env).length >= 6;

export async function signToken(env, payload) {
  const p = b64u(enc.encode(JSON.stringify(payload)));
  const sig = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(p)));
  return p + "." + sig;
}
// to'g'ri va muddati o'tmagan bo'lsa {id, n, exp} qaytaradi, aks holda null
export async function verifyToken(env, token) {
  try {
    if (!hasSecret(env)) return null;
    const [p, sig] = String(token || "").split(".");
    if (!p || !sig) return null;
    const want = b64u(await crypto.subtle.sign("HMAC", await hmacKey(env), enc.encode(p)));
    if (!same(want, sig)) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64u(p)));
    if (!data || !(data.exp > Date.now() / 1000)) return null;
    return data;
  } catch (e) { return null; }
}
