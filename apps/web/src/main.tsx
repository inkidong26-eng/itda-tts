import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DevAudioPage } from "./pages/DevAudioPage";
import { ReceivePage } from "./pages/ReceivePage";

// 청인 받는 화면: /c/{방번호} — 가입·설치 없이 바로 (규칙 6)
const callMatch = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css"; // 기본 글씨체 (필요한 글자만 받음)
import "./index.css";
import { applyAppearance } from "./storage/appearance";
import { loadView } from "./storage/settings";

// 청인 화면(/c/...)도 이 폰에 저장된 글씨체·크기가 있으면 따른다
applyAppearance(loadView());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {callMatch ? <ReceivePage callId={callMatch[1]} /> : window.location.pathname.startsWith("/dev/audio") ? <DevAudioPage /> : <App />}
  </StrictMode>,
);
