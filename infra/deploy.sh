#!/usr/bin/env bash
# 배포·업데이트 (VPS 에서). GitHub 의 최신 코드를 받아 다시 빌드하고 켠다.
# 앱이 다시 켜지는 몇 초 동안 연결이 끊길 수 있으니 행사 중에는 하지 않는다.
set -euo pipefail
cd /opt/itda
git pull --ff-only
docker compose -f infra/docker-compose.prod.yml up -d --build
docker image prune -f >/dev/null
docker compose -f infra/docker-compose.prod.yml ps
