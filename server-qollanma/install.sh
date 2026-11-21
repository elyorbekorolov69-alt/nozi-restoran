#!/usr/bin/env bash
# NoZi bot: Ubuntu serverga o'rnatish. Serverda ishga tushiring: bash /opt/nozi-bot/install.sh
set -e
cd /opt/nozi-bot
apt-get update -y
apt-get install -y python3 python3-venv python3-pip
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt
# yangi bot fayli bor bo'lsa, eskisini saqlab, yangisini qo'yamiz
if [ -f bot.yangi5.py ]; then cp -n bot.py bot.eski.py; cp bot.yangi5.py bot.py; fi
cat > /etc/systemd/system/nozi-bot.service <<'UNIT'
[Unit]
Description=NoZi Telegram bot
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/opt/nozi-bot
ExecStart=/opt/nozi-bot/venv/bin/python /opt/nozi-bot/bot.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now nozi-bot
sleep 3
systemctl --no-pager status nozi-bot | head -15
echo "Tayyor. Loglar: journalctl -u nozi-bot -f"
