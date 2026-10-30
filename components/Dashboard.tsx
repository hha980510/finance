"use client";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TabProps } from "./types";
import { burnDown, monthStats, planAnalysis } from "@/lib/analytics";
import { buildInsights } from "@/lib/insights";
import { pct, usd } from "@/lib/format";
import { Card, ChartTip, Kpi, Legend, LevelIcon, StatusBadge, UsageBar, useColors } from "./ui";

export default function Dashboard({ d, month, onGo }: TabProps & { onGo: (t: "tx" | "bva" | "sim" | "budget") => void }) {
  const C = useColors();
  const s = monthStats(d, month);
  const p = planAnalysis(d);
  const bd = burnDown(d, month);
  const ins = buildInsights(d, month);
  // 변동지출(관리 대상)을 먼저, 그 안에서는 사용률 높은 순
  const top = [...s.rows]
    .filter((r) => r.budget > 0 || r.actual > 0)
    .sort((a, b) => Number(b.cat.kind === "variable") - Number(a.cat.kind === "variable") || (isFinite(b.used) ? b.used : 9) - (isFinite(a.used) ? a.used : 9))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="수입" value={usd(s.incomeBasis)} sub={s.incomeActual > 0 ? `계획 ${usd(s.incomePlanned)}` : "계획 기준 (실제 수입 미입력)"} />
        <Kpi label="소비 지출" value={usd(s.spent)} sub={`예산 ${usd(s.budgetSpend)}의 ${pct(s.budgetSpend ? s.spent / s.budgetSpend : 0, 0)}`} tone={s.spent > s.budgetSpend ? "bad" : undefined} />
        <Kpi label="월말 예상 지출" value={usd(s.projectedSpend)} sub={s.projectedSpend > s.budgetSpend ? `예산 대비 +${usd(s.projectedSpend - s.budgetSpend)}` : `예산 내 (${usd(s.budgetSpend - s.projectedSpend)} 여유)`} tone={s.projectedSpend > s.budgetSpend ? "bad" : "good"} />
        <Kpi label="저축 이체" value={usd(s.saved)} sub={`목표 ${usd(s.budgetSave)}`} tone={s.saved >= s.budgetSave && s.budgetSave > 0 ? "good" : undefined} />
        <Kpi label="순현금흐름" value={usd(s.net)} sub={s.net < 0 ? "적자" : "흑자"} tone={s.net < 0 ? "bad" : "good"} />
        <Kpi label="하루 사용 가능액" value={bd.remainingDays ? usd(bd.dailyAllowance) : "–"} sub={bd.remainingDays ? `변동지출 · 남은 ${bd.remainingDays}일` : "지난 달"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="오늘의 진단" sub="예산 구조와 이번 달 흐름에서 자동으로 찾은 항목" className="lg:col-span-2">
          <ul className="space-y-3">
            {ins.slice(0, 6).map((i, k) => (
              <li key={k} className="flex gap-2.5">
                <LevelIcon level={i.level} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">{i.title}</div>
                  <div className="text-xs text-ink-2">{i.detail}</div>
                </div>
              </li>
            ))}
          </ul>
          {p.surplus < 0 && (
            <button className="btn mt-4 w-full justify-center" onClick={() => onGo("sim")}>
              시뮬레이터에서 적자 해소안 보기 →
            </button>
          )}
        </Card>

        <Card title="변동지출 소진 곡선" sub={`누적 사용액 vs 예산 페이스 (변동 예산 ${usd(bd.varBudget)})`} className="lg:col-span-3">
          <Legend items={[{ label: "실제 누적", color: C.s1 }, { label: "예산 페이스", color: C.muted, dash: true }]} />
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={bd.pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.axis }} interval={4} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => usd(v)} />
                <Tooltip content={<ChartTip fmt={(n) => usd(n, 2)} labelFmt={(l) => `${l}일`} />} cursor={{ stroke: C.axis }} />
                <Area type="linear" dataKey="actual" name="실제 누적" stroke={C.s1} strokeWidth={2} fill={C.s1} fillOpacity={0.12} connectNulls={false} dot={false} isAnimationActive={false} activeDot={{ r: 4, stroke: C.surface, strokeWidth: 2 }} />
                <Line type="linear" dataKey="pace" name="예산 페이스" stroke={C.muted} strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="카테고리 예산 사용률" sub="막대 위 세로선 = 오늘까지 써도 되는 페이스" right={<button className="btn text-xs" onClick={() => onGo("bva")}>전체 보기</button>}>
          <ul className="space-y-3">
            {top.map((r) => (
              <li key={r.cat.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-ink">{r.cat.name}</span>
                  <span className="flex items-center gap-3 text-xs text-ink-2 tnum">
                    {usd(r.actual)} / {usd(r.budget)}
                    <StatusBadge s={r.status} />
                  </span>
                </div>
                <UsageBar used={r.used} pace={r.cat.kind === "variable" ? s.elapsed : undefined} status={r.status} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="수입 배분 (계획)" sub={`월 수입 ${usd(p.income)}을 어디에 쓰기로 했는지`} right={<button className="btn text-xs" onClick={() => onGo("budget")}>예산 수정</button>}>
          <ul className="space-y-2.5">
            {p.groups.map((g) => (
              <li key={g.group} className="grid grid-cols-[92px_1fr_120px] items-center gap-3 text-sm">
                <span className="truncate text-ink-2">{g.group}</span>
                <div className="h-2 rounded-full" style={{ background: C.mid }}>
                  <div className="h-2 rounded-full" style={{ width: `${Math.min(100, g.share * 100)}%`, background: C.s1 }} />
                </div>
                <span className="text-right text-xs tnum text-ink-2">
                  {usd(g.amount)} · {pct(g.share, 0)}
                </span>
              </li>
            ))}
            <li className="grid grid-cols-[92px_1fr_120px] items-center gap-3 border-t border-line pt-2.5 text-sm font-semibold">
              <span>{p.surplus < 0 ? "부족액" : "남는 돈"}</span>
              <span />
              <span className="text-right tnum" style={{ color: p.surplus < 0 ? "var(--critical)" : "var(--good-text)" }}>
                {usd(p.surplus)} · {pct(p.surplus / p.income, 1)}
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
