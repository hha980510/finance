"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TabProps } from "./types";
import { monthStats, type CatRow } from "@/lib/analytics";
import { KIND_LABEL } from "@/lib/defaults";
import { pct, usd } from "@/lib/format";
import { Card, ChartTip, Kpi, Legend, StatusBadge, UsageBar, useColors } from "./ui";

export default function BudgetVsActual({ d, month }: TabProps) {
  const C = useColors();
  const s = monthStats(d, month);
  const [kind, setKind] = useState<"" | "fixed" | "variable" | "saving">("");
  const [byGroup, setByGroup] = useState(true);
  const rows = s.rows.filter((r) => (r.budget > 0 || r.actual > 0) && (!kind || r.cat.kind === kind));

  const groups = new Map<string, CatRow[]>();
  for (const r of rows) {
    if (!groups.has(r.cat.group)) groups.set(r.cat.group, []);
    groups.get(r.cat.group)!.push(r);
  }
  const tot = (rs: CatRow[]) => ({ b: rs.reduce((a, r) => a + r.budget, 0), a: rs.reduce((a, r) => a + r.actual, 0), p: rs.reduce((a, r) => a + r.projected, 0) });
  const T = tot(rows);

  const chart = rows
    .filter((r) => r.cat.kind !== "saving")
    .map((r) => ({ name: r.cat.name, v: Math.round((r.budget - (s.elapsed < 1 ? r.projected : r.actual)) * 100) / 100 }))
    .filter((r) => r.v !== 0)
    .sort((a, b) => a.v - b.v);

  // 월 중간에는 '아직 안 쓴 돈'이 아니라 '월말 예상' 기준으로 절약/초과를 계산
  const gap = (r: CatRow) => r.budget - (s.elapsed < 1 ? r.projected : r.actual);
  const fav = rows.filter((r) => r.cat.kind !== "saving" && gap(r) > 0).reduce((a, r) => a + gap(r), 0);
  const unfav = rows.filter((r) => r.cat.kind !== "saving" && gap(r) < 0).reduce((a, r) => a - gap(r), 0);

  const Row = ({ r }: { r: CatRow }) => (
    <tr>
      <td className="whitespace-nowrap pl-5">{r.cat.name}</td>
      <td className="text-xs text-muted">{KIND_LABEL[r.cat.kind]}</td>
      <td className="num">{usd(r.budget)}</td>
      <td className="num">{usd(r.actual, 2)}</td>
      <td className="num" style={{ color: r.variance < 0 ? "var(--critical)" : undefined }}>{usd(r.variance, 2)}</td>
      <td className="min-w-[140px]">
        <div className="flex items-center gap-2">
          <div className="flex-1"><UsageBar used={r.used} pace={r.cat.kind === "variable" ? s.elapsed : undefined} status={r.status} /></div>
          <span className="w-10 text-right text-xs tnum text-ink-2">{isFinite(r.used) ? pct(r.used, 0) : "∞"}</span>
        </div>
      </td>
      <td className="num text-ink-2">{usd(r.projected)}</td>
      <td><StatusBadge s={r.status} /></td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="예산 (소비)" value={usd(s.budgetSpend)} sub={`저축 목표 ${usd(s.budgetSave)} 별도`} />
        <Kpi label="실적 (소비)" value={usd(s.spent)} sub={`월 경과 ${pct(s.elapsed, 0)} · 예산 사용 ${pct(s.budgetSpend ? s.spent / s.budgetSpend : 0, 0)}`} tone={s.spent / (s.budgetSpend || 1) > s.elapsed + 0.1 ? "warn" : undefined} />
        <Kpi label={s.elapsed < 1 ? "월말 예상 절약" : "절약된 금액"} value={usd(fav)} sub="예산보다 덜 쓰는 항목 합계" tone="good" />
        <Kpi label={s.elapsed < 1 ? "월말 예상 초과" : "초과된 금액"} value={usd(unfav)} sub="예산보다 더 쓰는 항목 합계" tone={unfav > 0 ? "bad" : undefined} />
      </div>

      <Card
        title="카테고리별 예산 대비 실적"
        sub="사용률 막대의 세로선 = 오늘까지의 예산 페이스. 월말 예상 = 변동지출은 현재 속도로 외삽, 고정지출은 예산액."
        right={
          <div className="flex gap-2">
            <select className="field w-auto text-xs" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="">전체</option>
              <option value="fixed">고정</option>
              <option value="variable">변동</option>
              <option value="saving">저축</option>
            </select>
            <label className="flex items-center gap-1 whitespace-nowrap text-xs text-ink-2"><input type="checkbox" checked={byGroup} onChange={(e) => setByGroup(e.target.checked)} />그룹 소계</label>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>카테고리</th><th>성격</th><th className="num">예산</th><th className="num">실적</th><th className="num">차이</th><th>사용률</th><th className="num">월말 예상</th><th>상태</th>
              </tr>
            </thead>
            <tbody>
              {byGroup
                ? [...groups.entries()].map(([g, rs]) => {
                    const t = tot(rs);
                    return [
                      <tr key={g} style={{ background: "var(--surface-2)" }}>
                        <td colSpan={2} className="font-semibold">{g}</td>
                        <td className="num font-semibold">{usd(t.b)}</td>
                        <td className="num font-semibold">{usd(t.a, 2)}</td>
                        <td className="num font-semibold" style={{ color: t.b - t.a < 0 ? "var(--critical)" : undefined }}>{usd(t.b - t.a, 2)}</td>
                        <td className="text-xs text-ink-2 tnum">{t.b ? pct(t.a / t.b, 0) : "–"}</td>
                        <td className="num text-ink-2">{usd(t.p)}</td>
                        <td />
                      </tr>,
                      ...rs.map((r) => <Row key={r.cat.id} r={r} />),
                    ];
                  })
                : rows.map((r) => <Row key={r.cat.id} r={r} />)}
              <tr className="font-semibold">
                <td colSpan={2}>합계</td>
                <td className="num">{usd(T.b)}</td>
                <td className="num">{usd(T.a, 2)}</td>
                <td className="num" style={{ color: T.b - T.a < 0 ? "var(--critical)" : undefined }}>{usd(T.b - T.a, 2)}</td>
                <td className="text-xs tnum">{T.b ? pct(T.a / T.b, 0) : "–"}</td>
                <td className="num">{usd(T.p)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={s.elapsed < 1 ? "월말 예상 차이 (예산 − 예상 지출)" : "최종 차이 (예산 − 실적)"} sub="오른쪽 = 예산보다 덜 씀, 왼쪽 = 초과">
        {chart.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">차이가 나는 항목이 없어요.</div>
        ) : (
          <>
            <Legend items={[{ label: "절약 (유리)", color: C.s1 }, { label: "초과 (불리)", color: C.critical }]} />
            <div style={{ height: Math.max(160, chart.length * 30 + 40) }}>
              <ResponsiveContainer>
                <BarChart data={chart} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fill: C.muted, fontSize: 11 }} tickFormatter={(v) => usd(v)} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={130} tick={{ fill: C.ink2, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <ReferenceLine x={0} stroke={C.axis} />
                  <Tooltip content={<ChartTip fmt={(n) => usd(n, 2)} />} cursor={{ fill: C.mid, opacity: 0.5 }} />
                  <Bar dataKey="v" name="차이" radius={4} maxBarSize={18}>
                    {chart.map((r) => (
                      <Cell key={r.name} fill={r.v >= 0 ? C.s1 : C.critical} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
