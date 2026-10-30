"use client";
import type { TabProps } from "./types";
import type { Category, IncomeSource } from "@/lib/types";
import { BUCKET_LABEL, GROUPS, KIND_LABEL, UNCATEGORIZED } from "@/lib/defaults";
import { planAnalysis } from "@/lib/analytics";
import { pct, uid, usd } from "@/lib/format";
import { Card, Kpi } from "./ui";

export default function BudgetPlan({ d, store }: TabProps) {
  const p = planAnalysis(d);
  const setCat = (id: string, patch: Partial<Category>) => store.update((x) => ({ ...x, categories: x.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setInc = (id: string, patch: Partial<IncomeSource>) => store.update((x) => ({ ...x, incomes: x.incomes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const delCat = (id: string) => {
    const n = d.transactions.filter((t) => t.categoryId === id).length;
    if (!confirm(n ? `이 카테고리의 거래 ${n}건은 ‘미분류’로 옮겨집니다. 삭제할까요?` : "삭제할까요?")) return;
    store.update((x) => ({ ...x, categories: x.categories.filter((c) => c.id !== id), transactions: x.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: UNCATEGORIZED } : t)) }));
  };
  const addCat = () => store.update((x) => ({ ...x, categories: [...x.categories.filter((c) => c.id !== UNCATEGORIZED), { id: uid(), name: "새 항목", group: "기타", kind: "variable", bucket: "want", budget: 0 }, ...x.categories.filter((c) => c.id === UNCATEGORIZED)] }));
  const move = (i: number, dir: -1 | 1) =>
    store.update((x) => {
      const cs = [...x.categories];
      const j = i + dir;
      if (j < 0 || j >= cs.length) return x;
      [cs[i], cs[j]] = [cs[j], cs[i]];
      return { ...x, categories: cs };
    });

  const groups = Array.from(new Set([...GROUPS, ...d.categories.map((c) => c.group)]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="월 수입" value={usd(p.income)} />
        <Kpi label="예산 합계" value={usd(p.total)} sub={`수입의 ${pct(p.total / p.income)}`} tone={p.total > p.income ? "bad" : undefined} />
        <Kpi label="고정" value={usd(p.fixed)} sub={pct(p.ratio.fixed)} />
        <Kpi label="변동" value={usd(p.variable)} sub={pct(p.ratio.flexibility)} />
        <Kpi label={p.surplus < 0 ? "부족액" : "미배정 잉여"} value={usd(p.surplus)} tone={p.surplus < 0 ? "bad" : "good"} sub={p.surplus < 0 ? "예산이 수입보다 많아요" : "저축으로 돌리면 좋아요"} />
      </div>

      <Card title="수입" right={<button className="btn text-xs" onClick={() => store.update((x) => ({ ...x, incomes: [...x.incomes, { id: uid(), name: "추가 수입", amount: 0, payer: "공동" }] }))}>+ 수입원</button>}>
        <table className="data">
          <thead><tr><th>이름</th><th>받는 사람</th><th className="num">월 금액</th><th /></tr></thead>
          <tbody>
            {d.incomes.map((i) => (
              <tr key={i.id}>
                <td><input className="field" value={i.name} onChange={(e) => setInc(i.id, { name: e.target.value })} /></td>
                <td>
                  <select className="field" value={i.payer ?? "공동"} onChange={(e) => setInc(i.id, { payer: e.target.value })}>
                    {[...d.settings.people, "공동"].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td className="num"><input type="number" className="field tnum text-right" value={i.amount} onChange={(e) => setInc(i.id, { amount: Number(e.target.value) })} /></td>
                <td className="text-right">{d.incomes.length > 1 && <button className="text-xs text-critical" onClick={() => store.update((x) => ({ ...x, incomes: x.incomes.filter((y) => y.id !== i.id) }))}>삭제</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="예산 항목" sub="성격(고정/변동/저축)과 분류(필수/선택/헌금/저축)는 모든 분석의 기준이 됩니다. 예산을 바꿔도 지난 달 분석은 당시 예산으로 유지돼요." right={<button className="btn text-xs" onClick={addCat}>+ 항목 추가</button>}>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr><th /><th>항목</th><th>그룹</th><th>성격</th><th>분류</th><th className="num">월 예산</th><th className="num">수입 대비</th><th>납부일</th><th /></tr>
            </thead>
            <tbody>
              {d.categories.map((c, i) => (
                <tr key={c.id}>
                  <td className="whitespace-nowrap text-muted">
                    <button className="px-1" onClick={() => move(i, -1)} aria-label="위로">↑</button>
                    <button className="px-1" onClick={() => move(i, 1)} aria-label="아래로">↓</button>
                  </td>
                  <td><input className="field min-w-[150px]" value={c.name} onChange={(e) => setCat(c.id, { name: e.target.value })} /></td>
                  <td>
                    <input className="field min-w-[100px]" list="groups" value={c.group} onChange={(e) => setCat(c.id, { group: e.target.value })} />
                  </td>
                  <td>
                    <select className="field min-w-[76px]" value={c.kind} onChange={(e) => setCat(c.id, { kind: e.target.value as Category["kind"] })}>
                      {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="field min-w-[110px]" value={c.bucket} onChange={(e) => setCat(c.id, { bucket: e.target.value as Category["bucket"] })}>
                      {Object.entries(BUCKET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="num"><input type="number" className="field w-24 tnum text-right" value={c.budget} onChange={(e) => setCat(c.id, { budget: Number(e.target.value) })} /></td>
                  <td className="num text-xs text-ink-2">{pct(c.budget / p.income)}</td>
                  <td>{c.kind !== "variable" ? <input type="number" min={1} max={31} className="field w-16 tnum" value={c.dueDay ?? ""} placeholder="–" onChange={(e) => setCat(c.id, { dueDay: e.target.value ? Number(e.target.value) : undefined })} /> : <span className="text-xs text-muted">–</span>}</td>
                  <td className="whitespace-nowrap text-right">{c.id !== UNCATEGORIZED && <button className="text-xs text-critical" onClick={() => delCat(c.id)}>삭제</button>}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td /><td colSpan={4}>합계</td>
                <td className="num">{usd(p.total)}</td>
                <td className="num text-xs">{pct(p.total / p.income)}</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
          <datalist id="groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </div>
      </Card>
    </div>
  );
}
