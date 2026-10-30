"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TabProps } from "./types";
import { addMonths, pct, usd, ymLabel, ymShort } from "@/lib/format";
import { monthStats, trend } from "@/lib/analytics";
import { Card, ChartTip, Empty, Legend, useColors } from "./ui";

export default function Trends({ d, month }: TabProps) {
  const C = useColors();
  const [n, setN] = useState(12);
  const t = trend(d, month, n);
  const any = t.some((r) => r.hasData);
  const axis = { tick: { fill: C.muted, fontSize: 11 }, tickLine: false, axisLine: false } as const;

  // 카테고리 × 월 히트맵
  const months = t.map((r) => r.month);
  const stats = months.map((m) => monthStats(d, m));
  const cats = d.categories.filter((c) => stats.some((s) => (s.rows.find((r) => r.cat.id === c.id)?.actual ?? 0) > 0));
  const cell = (ci: string, mi: number) => stats[mi].rows.find((r) => r.cat.id === ci)?.actual ?? 0;
  const max = Math.max(1, ...cats.flatMap((c) => months.map((_, i) => cell(c.id, i))));
  const ramp = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"];
  const heat = (v: number) => (v <= 0 ? "transparent" : ramp[Math.min(ramp.length - 1, Math.floor((v / max) * ramp.length))]);

  // 전월 대비
  const cur = monthStats(d, month);
  const prev = monthStats(d, addMonths(month, -1));
  const mom = cur.rows
    .map((r) => {
      const p = prev.rows.find((x) => x.cat.id === r.cat.id)?.actual ?? 0;
      return { name: r.cat.name, cur: r.actual, prev: p, diff: r.actual - p, rate: p > 0 ? (r.actual - p) / p : null };
    })
    .filter((r) => r.cur || r.prev)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-1">
        {[6, 12, 24].map((k) => (
          <button key={k} className={`btn text-xs ${n === k ? "btn-primary" : ""}`} onClick={() => setN(k)}>
            최근 {k}개월
          </button>
        ))}
      </div>
      {!any && <Empty>이 기간에 거래가 없어요. 거래를 입력하면 추세가 그려집니다.</Empty>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="월별 수입 · 소비 · 저축" sub="점선 = 소비지출 3개월 이동평균">
          <Legend items={[{ label: "수입", color: C.s1 }, { label: "소비", color: C.s2 }, { label: "저축", color: C.s3 }, { label: "소비 3개월 평균", color: C.ink2, dash: true }]} />
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={t} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={ymShort} {...axis} axisLine={{ stroke: C.axis }} />
                <YAxis {...axis} width={56} tickFormatter={(v) => usd(v)} />
                <Tooltip content={<ChartTip fmt={(x) => usd(x, 2)} labelFmt={(l) => ymLabel(String(l))} />} cursor={{ fill: C.mid, opacity: 0.5 }} />
                <Bar dataKey="income" name="수입" fill={C.s1} radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="spent" name="소비" fill={C.s2} radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Bar dataKey="saved" name="저축" fill={C.s3} radius={[4, 4, 0, 0]} maxBarSize={14} />
                <Line dataKey="ma3" name="소비 3개월 평균" stroke={C.ink2} strokeDasharray="4 3" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="저축률 추이" sub={`(수입 − 소비) ÷ 수입 · 기준선 ${pct(d.settings.benchmarks.savings, 0)}`}>
          <div className="h-72 pt-6">
            <ResponsiveContainer>
              <LineChart data={t.map((r) => ({ ...r, sr: r.savingsRate === null ? null : Math.round(r.savingsRate * 1000) / 10 }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tickFormatter={ymShort} {...axis} axisLine={{ stroke: C.axis }} />
                <YAxis {...axis} width={44} tickFormatter={(v) => v + "%"} />
                <ReferenceLine y={d.settings.benchmarks.savings * 100} stroke={C.good} strokeDasharray="4 3" label={{ value: "권장", fill: C.muted, fontSize: 11, position: "insideTopLeft" }} />
                <ReferenceLine y={0} stroke={C.axis} />
                <Tooltip content={<ChartTip fmt={(x) => x + "%"} labelFmt={(l) => ymLabel(String(l))} />} cursor={{ stroke: C.axis }} />
                <Line dataKey="sr" name="저축률" stroke={C.s1} strokeWidth={2} dot={{ r: 4, fill: C.s1, stroke: C.surface, strokeWidth: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="지출 성격 구성 (월별)" sub="필수 · 선택 · 헌금/기부 — 저축 제외">
        <Legend items={[{ label: "필수", color: C.s1 }, { label: "선택", color: C.s2 }, { label: "헌금·기부", color: C.s3 }]} />
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={t} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={ymShort} {...axis} axisLine={{ stroke: C.axis }} />
              <YAxis {...axis} width={56} tickFormatter={(v) => usd(v)} />
              <Tooltip content={<ChartTip fmt={(x) => usd(x, 2)} labelFmt={(l) => ymLabel(String(l))} />} cursor={{ fill: C.mid, opacity: 0.5 }} />
              <Bar dataKey="need" name="필수" stackId="a" fill={C.s1} stroke={C.surface} strokeWidth={2} maxBarSize={36} />
              <Bar dataKey="want" name="선택" stackId="a" fill={C.s2} stroke={C.surface} strokeWidth={2} maxBarSize={36} />
              <Bar dataKey="giving" name="헌금·기부" stackId="a" fill={C.s3} stroke={C.surface} strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4">
        <Card title="카테고리 × 월 히트맵" sub="진할수록 지출이 큼">
          {cats.length === 0 ? (
            <Empty>데이터 없음</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-xs tnum">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-surface px-2 py-1 text-left font-medium text-muted">카테고리</th>
                    {months.map((m) => (
                      <th key={m} className="px-1 py-1 font-medium text-muted">{ymShort(m)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.id}>
                      <td className="sticky left-0 whitespace-nowrap bg-surface px-2 py-0.5 text-ink-2">{c.name}</td>
                      {months.map((m, i) => {
                        const v = cell(c.id, i);
                        const dark = v / max > 0.5;
                        return (
                          <td key={m} className="p-0.5">
                            <div title={`${c.name} ${ymLabel(m)}: ${usd(v, 2)}`} className="flex h-7 min-w-[46px] items-center justify-center rounded" style={{ background: v > 0 ? heat(v) : "var(--surface-2)", color: dark ? "#fff" : "#0b0b0b" }}>
                              {v > 0 ? usd(v) : ""}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="전월 대비 변화" sub={`${ymLabel(addMonths(month, -1))} → ${ymLabel(month)}`} >
          {mom.length === 0 ? (
            <Empty>비교할 데이터 없음</Empty>
          ) : (
            <table className="data">
              <thead>
                <tr><th>카테고리</th><th className="num">전월</th><th className="num">이번 달</th><th className="num">변화</th></tr>
              </thead>
              <tbody>
                {mom.slice(0, 12).map((r) => (
                  <tr key={r.name}>
                    <td className="truncate">{r.name}</td>
                    <td className="num text-ink-2">{usd(r.prev)}</td>
                    <td className="num">{usd(r.cur)}</td>
                    <td className="num" style={{ color: r.diff > 0 ? "var(--critical)" : "var(--good-text)" }}>
                      {r.diff > 0 ? "▲" : "▼"} {usd(Math.abs(r.diff))}
                      {r.rate !== null && <span className="ml-1 text-xs text-muted">({pct(r.rate, 0)})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
