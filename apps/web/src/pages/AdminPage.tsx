// 관리자 화면 (/admin): 폰에서 GPU 연결하기. RunPod 에서 켠 GPU 의 Pod ID 를 붙여 넣으면 진짜 목소리가 연결된다.
// 비밀번호는 이 폰의 이번 방문(sessionStorage)에만 기억한다.
import { useEffect, useState } from "react";
import { Button, Card, Notice, Screen } from "../components/ui";

type Status = { endpoints: { url: string; healthy: boolean }[]; state: string };

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "/api";
const PW_KEY = "itda.admin";

const loadPw = () => { try { return sessionStorage.getItem(PW_KEY) ?? ""; } catch { return ""; } };
const savePw = (v: string) => { try { sessionStorage.setItem(PW_KEY, v); } catch { /* 이번만 */ } };

async function call(method: "GET" | "POST", pw: string, body?: object): Promise<Status> {
  const res = await fetch(`${BASE}/admin/tts`, {
    method,
    headers: { "X-Admin": pw, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new Error("비밀번호가 맞지 않아요");
  if (res.status === 429) throw new Error("너무 여러 번 틀렸어요. 1분 뒤에 다시 해 주세요");
  if (res.status === 400) throw new Error("Pod ID 모양이 아니에요. RunPod 화면의 ID 를 그대로 붙여 넣어 주세요");
  if (!res.ok) throw new Error("문제가 생겼어요. 다시 해 주세요");
  return res.json();
}

export function AdminPage() {
  const [pw, setPw] = useState(loadPw);
  const [ok, setOk] = useState(false);
  const [pod, setPod] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<Status>) => {
    setBusy(true); setError(null);
    try { setStatus(await fn()); setOk(true); savePw(pw); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  // 연결한 뒤 GPU 가 준비될 때까지 10초마다 상태를 다시 본다
  useEffect(() => {
    if (!ok || !status?.endpoints.length || status.endpoints.every((e) => e.healthy)) return;
    const t = setTimeout(() => void run(() => call("GET", pw)), 10000);
    return () => clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const ep = status?.endpoints[0];
  return (
    <Screen title="🛠️ GPU 연결 (관리자)">
      {!ok ? (
        <Card className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">
            <span className="font-semibold">관리자 비밀번호</span>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password"
              className="min-h-[56px] rounded-2xl border-2 border-slate-200 bg-white px-4 text-xl" />
          </label>
          <Button disabled={!pw || busy} onClick={() => void run(() => call("GET", pw))}>들어가기</Button>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-2">
            <p className="text-lg font-bold">지금 상태</p>
            {!ep && <p className="text-lg">⚪ GPU 없음 · 폰 기본 목소리로 말해요</p>}
            {ep && ep.healthy && <p className="text-lg text-brand-dark">🟢 진짜 목소리 연결됨</p>}
            {ep && !ep.healthy && <p className="text-lg">🟡 GPU 준비 중… (켜고 3–5분, 처음엔 더 걸려요)</p>}
            {ep && <p className="break-all text-sm text-muted">{ep.url}</p>}
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => call("GET", pw))}>상태 새로 보기</Button>
          </Card>
          <Card className="flex flex-col gap-3">
            <p className="text-lg font-bold">새 GPU 연결</p>
            <p className="text-base text-muted">RunPod 에서 ITDA 템플릿으로 켠 뒤, Pod 의 ID (예: xvtleffn8cz0nt) 를 붙여 넣으세요.</p>
            <input value={pod} onChange={(e) => setPod(e.target.value.trim())} placeholder="Pod ID" autoCapitalize="off" autoCorrect="off"
              className="min-h-[56px] rounded-2xl border-2 border-slate-200 bg-white px-4 text-xl" />
            <Button disabled={!pod || busy} onClick={() => void run(() => call("POST", pw, { podId: pod }))}>연결하기</Button>
          </Card>
          {ep && (
            <Button variant="secondary" disabled={busy} onClick={() => void run(() => call("POST", pw, {}))}>
              GPU 연결 끊기
            </Button>
          )}
        </>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Screen>
  );
}
