import type { AppData, Bucket, Category, Txn } from "./types";
import { addMonths, daysInMonth, todayISO } from "./format";

export type Status = "over" | "risk" | "ok" | "paid" | "pending" | "idle";

export interface CatRow {
  cat: Category;
  budget: number;
  actual: number;
  variance: number; // budget - actual (+ 면 절약)
  used: number; // actual / budget
  projected: number;
  status: Status;
  count: number;
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function plannedIncome(d: AppData) {
  return sum(d.incomes.map((i) => i.amount));
}

export function budgetFor(d: AppData, month: string): Record<string, number> {
  const snap = d.budgetHistory[month];
  const out: Record<string, number> = {};
  for (const c of d.categories) out[c.id] = snap && c.id in snap ? snap[c.id] : c.budget;
  return out;
}

export function monthTxns(d: AppData, month: string) {
  return d.transactions.filter((t) => t.date.startsWith(month));
}

/** 이번 달 경과율 (과거 달 = 1, 미래 달 = 0) */
export function elapsedFraction(month: string, today = todayISO()) {
  const cur = today.slice(0, 7);
  if (month < cur) return 1;
  if (month > cur) return 0;
  return Number(today.slice(8, 10)) / daysInMonth(month);
}

export function monthStats(d: AppData, month: string, today = todayISO()) {
  const txns = monthTxns(d, month);
  const budgets = budgetFor(d, month);
  const elapsed = elapsedFraction(month, today);
  const spentBy: Record<string, number> = {};
  const countBy: Record<string, number> = {};
  let incomeActual = 0;
  for (const t of txns) {
    if (t.type === "income") incomeActual += t.amount;
    else {
      const k = t.categoryId ?? "uncategorized";
      spentBy[k] = (spentBy[k] ?? 0) + t.amount;
      countBy[k] = (countBy[k] ?? 0) + 1;
    }
  }
  const incomePlanned = plannedIncome(d);

  const rows: CatRow[] = d.categories.map((cat) => {
    const budget = budgets[cat.id] ?? 0;
    const actual = round2(spentBy[cat.id] ?? 0);
    let projected = actual;
    if (cat.kind === "variable") projected = elapsed > 0 ? Math.max(actual, actual / Math.max(elapsed, 0.05)) : 0;
    else projected = Math.max(actual, budget);
    if (elapsed === 1) projected = actual;
    let status: Status = "ok";
    if (budget === 0 && actual === 0) status = "idle";
    else if (actual > budget * 1.02 + 0.5) status = "over";
    else if (cat.kind !== "variable") status = actual >= budget * 0.98 ? "paid" : elapsed === 1 ? "ok" : "pending";
    else if (projected > budget * 1.05) status = "risk";
    return {
      cat,
      budget,
      actual,
      variance: round2(budget - actual),
      used: budget > 0 ? actual / budget : actual > 0 ? Infinity : 0,
      projected: round2(projected),
      status,
      count: countBy[cat.id] ?? 0,
    };
  });

  const consume = rows.filter((r) => r.cat.kind !== "saving");
  const saves = rows.filter((r) => r.cat.kind === "saving");
  const spent = sum(consume.map((r) => r.actual));
  const saved = sum(saves.map((r) => r.actual));
  const budgetSpend = sum(consume.map((r) => r.budget));
  const budgetSave = sum(saves.map((r) => r.budget));
  const projectedSpend = sum(consume.map((r) => r.projected));
  const incomeBasis = incomeActual > 0 ? incomeActual : incomePlanned;

  const byBucket = (rs: CatRow[], key: "actual" | "budget") => {
    const o: Record<Bucket, number> = { need: 0, want: 0, giving: 0, saving: 0 };
    for (const r of rs) o[r.cat.bucket] += r[key];
    return o;
  };

  return {
    month,
    txns,
    rows,
    elapsed,
    incomeActual,
    incomePlanned,
    incomeBasis,
    spent,
    saved,
    budgetSpend,
    budgetSave,
    budgetTotal: budgetSpend + budgetSave,
    projectedSpend,
    remainingBudget: budgetSpend - spent,
    net: incomeBasis - spent - saved,
    /** (수입 - 소비지출) / 수입 : 실제로 남긴 돈 + 저축 이체 */
    savingsRate: incomeBasis > 0 ? (incomeBasis - spent) / incomeBasis : 0,
    bucketActual: byBucket(rows, "actual"),
    bucketBudget: byBucket(rows, "budget"),
    hasData: txns.length > 0,
  };
}
export type MonthStats = ReturnType<typeof monthStats>;

/** 예산(계획) 자체의 구조 분석 — 거래가 없어도 바로 의미 있는 지표 */
export function planAnalysis(d: AppData) {
  const income = plannedIncome(d);
  const cats = d.categories;
  const total = sum(cats.map((c) => c.budget));
  const by = (f: (c: Category) => boolean) => sum(cats.filter(f).map((c) => c.budget));
  const housing = by((c) => c.group === "주거");
  const fixed = by((c) => c.kind === "fixed");
  const variable = by((c) => c.kind === "variable");
  const saving = by((c) => c.kind === "saving");
  const giving = by((c) => c.bucket === "giving");
  const need = by((c) => c.bucket === "need");
  const want = by((c) => c.bucket === "want");
  const surplus = income - total;
  const groups = new Map<string, number>();
  for (const c of cats) groups.set(c.group, (groups.get(c.group) ?? 0) + c.budget);
  return {
    income,
    total,
    surplus,
    housing,
    fixed,
    variable,
    saving,
    giving,
    need,
    want,
    ratio: {
      housing: housing / income,
      fixed: fixed / income,
      giving: giving / income,
      need: need / income,
      want: want / income,
      saving: saving / income,
      /** 실질 저축률 = (저축 + 남는 돈) / 수입 */
      effectiveSaving: (saving + surplus) / income,
      flexibility: variable / income,
    },
    groups: [...groups.entries()]
      .map(([group, amount]) => ({ group, amount, share: amount / income }))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    breakEvenIncome: total,
    emergencyMonths: need + giving > 0 ? d.settings.emergencyFund / (need + giving) : 0,
  };
}
export type PlanAnalysis = ReturnType<typeof planAnalysis>;

export function trend(d: AppData, end: string, n = 12) {
  const out: { month: string; income: number; spent: number; saved: number; budget: number; net: number; savingsRate: number | null; need: number; want: number; giving: number; hasData: boolean }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(end, -i);
    const s = monthStats(d, m);
    out.push({
      month: m,
      income: s.incomeActual,
      spent: s.spent,
      saved: s.saved,
      budget: s.budgetSpend,
      net: s.incomeActual - s.spent - s.saved,
      savingsRate: s.incomeActual > 0 ? (s.incomeActual - s.spent) / s.incomeActual : null,
      need: s.bucketActual.need,
      want: s.bucketActual.want,
      giving: s.bucketActual.giving,
      hasData: s.hasData,
    });
  }
  // 3개월 이동평균
  return out.map((r, i) => {
    const w = out.slice(Math.max(0, i - 2), i + 1).filter((x) => x.hasData);
    return { ...r, ma3: w.length ? sum(w.map((x) => x.spent)) / w.length : null };
  });
}

