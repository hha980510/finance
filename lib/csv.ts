"use client";
import type { AppData, Category, IncomeSource, Txn } from "./types";
import { UNCATEGORIZED } from "./defaults";
import { uid } from "./format";

/** RFC4180 CSV 파서 (따옴표, 쉼표, 줄바꿈, BOM, CRLF 처리) */
export function parseCSV(text: string): string[][] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");

const money = (v: string) => {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return isFinite(n) ? n : NaN;
};

/** 헤더 이름(한/영 여러 표기)으로 열 위치 찾기 */
function headerIndex(head: string[], names: string[]) {
  const norm = (x: string) => x.replace(/\s|\(.*?\)/g, "").toLowerCase();
  const h = head.map(norm);
  for (const n of names) {
    const i = h.indexOf(norm(n));
    if (i >= 0) return i;
  }
  return -1;
}

const KIND: Record<string, Category["kind"]> = { 고정: "fixed", fixed: "fixed", 변동: "variable", variable: "variable", 저축: "saving", saving: "saving" };
const BUCKET: Record<string, Category["bucket"]> = { 필수: "need", need: "need", 선택: "want", want: "want", 헌금: "giving", "헌금·기부": "giving", 기부: "giving", giving: "giving", 저축: "saving", saving: "saving" };

export type CsvKind = "budget" | "transactions" | "unknown";
export function detectCSV(rows: string[][]): CsvKind {
  if (!rows.length) return "unknown";
  const head = rows[0];
  if (headerIndex(head, ["날짜", "date"]) >= 0 && headerIndex(head, ["금액", "amount"]) >= 0) return "transactions";
  if (headerIndex(head, ["항목", "name", "item"]) >= 0 && headerIndex(head, ["월예산", "예산", "금액", "budget", "amount"]) >= 0) return "budget";
  return "unknown";
}

/* ───────────── 예산 CSV ───────────── */
export const BUDGET_HEADER = ["구분", "항목", "그룹", "성격", "분류", "월예산", "납부일", "결제자"];

export function budgetToCSV(d: AppData) {
  const KL = { fixed: "고정", variable: "변동", saving: "저축" };
  const BL = { need: "필수", want: "선택", giving: "헌금·기부", saving: "저축" };
  return toCSV([
    BUDGET_HEADER,
    ...d.incomes.map((i) => ["수입", i.name, "", "", "", i.amount, "", i.payer ?? "공동"]),
    ...d.categories.filter((c) => c.id !== UNCATEGORIZED).map((c) => ["지출", c.name, c.group, KL[c.kind], BL[c.bucket], c.budget, c.dueDay ?? "", c.payer ?? ""]),
  ]);
}

/** 예산 CSV → 새 incomes/categories. 이름이 같은 항목은 기존 id를 유지해 거래 연결이 끊기지 않음 */
export function budgetFromCSV(rows: string[][], d: AppData) {
  const h = rows[0];
  const ix = {
    type: headerIndex(h, ["구분", "type"]),
    name: headerIndex(h, ["항목", "name", "item"]),
    group: headerIndex(h, ["그룹", "group"]),
    kind: headerIndex(h, ["성격", "kind"]),
    bucket: headerIndex(h, ["분류", "bucket"]),
    amt: headerIndex(h, ["월예산", "예산", "금액", "budget", "amount"]),
    due: headerIndex(h, ["납부일", "dueday", "due"]),
    payer: headerIndex(h, ["결제자", "받는사람", "payer"]),
  };
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
  const errors: string[] = [];
  const incomes: IncomeSource[] = [];
  const cats: Category[] = [];
  rows.slice(1).forEach((r, k) => {
    const name = get(r, ix.name);
    const amount = money(get(r, ix.amt));
    if (!name) return;
    if (isNaN(amount)) return errors.push(`${k + 2}행 "${name}": 금액을 읽을 수 없음`);
    const type = get(r, ix.type);
    if (/수입|income/i.test(type)) {
      const old = d.incomes.find((x) => x.name === name);
      incomes.push({ id: old?.id ?? uid(), name, amount, payer: get(r, ix.payer) || "공동" });
      return;
    }
    const old = d.categories.find((x) => x.name === name);
    const kindRaw = get(r, ix.kind);
    const kind = KIND[kindRaw] ?? old?.kind ?? (/저축/.test(name) ? "saving" : "variable");
    const bucket = BUCKET[get(r, ix.bucket)] ?? old?.bucket ?? (kind === "saving" ? "saving" : /헌금|십일조|연합/.test(name) ? "giving" : "need");
    const due = Number(get(r, ix.due));
    cats.push({
      id: old?.id ?? uid(),
      name,
      group: get(r, ix.group) || old?.group || "기타",
      kind,
      bucket,
      budget: amount,
      dueDay: due >= 1 && due <= 31 ? due : old?.dueDay,
      payer: get(r, ix.payer) || old?.payer,
    });
  });
  // CSV에 없지만 거래가 연결된 기존 항목은 예산 0으로 유지 (데이터 보존)
  const kept = d.categories.filter((c) => c.id !== UNCATEGORIZED && !cats.some((x) => x.id === c.id) && d.transactions.some((t) => t.categoryId === c.id)).map((c) => ({ ...c, budget: 0 }));
  const unc = d.categories.find((c) => c.id === UNCATEGORIZED)!;
  return { incomes, categories: [...cats, ...kept, unc], kept: kept.map((c) => c.name), errors };
}

