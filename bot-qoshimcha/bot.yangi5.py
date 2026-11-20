"""NoZi Restaurant boti.
Kompyuterda sinash:  python bot.py          (bot o'zi Telegram'dan xabarlarni so'rab turadi)
Serverda:            web.py ishlatiladi     (Telegram xabarlarni serverga o'zi yuboradi)"""
import html
import re
import time
import traceback
from datetime import date, datetime, timedelta

import ai
import bilim
import db
import tg
import zakazlar
from config import (ADMIN_IDS, AI_ENABLED, AI_LIMIT_PER_HOUR, BOT_USERNAME, DAILY_HOUR, MINIAPP_URL, SITE_URL,
                    STAFF_CHAT_ID, TZINFO, YOPIQ_REJIM)
from matnlar import LANGS, same_button, t

db.init()

STATUS = {"yangi": "🆕 Yangi", "ok": "✅ Tasdiqlandi", "no": "❌ Rad etildi", "call": "📞 Bog‘lanildi"}
EVENTS = ("banket", "toy", "boshqa")
TAGS = {"[BANKET]": "banket", "[MENYU]": "menu", "[ALOQA]": "contact"}


PANEL_TUGMA = "🛠 Panel"
_KIM = 0          # hozir kim bilan gaplashyapmiz (bot bitta oqimda ishlaydi)


# ================= klaviaturalar =================
def kb_main(lang):
    rows = [[{"text": t("btn_menu", lang)}, {"text": t("btn_banket", lang)}],
            [{"text": t("btn_contact", lang)}, {"text": t("btn_review", lang)}]]
    web = []
    if MINIAPP_URL:       # alohida menyu oynasi (savatcha bilan)
        web.append({"text": t("btn_app", lang), "web_app": {"url": MINIAPP_URL}})
    if SITE_URL:          # saytning o'zi, menyu qismi
        web.append({"text": t("btn_site", lang), "web_app": {"url": SITE_URL.rstrip("/") + "/#menyu"}})
    if web:
        rows.insert(0, web)
    rows.append([{"text": t("btn_lang", lang)}])
    if _KIM in ADMIN_IDS:          # admin uchun doimiy pastki tugma
        rows.append([{"text": PANEL_TUGMA}])
    return {"keyboard": rows, "resize_keyboard": True, "is_persistent": True}


def kb_reply(lang, *rows):
    return {"keyboard": [*rows, [{"text": t("btn_cancel", lang)}]], "resize_keyboard": True}


def kb_inline(rows):
    return {"inline_keyboard": rows}


def kb_lang():
    items = list(LANGS.items())
    return kb_inline([[{"text": v, "callback_data": f"lang:{k}"} for k, v in items[i:i + 2]] for i in range(0, 4, 2)])


def kb_sections(lang):
    secs = bilim.sections(lang)
    return kb_inline([[{"text": n, "callback_data": f"m:{i}"} for i, n in secs[k:k + 2]] for k in range(0, len(secs), 2)])


def kb_staff(bid):
    return kb_inline([[{"text": "✅ Tasdiqlash", "callback_data": f"st:{bid}:ok"},
                       {"text": "❌ Rad etish", "callback_data": f"st:{bid}:no"}],
                      [{"text": "📞 Bog‘lanildi", "callback_data": f"st:{bid}:call"}]])


def is_admin(uid):
    return uid in ADMIN_IDS


def guess_lang(text):
    if re.search(r"[ӣӯқғҳҷҚҒҲҶӢӮ]", text):
        return "tj"
    if re.search(r"[а-яА-ЯёЁ]", text):
        return "ru"
    if re.search(r"\b(the|what|how|where|when|price|menu|hello|hi|do you|is there)\b", text, re.I):
        return "en"
    return "uz"


# ================= kirish nuqtasi =================
def blocked(u):
    """Yopiq rejimda shaxsiy chatda admin bo'lmagan odamga True (bot jim qoladi). Guruhga tegmaydi.
    ADMIN_IDS bo'sh bo'lsa ham yopiq: faqat /myid ishlaydi, shunda admin o'z ID sini bilib .env ga yoza oladi."""
    if not YOPIQ_REJIM:
        return False
    if "message" in u:
        m = u["message"]
        if m.get("chat", {}).get("type") != "private":
            return False
        if m.get("from", {}).get("id") in ADMIN_IDS:
            return False
        return not (not ADMIN_IDS and (m.get("text") or "").startswith("/myid"))
    if "callback_query" in u:
        q = u["callback_query"]
        chat = (q.get("message") or {}).get("chat", {})
        return chat.get("type") == "private" and q.get("from", {}).get("id") not in ADMIN_IDS
    return False


def handle_update(u):
    """Telegram'dan kelgan bitta yangilanishni ishlaydi. Xato botni to'xtatmaydi."""
    try:
        if blocked(u):
            return
        if "message" in u:
            on_message(u["message"])
        elif "callback_query" in u:
            on_callback(u["callback_query"])
    except Exception:
        traceback.print_exc()


