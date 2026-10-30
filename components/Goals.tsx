"use client";
import type { TabProps } from "./types";
import type { Goal } from "@/lib/types";
import { goalPlan, planAnalysis } from "@/lib/analytics";
import { pct, uid, usd, ymLabel } from "@/lib/format";
import { Card, Empty, Kpi } from "./ui";

export default function Goals({ d, store }: TabProps) {
  const p = planAnalysis(d);
  const capacity = p.saving + Math.max(0, p.surplus); // 매달 목표에 쓸 수 있는 돈
  const plans = d.goals.map((g) => ({ g, ...goalPlan(g.target, g.saved, g.deadline) }));
  const required = plans.reduce((a, x) => a + x.monthly, 0);
  const set = (id: string, patch: Partial<Goal>) => store.update((x) => ({ ...x, goals: x.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="목표 달성에 필요한 월 저축" value={usd(required)} />
        <Kpi label="현재 계획상 월 저축 여력" value={usd(capacity)} sub="저축 예산 + 남는 돈" />
        <Kpi label="차이" value={usd(capacity - required)} tone={capacity >= required ? "good" : "bad"} sub={capacity >= required ? "모든 목표 달성 가능" : "기한 연장 또는 지출 조정 필요"} />
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="text-xs font-medium text-muted">현재 비상금·예금 잔액</div>
          <input type="number" className="field mt-1 text-lg font-semibold tnum" value={d.settings.emergencyFund} onChange={(e) => store.update((x) => ({ ...x, settings: { ...x.settings, emergencyFund: Number(e.target.value) } }))} />
          <div className="mt-1 text-xs text-ink-2">필수지출 {p.emergencyMonths.toFixed(1)}개월치</div>
        </div>
      </div>

      <Card title="저축 목표" right={<button className="btn text-xs" onClick={() => store.update((x) => ({ ...x, goals: [...x.goals, { id: uid(), name: "새 목표", target: 1000, saved: 0, deadline: `${new Date().getFullYear() + 1}-12` }] }))}>+ 목표 추가</button>}>
        {plans.length === 0 ? (
          <Empty>목표가 없어요. 여행, 차량 교체, 비상금 등 목표를 추가해 보세요.</Empty>
        ) : (
          <ul className="space-y-5">
            {plans.map(({ g, months, remaining, monthly, progress }) => {
              const ok = monthly <= capacity;
              return (
                <li key={g.id} className="grid gap-3 lg:grid-cols-[1fr_380px]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <input className="field max-w-[260px] font-medium" value={g.name} onChange={(e) => set(g.id, { name: e.target.value })} />
                      <button className="text-xs text-critical" onClick={() => confirm("삭제할까요?") && store.update((x) => ({ ...x, goals: x.goals.filter((y) => y.id !== g.id) }))}>삭제</button>
                    </div>
                    <div className="mt-2 h-2.5 rounded-full" style={{ background: "var(--mid)" }}>
                      <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, progress * 100)}%`, background: "var(--s1)" }} />
                    </div>
                    <div className="mt-1 text-xs text-ink-2">
                      {pct(progress, 0)} 달성 · 남은 금액 {usd(remaining)} · {ymLabel(g.deadline)}까지 {months}개월 · <b className="text-ink">매달 {usd(monthly)}</b>
                      <span className="ml-2" style={{ color: ok ? "var(--good-text)" : "var(--critical)" }}>{ok ? "✓ 여력 내" : "▲ 여력 초과"}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted">
                    <label>목표액<input type="number" className="field tnum" value={g.target} onChange={(e) => set(g.id, { target: Number(e.target.value) })} /></label>
                    <label>모은 돈<input type="number" className="field tnum" value={g.saved} onChange={(e) => set(g.id, { saved: Number(e.target.value) })} /></label>
                    <label>기한<input type="month" className="field tnum" value={g.deadline} onChange={(e) => e.target.value && set(g.id, { deadline: e.target.value })} /></label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