/** 변동지출 누적 소진 곡선 vs 예산 페이스 */
export function burnDown(d: AppData, month: string) {
  const s = monthStats(d, month);
  const varIds = new Set(d.categories.filter((c) => c.kind === "variable").map((c) => c.id));
  const varBudget = sum(s.rows.filter((r) => varIds.has(r.cat.id)).map((r) => r.budget));
  const n = daysInMonth(month);
  const today = todayISO();
  const lastDay = month < today.slice(0, 7) ? n : month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 0;
  const daily = new Array(n + 1).fill(0);
  for (const t of s.txns)
    if (t.type === "expense" && varIds.has(t.categoryId ?? "uncategorized")) daily[Number(t.date.slice(8, 10))] += t.amount;
  let acc = 0;
  const pts: { day: number; pace: number; actual: number | null }[] = [];
  for (let day = 1; day <= n; day++) {
    acc += daily[day];
    pts.push({ day, pace: round2((varBudget * day) / n), actual: day <= lastDay ? round2(acc) : null });
  }
  const remainingDays = Math.max(0, n - lastDay);
  const varSpent = acc;
  return {
    pts,
    varBudget,
    varSpent: round2(varSpent),
    remainingDays,
    dailyAllowance: remainingDays > 0 ? Math.max(0, (varBudget - varSpent) / remainingDays) : 0,
  };
}