# ================= xabarlar =================
def on_message(m):
    chat, frm = m["chat"], m.get("from", {})
    text = (m.get("text") or "").strip()
    if chat["type"] != "private":
        if text.startswith("/groupid"):
            tg.send(chat["id"], f"Bu guruhning ID raqami: {chat['id']}\n.env fayliga STAFF_CHAT_ID={chat['id']} deb yozing.")
        return

    cid = chat["id"]
    global _KIM
    _KIM = cid
    u = db.user(cid, frm.get("first_name"), frm.get("username"))
    lang = u["lang"] or guess_lang(text)
    if is_admin(cid) and (text == PANEL_TUGMA or text.split("@")[0].lower() == "/panel"):
        return panel_uy(cid)

    # --- buyruqlar ---
    _cmd = text.split("@")[0].split(" ")[0].lower()          # "/menyu@NoziBot" ham ishlaydi
    _alias = {"/menyu": "btn_menu", "/menu": "btn_menu", "/banket": "btn_banket", "/aloqa": "btn_contact", "/contact": "btn_contact"}
    if _cmd in _alias:
        text = t(_alias[_cmd], lang)
    if text.startswith("/start"):
        payload = text[6:].strip()
        if payload.startswith("b") and "_" in payload:
            return link_site_request(cid, u, payload, lang)
        if payload == "banket":
            db.user_set(cid, lang=lang)
            return bk_start(cid, lang)
        if not u["lang"]:
            return tg.send(cid, "Tilni tanlang / Выберите язык / Choose a language / Забонро интихоб кунед:", kb_lang())
        db.user_set(cid, state="", draft={})
        tg.send(cid, t("welcome", lang), kb_main(lang))
        return admin_prompt(cid) if is_admin(cid) else None
    if text.startswith("/myid"):
        return tg.send(cid, f"Sizning Telegram ID raqamingiz: {cid}")
    if text.startswith("/lang") or same_button(text, "btn_lang"):
        return tg.send(cid, t("choose_lang", lang), kb_lang())
    if is_admin(cid) and text.split(" ")[0] == "/hisob":
        return daily_start(cid, (datetime.now(TZINFO).date() - timedelta(days=1)).isoformat())
    if is_admin(cid) and text.split(" ")[0] == "/zakazlar":
        return zakazlar.show(cid, " ".join(text.split(" ")[1:]))
    if is_admin(cid) and text.split(" ")[0] in ("/admin", "/yordam", "/ekran", "/banketlar", "/ai"):
        return admin_command(cid, text.split(" ")[0])

    if not u["lang"]:
        db.user_set(cid, lang=lang)

    # --- admin fayl yuborsa: katta ekranga ---
    media = pick_media(m)
    if media and is_admin(cid):
        return admin_media(cid, m, media)

    # --- kunlik hisobni kiritish (faqat adminlar) ---
    if is_admin(cid) and u["state"] == "yt_add" and text:
        return yt_qosh(cid, text)
    if is_admin(cid) and u["state"].startswith("d_"):
        return daily_step(cid, u, text)

    # --- Telegram ichidagi menyu oynasidan kelgan tanlov ---
    if m.get("web_app_data"):
        return miniapp_cart(cid, lang, m["web_app_data"].get("data", ""))

    # --- mijoz rasm yuborsa: fikr sifatida adminlarga ---
    if media and media[0] == "photo":
        return review_save(cid, lang, frm, m.get("caption", ""), media[1])
    if u["state"] == "s_wait" and text and not same_button(text, "btn_cancel"):
        return review_save(cid, lang, frm, text, None)
    if u["state"] == "s_wait" and same_button(text, "btn_cancel"):
        db.user_set(cid, state="", draft={})
        return tg.send(cid, t("bk_cancel", lang), kb_main(lang))

    # --- banket so'rovi bosqichma-bosqich ---
    # (so'rov yuborishga tayyor turganda mehmon savol bersa, AI javob beradi, "Yuborish" tugmasi ishlayveradi)
    if u["state"].startswith("b_") and u["state"] != "b_confirm":
        return bk_step(cid, u, lang, m, text)

    if not text:
        return tg.send(cid, t("only_text", lang))

    # --- asosiy tugmalar ---
    if same_button(text, "btn_menu"):
        return tg.send(cid, t("menu_pick", lang), kb_sections(lang))
    if same_button(text, "btn_banket"):
        return bk_start(cid, lang)
    if same_button(text, "btn_contact"):
        return tg.send(cid, bilim.contact_text(lang), kb_main(lang), html=True)
    if same_button(text, "btn_review"):
        db.user_set(cid, state="s_wait", draft={})
        return tg.send(cid, t("rv_ask", lang), kb_reply(lang))

    # --- qolgan hamma narsa: AI javob beradi ---
    ai_reply(cid, lang, text)


# ================= tugmalar (inline) =================
def on_callback(q):
    data, frm = q.get("data", ""), q["from"]
    msg = q.get("message") or {}
    cid = msg.get("chat", {}).get("id", frm["id"])
    mid = msg.get("message_id")
    global _KIM
    _KIM = cid

    if data.startswith("pn:") and is_admin(frm["id"]):   # admin panel oynalari
        tg.answer(q["id"])
        w = data[3:]
        if w == "ytadd":
            db.user_set(cid, state="yt_add")
            return tg.send(cid, "▶️ YouTube video havolasini yuboring (masalan https://youtu.be/...). Bir nechta bo‘lsa, ketma-ket yuboring.\nTugatish uchun /bekor yozing.")
        if w == "ytlist":
            return yt_royxat(cid)
        if w.startswith("ytdel:"):
            ok, _ = yt_api({"del": int(w[6:])})
            tg.send(cid, "🗑 O‘chirildi." if ok else "O‘chirib bo‘lmadi, keyinroq urinib ko‘ring.")
            return yt_royxat(cid)
        if w == "hbugun":
            return daily_start(cid, datetime.now(TZINFO).date().isoformat())
        if w == "yordam":
            return admin_command(cid, "/yordam")
        if w == "id":
            return tg.send(cid, f"Sizning Telegram ID raqamingiz: {frm['id']}")
        return panel_oyna(cid, mid, w)
    if data.startswith("zk:") and is_admin(frm["id"]):   # banket zakazlari ro'yxati
        return zakazlar.callback(q, data, cid, mid)

    if data.startswith("st:"):                       # xodimlar guruhidagi tugmalar
        return staff_button(q, data, cid, mid)

    if data.startswith("rv:"):
        return review_button(q, data, cid, mid)
    if data.startswith("ad:") and is_admin(frm["id"]):
        tg.answer(q["id"])
        what = data[3:]
        if what == "hisob":
            return daily_start(cid, (datetime.now(TZINFO).date() - timedelta(days=1)).isoformat())
        if what == "add":
            return tg.send(cid, "Rasm, video yoki qo‘shiqni shu yerga yuboring (20 MB gacha). "
                                "Bir nechtasini ketma-ket yuborsangiz ham bo‘ladi. Fayl ostiga izoh yozsangiz, u ham saqlanadi.")
        return admin_command(cid, {"screen": "/ekran", "req": "/banketlar", "ai": "/ai"}.get(what, "/admin"))

    u = db.user(frm["id"], frm.get("first_name"), frm.get("username"))
    lang = u["lang"] or "uz"

    if data.startswith("lang:"):
        lang = data[5:]
        db.user_set(frm["id"], lang=lang, state="", draft={})
        tg.answer(q["id"], LANGS.get(lang))
        tg.send(cid, t("welcome", lang), kb_main(lang))
        return admin_prompt(cid) if is_admin(frm["id"]) else None
    if data == "m:":
        tg.answer(q["id"])
        return tg.edit(cid, mid, t("menu_pick", lang), kb_sections(lang))
    if data.startswith("m:"):
        sid = data[2:]
        tg.answer(q["id"])
        if sid in bilim.SEC:
            back = kb_inline([[{"text": t("btn_sections", lang), "callback_data": "m:"}]])
            tg.edit(cid, mid, bilim.section_text(sid, lang), back, html=True)
        return
    if data.startswith("go:"):                       # AI javobidagi tugmalar
        tg.answer(q["id"])
        what = data[3:]
        if what == "banket":
            return bk_start(cid, lang)
        if what == "menu":
            return tg.send(cid, t("menu_pick", lang), kb_sections(lang))
        if what == "contact":
            return tg.send(cid, bilim.contact_text(lang), html=True)
        return
    if data.startswith("bk:"):
        tg.answer(q["id"])
        return bk_button(cid, u, lang, data[3:], mid)
    if data.startswith("ek:off:") and is_admin(frm["id"]):
        eid = int(data[7:])
        db.ekran_off(eid)
        tg.answer(q["id"], f"#{eid} o‘chirildi")
        return admin_command(cid, "/ekran", mid)
    if data == "ai:test" and is_admin(frm["id"]):
        tg.answer(q["id"], "Sinalyapti...")
        res = ai.sinash()
        lines = [f"{'✅' if ok else '❌'} {ai.PROVIDERS[n]['nomi']}: {html.escape(info)}" for n, ok, info in res]
        return tg.send(cid, "<b>AI sinovi</b>\n" + ("\n".join(lines) or "Hech qaysi AI ga kalit kiritilmagan."), html=True)
    tg.answer(q["id"])


