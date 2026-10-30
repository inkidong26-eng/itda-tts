import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AdminPage } from "./pages/AdminPage";
import { DevAudioPage } from "./pages/DevAudioPage";
import { ReceivePage } from "./pages/ReceivePage";
import { InAppGate } from "./components/InAppGate";
import { autoLeaveUrl } from "./lib/inApp";

// 청인 받는 화면: /c/{방번호} — 가입·설치 없이 바로 (규칙 6)
const callMatch = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css"; // 기본 글씨체 (필요한 글자만 받음)
import "./index.css";
import { applyAppearance } from "./storage/appearance";
import { loadView } from "./storage/settings";

// 안드로이드 카톡 등 앱 안에서 열면 크롬으로 저절로 넘긴다 (관리자 화면 제외). 이 창에는 안내가 남는다
const STAY_KEY = "itda.stayInApp";
const stayed = (() => { try { return sessionStorage.getItem(STAY_KEY) === "1"; } catch { return false; } })();
const leave = window.location.pathname.startsWith("/admin") ? null : autoLeaveUrl(navigator.userAgent, window.location.href, stayed);
if (leave) window.location.href = leave;

// 청인 화면(/c/...)도 이 폰에 저장된 글씨체·크기가 있으면 따른다
applyAppearance(loadView());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {callMatch ? <ReceivePage callId={callMatch[1]} /> : window.location.pathname.startsWith("/dev/audio") ? <DevAudioPage />
      : window.location.pathname.startsWith("/admin") ? <AdminPage /> : leave ? <InAppGate stayKey={STAY_KEY} app={<App />} /> : <App />}
  </StrictMode>,
);
