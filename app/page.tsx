"use client";
import { useEffect, useState } from "react";
import { useFinanceStore } from "@/lib/store";
import { addMonths, todayISO, ymLabel } from "@/lib/format";
import Dashboard from "@/components/Dashboard";
import Transactions from "@/components/Transactions";
import BudgetPlan from "@/components/BudgetPlan";
import BudgetVsActual from "@/components/BudgetVsActual";
import Trends from "@/components/Trends";
import Analysis from "@/components/Analysis";
import Simulator from "@/components/Simulator";
import Goals from "@/components/Goals";
import DataTab from "@/components/DataTab";

const TABS = [
  ["dash", "대시보드"],
  ["tx", "거래내역"],
  ["bva", "예산 대비 실적"],
  ["trend", "추세"],
  ["diag", "재무 진단"],
  ["sim", "시뮬레이터"],
  ["budget", "예산 계획"],
  ["goals", "목표"],
  ["data", "데이터"],
] as const;
type Tab = (typeof TABS)[number][0];

const SYNC_LABEL = { local: "이 기기에 저장", syncing: "동기화 중…", cloud: "클라우드 동기화됨", error: "동기화 오류", unconfigured: "클라우드 미설정" };

export default function Home() {
  const store = useFinanceStore();
  const [tab, setTab] = useState<Tab>("dash");
  const [month, setMonth] = useState(todayISO().slice(0, 7));

  useEffect(() => {
    try {
      const t = localStorage.getItem("hf:tab") as Tab | null;
      if (t && TABS.some(([k]) => k === t)) setTab(t);
    } catch {}
  }, []);
  const go = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("hf:tab", t);
    } catch {}
  };

  const d = store.data;
  if (!d) return <div className="p-10 text-center text-muted">불러오는 중…</div>;
  const props = { d, store, month };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pt-3">
          <h1 className="text-lg font-bold tracking-tight">{d.settings.people.join("·")} 가계부</h1>
          <span className="text-xs text-muted" title="데이터 저장 위치">
            <span style={{ color: store.sync === "cloud" ? "var(--good)" : store.sync === "error" ? "var(--critical)" : "var(--muted)" }}>●</span> {SYNC_LABEL[store.sync]}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button className="btn px-2" onClick={() => setMonth(addMonths(month, -1))} aria-label="이전 달">‹</button>
            <input type="month" className="field w-[150px] tnum" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="분석 월" />
            <button className="btn px-2" onClick={() => setMonth(addMonths(month, 1))} aria-label="다음 달">›</button>
            <button className="btn hidden sm:inline-flex" onClick={() => setMonth(todayISO().slice(0, 7))}>이번 달</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pt-2" role="tablist">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => go(k)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2"}`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-5">
        <div className="mb-4 text-sm text-ink-2">{ymLabel(month)}</div>
        {tab === "dash" && <Dashboard {...props} onGo={go} />}
        {tab === "tx" && <Transactions {...props} />}
        {tab === "bva" && <BudgetVsActual {...props} />}
        {tab === "trend" && <Trends {...props} />}
        {tab === "diag" && <Analysis {...props} />}
        {tab === "sim" && <Simulator {...props} />}
        {tab === "budget" && <BudgetPlan {...props} />}
        {tab === "goals" && <Goals {...props} />}
        {tab === "data" && <DataTab {...props} />}
      </main>
    </div>
  );
}