# ================= AI javobi =================
def ai_answer(lang, history, text):
    """AI javobi va undagi tugma belgilari. Sayt chati ham shuni ishlatadi."""
    messages = [{"role": "system", "content": bilim.system_prompt(lang)}] + history + [{"role": "user", "content": text}]
    ans, prov = ai.ask(messages)
    if not ans:
        return None, [], None
    tags = [v for k, v in TAGS.items() if k in ans]
    for k in TAGS:
        ans = ans.replace(k, "")
    ans = re.sub(r"\*\*|__|^#+\s*", "", ans, flags=re.M).strip()
    return ans, tags, prov


KEYWORDS = (("banket", ("banket", "to'y", "toy", "банкет", "свадьб", "banquet", "wedding", "тӯй", "туй")),
            ("contact", ("manzil", "telefon", "ish vaqti", "adres", "адрес", "телефон", "контакт", "address", "phone", "суроға")),
            ("menu", ("menyu", "меню", "menu", "narx", "цены", "price")))


def simple_reply(cid, lang, text):
    """AI o'chiq paytda: taom nomini qidirish, kalit so'zlar, bo'lmasa tugmalar."""
    found = bilim.search(text, lang)
    if found:
        return tg.send(cid, found, html=True)
    low = bilim._norm(text)
    for what, words in KEYWORDS:
        if any(w in low for w in words):
            return on_callback_go(cid, lang, what)
    tg.send(cid, t("no_ai", lang), kb_main(lang))


def on_callback_go(cid, lang, what):
    if what == "banket":
        return bk_start(cid, lang)
    if what == "menu":
        return tg.send(cid, t("menu_pick", lang), kb_sections(lang))
    return tg.send(cid, bilim.contact_text(lang), kb_main(lang), html=True)


def ai_reply(cid, lang, text):
    if not AI_ENABLED:
        return simple_reply(cid, lang, text)
    if db.questions_since(cid, 3600) >= AI_LIMIT_PER_HOUR:
        return tg.send(cid, t("ai_limit", lang))
    tg.typing(cid)
    ans, tags, prov = ai_answer(lang, db.hist(cid), text[:1500])
    db.hist_add(cid, "user", text[:1500])
    if not ans:
        return tg.send(cid, t("ai_busy", lang))
    db.hist_add(cid, "assistant", ans)
    labels = {"banket": "btn_banket", "menu": "btn_menu", "contact": "btn_contact"}
    buttons = [[{"text": t(labels[x], lang), "callback_data": f"go:{x}"}] for x in tags]
    tg.send(cid, ans, kb_inline(buttons) if buttons else None)


# ================= banket so'rovi =================
def parse_when(text, today):
    """'15.11 18:00' -> (date, '18:00'). Xato bo'lsa ('bad' yoki 'past', None)."""
    m = re.search(r"(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?", text)
    if not m:
        return "bad", None
    d, mo, y = int(m.group(1)), int(m.group(2)), m.group(3)
    year = (2000 + int(y) if len(y) == 2 else int(y)) if y else today.year
    try:
        when = date(year, mo, d)
    except ValueError:
        return "bad", None
    if when < today:
        if y:
            return "past", None
        when = date(year + 1, mo, d)
    if (when - today).days > 730:
        return "bad", None
    tm = re.search(r"(\d{1,2})[:.](\d{2})", text[m.end():])
    hhmm = f"{int(tm.group(1)):02d}:{tm.group(2)}" if tm and int(tm.group(1)) < 24 and int(tm.group(2)) < 60 else ""
    return when, hhmm


def parse_phone(text):
    d = re.sub(r"\D", "", text)
    if len(d) == 9:
        return "+998" + d
    if 10 <= len(d) <= 15:
        return "+" + d
    return None


def bk_start(cid, lang):
    db.user_set(cid, state="b_type", draft={"lang": lang})
    tg.send(cid, "🎉", kb_reply(lang))
    tg.send(cid, t("bk_type", lang), kb_inline([[{"text": t(f"ev_{e}", lang), "callback_data": f"bk:type:{e}"}] for e in EVENTS]))


