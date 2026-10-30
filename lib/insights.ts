import type { AppData } from "./types";
import { anomalies, burnDown, monthStats, planAnalysis } from "./analytics";
import { pct, usd } from "./format";

export type Level = "critical" | "warning" | "good" | "info";
export interface Insight {
  level: Level;
  title: string;
  detail: string;
}

export function buildInsights(d: AppData, month: string): Insight[] {
  const out: Insight[] = [];
  const p = planAnalysis(d);
  const s = monthStats(d, month);
  const b = d.settings.benchmarks;

  if (p.surplus < 0)
    out.push({
      level: "critical",
      title: `예산이 수입보다 ${usd(-p.surplus)} 많아요 (월 적자 구조)`,
      detail: `월 수입 ${usd(p.income)} 대비 계획 지출+저축 ${usd(p.total)}. 1년이면 ${usd(-p.surplus * 12)} 부족합니다. 시뮬레이터에서 조정안을 확인하세요.`,
    });
  else
    out.push({
      level: "good",
      title: `예산 배정 후 매달 ${usd(p.surplus)} 여유`,
      detail: `남는 금액을 저축으로 돌리면 실질 저축률은 ${pct(p.ratio.effectiveSaving)} 입니다.`,
    });

  if (p.ratio.housing > b.housing)
    out.push({
      level: p.ratio.housing > 0.4 ? "critical" : "warning",
      title: `주거비 비중 ${pct(p.ratio.housing)} (권장 ${pct(b.housing, 0)} 이하)`,
      detail: `권장선에 맞추려면 주거비 ${usd(p.income * b.housing)} 이하 또는 수입 ${usd(p.housing / b.housing)} 이상이 필요합니다.`,
    });

  if (p.ratio.effectiveSaving < b.savings)
    out.push({
      level: p.ratio.effectiveSaving < 0.05 ? "warning" : "info",
      title: `실질 저축률 ${pct(p.ratio.effectiveSaving)} (권장 ${pct(b.savings, 0)})`,
      detail: `권장 저축률을 맞추려면 매달 ${usd(Math.max(0, p.income * b.savings - (p.saving + p.surplus)))} 더 확보해야 합니다.`,
    });

  if (p.ratio.fixed > 0.6)
    out.push({
      level: "warning",
      title: `고정비가 수입의 ${pct(p.ratio.fixed)}`,
      detail: `변동지출로 조정할 수 있는 여지는 ${usd(p.variable)} (수입의 ${pct(p.ratio.flexibility)}) 뿐이라, 수입 변동에 취약합니다.`,
    });

  if (d.settings.emergencyFund > 0 && p.emergencyMonths < 3)
    out.push({
      level: "warning",
      title: `비상금 ${p.emergencyMonths.toFixed(1)}개월치`,
      detail: `필수지출+헌금 기준 3개월치(${usd((p.need + p.giving) * 3)}) 확보를 권장합니다.`,
    });

  if (s.hasData) {
    const over = s.rows.filter((r) => r.status === "over");
    for (const r of over.slice(0, 3))
      out.push({
        level: "critical",
        title: `${r.cat.name} 예산 초과 ${usd(-r.variance)}`,
        detail: `예산 ${usd(r.budget)} 중 ${usd(r.actual)} 사용 (${pct(r.used, 0)}).`,
      });
    const risk = s.rows.filter((r) => r.status === "risk");
    for (const r of risk.slice(0, 3))
      out.push({
        level: "warning",
        title: `${r.cat.name} 이 속도면 ${usd(r.projected)} 예상`,
        detail: `월 예산 ${usd(r.budget)} 대비 ${usd(r.projected - r.budget)} 초과 페이스입니다.`,
      });
    const bd = burnDown(d, month);
    if (bd.remainingDays > 0)
      out.push({
        level: "info",
        title: `남은 ${bd.remainingDays}일 동안 하루 ${usd(bd.dailyAllowance)}까지 사용 가능`,
        detail: `변동지출 예산 ${usd(bd.varBudget)} 중 ${usd(bd.varSpent)} 사용.`,
      });
    const an = anomalies(d, month);
    if (an.length)
      out.push({
        level: "info",
        title: `확인이 필요한 거래 ${an.length}건`,
        detail: an
          .slice(0, 3)
          .map((a) => `${a.txn.memo || "(메모 없음)"} ${usd(a.txn.amount)} — ${a.reason}`)
          .join(" · "),
      });
    const unc = s.rows.find((r) => r.cat.id === "uncategorized");
    if (unc && unc.actual > 0)
      out.push({ level: "info", title: `미분류 지출 ${usd(unc.actual)}`, detail: "분류하면 예산 대비 분석이 정확해집니다." });
  } else
    out.push({
      level: "info",
      title: "이번 달 거래가 아직 없어요",
      detail: "'고정지출 자동 입력'으로 월세·헌금 등을 한 번에 넣고, 변동지출을 기록하세요.",
    });

  const order = { critical: 0, warning: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
