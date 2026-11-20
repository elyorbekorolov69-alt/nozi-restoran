# Taom reytingi: egasi "✅ Tasdiqlash" (st:<id>:ok) bosganda chaqiriladi.
# Bot .env fayliga qo'shing (kalitni chatga yozmang): REYTING_KEY=<Cloudflare dagi bilan bir xil>
import os, json, urllib.request

def taom_ball(banket_data):
    """banket_data: banket jadvalidagi `data` (JSON matn yoki dict). Tasdiqlanganda har bir taomga +1."""
    try:
        d = json.loads(banket_data) if isinstance(banket_data, str) else (banket_data or {})
        if not os.getenv("REYTING_KEY"):
            return False
        items = d.get("items") or []
        if not items:
            return False
        req = urllib.request.Request(
            (os.getenv("SITE_URL") or "https://restorannozi.uz").rstrip("/") + "/api/reyting",
            data=json.dumps({"items": items}).encode(),
            headers={"Content-Type": "application/json", "x-reyting": os.getenv("REYTING_KEY", "")},
            method="POST")
        return urllib.request.urlopen(req, timeout=10).status == 200
    except Exception as e:
        print("reyting xatosi:", e)
        return False
