import { useState } from "react";
import { Button, Notice, Screen } from "../components/ui";
import { cleanName, nameError } from "../lib/labels";

// 보관 기간: 10 문서 Q2 (행사 11/13 후 30일)
export const CONSENT_TEXT = "행사 체험을 위해 이름을 저장하는 데 동의합니다. 행사 후 30일 이내 삭제됩니다.";

/** S2 이름 입력 */
export function NamePage({ initial, onBack, onNext }: {
  initial: string;
  onBack: () => void;
  onNext: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [consent, setConsent] = useState(false);
  const [tried, setTried] = useState(false);
  const error = nameError(name);

  const next = () => {
    setTried(true);
    if (!error && consent) onNext(cleanName(name));
  };

  return (
    <Screen
      step={{ n: 1, total: 3, label: "이름" }}
      title="이름을 적어 주세요"
      footer={
        <>
          <Button onClick={next}>다음</Button>
          <Button variant="secondary" onClick={onBack}>뒤로</Button>
        </>
      }
    >
      <label className="flex flex-col gap-2">
        <span className="font-semibold">이름 (한글·영문 2–20자)</span>
        <input
          className="min-h-[56px] rounded-2xl border-2 border-slate-200 bg-white px-4 text-xl shadow-sm focus:border-[#0e6582] focus:outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={20}
          aria-invalid={tried && !!error}
        />
      </label>
      {tried && error && <Notice kind="error">{error}</Notice>}

      <label className="flex min-h-[56px] items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <input type="checkbox" className="mt-1 h-7 w-7 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{CONSENT_TEXT} <b>(필수)</b></span>
      </label>
      {tried && !consent && <Notice kind="error">동의해 주셔야 다음으로 갈 수 있어요</Notice>}
    </Screen>
  );
}