def bk_summary(lang, d):
    hall = bilim.hall_for(d["guests"])
    when = datetime.strptime(d["date"], "%Y-%m-%d").strftime("%d.%m.%Y") + (f" · {d['time']}" if d.get("time") else "")
    rows = [f"<b>{t('bk_summary', lang)}</b>",
            f"{t('l_event', lang)}: {t('ev_' + d['type'], lang)}",
            f"{t('l_date', lang)}: {when}",
            f"{t('l_guests', lang)}: {d['guests']}",
            f"{t('l_place', lang)}: {bilim.hall_name(hall, lang)}",
            f"{t('l_name', lang)}: {html.escape(d['name'])}",
            f"{t('l_phone', lang)}: {html.escape(d['phone'])}"]
    if d.get("note"):
        rows.append(f"{t('l_note', lang)}: {html.escape(d['note'])}")
    rows += ["", t("bk_fee", lang, p=bilim.INFO["xizmat_foizi"])]
    return "\n".join(rows)


def bk_step(cid, u, lang, m, text):
    st, d = u["state"], u["draft"]
    if same_button(text, "btn_cancel") or text.startswith("/bekor"):
        db.user_set(cid, state="", draft={})
        return tg.send(cid, t("bk_cancel", lang), kb_main(lang))

    if st == "b_type":
        return tg.send(cid, t("bk_type", lang), kb_inline([[{"text": t(f"ev_{e}", lang), "callback_data": f"bk:type:{e}"}] for e in EVENTS]))

    if st == "b_date":
        today = datetime.now(TZINFO).date()
        when, hhmm = parse_when(text, today)
        if when in ("bad", "past"):
            return tg.send(cid, t("bk_date_" + when, lang))
        d.update(date=when.isoformat(), time=hhmm)
        db.user_set(cid, state="b_guests", draft=d)
        return tg.send(cid, t("bk_guests", lang))

    if st == "b_guests":
        n = re.search(r"\d+", text)
        if not n or not 1 <= int(n.group()) <= 2000:
            return tg.send(cid, t("bk_guests_bad", lang))
        d["guests"] = int(n.group())
        db.user_set(cid, state="b_name", draft=d)
        first = (m.get("from") or {}).get("first_name")
        rows = [[{"text": first}]] if first else []
        return tg.send(cid, t("bk_name", lang), kb_reply(lang, *rows))

    if st == "b_name":
        if len(text) < 2:
            return tg.send(cid, t("bk_name", lang))
        d["name"] = text[:60]
        db.user_set(cid, state="b_phone", draft=d)
        return tg.send(cid, t("bk_phone", lang), kb_reply(lang, [{"text": t("btn_share_phone", lang), "request_contact": True}]))

    if st == "b_phone":
        phone = parse_phone(m["contact"]["phone_number"]) if m.get("contact") else parse_phone(text)
        if not phone:
            return tg.send(cid, t("bk_phone_bad", lang))
        d["phone"] = phone
        db.user_set(cid, state="b_note", draft=d)
        return tg.send(cid, t("bk_note", lang), kb_reply(lang, [{"text": t("btn_skip", lang)}]))

    if st == "b_note":
        d["note"] = "" if same_button(text, "btn_skip") else text[:500]
        db.user_set(cid, state="b_confirm", draft=d)
        tg.send(cid, "👇", kb_main(lang))
        return tg.send(cid, bk_summary(lang, d), kb_inline([[{"text": t("btn_send", lang), "callback_data": "bk:send"},
                                                             {"text": t("btn_again", lang), "callback_data": "bk:again"}]]), html=True)



def bk_button(cid, u, lang, what, mid):
    d = u["draft"]
    if what.startswith("type:") and u["state"] == "b_type":
        d["type"] = what[5:] if what[5:] in EVENTS else "banket"
        db.user_set(cid, state="b_date", draft=d)
        tg.edit(cid, mid, f"{t('l_event', lang)}: {t('ev_' + d['type'], lang)}")
        return tg.send(cid, t("bk_date", lang))
    if what == "again":
        tg.edit(cid, mid, t("bk_cancel", lang))
        return bk_start(cid, lang)
    if what == "send" and u["state"] == "b_confirm":
        hall = bilim.hall_for(d["guests"])
        d["hall"] = hall["nomi"]["uz"]
        bid, _ = db.banket_add("bot", cid, d, "")
        db.user_set(cid, state="", draft={})
        tg.edit(cid, mid, bk_summary(lang, d), html=True)
        post_to_staff(bid)
        return tg.send(cid, t("bk_sent", lang, id=bid), kb_main(lang))


def staff_text(b):
    d = b["data"]
    if b["source"] == "sayt":
        body = f"🌐 <b>Saytdan so‘rov #{b['id']}</b>\n\n<pre>{html.escape(b['text'])}</pre>"
    else:
        when = datetime.strptime(d["date"], "%Y-%m-%d").strftime("%d.%m.%Y") + (f" · {d['time']}" if d.get("time") else "")
        u = db.user(b["chat_id"])
        who = f"@{u['username']}" if u.get("username") else f"<a href=\"tg://user?id={b['chat_id']}\">profil</a>"
        body = "\n".join(x for x in [
            f"🎉 <b>Yangi so‘rov #{b['id']}</b> (bot orqali)",
            f"Tadbir: {t('ev_' + d['type'], 'uz')}",
            f"📅 {when}",
            f"👥 {d['guests']} kishi · {html.escape(d['hall'])}",
            f"👤 {html.escape(d['name'])}, {html.escape(d['phone'])}",
            f"💬 Telegram: {who} · til: {d.get('lang', 'uz')}",
            f"📝 Izoh: {html.escape(d['note'])}" if d.get("note") else "",
        ] if x)
    status = STATUS.get(b["status"], b["status"])
    by = f" — {html.escape(b['status_by'])}" if b.get("status_by") else ""
    return f"{body}\n\nHolat: {status}{by}"


def post_to_staff(bid):
    b = db.banket(bid)
    targets = [STAFF_CHAT_ID] if STAFF_CHAT_ID else sorted(ADMIN_IDS)
    for chat in targets:
        sent = tg.send(chat, staff_text(b), kb_staff(bid), html=True)
        if sent and chat == STAFF_CHAT_ID:
            db.banket_set(bid, group_msg=sent["message_id"])


