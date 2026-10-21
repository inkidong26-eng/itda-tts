import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DevAudioPage } from "./pages/DevAudioPage";
import { ReceivePage } from "./pages/ReceivePage";

// 청인 받는 화면: /c/{방번호} — 가입·설치 없이 바로 (규칙 6)
const callMatch = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]+)\/?$/);
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {callMatch ? <ReceivePage callId={callMatch[1]} /> : window.location.pathname.startsWith("/dev/audio") ? <DevAudioPage /> : <App />}
  </StrictMode>,
);
