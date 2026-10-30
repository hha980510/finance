"use client";
import { useRef } from "react";
import type { Store } from "@/lib/store";
import type { AppData } from "@/lib/types";
import { budgetFromCSV, detectCSV, parseCSV, txnsFromCSV } from "@/lib/csv";
import { usd } from "@/lib/format";

/** CSV 파일 하나로 예산 또는 거래내역을 가져오기 (헤더로 자동 판별) */
export default function CsvImport({ d, store, expect, label = "CSV 가져오기", className = "btn", onMessage }: { d: AppData; store: Store; expect?: "budget" | "transactions"; label?: string; className?: string; onMessage?: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const say = onMessage ?? ((m: string) => alert(m));

  const onFile = async (f?: File) => {
    if (!f) return;
    try {
      const rows = parseCSV(await f.text());
      const kind = detectCSV(rows);
      if (kind === "unknown") return say("CSV 형식을 알 수 없어요. 첫 줄에 머리글이 필요해요.\n· 예산: 구분, 항목, 그룹, 성격, 분류, 월예산, 납부일, 결제자\n· 거래: 날짜, 구분, 카테고리, 금액, 결제자, 계좌, 메모");
      if (expect && kind !== expect) {
        if (!confirm(`이 파일은 ${kind === "budget" ? "예산" : "거래내역"} CSV로 보여요. 그대로 가져올까요?`)) return;
      }
      if (kind === "budget") {
        const r = budgetFromCSV(rows, d);
        if (!r.categories.length && !r.incomes.length) return say("가져올 예산 항목이 없어요.");
        const inc = r.incomes.reduce((a, i) => a + i.amount, 0);
        const tot = r.categories.reduce((a, c) => a + c.budget, 0);
        const msg = `예산을 CSV 내용으로 바꿀까요?\n\n수입 ${r.incomes.length}개 · ${usd(inc)}\n지출 항목 ${r.categories.length - 1 - r.kept.length}개 · ${usd(tot)}\n${inc ? `잉여/적자 ${usd(inc - tot)}` : ""}${r.kept.length ? `\n\nCSV에 없지만 거래가 있는 항목은 예산 0으로 유지: ${r.kept.join(", ")}` : ""}${r.errors.length ? `\n\n건너뛴 행:\n${r.errors.slice(0, 5).join("\n")}` : ""}`;
        if (!confirm(msg)) return;
        store.update((x) => ({ ...x, incomes: r.incomes.length ? r.incomes : x.incomes, categories: r.categories }));
        say(`예산을 가져왔어요. (수입 ${r.incomes.length}개, 지출 항목 ${r.categories.length - 1}개)`);
      } else {
        const r = txnsFromCSV(rows, d);
        if (!r.fresh.length) return say(`새로 넣을 거래가 없어요.${r.skipped ? ` (중복 ${r.skipped}건 건너뜀)` : ""}${r.errors.length ? `\n오류: ${r.errors.slice(0, 5).join(", ")}` : ""}`);
        const out = r.fresh.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0);
        const inc = r.fresh.filter((t) => t.type === "income").reduce((a, t) => a + t.amount, 0);
        const msg = `거래 ${r.fresh.length}건을 추가할까요?\n지출 ${usd(out, 2)} · 수입 ${usd(inc, 2)}${r.skipped ? `\n중복 ${r.skipped}건은 건너뜀` : ""}${r.unmatched.length ? `\n\n없는 카테고리 → 미분류: ${r.unmatched.join(", ")}` : ""}${r.errors.length ? `\n\n건너뛴 행 ${r.errors.length}개: ${r.errors.slice(0, 3).join(", ")}` : ""}`;
        if (!confirm(msg)) return;
        store.update((x) => ({ ...x, transactions: [...x.transactions, ...r.fresh] }));
        say(`거래 ${r.fresh.length}건을 가져왔어요.${r.unmatched.length ? ` 미분류로 들어간 카테고리: ${r.unmatched.join(", ")}` : ""}`);
      }
    } catch (e) {
      say("CSV를 읽지 못했어요: " + (e as Error).message);
    } finally {
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>
        {label}
      </button>
      <input ref={ref} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </>
  );
}