def staff_button(q, data, cid, mid):
    frm = q["from"]
    if not (cid == STAFF_CHAT_ID or is_admin(frm["id"])):
        return tg.answer(q["id"], "Bu tugma faqat xodimlar uchun")
    _, bid, status = data.split(":")
    b = db.banket(int(bid))
    if not b or status not in STATUS:
        return tg.answer(q["id"], "So‘rov topilmadi")
    by = f"{frm.get('first_name', '')} {datetime.now(TZINFO).strftime('%d.%m %H:%M')}".strip()
    db.banket_set(b["id"], status=status, status_by=by)
    b = db.banket(b["id"])
    if status == "ok" and not (b["data"] or {}).get("ball"):      # taom reytingi: faqat egasi tasdiqlaganda, bir marta
        try:
            import json as _json
            import reyting_hook
            if reyting_hook.taom_ball(b["data"]):
                d = dict(b["data"]); d["ball"] = 1
                db.banket_set(b["id"], data=_json.dumps(d, ensure_ascii=False))
                b = db.banket(b["id"])
        except Exception as e:
            print("reyting:", e)
    tg.edit(cid, mid, staff_text(b), kb_staff(b["id"]), html=True)
    told = ""
    if b["chat_id"]:
        glang = (b["data"] or {}).get("lang") or db.user(b["chat_id"])["lang"] or "uz"
        told = " · mehmonga xabar yuborildi" if tg.send(b["chat_id"], t("st_" + status, glang, id=b["id"])) else ""
    tg.answer(q["id"], STATUS[status] + told)


def site_request(payload):
    """Saytdagi Banket oynasidan kelgan so'rov (web.py chaqiradi)."""
    data = {k: str(payload.get(k, ""))[:300] for k in ("name", "phone", "date", "time", "guests", "hall", "total", "lang")}
    text = str(payload.get("text", ""))[:3500]
    bid, code = db.banket_add("sayt", None, data, text)
    post_to_staff(bid)
    link = f"https://t.me/{bot_username()}?start=b{bid}_{code}" if bot_username() else ""
    return bid, link


def link_site_request(cid, u, payload, lang):
    m = re.fullmatch(r"b(\d+)_([0-9a-f]+)", payload)
    b = db.banket(int(m.group(1))) if m else None
    if not b or b["code"] != m.group(2):
        return tg.send(cid, t("welcome", lang), kb_main(lang))
    db.banket_set(b["id"], chat_id=cid)
    db.user_set(cid, lang=u["lang"] or b["data"].get("lang") or lang)
    lang = u["lang"] or b["data"].get("lang") or lang
    tg.send(cid, t("bk_linked", lang, id=b["id"]), kb_main(lang))
    if b["status"] != "yangi":
        tg.send(cid, t("st_" + b["status"], lang, id=b["id"]))


_me = {}


def bot_username():
    if BOT_USERNAME:
        return BOT_USERNAME
    if "u" not in _me:
        me = tg.safe("getMe")
        _me["u"] = me["username"] if me else ""
    return _me["u"]


# ================= admin =================
KINDS = {"photo": "🖼 rasm", "video": "🎬 video", "animation": "🎞 animatsiya", "audio": "🎵 qo‘shiq"}


def pick_media(m):
    if m.get("photo"):
        p = m["photo"][-1]
        return "photo", p, "image/jpeg"
    for k in ("video", "animation", "audio"):
        if m.get(k):
            return k, m[k], m[k].get("mime_type", "")
    doc = m.get("document")
    if doc:
        mime = doc.get("mime_type", "")
        kind = {"image": "photo", "video": "video", "audio": "audio"}.get(mime.split("/")[0])
        if kind:
            return kind, doc, mime
    return None


def admin_prompt(cid):
    return panel_uy(cid)


# ================= ADMIN PANEL: 5 ta oyna, hammasi tugmalar bilan =================
def _orqaga():
    return [{"text": "⬅️ Panelga qaytish", "callback_data": "pn:uy"}]


def yt_api(payload=None):
    """Sayt funksiyasi bilan gaplashadi (/api/video). Kalit .env dagi REYTING_KEY, chatga yozilmaydi."""
    import os
    import requests
    base = (SITE_URL or "https://restorannozi.uz").rstrip("/") + "/api/video"
    try:
        if payload is None:
            r = requests.get(base, timeout=15)
        else:
            r = requests.post(base, json=payload, headers={"x-reyting": os.getenv("REYTING_KEY", "")}, timeout=15)
        return r.status_code == 200, r.json()
    except Exception as e:
        print("yt_api:", e)
        return False, {}


def yt_royxat(cid):
    ok, j = yt_api()
    vids = (j or {}).get("videos") or []
    if not ok or not vids:
        return tg.send(cid, "YouTube videolar hozircha yo‘q." if ok else "Ro‘yxatni olib bo‘lmadi.",
                       kb_inline([[{"text": "▶️ Havola qo‘shish", "callback_data": "pn:ytadd"}], _orqaga()]))
    rows = [[{"text": f"🗑 {i}. youtu.be/{v['yt']}", "callback_data": f"pn:ytdel:{v['id']}"}] for i, v in enumerate(vids, 1)]
    rows.append([{"text": "▶️ Havola qo‘shish", "callback_data": "pn:ytadd"}])
    rows.append(_orqaga())
    tg.send(cid, f"📺 <b>YouTube videolar: {len(vids)} / 15</b>\nO‘chirish uchun videoni bosing.", kb_inline(rows), html=True)


def yt_qosh(cid, text):
    if text.startswith("/bekor"):
        db.user_set(cid, state="")
        return tg.send(cid, "Tayyor.", kb_main("uz"))
    ok, j = yt_api({"url": text})
    if ok:
        return tg.send(cid, "✅ Allaqachon bor." if (j or {}).get("dup") else "✅ Qo‘shildi. Yana yuborsangiz ham bo‘ladi, tugatish: /bekor")
    if (j or {}).get("full"):
        db.user_set(cid, state="")
        return tg.send(cid, "Limit to‘ldi: 15 ta video bor. Avval keraksizini o‘chiring.",
                       kb_inline([[{"text": "📺 Ro‘yxat / o‘chirish", "callback_data": "pn:ytlist"}]]))
    tg.send(cid, "Havolani tushunmadim yoki sayt javob bermadi. Masalan: https://youtu.be/xxxxxxxxxxx")


