"use client";
import type { AppData, Txn } from "./types";
import { EXCEL_CATEGORY_MAP, UNCATEGORIZED } from "./defaults";
import { monthStats, planAnalysis } from "./analytics";
import { uid } from "./format";

type Cell = { value: unknown } | undefined;

function raw(c: Cell): unknown {
  const v = c?.value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ("result" in o) return o.result;
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text) return o.text;
  }
  return v;
}

function toISO(v: unknown, fallbackYM: string): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.trim().match(/(\d{4})[.\-/ ]\s*(\d{1,2})[.\-/ ]\s*(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return v == null || v === "" ? null : `${fallbackYM}-01`;
}

function guessPayer(memo: string, people: string[]) {
  for (const p of people) if (memo.includes(p)) return p;
  return "공동";
}

/** 기존 '현성 세연 가계부' 엑셀(월별 시트: 수입 A~E, 지출 G~K) 가져오기 */
export async function importLegacyExcel(file: File, d: AppData) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const yearMatch = file.name.match(/20\d{2}/);
  let year = yearMatch ? yearMatch[0] : String(new Date().getFullYear());
  const ysheet = wb.worksheets.find((w) => /년도$/.test(w.name));
  const yv = ysheet ? raw(ysheet.getCell("B1")) : null;
  if (yv && /^20\d{2}$/.test(String(yv))) year = String(yv);

  const found: Txn[] = [];
  const unmapped = new Set<string>();
  for (const ws of wb.worksheets) {
    const mm = ws.name.trim().match(/^(\d{1,2})월$/);
    if (!mm) continue;
    const ym = `${year}-${mm[1].padStart(2, "0")}`;
    ws.eachRow((row, r) => {
      if (r < 5) return;
      // 수입 A~E
      const iAmt = Number(raw(row.getCell(4)));
      const iKind = String(raw(row.getCell(5)) ?? "");
      if (iAmt && iKind !== "이월금") {
        const date = toISO(raw(row.getCell(2)), ym);
        const memo = String(raw(row.getCell(3)) ?? "");
        if (date) found.push({ id: uid(), date, type: "income", amount: Math.abs(iAmt), incomeId: d.incomes[0]?.id, memo, payer: guessPayer(memo, d.settings.people) });
      }
      // 지출 G~K
      const eAmt = Number(raw(row.getCell(10)));
      if (eAmt) {
        const date = toISO(raw(row.getCell(8)), ym);
        const memo = String(raw(row.getCell(9)) ?? "");
        const kind = String(raw(row.getCell(11)) ?? "").trim();
        let categoryId = EXCEL_CATEGORY_MAP[kind];
        if (!categoryId) {
          const byName = d.categories.find((c) => kind && (c.name.includes(kind) || kind.includes(c.name)));
          categoryId = byName?.id ?? UNCATEGORIZED;
          if (kind && !byName) unmapped.add(kind);
        }
        if (/보증금|deposit/i.test(memo)) categoryId = UNCATEGORIZED; // 일회성 보증금은 월세와 분리
        if (date) found.push({ id: uid(), date, type: "expense", amount: Math.abs(eAmt), categoryId, memo, payer: guessPayer(memo, d.settings.people) });
      }
    });
  }
  const sig = (t: Txn) => `${t.date}|${t.type}|${t.amount.toFixed(2)}|${t.memo}`;
  const existing = new Set(d.transactions.map(sig));
  const fresh = found.filter((t) => !existing.has(sig(t)));
  return { fresh, skipped: found.length - fresh.length, unmapped: [...unmapped] };
}

export function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const csvEsc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function transactionsCSV(d: AppData, txns = d.transactions) {
  const cat = new Map(d.categories.map((c) => [c.id, c]));
  const head = ["날짜", "구분", "카테고리", "그룹", "성격", "금액", "결제자", "계좌", "메모"];
  const lines = [...txns]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => {
      const c = t.categoryId ? cat.get(t.categoryId) : undefined;
      return [t.date, t.type === "income" ? "수입" : "지출", c?.name ?? (t.type === "income" ? "수입" : ""), c?.group ?? "", c?.kind ?? "", t.amount.toFixed(2), t.payer, t.account ?? "", t.memo].map(csvEsc).join(",");
    });
  return "﻿" + [head.join(","), ...lines].join("\n");
}

