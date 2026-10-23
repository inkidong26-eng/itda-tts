import { useState } from "react";
import { Button, Notice, Screen } from "../components/ui";
import { AGE_GROUPS, GENDERS } from "../lib/labels";

/** S3 나이·성별. [다음]을 누르면 가입(서버에 사용자 생성) 후 목소리 추천으로 */
export function AgeGenderPage({ onBack, onNext }: {
  onBack: () => void;
  onNext: (ageGroup: string, gender: "m" | "f") => Promise<string | null>;
}) {
  const [age, setAge] = useState<string | null>(null);
  const [gender, setGender] = useState<"m" | "f" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = async () => {
    if (!age || !gender) {
      setError("나이대와 성별을 하나씩 골라 주세요");
      return;
    }
    setBusy(true);
    setError(await onNext(age, gender));
    setBusy(false);
  };

  return (
    <Screen
      step={{ n: 2, total: 3, label: "나이·성별" }}
      title="나이대와 성별을 골라 주세요"
      footer={
        <>
          <Button onClick={next} disabled={busy}>{busy ? "⏳ 잠시만요…" : "다음"}</Button>
          <Button variant="secondary" onClick={onBack} disabled={busy}>뒤로</Button>
        </>
      }
    >
      <p className="text-muted">내 목소리를 추천해 드리기 위해 사용해요.</p>
      <fieldset>
        <legend className="mb-2 font-semibold">나이대</legend>
        <div className="grid grid-cols-2 gap-3">
          {AGE_GROUPS.map((a) => (
            <Button key={a.value} variant="choice" selected={age === a.value} onClick={() => setAge(a.value)}>
              {a.label}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 font-semibold">성별</legend>
        <div className="grid grid-cols-2 gap-3">
          {GENDERS.map((g) => (
            <Button key={g.value} variant="choice" selected={gender === g.value} onClick={() => setGender(g.value)}>
              {g.label}
            </Button>
          ))}
        </div>
      </fieldset>
      {error && <Notice kind="error">{error}</Notice>}
    </Screen>
  );
}
