import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "choice";

const BASE =
  "min-h-[56px] w-full rounded-2xl px-4 text-lg font-bold transition-colors disabled:opacity-40 " +
  "focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-accent";

const STYLES: Record<Variant, string> = {
  primary: "bg-[#0e6582] text-white shadow-sm active:bg-[#0a4d63]",
  secondary: "border-2 border-navy bg-white text-navy active:bg-blue-50",
  choice: "border-2 border-slate-200 bg-white text-ink shadow-sm",
};

/** 큰 버튼 (높이 56px 이상) */
export function Button({
  variant = "primary", selected, className = "", children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; selected?: boolean }) {
  const look = selected ? "border-2 border-brand-dark bg-brand-dark text-white" : STYLES[variant];
  return (
    <button type="button" className={`${BASE} ${look} ${className}`} aria-pressed={selected} {...rest}>
      {selected ? "✓ " : ""}
      {children}
    </button>
  );
}

/** 가입 단계 표시 (예: 1/3 이름) */
export type Step = { n: number; total: number; label: string };

/** 한 화면 틀: 폭 360px에서도 가로 스크롤 없게. 화면마다 따로 꾸미지 않고 여기서 모양을 맞춘다 */
export function Screen({ title, children, footer, step, white }: { title?: string; children: ReactNode; footer?: ReactNode; step?: Step; white?: boolean }) {
  return (
    <main className={`mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 py-6 ${white ? "bg-white" : "bg-slate-50"}`}>
      {step && (
        <div className="mb-4" aria-label={`${step.total}단계 중 ${step.n}단계`}>
          <p className="mb-2 flex justify-between text-sm font-semibold text-muted">
            <span>{step.n}단계 · {step.label}</span><span>{step.n} / {step.total}</span>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-[#0e6582]" style={{ width: `${(step.n / step.total) * 100}%` }} />
          </div>
        </div>
      )}
      {title && <h1 className="mb-5 text-2xl font-bold leading-snug">{title}</h1>}
      <div className="flex flex-1 flex-col gap-4">{children}</div>
      {footer && <div className="mt-6 flex flex-col gap-3">{footer}</div>}
    </main>
  );
}

/** 흰 카드 묶음 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

/** 오류·상태 안내: 글자 + 아이콘 + 색 (소리에만 의존하지 않기) */
export function Notice({ kind, children }: { kind: "error" | "info"; children: ReactNode }) {
  const look = kind === "error" ? "border-red-700 bg-red-50 text-red-800" : "border-navy bg-blue-50 text-navy";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-xl border-2 px-4 py-3 font-semibold ${look}`}>
      {kind === "error" ? "⚠️ " : "ℹ️ "}
      {children}
    </p>
  );
}
