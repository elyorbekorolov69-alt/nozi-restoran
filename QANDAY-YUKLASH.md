
## Banket eslatmalari (bir marta sozlanadi)
1. Supabase -> SQL Editor: `3-supabase/eslatma.sql` ni Run qiling.
2. Cloudflare -> Variables and Secrets: `CRON_SECRET` (o'zingiz o'ylab topgan uzun maxfiy so'z), `BOT_TOKEN`, `STAFF_CHAT_ID` bo'lishi kerak. Retry deployment.
3. https://cron-job.org (bepul) da hisob oching, yangi cron: manzil `https://restorannozi.uz/api/eslatma?key=SIZNING_CRON_SECRET`, har 1 soatda.
4. Natija: banketdan 1 kun oldin va banket kuni ertalab (08:00 dan keyin) xodimlar guruhiga xabar boradi. Rad etilganlarga ketmaydi.
