"""켜져 있는 TTS 서버를 점검하는 스크립트 (T02 완료 확인용).

사용: python scripts/check_server.py --url http://127.0.0.1:8001 --key 비밀키 --out ./t02_out
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DESCRIPTION = "20대 여성, 밝고 또렷한 목소리"
TEXT = "안녕하세요, 만나서 반가워요."


def call(url: str, key: str, method: str = "GET", body: dict | None = None, timeout: int = 120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("X-Key", key)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read(), res.headers


def wait_ready(base: str, key: str, max_wait: int) -> dict:
    # 모델을 내려받고 올리는 데 처음에는 몇 분 걸릴 수 있다
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            body, _ = call(f"{base}/health", key, timeout=5)
            info = json.loads(body)
            if info.get("ready"):
                return info
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            pass
        time.sleep(5)
    raise SystemExit(f"❌ {max_wait}초 안에 서버가 준비되지 않았어요. 서버 로그를 확인해 주세요.")


def main() -> None:
    # 윈도우 한글 콘솔(cp949)에서도 ✅ 같은 글자가 깨지지 않게
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    parser.add_argument("--key", required=True)
    parser.add_argument("--out", default="t02_out")
    parser.add_argument("--wait", type=int, default=900)
    args = parser.parse_args()
    base = args.url.rstrip("/")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    info = wait_ready(base, args.key, args.wait)
    print(f"✅ 1. /health ready: true (GPU: {info.get('gpu')})")

    try:
        call(f"{base}/health", "wrong-key", timeout=5)
        print("❌ 틀린 비밀키가 통과됐어요")
    except urllib.error.HTTPError as e:
        print(f"✅ 틀린 비밀키는 거절됨 ({e.code})")

    body, _ = call(f"{base}/warmup", args.key, method="POST")
    print(f"✅ 워밍업 완료 ({json.loads(body)['ms']} ms)")

    times = []
    for i in range(1, 4):
        started = time.perf_counter()
        wav, headers = call(f"{base}/synthesize", args.key, "POST",
                      {"mode": "design", "description": DESCRIPTION, "text": TEXT, "seed": i})
        sec = time.perf_counter() - started
        times.append(sec)
        path = out / f"t02_seed{i}.wav"
        path.write_bytes(wav)
        gen_sec = int(headers.get("X-Gen-Ms", 0)) / 1000
        print(f"   seed {i}: 전체 {sec:.2f}초 (서버 생성 {gen_sec:.2f}초) → {path}")

    print(f"✅ 2. wav 3개 생성 — 직접 들어 보고 한국어가 자연스러운지, 숨소리가 있는지 확인해 주세요")
    print(f"✅ 3. 한 문장 생성 시간: 평균 {sum(times) / len(times):.2f}초 (최소 {min(times):.2f}, 최대 {max(times):.2f})")


if __name__ == "__main__":
    main()
