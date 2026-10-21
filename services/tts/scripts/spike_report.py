"""T03 결과(results.json + wav)를 spike_report.html 한 장으로 만든다."""

import html
import json
from pathlib import Path

import soundfile as sf

from spike_audio import to_data_uri

SECTIONS = [
    ("ref", "1. 방식 A — 감정별 기준 음성 (후보 3개 중 '같은 사람 점수'가 가장 높은 것을 선택)"),
    ("method", "2. 방식 A(복제) vs B(매번 설계) — 같은 문장, 감정 7종"),
    ("consist", "3. 같은 사람처럼 들리나요? — 서로 다른 10문장"),
    ("speed", "4. 속도 비교 (같은 문장, 3번 평균)"),
    ("breath", "5. 숨소리 조건 비교 — 원본과 '앞부분 자름'을 들어 보세요"),
    ("split", "6. 문장 부호에서 나눠 만들기 — 문장 사이 숨소리 비교"),
    ("urgent", "7. 다급한 문장 — \"가쁜 숨소리는 누가 쫓아오는 듯해…\""),
]

STYLE = """
:root{--bg:#fff;--fg:#111;--muted:#555;--line:#ddd;--accent:#1A9A9A;--warn:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#111;--fg:#eee;--muted:#aaa;--line:#333}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
h1{font-size:24px}h2{font-size:19px;margin-top:32px;border-bottom:2px solid var(--accent);padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:middle}
th{color:var(--muted);font-weight:600}audio{height:32px;max-width:260px}.num{text-align:right;white-space:nowrap}
.low{color:var(--warn);font-weight:600}.box{border:1px solid var(--line);border-radius:8px;padding:12px;margin:12px 0}
textarea{width:100%;height:120px;font:14px monospace}button{font-size:16px;padding:8px 16px;margin:6px 0}
"""

SCRIPT = """
function collect(){
  const lines=[];
  document.querySelectorAll('tr[data-id]').forEach(tr=>{
    const marks=[...tr.querySelectorAll('input:checked')].map(i=>i.dataset.k);
    if(marks.length) lines.push(tr.dataset.id+' '+marks.join(','));
  });
  const t=document.getElementById('notes');
  t.value=lines.join('\\n')||'(체크한 항목 없음)';
  t.select();
  try{navigator.clipboard.writeText(t.value)}catch(e){}
}
"""


def _cell_score(v):
    if v is None:
        return "<td class=num>-</td>"
    cls = " low" if v < 0.75 else ""
    return f"<td class='num{cls}'>{v:.2f}</td>"


def _summary(summary: dict) -> str:
    parts = [f"<p>GPU: <b>{html.escape(str(summary.get('gpu')))}</b> · 걸린 시간: {summary.get('minutes')}분</p>"]
    if summary.get("speed"):
        rows = "".join(
            f"<tr><td>{html.escape(k)}</td><td class=num>{v['평균초']}초</td><td class=num>{v['최소초']}초</td>"
            f"<td class=num>{v['실시간배수']}배</td></tr>" for k, v in summary["speed"].items())
        parts.append("<h3>속도 (목표 1.5초, 비상 전환 4초)</h3><table><tr><th>방법</th><th>평균</th><th>최소</th>"
                     f"<th>실시간 배수 (1보다 크면 말하는 속도보다 빨리 만듦)</th></tr>{rows}</table>")
    if summary.get("throughput"):
        rows = "".join(f"<tr><td>{html.escape(k)}</td><td class=num>{v}문장/초</td></tr>"
                       for k, v in summary["throughput"].items())
        parts.append(f"<h3>동시 처리량 (GPU 1대가 1초에 만드는 문장 수)</h3><table>{rows}</table>")
    if summary.get("consistency"):
        c = summary["consistency"]
        parts.append("<h3>같은 사람 점수 — 10문장 (1에 가까울수록 같은 사람)</h3><table>"
                     + "".join(f"<tr><td>방식 {m}</td><td class=num>평균 {s['평균']}</td><td class=num>최저 {s['최저']}</td></tr>"
                               for m, s in c.items()) + "</table>")
    if summary.get("errors"):
        parts.append("<p class=low>⚠️ 실패한 부분: " + html.escape(" / ".join(summary["errors"])) + "</p>")
    return "<div class=box>" + "".join(parts) + "</div>"


def build_report(out: Path) -> Path:
    data = json.loads((out / "results.json").read_text(encoding="utf-8"))
    rows = data["rows"]
    body = [
        "<h1>ITDA T03 검증 보고서</h1>",
        "<p>각 소리를 듣고 해당하는 칸에 체크하세요. 끝나면 맨 아래 [체크 결과 복사]를 눌러 붙여 넣어 보내 주세요.</p>",
        "<p>'같은 사람 점수'는 모델의 목소리 인식 기능으로 잰 값이에요 (평온 기준 음성과 비교, 1에 가까울수록 같은 사람). "
        "<span class=low>0.75 미만</span>은 다른 사람일 가능성이 높아요. 숫자보다 귀가 우선이에요.</p>",
        _summary(data["summary"]),
    ]
    for key, title in SECTIONS:
        section = [r for r in rows if r["section"] == key]
        if not section:
            continue
        trs = []
        for r in section:
            wav, sr = sf.read(out / "wav" / r["file"], dtype="float32")
            rid = r["file"].removesuffix(".wav")
            gen = f"{r['gen_sec']}초" if r["gen_sec"] is not None else "-"
            checks = "".join(f"<label><input type=checkbox data-k={k}> {t}</label> "
                             for k, t in (("좋음", "좋음"), ("숨소리", "숨소리"), ("다른사람", "다른 사람"), ("어색", "어색")))
            trs.append(
                f"<tr data-id='{rid}'><td>{html.escape(r['voice'] or '')}</td><td>{html.escape(r['label'])}</td>"
                f"<td>{html.escape(r['text'])}</td><td><audio controls preload=none src='{to_data_uri(wav, sr)}'></audio></td>"
                f"<td class=num>{gen}</td>{_cell_score(r['same_person'])}<td>{checks}</td></tr>")
        body.append(f"<h2>{html.escape(title)}</h2><table><tr><th>음성</th><th>항목</th><th>문장</th><th>소리</th>"
                    f"<th>생성 시간</th><th>같은 사람</th><th>들어 보고 체크</th></tr>{''.join(trs)}</table>")
    body.append("<div class=box><button onclick='collect()'>체크 결과 복사</button>"
                "<textarea id=notes placeholder='여기에 체크 결과가 나와요'></textarea></div>")
    page = (f"<!doctype html><html lang=ko><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
            f"<title>ITDA T03 검증</title><style>{STYLE}</style></head><body>{''.join(body)}<script>{SCRIPT}</script></body></html>")
    path = out / "spike_report.html"
    path.write_text(page, encoding="utf-8")
    return path


if __name__ == "__main__":
    import sys
    build_report(Path(sys.argv[1] if len(sys.argv) > 1 else "t03_out"))