/** 분석 리포트 엑셀: 요약 / 예산대비실적 / 거래내역 */
export async function exportReport(d: AppData, month: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const p = planAnalysis(d);
  const s = monthStats(d, month);
  const bold = { bold: true };
  const money = '"$"#,##0.00;[Red]-"$"#,##0.00';

  const sum = wb.addWorksheet("요약");
  sum.columns = [{ width: 28 }, { width: 16 }, { width: 14 }];
  sum.addRow([`가계부 분석 리포트 — ${month}`]).font = { bold: true, size: 14 };
  sum.addRow([]);
  const rows: [string, number, string?][] = [
    ["계획 월 수입", p.income],
    ["계획 지출+저축 합계", p.total],
    ["계획상 월 잉여(적자)", p.surplus],
    ["주거비 비중", p.ratio.housing, "pct"],
    ["고정비 비중", p.ratio.fixed, "pct"],
    ["헌금·기부 비중", p.ratio.giving, "pct"],
    ["실질 저축률(계획)", p.ratio.effectiveSaving, "pct"],
    [`${month} 실제 수입`, s.incomeActual],
    [`${month} 소비 지출`, s.spent],
    [`${month} 저축 이체`, s.saved],
    [`${month} 순현금흐름`, s.incomeActual - s.spent - s.saved],
  ];
  for (const [k, v, f] of rows) {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = bold;
    r.getCell(2).numFmt = f === "pct" ? "0.0%" : money;
  }

  const bva = wb.addWorksheet("예산대비실적");
  bva.columns = [
    { header: "카테고리", width: 24 },
    { header: "그룹", width: 12 },
    { header: "성격", width: 8 },
    { header: "예산", width: 12 },
    { header: "실적", width: 12 },
    { header: "차이(예산-실적)", width: 16 },
    { header: "사용률", width: 10 },
  ];
  bva.getRow(1).font = bold;
  s.rows.forEach((r, i) => {
    const n = i + 2;
    bva.addRow([r.cat.name, r.cat.group, r.cat.kind, r.budget, r.actual, { formula: `D${n}-E${n}` }, { formula: `IF(D${n}=0,0,E${n}/D${n})` }]);
  });
  const last = s.rows.length + 1;
  const tot = bva.addRow(["합계", "", "", { formula: `SUM(D2:D${last})` }, { formula: `SUM(E2:E${last})` }, { formula: `SUM(F2:F${last})` }, { formula: `IF(D${last + 1}=0,0,E${last + 1}/D${last + 1})` }]);
  tot.font = bold;
  bva.getColumn(4).numFmt = money;
  bva.getColumn(5).numFmt = money;
  bva.getColumn(6).numFmt = money;
  bva.getColumn(7).numFmt = "0.0%";

  const tx = wb.addWorksheet("거래내역");
  const cat = new Map(d.categories.map((c) => [c.id, c.name]));
  tx.columns = [
    { header: "날짜", width: 12 },
    { header: "구분", width: 8 },
    { header: "카테고리", width: 22 },
    { header: "금액", width: 12 },
    { header: "결제자", width: 8 },
    { header: "메모", width: 40 },
  ];
  tx.getRow(1).font = bold;
  [...d.transactions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((t) => tx.addRow([t.date, t.type === "income" ? "수입" : "지출", t.categoryId ? cat.get(t.categoryId) : "수입", t.amount, t.payer, t.memo]));
  tx.getColumn(4).numFmt = money;
  tx.autoFilter = "A1:F1";

  const buf = await wb.xlsx.writeBuffer();
  download(`가계부_리포트_${month}.xlsx`, buf as ArrayBuffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