/** 카테고리별 Z-score 기반 이상 거래 탐지 */
export function anomalies(d: AppData, month: string) {
  const byCat = new Map<string, Txn[]>();
  for (const t of d.transactions)
    if (t.type === "expense" && !t.auto) {
      const k = t.categoryId ?? "uncategorized";
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(t);
    }
  const budgets = budgetFor(d, month);
  const out: { txn: Txn; reason: string; score: number }[] = [];
  for (const [cid, ts] of byCat) {
    const cat = d.categories.find((c) => c.id === cid);
    const amts = ts.map((t) => t.amount);
    const mean = sum(amts) / amts.length;
    const sd = Math.sqrt(sum(amts.map((a) => (a - mean) ** 2)) / amts.length);
    for (const t of ts) {
      if (!t.date.startsWith(month)) continue;
      const z = sd > 0 ? (t.amount - mean) / sd : 0;
      const b = budgets[cid] ?? 0;
      if (amts.length >= 5 && z >= 2) out.push({ txn: t, reason: `${cat?.name ?? "미분류"} 평균 대비 ${z.toFixed(1)}σ`, score: z });
      else if (cat?.kind === "variable" && b > 0 && t.amount >= b * 0.5)
        out.push({ txn: t, reason: `한 번에 월 예산의 ${Math.round((t.amount / b) * 100)}% 사용`, score: t.amount / b });
      else if (cid === "uncategorized" && t.amount >= 50) out.push({ txn: t, reason: "미분류 고액 거래", score: 1 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

export function payerSplit(d: AppData, month: string) {
  const m = new Map<string, number>();
  for (const t of monthTxns(d, month)) if (t.type === "expense") m.set(t.payer, (m.get(t.payer) ?? 0) + t.amount);
  return [...m.entries()].map(([payer, amount]) => ({ payer, amount })).sort((a, b) => b.amount - a.amount);
}

export function topMemos(d: AppData, month: string, n = 8) {
  const m = new Map<string, { amount: number; count: number }>();
  for (const t of monthTxns(d, month))
    if (t.type === "expense") {
      const key = t.memo.replace(/\(.*?\)|-.*$/g, "").trim() || "(메모 없음)";
      const v = m.get(key) ?? { amount: 0, count: 0 };
      v.amount += t.amount;
      v.count++;
      m.set(key, v);
    }
  return [...m.entries()].map(([memo, v]) => ({ memo, ...v })).sort((a, b) => b.amount - a.amount).slice(0, n);
}

/** 올해 연말 예상: 실적(지난 달까지) + 남은 달은 계획 */
export function yearProjection(d: AppData, year: number, today = todayISO()) {
  const plan = planAnalysis(d);
  const cur = today.slice(0, 7);
  let actualNet = 0,
    actualMonths = 0,
    planMonths = 0;
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    const s = monthStats(d, key, today);
    if (key < cur && s.hasData) {
      actualNet += s.incomeActual - s.spent;
      actualMonths++;
    } else if (key >= cur) planMonths++;
  }
  const planNet = plan.income - (plan.total - plan.saving);
  return { actualNet, actualMonths, planMonths, projected: actualNet + planNet * planMonths, planNetMonthly: planNet };
}

export function goalPlan(target: number, saved: number, deadline: string, today = todayISO()) {
  const [y, m] = deadline.split("-").map(Number);
  const [ty, tm] = today.slice(0, 7).split("-").map(Number);
  const months = Math.max(1, (y - ty) * 12 + (m - tm));
  const remaining = Math.max(0, target - saved);
  return { months, remaining, monthly: remaining / months, progress: target > 0 ? saved / target : 0 };
}
