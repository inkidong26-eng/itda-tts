#!/usr/bin/env bash
# 가입 정보 DB 하루 1번 백업 (VPS 에서 cron 으로). 백업도 개인정보라 7일 지난 것은 지운다.
# → 이름을 지우는 날(행사 후 30일) 뒤 7일 안에 백업에서도 사라진다 (10 문서 Q2)
set -euo pipefail
SRC=/opt/itda/services/api/data/itda.db
DST=/opt/itda-backup
mkdir -p "$DST" && chmod 700 "$DST"
[ -f "$SRC" ] || exit 0
# 앱이 쓰는 중에도 안전하게 복사 (SQLite 백업 기능)
python3 - "$SRC" "$DST/itda-$(date +%Y%m%d).db" <<'PY'
import sqlite3, sys
src = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
dst = sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close(); src.close()
PY
chmod 600 "$DST"/itda-*.db
find "$DST" -name 'itda-*.db' -mtime +7 -delete