/* ───────────── 거래 CSV ───────────── */
export const TXN_HEADER = ["날짜", "구분", "카테고리", "금액", "결제자", "계좌", "메모"];

function toISO(v: string): string | null {
  let m = v.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); // 미국식 M/D/YYYY
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

export function txnsFromCSV(rows: string[][], d: AppData) {
  const h = rows[0];
  const ix = {
    date: headerIndex(h, ["날짜", "date"]),
    type: headerIndex(h, ["구분", "type"]),
    cat: headerIndex(h, ["카테고리", "항목", "category"]),
    amt: headerIndex(h, ["금액", "amount"]),
    payer: headerIndex(h, ["결제자", "payer"]),
    acct: headerIndex(h, ["계좌", "카드", "account"]),
    memo: headerIndex(h, ["메모", "내역", "memo", "description"]),
  };
  const get = (r: string[], i: number) => (i >= 0 ? r[i] ?? "" : "");
  const findCat = (n: string) => {
    if (!n) return undefined;
    return d.categories.find((c) => c.name === n) ?? d.categories.find((c) => c.name.includes(n) || n.includes(c.name)) ?? d.categories.find((c) => c.group === n);
  };
  const errors: string[] = [];
  const unmatched = new Set<string>();
  const out: Txn[] = [];
  rows.slice(1).forEach((r, k) => {
    const date = toISO(get(r, ix.date));
    let amount = money(get(r, ix.amt));
    if (!date || isNaN(amount) || amount === 0) return errors.push(`${k + 2}행: 날짜 또는 금액 오류`);
    const typeRaw = get(r, ix.type);
    // 구분 열이 없으면 기본은 지출, 메모가 급여/입금이면 수입
    let type: Txn["type"] = /수입|income|입금/i.test(typeRaw) ? "income" : "expense";
    if (!typeRaw && amount > 0 && ix.type < 0 && /급여|salary|payroll|deposit/i.test(get(r, ix.memo))) type = "income";
    amount = Math.abs(amount);
    const catName = get(r, ix.cat);
    const cat = type === "expense" ? findCat(catName) : undefined;
    if (type === "expense" && catName && !cat) unmatched.add(catName);
    const memo = get(r, ix.memo);
    const payerRaw = get(r, ix.payer);
    const payer = payerRaw || d.settings.people.find((p) => memo.includes(p)) || "공동";
    out.push({
      id: uid(),
      date,
      type,
      amount: Math.round(amount * 100) / 100,
      categoryId: type === "expense" ? cat?.id ?? UNCATEGORIZED : undefined,
      incomeId: type === "income" ? d.incomes.find((i) => i.name === catName)?.id ?? d.incomes[0]?.id : undefined,
      memo,
      payer,
      account: get(r, ix.acct) || undefined,
    });
  });
  const sig = (t: Txn) => `${t.date}|${t.type}|${t.amount.toFixed(2)}|${t.memo}`;
  const existing = new Set(d.transactions.map(sig));
  const fresh = out.filter((t) => !existing.has(sig(t)));
  return { fresh, skipped: out.length - fresh.length, unmatched: [...unmatched], errors };
}

export function txnTemplateCSV(d: AppData) {
  const ex = d.categories.filter((c) => c.kind === "variable").slice(0, 3);
  return toCSV([
    TXN_HEADER,
    ["2026-11-01", "수입", d.incomes[0]?.name ?? "급여", 3500, "공동", "", "11월 급여"],
    ["2026-11-01", "지출", "월세", 1651, "공동", "Chase", "11월 월세"],
    ["2026-11-03", "지출", ex[0]?.name ?? "생활비", 86.4, d.settings.people[0] ?? "공동", "Visa", "Costco"],
    ["2026-11-05", "지출", "기름값", 38, d.settings.people[1] ?? "공동", "", "주유"],
  ]);
}
