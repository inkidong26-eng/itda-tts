import { useEffect, useState } from "react";
import { ApiError, deleteMe, signup } from "./api/client";
import { AboutPage } from "./pages/AboutPage";
import { AgeGenderPage } from "./pages/AgeGenderPage";
import { CallPage } from "./pages/CallPage";
import { FaceToFacePage } from "./pages/FaceToFacePage";
import { HomePage, SoonPage } from "./pages/HomePage";
import { NamePage } from "./pages/NamePage";
import { SettingsPage } from "./pages/SettingsPage";
import { SpeakerGuidePage } from "./pages/SpeakerGuidePage";
import { StartPage } from "./pages/StartPage";
import { VoicePage } from "./pages/VoicePage";
import { type Session, clearSession, loadSession, saveSession } from "./storage/local";
import { applyAppearance } from "./storage/appearance";
import { type ViewSettings, loadView, saveView } from "./storage/settings";

type View =
  | { name: "start" }
  | { name: "name" }
  | { name: "ageGender" }
  | { name: "voice" }
  | { name: "home" }
  | { name: "face" }
  | { name: "call" }
  | { name: "speakerGuide" }
  | { name: "speaker" }
  | { name: "settings" }
  | { name: "about" }
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
  const [viewSettings, setViewSettings] = useState<ViewSettings>(loadView);

  // 글자 크기·글씨체·글자색은 앱 전체에 적용
  useEffect(() => applyAppearance(viewSettings), [viewSettings]);

  const changeView = (v: ViewSettings) => {
    saveView(v);
    setViewSettings(v);
  };

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
      return (
        <HomePage session={session} onSoon={(what) => setView(
          what === "마주보고 대화" ? { name: "face" } : what === "전화로 대화" ? { name: "call" }
            : what === "설정" ? { name: "settings" } : { name: "soon", what })} />
      );
    case "face":
      if (!session) return <StartPage onStart={() => setView({ name: "name" })} />;
      return (
        <FaceToFacePage session={session} view={viewSettings} onView={changeView}
          onHome={() => setView({ name: "home" })} onAuthLost={restart} />
      );
    case "call":
      if (!session) return <StartPage onStart={() => setView({ name: "name" })} />;
      return (
        <CallPage session={session} view={viewSettings} onHome={() => setView({ name: "home" })}
          onSpeaker={() => setView({ name: "speakerGuide" })} />
      );
    case "speakerGuide":
      return <SpeakerGuidePage onStart={() => setView({ name: "speaker" })} onBack={() => setView({ name: "call" })} />;
    case "speaker":
      if (!session) return <StartPage onStart={() => setView({ name: "name" })} />;
      return (
        <FaceToFacePage session={session} view={viewSettings} onView={changeView} speaker
          onHome={() => setView({ name: "home" })} onAuthLost={restart} />
      );
    case "settings":
      return <SettingsPage view={viewSettings} onView={changeView} onHome={() => setView({ name: "home" })}
        onAbout={() => setView({ name: "about" })}
        onRestart={() => { if (session) void deleteMe(session.token).catch(() => undefined); restart(); }} />;
    case "about":
      return <AboutPage onBack={() => setView({ name: "settings" })} />;
    case "soon":
      return <SoonPage what={view.what} onHome={() => setView({ name: "home" })} />;
  }
}
