import { useState } from "react";
import { ApiError, signup } from "./api/client";
import { AgeGenderPage } from "./pages/AgeGenderPage";
import { HomePage, SoonPage } from "./pages/HomePage";
import { NamePage } from "./pages/NamePage";
import { StartPage } from "./pages/StartPage";
import { VoicePage } from "./pages/VoicePage";
import { type Session, clearSession, loadSession, saveSession } from "./storage/local";

type View =
  | { name: "start" }
  | { name: "name" }
  | { name: "ageGender" }
  | { name: "voice" }
  | { name: "home" }
  | { name: "soon"; what: string };

function firstView(session: Session | null): View {
  if (session?.voiceId) return { name: "home" }; // 다시 오면 홈으로 바로
  if (session) return { name: "voice" };
  return { name: "start" };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [view, setView] = useState<View>(() => firstView(loadSession()));
  const [draftName, setDraftName] = useState("");

  const keep = (next: Session) => {
    saveSession(next);
    setSession(next);
  };

  const restart = () => {
    clearSession();
    setSession(null);
    setDraftName("");
    setView({ name: "start" });
  };

  const register = async (ageGroup: string, gender: "m" | "f"): Promise<string | null> => {
    try {
      const res = await signup(draftName, ageGroup, gender);
      keep({ token: res.token, userId: res.userId, name: draftName, ageGroup, gender });
      setView({ name: "voice" });
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "문제가 생겼어요. 다시 해 주세요";
    }
  };

  switch (view.name) {
    case "start":
      return <StartPage onStart={() => setView({ name: "name" })} />;
    case "name":
      return (
        <NamePage initial={draftName} onBack={() => setView({ name: "start" })}
          onNext={(name) => { setDraftName(name); setView({ name: "ageGender" }); }} />
      );
    case "ageGender":
      return <AgeGenderPage onBack={() => setView({ name: "name" })} onNext={register} />;
    case "voice":
      if (!session) return <StartPage onStart={() => setView({ name: "name" })} />;
      return (
        <VoicePage session={session} onAuthLost={restart} onRestart={restart}
          onChosen={(v) => { keep({ ...session, voiceId: v.id, voiceName: v.name }); setView({ name: "home" }); }} />
      );
    case "home":
      if (!session) return <StartPage onStart={() => setView({ name: "name" })} />;
      return <HomePage session={session} onSoon={(what) => setView({ name: "soon", what })} />;
    case "soon":
      return <SoonPage what={view.what} onHome={() => setView({ name: "home" })} />;
  }
}
