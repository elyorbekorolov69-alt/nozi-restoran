# AI yordamchi uchun 20 ta test-banket

Agent yoki uning qoidalari (agent-miya.md, agent.js, index.html dagi agentApply) o'zgargandan keyin shu ro'yxatni tekshirish kerak.
Har bir testda "Kutilgan natija" bajarilishi shart. Biror test yiqilsa, o'zgarish qaytariladi yoki tuzatiladi.

| # | Mijoz so'rovi | Kutilgan natija |
|---|---|---|
| 1 | 10 kishi, dumaloq stol, kishiga 150 000 | Яхна 10 ta (1 kg = 5 lagan); non 3 ta (chorakdan); 1 ta gul; jami byudjetdan oshmaydi |
| 2 | 20 kishi, 1-taom: sho'rva, 2-taom: yo'q | Sho'rva 20 porsiya; shashlik o'zidan qo'shilmagan |
| 3 | 30 kishi, komplekt suv kerak | 3 komplekt; gazli ichimliklar har xil (cola, fanta, pepsi); suv-gazli-sharbat bir joyda |
| 4 | 35 kishi, komplekt suv kerak | 3 komplekt qo'yiladi va "yana 1 komplekt qo'shaymi?" deb so'raladi (qoldiq 5) |
| 5 | 34 kishi, komplekt suv kerak | 3 komplekt, savol berilmaydi (qoldiq 4) |
| 6 | 10 kishi, Гиждувон балик | Baliq 1 kg (10 kishiga me'yor) |
| 7 | 25 kishi, Гиждувон балик | Baliq 3 kg (yuqoriga yaxlitlanadi) |
| 8 | 10 kishi, salatlar ko'p bo'lsin | Salatlar stendga chiqmaydi, past turadi |
| 9 | 10 kishi, Сырное ассорти va meva assorti | Ikkalasi stendda; dumaloq stolda 2 tadan bo'lsa X shaklida qarama-qarshi |
| 10 | 40 kishi, to'rtburchak stol | Stol to'rtburchak qoladi; stendlar "+" bo'lib ikki yarmida oynadek; non mehmonga yaqin |
| 11 | "dumaloq stol" deb boshlab, keyin "to'rtburchak qil" | Oxirgi aytilgani (to'rtburchak) qo'llanadi |
| 12 | 10 kishi, Яхна 1 ta deb aytilsa | Baribir 10 ta (1 kg) ga to'g'rilanadi |
| 13 | 60 kishi, 2-taom: shashlik (bitta tur) | Faqat tanlangan shashlik 60 porsiya; boshqa shashlik yo'q |
| 14 | Ovozli: "Muratga 6 ta, Anasarga 4 ta, komplekt suv 3 ta" | Шашлик/taomlar aytilgan sonda; 3 komplekt suv |
| 15 | 10 kishi, kishiga 50 000 (kam byudjet) | Arzon taomlar; byudjetdan oshsa, agent ochiq aytadi |
| 16 | Narx toifasi tanlangan (masalan, Standart) | Faqat shu toifadagi taomlar qo'shiladi |
| 17 | 15 kishi, desertlar | Desertlar stendda; yaxna past |
| 18 | 100 kishi, dumaloq stollar | Har stol 10 kishilik; telefonda yengil modellar (stol 3+ bo'lsa) |
| 19 | 12 kishi, 3 xil non | Non jami 3 ta (12/4), xillar o'rtasida teng bo'linadi |
| 20 | "Bezab ber" deyilsa, bezak berilmasa | Kamida gul qo'yiladi (10 kishigacha 1 ta, undan ko'p 2 ta); martini 3 tadan 3 joyda |

Eslatma: banket bo'limi kod bilan ochiladi, shuning uchun bu testlar admin yoki kod egasi tomonidan saytda bajariladi.
