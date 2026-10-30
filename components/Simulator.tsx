"use client";
import { useMemo, useState } from "react";
import type { TabProps } from "./types";
import type { AppData, Category } from "@/lib/types";
import { planAnalysis } from "@/lib/analytics";
import { pct, signed, usd } from "@/lib/format";
import { Card, Kpi } from "./ui";

/** 삭감 우선순위: 변동·선택 → 변동·필수 → 고정·선택 (헌금·월세·저축은 손대지 않음) */
const TIERS: { f: (c: Category) => boolean; max: number }[] = [
  { f: (c) => c.kind === "variable" && c.bucket === "want", max: 0.5 },
  { f: (c) => c.kind === "variable" && c.bucket === "need", max: 0.3 },
  { f: (c) => c.kind === "fixed" && c.bucket === "want", max: 0.4 },
];

function cutPlan(cats: Category[], budgets: Record<string, number>, need: number) {
  const out = { ...budgets };
  let left = need;
  for (const t of TIERS) {
    if (left <= 0) break;
    const pool = cats.filter(t.f);
    const room = pool.reduce((a, c) => a + out[c.id] * t.max, 0);
    if (room <= 0) continue;
    const ratio = Math.min(1, left / room);
    for (const c of pool) {
      const cut = Math.ceil(out[c.id] * t.max * ratio);
      out[c.id] -= cut;
      left -= cut;
    }
  }
  return { budgets: out, unresolved: Math.max(0, left) };
}

export default function Simulator({ d, store }: TabProps) {
  const base = useMemo(() => Object.fromEntries(d.categories.map((c) => [c.id, c.budget])), [d.categories]);
  const baseIncome = d.incomes.reduce((a, i) => a + i.amount, 0);
  const [income, setIncome] = useState(baseIncome);
  const [bud, setBud] = useState<Record<string, number>>(base);
  const [note, setNote] = useState("");

  const sim: AppData = { ...d, incomes: [{ id: "sim", name: "sim", amount: income }], categories: d.categories.map((c) => ({ ...c, budget: bud[c.id] ?? c.budget })) };
  const before = planAnalysis(d);
  const after = planAnalysis(sim);
  const changed = d.categories.filter((c) => (bud[c.id] ?? c.budget) !== c.budget);

  const fixDeficit = () => {
    const deficit = sim.categories.reduce((a, c) => a + c.budget, 0) - income;
    if (deficit <= 0) return setNote("이미 적자가 아니에요.");
    const r = cutPlan(d.categories, bud, deficit);
    setBud(r.budgets);
    setNote(r.unresolved > 0 ? `조정 가능한 항목만으로는 ${usd(r.unresolved)} 부족해요. 수입을 늘리거나 고정비(월세 등)를 재검토해야 합니다.` : `변동·선택 지출부터 비율대로 ${usd(deficit)}를 줄였어요.`);
  };
  const reachSavings = () => {
    const total = (o: Record<string, number>) => Object.values(o).reduce((x, y) => x + y, 0);
    const target = income * d.settings.benchmarks.savings;
    const need = target - ((bud.saving ?? 0) + (income - total(bud)));
    if (need <= 0) return setNote("이미 목표 저축률 이상이에요.");
    const r = cutPlan(d.categories, bud, need);
    const leftover = income - total(r.budgets);
    setBud({ ...r.budgets, saving: (r.budgets.saving ?? 0) + Math.max(0, leftover) });
    setNote(r.unresolved > 0 ? `지출 조정만으로는 ${usd(r.unresolved)} 부족해 목표 저축률에 못 미쳐요. 수입 증가나 고정비 조정이 필요합니다.` : `지출을 줄이고 남는 돈을 모두 저축으로 옮겼어요.`);
  };
  const reset = () => {
    setBud(base);
    setIncome(baseIncome);
    setNote("");
  };
  const apply = () => {
    if (!confirm("시뮬레이션 결과를 실제 예산에 적용할까요? (지난 달 분석은 그대로 유지됩니다)")) return;
    store.update((x) => ({
      ...x,
      incomes: x.incomes.length === 1 ? [{ ...x.incomes[0], amount: income }] : x.incomes,
      categories: x.categories.map((c) => ({ ...c, budget: bud[c.id] ?? c.budget })),
    }));
    setNote("예산에 적용했어요.");
  };

  const delta = (a: number, b: number, fmt: (n: number) => string, goodUp = true) => {
    const dd = b - a;
    if (Math.abs(dd) < 0.0005) return "변화 없음";
    return { text: `${dd > 0 ? "+" : ""}${fmt(dd)}`, tone: (dd > 0) === goodUp ? ("good" as const) : ("bad" as const) };
  };
  const K = (label: string, a: number, b: number, fmt: (n: number) => string, goodUp = true) => {
    const x = delta(a, b, fmt, goodUp);
    return <Kpi label={label} value={fmt(b)} sub={typeof x === "string" ? x : `현재 ${fmt(a)} → ${x.text}`} tone={typeof x === "string" ? undefined : x.tone} />;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {K("월 잉여/적자", before.surplus, after.surplus, usd)}
        {K("실질 저축률", before.ratio.effectiveSaving, after.ratio.effectiveSaving, (n) => pct(n))}
        {K("주거비 비율", before.ratio.housing, after.ratio.housing, (n) => pct(n), false)}
        {K("연간 누적 효과", before.surplus * 12, after.surplus * 12, usd)}
      </div>

      <Card
        title="What-if 시뮬레이터"
        sub="수입과 예산을 바꿔보며 결과를 즉시 확인하세요. 실제 데이터는 ‘예산에 적용’을 누르기 전까지 바뀌지 않습니다."
        right={
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn" onClick={fixDeficit}>적자 해소안</button>
            <button className="btn" onClick={reachSavings}>저축률 {pct(d.settings.benchmarks.savings, 0)} 달성안</button>
            <button className="btn" onClick={reset}>초기화</button>
            <button className="btn btn-primary" onClick={apply} disabled={!changed.length && income === baseIncome}>예산에 적용</button>
          </div>
        }
      >
        {note && <div className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">{note}</div>}
        <div className="mb-4 grid items-center gap-3 sm:grid-cols-[160px_1fr_120px]">
          <label className="text-sm font-semibold">월 수입</label>
          <input type="range" min={Math.round(baseIncome * 0.5)} max={Math.round(baseIncome * 1.8)} step={50} value={income} onChange={(e) => setIncome(Number(e.target.value))} />
          <input type="number" className="field tnum" value={income} onChange={(e) => setIncome(Number(e.target.value))} />
        </div>
        <div className="grid gap-x-8 gap-y-2 lg:grid-cols-2">
          {d.categories.filter((c) => c.budget > 0 || (bud[c.id] ?? 0) > 0).map((c) => {
            const v = bud[c.id] ?? c.budget;
            const diff = v - c.budget;
            return (
              <div key={c.id} className="grid items-center gap-2 sm:grid-cols-[150px_1fr_84px_64px]">
                <span className="truncate text-sm">{c.name}</span>
                <input type="range" min={0} max={Math.max(100, Math.round(c.budget * 2))} step={5} value={v} onChange={(e) => setBud({ ...bud, [c.id]: Number(e.target.value) })} aria-label={c.name} />
                <input type="number" className="field tnum py-1 text-xs" value={v} onChange={(e) => setBud({ ...bud, [c.id]: Number(e.target.value) })} />
                <span className="text-right text-xs tnum" style={{ color: diff < 0 ? "var(--good-text)" : diff > 0 ? "var(--critical)" : "var(--muted)" }}>{diff ? signed(diff) : "–"}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