def panel_uy(cid, mid=None):
    text = ("🛠 <b>NoZi paneli</b>\n\nNimani ochamiz? Tugmani bosing, har bir oynada nima qilish yozilgan.\n"
            "Bu panelni istalgan paytda pastdagi <b>🛠 Panel</b> tugmasi yoki /panel bilan ochasiz.")
    kb = kb_inline([[{"text": "📦 Zakazlar", "callback_data": "pn:zk"}, {"text": "👥 Mijozlar", "callback_data": "pn:ml"}],
                    [{"text": "📊 Hisob", "callback_data": "pn:hs"}, {"text": "🖥 Katta ekran", "callback_data": "pn:ek"}],
                    [{"text": "⚙️ Sozlamalar", "callback_data": "pn:sz"}]])
    return tg.edit(cid, mid, text, kb, html=True) if mid else tg.send(cid, text, kb, html=True)


def panel_oyna(cid, mid, w):
    if w == "uy":
        return panel_uy(cid, mid)
    if w == "zk":
        text = ("📦 <b>Zakazlar</b>\nBanket va to‘y so‘rovlari. Qaysi kunlarni ko‘rmoqchisiz?\n"
                "Ro‘yxatdagi zakazni ochib, tasdiqlash yoki rad etishingiz mumkin.")
        kb = [[{"text": "Bugun", "callback_data": "zk:bugun"}, {"text": "Ertaga", "callback_data": "zk:ertaga"}],
              [{"text": "Shu hafta", "callback_data": "zk:hafta"}, {"text": "Shu oy", "callback_data": "zk:oy"}],
              [{"text": "🆕 Oxirgi so‘rovlar", "callback_data": "ad:req"}], _orqaga()]
    elif w == "ml":
        n = db._q("select count(*) c from users", one=True)["c"]
        last = db._q("select name, username, lang, created from users order by created desc limit 10")
        rows = [f"• {html.escape(str(r['name'] or '—'))}{' @' + html.escape(r['username']) if r['username'] else ''} · {r['lang'] or '?'}" for r in last]
        text = f"👥 <b>Mijozlar</b>\nBotga kirgan odamlar: <b>{n}</b>\n\nOxirgi 10 ta:\n" + ("\n".join(rows) or "hali yo‘q")
        kb = [_orqaga()]
    elif w == "hs":
        text = ("📊 <b>Hisob</b>\nKunlik savdo va xarajatni kiritasiz. Bot ikkita savol beradi: savdo qancha, xarajat qancha.\n"
                "Masalan: 12 500 000 yoki 12.5 mln. Qaysi kun uchun?")
        kb = [[{"text": "Kecha uchun", "callback_data": "ad:hisob"}, {"text": "Bugun uchun", "callback_data": "pn:hbugun"}], _orqaga()]
    elif w == "ek":
        text = ("🖥 <b>Katta ekran</b>\nRestorandagi katta ekranda chiqadigan rasm, video va qo‘shiqlar.\n"
                "Qo‘shish uchun fayl yuborasiz (20 MB gacha), o‘chirish uchun ro‘yxatdan tanlaysiz.")
        text += "\n\n▶️ <b>YouTube:</b> video havolasini yuborasiz, u saytdagi Reklamalar oynasida chiqadi (eng ko‘pi 15 ta)."
        kb = [[{"text": "➕ Fayl qo‘shish", "callback_data": "ad:add"}, {"text": "📋 Ro‘yxat / o‘chirish", "callback_data": "ad:screen"}],
              [{"text": "▶️ YouTube havola qo‘shish", "callback_data": "pn:ytadd"}, {"text": "📺 YouTube ro‘yxati", "callback_data": "pn:ytlist"}], _orqaga()]
    elif w == "sz":
        text = "⚙️ <b>Sozlamalar</b>\nAI holati, yordam va o‘zingizning ID raqamingiz."
        kb = [[{"text": "🤖 AI holati", "callback_data": "ad:ai"}, {"text": "❓ Yordam", "callback_data": "pn:yordam"}],
              [{"text": "🆔 Mening ID raqamim", "callback_data": "pn:id"}], _orqaga()]
    else:
        return None
    return tg.edit(cid, mid, text, kb_inline(kb), html=True)


def admin_media(cid, m, media):
    kind, f, mime = media
    size = f.get("file_size") or 0
    if size > 20 * 1024 * 1024:
        return tg.send(cid, f"Bu fayl {size / 1048576:.0f} MB. Telegram botlari 20 MB gacha faylni yuklab oladi. "
                            "Videoni siqib (yoki qisqartirib) qayta yuboring.")
    eid = db.ekran_add(f["file_id"], f.get("file_unique_id"), kind, mime, m.get("caption", ""), size, cid)
    tg.send(cid, f"✅ Katta ekranga qo‘shildi: #{eid} ({KINDS[kind]}). Yana qo‘shasizmi?",
            kb_inline([[{"text": "➕ Yana qo‘shaman", "callback_data": "ad:add"},
                        {"text": "🖥 Ro‘yxat", "callback_data": "ad:screen"}]]))


