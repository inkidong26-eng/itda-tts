import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DevAudioPage } from "./pages/DevAudioPage";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {window.location.pathname.startsWith("/dev/audio") ? <DevAudioPage /> : <App />}
  </StrictMode>,
);
