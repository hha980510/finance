"use client";
import { useMemo, useState } from "react";
import type { TabProps } from "./types";
import type { Txn } from "@/lib/types";
import { monthTxns } from "@/lib/analytics";
import { todayISO, uid, usd } from "@/lib/format";
import { download, transactionsCSV } from "@/lib/io";
import { Card, Empty, Money } from "./ui";
import CsvImport from "./CsvImport";
import { txnTemplateCSV } from "@/lib/csv";

const blank = (month: string, people: string[]): Omit<Txn, "id"> => {
  const t = todayISO();
  return { date: t.startsWith(month) ? t : `${month}-01`, type: "expense", amount: 0, categoryId: "living", memo: "", payer: people[0] ?? "공동" };
};

export default function Transactions({ d, store, month }: TabProps) {
  const people = [...d.settings.people, "공동"];
  const [form, setForm] = useState(() => blank(month, d.settings.people));
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fPayer, setFPayer] = useState("");
  const [fType, setFType] = useState("");
  const [allMonths, setAllMonths] = useState(false);
  const [sort, setSort] = useState<"date" | "amount">("date");
  const catName = useMemo(() => new Map(d.categories.map((c) => [c.id, c.name])), [d.categories]);

  const list = useMemo(() => {
    let xs = allMonths ? d.transactions : monthTxns(d, month);
    if (fCat) xs = xs.filter((t) => t.categoryId === fCat);
    if (fPayer) xs = xs.filter((t) => t.payer === fPayer);
    if (fType) xs = xs.filter((t) => t.type === fType);
    if (q) {
      const k = q.toLowerCase();
      xs = xs.filter((t) => t.memo.toLowerCase().includes(k) || (t.account ?? "").toLowerCase().includes(k));
    }
    return [...xs].sort((a, b) => (sort === "date" ? b.date.localeCompare(a.date) : b.amount - a.amount));
  }, [d, month, q, fCat, fPayer, fType, allMonths, sort]);

  const totIn = list.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
  const totOut = list.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) return;
    const t: Txn = { ...form, id: editing ?? uid(), amount: Math.round(form.amount * 100) / 100, categoryId: form.type === "expense" ? form.categoryId : undefined, incomeId: form.type === "income" ? form.incomeId ?? d.incomes[0]?.id : undefined };
    store.update((x) => ({ ...x, transactions: editing ? x.transactions.map((o) => (o.id === editing ? t : o)) : [...x.transactions, t] }));
    setEditing(null);
    setForm({ ...blank(month, d.settings.people), date: form.date, payer: form.payer, categoryId: form.categoryId, type: form.type });
  };

  const edit = (t: Txn) => {
    setEditing(t.id);
    const { id: _id, ...rest } = t;
    setForm(rest);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const del = (id: string) => {
    if (confirm("이 거래를 삭제할까요?")) store.update((x) => ({ ...x, transactions: x.transactions.filter((t) => t.id !== id) }));
  };

  /** 고정지출 + 저축 + 수입을 이번 달에 한 번에 기록 (이미 있으면 건너뜀) */
  const autoFill = () => {
    const existing = monthTxns(d, month);
    const add: Txn[] = [];
    for (const c of d.categories) {
      if (c.kind === "variable" || c.budget <= 0) continue;
      if (existing.some((t) => t.categoryId === c.id)) continue;
      const day = String(Math.min(c.dueDay ?? 1, 28)).padStart(2, "0");
      add.push({ id: uid(), date: `${month}-${day}`, type: "expense", amount: c.budget, categoryId: c.id, memo: `${c.name} (자동)`, payer: c.payer ?? "공동", auto: true });
    }
    for (const i of d.incomes) {
      if (existing.some((t) => t.type === "income" && t.incomeId === i.id)) continue;
      add.push({ id: uid(), date: `${month}-01`, type: "income", amount: i.amount, incomeId: i.id, memo: `${i.name} (자동)`, payer: i.payer ?? "공동", auto: true });
    }
    if (!add.length) return alert("이번 달 고정 항목은 이미 모두 입력되어 있어요.");
    if (confirm(`${add.length}건 (${usd(add.reduce((a, t) => a + (t.type === "expense" ? t.amount : 0), 0))} 지출, ${usd(add.reduce((a, t) => a + (t.type === "income" ? t.amount : 0), 0))} 수입)을 추가할까요?`))
      store.update((x) => ({ ...x, transactions: [...x.transactions, ...add] }));
  };

  return (
    <div className="space-y-4">
      <Card title={editing ? "거래 수정" : "거래 추가"} right={
          <div className="flex flex-wrap justify-end gap-2">
            <CsvImport d={d} store={store} expect="transactions" onImported={(ms) => { if (ms.some((m) => m !== month)) setAllMonths(true); }} />
            <button className="btn" onClick={() => download("거래내역_양식.csv", txnTemplateCSV(d), "text/csv;charset=utf-8")}>CSV 양식</button>
            <button className="btn" onClick={autoFill}>고정지출·수입 자동 입력</button>
          </div>
        }>
        <form onSubmit={submit} className="grid grid-cols-2 gap-2 md:grid-cols-[130px_100px_1fr_120px_100px_1.4fr_auto]">
          <input type="date" className="field tnum" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required aria-label="날짜" />
          <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Txn["type"] })} aria-label="구분">
            <option value="expense">지출</option>
            <option value="income">수입</option>
          </select>
          {form.type === "expense" ? (
            <select className="field" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} aria-label="카테고리">
              {d.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.group} · {c.name}
                </option>
              ))}
            </select>
          ) : (
            <select className="field" value={form.incomeId ?? d.incomes[0]?.id} onChange={(e) => setForm({ ...form, incomeId: e.target.value })} aria-label="수입원">
              {d.incomes.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          )}
          <input type="number" step="0.01" min="0" className="field tnum" placeholder="금액 $" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required aria-label="금액" />
          <select className="field" value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value })} aria-label="결제자">
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input className="field col-span-2 md:col-span-1" placeholder="메모 (가게, 내용)" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} aria-label="메모" />
          <div className="col-span-2 flex gap-2 md:col-span-1">
            <button className="btn btn-primary flex-1 justify-center">{editing ? "저장" : "추가"}</button>
            {editing && (
              <button type="button" className="btn" onClick={() => { setEditing(null); setForm(blank(month, d.settings.people)); }}>
                취소
              </button>
            )}
          </div>
        </form>
      </Card>

      <Card
        title={`거래 ${list.length}건`}
        sub={<>수입 <Money v={totIn} /> · 지출 <Money v={totOut} /></>}
        right={<button className="btn text-xs" onClick={() => download(`거래내역_${allMonths ? "전체" : month}.csv`, transactionsCSV(d, list), "text/csv;charset=utf-8")}>CSV 내보내기</button>}
      >
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          <input className="field col-span-2" placeholder="메모 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="field" value={fType} onChange={(e) => setFType(e.target.value)}>
            <option value="">수입+지출</option>
            <option value="expense">지출만</option>
            <option value="income">수입만</option>
          </select>
          <select className="field" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">전체 카테고리</option>
            {d.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className="field" value={fPayer} onChange={(e) => setFPayer(e.target.value)}>
            <option value="">전체 결제자</option>
            {people.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <div className="flex items-center gap-3 text-sm text-ink-2">
            <label className="flex items-center gap-1.5 whitespace-nowrap"><input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />전체 기간</label>
            <select className="field w-auto" value={sort} onChange={(e) => setSort(e.target.value as "date" | "amount")} aria-label="정렬">
              <option value="date">날짜순</option>
              <option value="amount">금액순</option>
            </select>
          </div>
        </div>
        {list.length === 0 ? (
          <Empty>거래가 없어요. 위에서 추가하거나 ‘데이터’ 탭에서 기존 엑셀을 가져오세요.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>날짜</th><th>카테고리</th><th>메모</th><th>결제자</th><th className="num">금액</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="tnum whitespace-nowrap text-ink-2">{t.date}</td>
                    <td className="whitespace-nowrap">{t.type === "income" ? <span style={{ color: "var(--good-text)" }}>수입</span> : catName.get(t.categoryId ?? "") ?? "미분류"}</td>
                    <td className="max-w-[320px] truncate text-ink-2">{t.memo}{t.auto && <span className="ml-1 text-[10px] text-muted">AUTO</span>}</td>
                    <td className="text-ink-2">{t.payer}</td>
                    <td className="num font-medium" style={{ color: t.type === "income" ? "var(--good-text)" : undefined }}>{t.type === "income" ? "+" : ""}{usd(t.amount, 2)}</td>
                    <td className="whitespace-nowrap text-right">
                      <button className="text-xs text-accent hover:underline" onClick={() => edit(t)}>수정</button>
                      <button className="ml-3 text-xs text-critical hover:underline" onClick={() => del(t.id)}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