def admin_command(cid, cmd, mid=None):
    if cmd == "/admin":
        return admin_prompt(cid)
    if cmd == "/yordam":
        return tg.send(cid, "<b>NoZi admin</b>\n\n"
                            "📤 Katta ekranga rasm, video yoki qo‘shiq qo‘shish: faylni shu yerga yuboring (20 MB gacha). "
                            "Fayl ostiga yozilgan izoh ham saqlanadi.\n"
                            "/ekran — ekrandagi fayllar, o‘chirish\n"
                            "/banketlar — oxirgi banket so‘rovlari\n"
                            "/zakazlar — banket zakazlari (filtr: bugun, ertaga, hafta, oy)\n"
                            "/ai — AI lar holati va sinov\n"
                            "/hisob — kechagi savdo va xarajatni kiritish (har kuni ertalab bot o‘zi ham so‘raydi)\n"
                            "/myid — Telegram ID raqamingiz", html=True)
    if cmd == "/ekran":
        items = db.ekran_list(n=30)
        if not items:
            text = "Ekranda hozircha fayl yo‘q. Rasm, video yoki qo‘shiqni shu yerga yuboring."
            return tg.edit(cid, mid, text) if mid else tg.send(cid, text)
        lines = [f"#{e['id']} {KINDS.get(e['kind'], e['kind'])}"
                 f"{' — ' + html.escape(e['caption'][:40]) if e['caption'] else ''}" for e in items]
        kb = kb_inline([[{"text": f"❌ #{e['id']} ni o‘chirish", "callback_data": f"ek:off:{e['id']}"}] for e in items])
        text = "<b>Katta ekrandagi fayllar</b>\n" + "\n".join(lines)
        return tg.edit(cid, mid, text, kb, html=True) if mid else tg.send(cid, text, kb, html=True)
    if cmd == "/banketlar":
        rows = db.banket_last(10)
        if not rows:
            return tg.send(cid, "Hali banket so‘rovi yo‘q.")
        out = []
        for b in rows:
            d = b["data"]
            src = "sayt" if b["source"] == "sayt" else "bot"
            out.append(f"#{b['id']} {STATUS.get(b['status'], b['status'])} · {d.get('date', '')} · "
                       f"{d.get('guests', '')} kishi · {html.escape(d.get('name', ''))} {html.escape(d.get('phone', ''))} ({src})")
        return tg.send(cid, "<b>Oxirgi so‘rovlar</b>\n" + "\n".join(out), html=True)
    if cmd == "/ai":
        lines = []
        for p in ai.holat():
            if not p["kalit"]:
                lines.append(f"⚪️ {p['nomi']}: kalit kiritilmagan")
                continue
            state = f"dam olyapti {p['dam']} s" if p["dam"] else "tayyor"
            lines.append(f"{'🟡' if p['dam'] else '🟢'} {p['nomi']} · {html.escape(p['model'])} · {state}\n"
                         f"   bugun: {p['ok']} javob, {p['fail']} xato"
                         + (f"\n   oxirgi xato: {html.escape(p['xato'])}" if p["xato"] else ""))
        kb = kb_inline([[{"text": "🔄 Hammasini sinash", "callback_data": "ai:test"}]])
        return tg.send(cid, "<b>AI holati</b>\n" + "\n".join(lines), kb, html=True)


# ================= kunlik hisob =================
def parse_amount(text):
    """'12 500 000', '12,5 mln', '800 ming', '0' -> so'm (butun son). Tushunilmasa None."""
    low = text.lower().replace("\u00a0", " ").strip()
    m = re.fullmatch(r"(\d[\d ]*(?:[.,]\d+)?)\s*(mln|млн|million|ming|тыс|k)?\.?(?:\s*(?:so.?m|сум|sum))?", low)
    if not m:
        return None
    num, unit = m.group(1), m.group(2)
    if unit:
        v = float(num.replace(" ", "").replace(",", "."))
        v *= 1_000_000 if unit in ("mln", "млн", "million") else 1000
    else:
        v = float(re.sub(r"[ .,]", "", num))
    return int(v) if 0 <= v < 10 ** 12 else None


def fmt_day(day):
    return datetime.strptime(day, "%Y-%m-%d").strftime("%d.%m.%Y")


def daily_start(cid, day):
    db.user(cid)
    db.user_set(cid, state="d_sales", draft={"day": day})
    tg.send(cid, f"📊 {fmt_day(day)} kuni savdo (kassa tushumi) qancha bo‘ldi?\n"
                 "Masalan: 12 500 000 yoki 12.5 mln", kb_reply("uz"))


def daily_step(cid, u, text):
    st, d = u["state"], u["draft"]
    if same_button(text, "btn_cancel") or text.startswith("/bekor"):
        db.user_set(cid, state="", draft={})
        return tg.send(cid, "Bekor qilindi.", kb_main(u["lang"] or "uz"))
    amount = parse_amount(text)
    if amount is None:
        return tg.send(cid, "Raqamni tushunmadim. Masalan: 12 500 000 yoki 12.5 mln")
    if st == "d_sales":
        d["sales"] = amount
        db.user_set(cid, state="d_exp", draft=d)
        return tg.send(cid, "Xarajat qancha bo‘ldi? (yo‘q bo‘lsa 0 deb yozing)")
    if st == "d_exp":
        who = (db.user(cid)["name"] or "admin")
        db.kunlik_set(d["day"], d["sales"], amount, who)
        db.user_set(cid, state="", draft={})
        tg.send(cid, "✅ Saqlandi.", kb_main(u["lang"] or "uz"))
        rep = daily_report(d["day"])
        for a in sorted(ADMIN_IDS):
            tg.send(a, rep, html=True)


def daily_report(day):
    r = db.kunlik(day)
    profit = r["sales"] - r["expense"]
    mo = db.kunlik_month(day[:7])
    mprofit = mo["sales"] - mo["expense"]
    mark = "📈" if profit >= 0 else "📉"
    return (f"📊 <b>Kunlik hisob — {fmt_day(day)}</b>\n\n"
            f"Savdo: <b>{bilim.som(r['sales'])}</b> so‘m\n"
            f"Xarajat: <b>{bilim.som(r['expense'])}</b> so‘m\n"
            f"{mark} Foyda: <b>{bilim.som(profit)}</b> so‘m\n\n"
            f"Shu oy jami ({mo['n']} kun):\n"
            f"Savdo {bilim.som(mo['sales'])} · Xarajat {bilim.som(mo['expense'])} · Foyda <b>{bilim.som(mprofit)}</b> so‘m\n\n"
            f"Kiritdi: {html.escape(r['by_name'] or '')}")


def daily_tick():
    """Har kuni DAILY_HOUR dan keyin bir marta: adminlardan kechagi hisobni so'raydi."""
    now = datetime.now(TZINFO)
    today = now.date().isoformat()
    if now.hour < DAILY_HOUR or not ADMIN_IDS or db.kv_get("daily_asked") == today:
        return
    db.kv_set("daily_asked", today)
    yday = (now.date() - timedelta(days=1)).isoformat()
    if db.kunlik(yday):
        return
    for a in sorted(ADMIN_IDS):
        daily_start(a, yday)


# ================= mijoz fikri va rasmi =================
def post_targets():
    return [STAFF_CHAT_ID] if STAFF_CHAT_ID else sorted(ADMIN_IDS)


def kb_review(sid, photo):
    ok = "✅ Ekranga chiqarish" if photo else "✅ Yaxshi"
    return kb_inline([[{"text": ok, "callback_data": f"rv:ok:{sid}"}, {"text": "❌ Rad etish", "callback_data": f"rv:no:{sid}"}]])


