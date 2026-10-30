"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/analytics";
import type { Level } from "@/lib/insights";

export function Card({ title, sub, right, children, className = "" }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-4 sm:p-5 min-w-0 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "bad" | "warn" }) {
  const subColor = tone === "good" ? "text-good-text" : tone === "bad" ? "text-critical" : tone === "warn" ? "text-serious" : "text-ink-2";
  return (
    <div className="rounded-xl border border-line bg-surface p-4 min-w-0">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink truncate">{value}</div>
      {sub && <div className={`mt-1 text-xs ${subColor}`}>{sub}</div>}
    </div>
  );
}

const STATUS: Record<Status, { label: string; icon: string; color: string }> = {
  over: { label: "초과", icon: "▲", color: "var(--critical)" },
  risk: { label: "주의", icon: "◆", color: "var(--serious)" },
  ok: { label: "정상", icon: "●", color: "var(--good)" },
  paid: { label: "납부", icon: "✓", color: "var(--good)" },
  pending: { label: "예정", icon: "○", color: "var(--muted)" },
  idle: { label: "—", icon: "", color: "var(--muted)" },
};
export function StatusBadge({ s }: { s: Status }) {
  const v = STATUS[s];
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 whitespace-nowrap">
      <span style={{ color: v.color }} aria-hidden>
        {v.icon}
      </span>
      {v.label}
    </span>
  );
}

const LEVEL: Record<Level, { icon: string; color: string; label: string }> = {
  critical: { icon: "▲", color: "var(--critical)", label: "위험" },
  warning: { icon: "◆", color: "var(--serious)", label: "주의" },
  info: { icon: "i", color: "var(--accent)", label: "참고" },
  good: { icon: "✓", color: "var(--good)", label: "양호" },
};
export function LevelIcon({ level }: { level: Level }) {
  const v = LEVEL[level];
  return (
    <span
      title={v.label}
      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: v.color }}
    >
      {v.icon}
    </span>
  );
}

/** 예산 사용률 바 (경과율 마커 포함) */
export function UsageBar({ used, pace, status }: { used: number; pace?: number; status: Status }) {
  const w = Math.min(1, isFinite(used) ? used : 1);
  const color = status === "over" ? "var(--critical)" : status === "risk" ? "var(--serious)" : "var(--accent)";
  return (
    <div className="relative h-2 w-full rounded-full" style={{ background: "var(--mid)" }}>
      <div className="h-2 rounded-full" style={{ width: `${w * 100}%`, background: color }} />
      {pace !== undefined && pace > 0 && pace < 1 && (
        <div className="absolute -top-1 h-4 w-[2px] rounded" style={{ left: `calc(${pace * 100}% - 1px)`, background: "var(--ink-2)" }} title="오늘까지의 예산 페이스" />
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

/** CSS 변수 → 실제 색상 (Recharts SVG 속성은 var()를 못 읽으므로) */
export function useColors() {
  const read = () => {
    if (typeof window === "undefined") return null;
    const cs = getComputedStyle(document.documentElement);
    const g = (k: string) => cs.getPropertyValue(k).trim();
    return { s1: g("--s1"), s2: g("--s2"), s3: g("--s3"), s4: g("--s4"), grid: g("--grid"), axis: g("--axis"), muted: g("--muted"), ink: g("--ink"), ink2: g("--ink-2"), surface: g("--surface"), critical: g("--critical"), good: g("--good"), mid: g("--mid") };
  };
  const [c, setC] = useState(read);
  useEffect(() => {
    setC(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => setC(read());
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return (
    c ?? { s1: "#2a78d6", s2: "#eb6834", s3: "#1baf7a", s4: "#eda100", grid: "#e1e0d9", axis: "#c3c2b7", muted: "#898781", ink: "#0b0b0b", ink2: "#52514e", surface: "#fcfcfb", critical: "#d03b3b", good: "#0ca30c", mid: "#f0efec" }
  );
}

export function ChartTip({ active, payload, label, fmt, labelFmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string | number; fmt: (n: number) => string; labelFmt?: (l: string | number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{labelFmt ? labelFmt(label ?? "") : label}</div>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-ink-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span>{p.name}</span>
            <span className="ml-auto pl-3 font-medium text-ink tnum">{fmt(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dash?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.dash ? (
            <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: i.color }} />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function Money({ v, className = "" }: { v: number; className?: string }) {
  return <span className={`tnum ${className}`}>{(v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}</span>;
}
