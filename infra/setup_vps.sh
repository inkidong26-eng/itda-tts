#!/usr/bin/env bash
# VPS 처음 한 번만 (Ubuntu 24.04, root). 사용: bash setup_vps.sh
# Docker 설치 → 방화벽(22·80·443) → 메모리 보조(swap) → 코드 받기 → .env 만들기(비밀키 자동 생성)
set -euo pipefail

REPO=https://github.com/inkidong26-eng/itda-tts.git
DIR=/opt/itda
SITE=${SITE:-itda.gyeot.ai.kr}

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io docker-compose-v2 git ufw unattended-upgrades
systemctl enable --now docker

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# 인터넷으로는 열쇠(SSH 키)로만 들어온다. 비밀번호 로그인 끔 (비상시 Vultr 웹 콘솔은 그대로)
cat > /etc/ssh/sshd_config.d/00-itda-hardening.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
SSHD
sshd -t && systemctl reload ssh

# 웹앱 빌드 때 메모리가 모자라지 않게 2GB 보조 메모리
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

[ -d "$DIR/.git" ] || git clone "$REPO" "$DIR"

ENV="$DIR/services/api/.env"
if [ ! -f "$ENV" ]; then
  cat > "$ENV" <<EOF
APP_SECRET=$(openssl rand -hex 32)
CONSENT_VERSION=event-2026-11-v1
SIGNUP_LIMIT_PER_MIN=30
ALLOWED_ORIGIN=https://$SITE
PUBLIC_AUDIO_BASE=/api/a
TTS_LIMIT_PER_MIN=20
WEB_BASE=https://$SITE
TTS_ENDPOINTS=
TTS_KEY=$(openssl rand -hex 24)
TTS_MAX_CONCURRENCY=4
TTS_START_TIMEOUT_MS=2500
TTS_TOTAL_TIMEOUT_MS=4000
EOF
  chmod 600 "$ENV"
fi
mkdir -p "$DIR/services/api/data"
echo "준비 끝. 다음: bash $DIR/infra/deploy.sh"