def review_text(r):
    who = f"@{r['username']}" if r.get("username") else r["name"] or "mijoz"
    st = {"yangi": "🆕 Yangi", "ok": "✅ Qabul qilindi", "no": "❌ Rad etildi"}[r["status"]]
    return f"⭐ Mijoz fikri #{r['id']} — {who}\n\n{r['text'] or '(izohsiz rasm)'}\n\nHolat: {st}"


def review_save(cid, lang, frm, text, photo):
    pid = photo["file_id"] if photo else None
    sid = db.sharh_add(cid, frm.get("first_name"), frm.get("username"), text[:700], pid,
                       photo.get("file_unique_id") if photo else None)
    db.user_set(cid, state="", draft={})
    r = db.sharh(sid)
    for chat in post_targets():
        if pid:
            tg.send_photo(chat, pid, review_text(r), kb_review(sid, True))
        else:
            tg.send(chat, review_text(r), kb_review(sid, False))
    tg.send(cid, t("rv_thanks", lang), kb_main(lang))


def review_button(q, data, cid, mid):
    frm = q["from"]
    if not (cid in post_targets() or is_admin(frm["id"])):
        return tg.answer(q["id"], "Bu tugma faqat xodimlar uchun")
    _, what, sid = data.split(":")
    r = db.sharh(int(sid))
    if not r or r["status"] != "yangi":
        return tg.answer(q["id"], "Bu fikr ko‘rib chiqilgan")
    db.sharh_set(r["id"], status=what)
    r = db.sharh(r["id"])
    if what == "ok" and r["photo_id"]:
        db.ekran_add(r["photo_id"], r["uniq"], "photo", "image/jpeg", (r["text"] or "")[:200], 0, frm["id"])
    (tg.edit_caption if r["photo_id"] else tg.edit)(cid, mid, review_text(r))
    tg.answer(q["id"], "Katta ekranga qo‘shildi" if what == "ok" and r["photo_id"] else "Tayyor")


# ================= Telegram ichidagi menyu oynasi =================
def miniapp_cart(cid, lang, raw):
    """Menyu oynasidan kelgan tanlov: {"i": [["salat", 0, 2], ...]}. Narxni o'zimiz menyudan olamiz."""
    import json
    try:
        picks = json.loads(raw)["i"]
    except (ValueError, KeyError, TypeError):
        return tg.send(cid, t("only_text", lang))
    nl, total, lines = bilim.name_lang(lang), 0, []
    for sid, idx, qty in picks[:60]:
        try:
            it = bilim.SEC[sid]["taomlar"][int(idx)]
            qty = max(1, min(99, int(qty)))
        except (KeyError, IndexError, ValueError, TypeError):
            continue
        price = it.get("narx") or 0
        total += price * qty
        lines.append(f"• {html.escape(it[nl])} × {qty}" + (f" — {bilim.som(price * qty)} {t('som', lang)}" if price else ""))
    if not lines:
        return tg.send(cid, t("only_text", lang))
    kb = kb_inline([[{"text": t("btn_banket", lang), "callback_data": "go:banket"}]])
    tg.send(cid, f"{t('cart', lang)}\n" + "\n".join(lines) + f"\n\n<b>{t('cart_total', lang)}: {bilim.som(total)} {t('som', lang)}</b>", kb, html=True)


# ================= kompyuterda ishga tushirish =================
MEHMON_BUYRUQ = {
    "uz": [("start", "Boshlash"), ("menyu", "Taomlar menyusi"), ("banket", "Banket yoki to‘y buyurtmasi"), ("aloqa", "Manzil va telefon"), ("lang", "Tilni o‘zgartirish"), ("bekor", "Bekor qilish")],
    "ru": [("start", "Начать"), ("menyu", "Меню блюд"), ("banket", "Заказ банкета или свадьбы"), ("aloqa", "Адрес и телефон"), ("lang", "Сменить язык"), ("bekor", "Отмена")],
    "en": [("start", "Start"), ("menyu", "Dish menu"), ("banket", "Book a banquet or wedding"), ("aloqa", "Address and phone"), ("lang", "Change language"), ("bekor", "Cancel")],
}
ADMIN_BUYRUQ = [("panel", "Admin paneli (hamma narsa tugmalar bilan)"), ("zakazlar", "Banket zakazlari (bugun, ertaga, hafta)"), ("banketlar", "Oxirgi banket so‘rovlari"), ("hisob", "Kechagi savdo va xarajat"),
                ("ekran", "Katta ekran fayllari"), ("ai", "AI lar holati"), ("yordam", "Admin yordami"), ("myid", "Mening ID raqamim")]


def buyruqlar_menyusi():
    """Telegramning ko'k 'Menu' tugmasidagi buyruqlar ro'yxati: mehmonlar va adminlar uchun alohida."""
    def cm(lst):
        return [{"command": c, "description": d} for c, d in lst]
    try:
        tg.call("setMyCommands", commands=cm(MEHMON_BUYRUQ["uz"]))
        for lg in ("ru", "en"):
            tg.call("setMyCommands", commands=cm(MEHMON_BUYRUQ[lg]), language_code=lg)
        for aid in ADMIN_IDS:
            tg.safe("setMyCommands", commands=cm(MEHMON_BUYRUQ["uz"] + ADMIN_BUYRUQ), scope={"type": "chat", "chat_id": aid})
        tg.call("setChatMenuButton", menu_button={"type": "commands"})
        print("Buyruqlar menyusi yangilandi.")
    except Exception as e:
        print("Buyruqlar menyusi o‘rnatilmadi:", e)


def polling():
    tg.call("deleteWebhook")
    buyruqlar_menyusi()
    me = tg.call("getMe")
    print(f"@{me['username']} ishga tushdi. To‘xtatish: Ctrl+C")
    print("AI:", ", ".join(ai.ulangan()) or "kalit kiritilmagan!")
    offset = None
    while True:
        try:
            daily_tick()
        except Exception:
            traceback.print_exc()
        try:
            ups = tg.call("getUpdates", offset=offset, timeout=30, allowed_updates=["message", "callback_query"])
        except Exception as e:
            print("Ulanish xatosi:", e)
            time.sleep(3)
            continue
        for u in ups:
            offset = u["update_id"] + 1
            handle_update(u)


if __name__ == "__main__":
    polling()
