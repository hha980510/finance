"use client";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TabProps } from "./types";
import { anomalies, monthStats, payerSplit, planAnalysis, topMemos, yearProjection } from "@/lib/analytics";
import { BUCKET_LABEL } from "@/lib/defaults";
import { pct, usd } from "@/lib/format";
import { Card, ChartTip, Empty, Kpi, Legend, useColors } from "./ui";
import type { Bucket } from "@/lib/types";

type Grade = "good" | "warn" | "bad";
const GRADE: Record<Grade, { icon: string; label: string; color: string }> = {
  good: { icon: "✓", label: "양호", color: "var(--good)" },
  warn: { icon: "◆", label: "주의", color: "var(--serious)" },
  bad: { icon: "▲", label: "위험", color: "var(--critical)" },
};

export default function Analysis({ d, month }: TabProps) {
  const C = useColors();
  const p = planAnalysis(d);
  const s = monthStats(d, month);
  const b = d.settings.benchmarks;
  const yp = yearProjection(d, Number(month.slice(0, 4)));
  const inc = s.incomeBasis || 1;

  const metrics: { name: string; desc: string; plan: string; actual?: string; bench: string; grade: Grade }[] = [
    { name: "월 잉여/적자", desc: "수입 − (모든 예산)", plan: usd(p.surplus), actual: s.hasData ? usd(s.net) : undefined, bench: "≥ $0", grade: p.surplus >= 0 ? "good" : "bad" },
    { name: "주거비 비율", desc: "주거 ÷ 수입", plan: pct(p.ratio.housing), actual: s.hasData ? pct(rowsSum(s, (c) => c.group === "주거") / inc) : undefined, bench: `≤ ${pct(b.housing, 0)}`, grade: p.ratio.housing <= b.housing ? "good" : p.ratio.housing <= 0.4 ? "warn" : "bad" },
    { name: "고정비 비율", desc: "고정지출 ÷ 수입", plan: pct(p.ratio.fixed), actual: s.hasData ? pct(rowsSum(s, (c) => c.kind === "fixed") / inc) : undefined, bench: "≤ 50%", grade: p.ratio.fixed <= 0.5 ? "good" : p.ratio.fixed <= 0.65 ? "warn" : "bad" },
    { name: "실질 저축률", desc: "(저축 + 남는 돈) ÷ 수입", plan: pct(p.ratio.effectiveSaving), actual: s.hasData && s.incomeActual > 0 ? pct(s.savingsRate) : undefined, bench: `≥ ${pct(b.savings, 0)}`, grade: p.ratio.effectiveSaving >= b.savings ? "good" : p.ratio.effectiveSaving >= 0.05 ? "warn" : "bad" },
    { name: "헌금·기부 비율", desc: "헌금·기부 ÷ 수입", plan: pct(p.ratio.giving), actual: s.hasData ? pct(s.bucketActual.giving / inc) : undefined, bench: "가정 기준", grade: "good" },
    { name: "변동비 여력", desc: "조정 가능한 변동지출 ÷ 수입", plan: pct(p.ratio.flexibility), bench: "높을수록 유연", grade: p.ratio.flexibility >= 0.2 ? "good" : "warn" },
    { name: "비상금", desc: "비상금 ÷ (필수+헌금) 월지출", plan: `${p.emergencyMonths.toFixed(1)}개월`, bench: "≥ 3~6개월", grade: p.emergencyMonths >= 3 ? "good" : p.emergencyMonths >= 1 ? "warn" : "bad" },
    { name: "손익분기 수입", desc: "현재 예산을 유지하는 데 필요한 수입", plan: usd(p.breakEvenIncome), bench: `현재 ${usd(p.income)}`, grade: p.income >= p.breakEvenIncome ? "good" : "bad" },
  ];

  // 50/30/20 (+헌금 별도)
  const buckets: Bucket[] = ["need", "want", "giving", "saving"];
  const planB: Record<Bucket, number> = { need: p.need, want: p.want, giving: p.giving, saving: p.saving + Math.max(0, p.surplus) };
  const benchB: Record<Bucket, number | null> = { need: b.needs, want: b.wants, giving: null, saving: b.savings };
  const ruleData = buckets.map((k) => ({ name: BUCKET_LABEL[k], plan: +((planB[k] / p.income) * 100).toFixed(1), actual: s.hasData && s.incomeActual > 0 ? +(((k === "saving" ? s.incomeActual - s.spent : s.bucketActual[k]) / s.incomeActual) * 100).toFixed(1) : null, bench: benchB[k] === null ? null : benchB[k]! * 100 }));

  // 워터폴: 수입 → 그룹별 차감 → 잔액 (floating range bar)
  let run = p.income;
  const wf: { name: string; range: [number, number]; amt: number; kind: "in" | "out" | "end" }[] = [{ name: "수입", range: [0, p.income], amt: p.income, kind: "in" }];
  for (const g of p.groups) {
    const next = run - g.amount;
    wf.push({ name: g.group, range: [Math.min(run, next), Math.max(run, next)], amt: -g.amount, kind: "out" });
    run = next;
  }
  wf.push({ name: p.surplus < 0 ? "적자" : "남는 돈", range: [Math.min(0, p.surplus), Math.max(0, p.surplus)], amt: p.surplus, kind: "end" });

  const ps = payerSplit(d, month);
  const tm = topMemos(d, month);
  const an = anomalies(d, month);
  const catName = new Map(d.categories.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="연간 계획 잉여" value={usd(p.surplus * 12)} sub="(수입 − 전체 예산) × 12" tone={p.surplus < 0 ? "bad" : "good"} />
        <Kpi label={`${month.slice(0, 4)}년 말 예상 순자산 증가`} value={usd(yp.projected + p.saving * yp.planMonths)} sub={`실적 ${yp.actualMonths}개월 + 계획 ${yp.planMonths}개월 (저축 포함)`} />
        <Kpi label="월 고정비" value={usd(p.fixed)} sub={`수입의 ${pct(p.ratio.fixed)}`} />
        <Kpi label="월 변동비 예산" value={usd(p.variable)} sub={`조정 가능 영역 · ${pct(p.ratio.flexibility)}`} />
      </div>

      <Card title="재무 건전성 스코어카드" sub="계획(예산) 기준과 이번 달 실적 기준을 함께 비교">
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr><th>지표</th><th>정의</th><th className="num">계획</th><th className="num">이번 달 실적</th><th className="num">기준</th><th>판정</th></tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.name}>
                  <td className="whitespace-nowrap font-medium">{m.name}</td>
                  <td className="text-xs text-ink-2">{m.desc}</td>
                  <td className="num font-semibold">{m.plan}</td>
                  <td className="num text-ink-2">{m.actual ?? "–"}</td>
                  <td className="num text-xs text-muted">{m.bench}</td>
                  <td>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-2">
                      <span style={{ color: GRADE[m.grade].color }}>{GRADE[m.grade].icon}</span>
                      {GRADE[m.grade].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="수입 흐름 워터폴 (계획)" sub="수입에서 그룹별 예산을 차례로 뺀 결과">
          <Legend items={[{ label: "수입", color: C.s1 }, { label: "지출 그룹", color: C.s2 }, { label: p.surplus < 0 ? "적자" : "남는 돈", color: p.surplus < 0 ? C.critical : C.s3 }]} />
          <div className="h-72">
            <ResponsiveContainer>
              <BarChart data={wf} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} interval={0} angle={-30} textAnchor="end" tickLine={false} axisLine={{ stroke: C.axis }} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} width={56} tickFormatter={(v) => usd(v)} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: C.mid, opacity: 0.5 }}
                  content={({ active, payload, label }) => {
                    const r = payload?.[0]?.payload as (typeof wf)[number] | undefined;
                    return active && r ? <ChartTip active label={label as string} payload={[{ name: r.kind === "out" ? "차감" : "금액", value: r.amt, color: r.kind === "in" ? C.s1 : r.kind === "out" ? C.s2 : p.surplus < 0 ? C.critical : C.s3 }]} fmt={(n) => usd(n)} /> : null;
                  }}
                />
                <ReferenceLine y={0} stroke={C.axis} />
                <Bar dataKey="range" radius={4} maxBarSize={36}>
                  {wf.map((r) => (
                    <Cell key={r.name} fill={r.kind === "in" ? C.s1 : r.kind === "out" ? C.s2 : p.surplus < 0 ? C.critical : C.s3} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="50 / 30 / 20 규칙 비교" sub="필수 50% · 선택 30% · 저축 20% (헌금은 별도 표시, 저축엔 남는 돈 포함)">
          <Legend items={[{ label: "계획", color: C.s1 }, { label: "이번 달 실적", color: C.s2 }]} />
          <div className="h-60">
            <ResponsiveContainer>
              <BarChart data={ruleData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: C.ink2, fontSize: 12 }} tickLine={false} axisLine={{ stroke: C.axis }} />
                <YAxis tick={{ fill: C.muted, fontSize: 11 }} width={40} tickFormatter={(v) => v + "%"} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip fmt={(n) => n + "%"} />} cursor={{ fill: C.mid, opacity: 0.5 }} />
                <Bar dataKey="plan" name="계획" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="actual" name="이번 달 실적" fill={C.s2} radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
            {ruleData.map((r) => (
              <div key={r.name} className="rounded-lg bg-surface-2 p-2">
                <div className="text-muted">{r.name}</div>
                <div className="font-semibold tnum">{r.plan}%</div>
                <div className="text-muted">{r.bench === null ? "기준 없음" : `기준 ${r.bench}%`}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="결제자별 지출" sub="이번 달">
          {ps.length === 0 ? <Empty>데이터 없음</Empty> : (
            <ul className="space-y-2">
              {ps.map((x) => {
                const tot = ps.reduce((a, y) => a + y.amount, 0);
                return (
                  <li key={x.payer} className="grid grid-cols-[56px_1fr_110px] items-center gap-2 text-sm">
                    <span>{x.payer}</span>
                    <div className="h-2 rounded-full" style={{ background: C.mid }}><div className="h-2 rounded-full" style={{ width: `${(x.amount / tot) * 100}%`, background: C.s1 }} /></div>
                    <span className="text-right text-xs tnum text-ink-2">{usd(x.amount)} · {pct(x.amount / tot, 0)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="지출처 Top" sub="메모 기준 묶음">
          {tm.length === 0 ? <Empty>데이터 없음</Empty> : (
            <table className="data">
              <tbody>
                {tm.map((x) => (
                  <tr key={x.memo}><td className="max-w-[160px] truncate">{x.memo}</td><td className="num text-xs text-muted">{x.count}건</td><td className="num">{usd(x.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="이상 거래 탐지" sub="카테고리 평균 대비 2σ 이상, 또는 한 번에 월 예산의 50% 이상">
          {an.length === 0 ? <Empty>특이 거래 없음</Empty> : (
            <ul className="space-y-2 text-sm">
              {an.slice(0, 8).map((a) => (
                <li key={a.txn.id} className="flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate">{a.txn.memo || catName.get(a.txn.categoryId ?? "")}</div>
                    <div className="text-xs text-muted">{a.txn.date} · {a.reason}</div>
                  </div>
                  <span className="tnum font-medium">{usd(a.txn.amount, 2)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function rowsSum(s: ReturnType<typeof monthStats>, f: (c: ReturnType<typeof monthStats>["rows"][number]["cat"]) => boolean) {
  return s.rows.filter((r) => f(r.cat)).reduce((a, r) => a + r.actual, 0);
}
