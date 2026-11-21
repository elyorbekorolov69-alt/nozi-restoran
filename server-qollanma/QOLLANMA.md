# NoZi botni serverga ko'chirish (Ubuntu 24.04)

Hammasi kompyuterdan (Windows PowerShell). Server IP va parolni eskiz panelidan oling. Parolni hech kimga yozmang.

1. **Kompyuterdagi botni to'xtating** (Ctrl+C). Ikkita bot bir vaqtda ishlasa, Telegram xato beradi.
2. Bot papkasini serverga ko'chiring (PowerShell, IP o'rniga serveringiz IP):
   `scp -r "C:\Users\User\Downloads\nozi-bot\nozi-bot" root@IP:/opt/nozi-bot`
   (Birinchi marta "yes" deb yozing, keyin parolni kiriting.)
3. Serverga kiring: `ssh root@IP`
4. O'rnating: `bash /opt/nozi-bot/install.sh`
5. Oxirida "active (running)" chiqishi kerak. Telegramda botga /start yozib tekshiring.
6. Keyin kompyuterdagi botni qayta yoqmang.

Foydali buyruqlar (serverda): `journalctl -u nozi-bot -f` (log), `systemctl restart nozi-bot` (qayta yoqish).
