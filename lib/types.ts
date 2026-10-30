/** 지출 성격: 고정(매달 같은 금액) / 변동(쓰는 만큼) / 저축(자산으로 이동) */
export type Kind = "fixed" | "variable" | "saving";
/** 50/30/20 분석용 버킷 */
export type Bucket = "need" | "want" | "giving" | "saving";
export type Payer = string; // 예: "현성" | "세연" | "공동"

export interface Category {
  id: string;
  name: string;
  group: string;
  kind: Kind;
  bucket: Bucket;
  budget: number; // 월 예산 (USD)
  dueDay?: number; // 고정지출 납부일 (1~31)
  payer?: Payer; // 기본 결제자
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number; // 월 예상 수입
  payer?: Payer;
}

export interface Txn {
  id: string;
  date: string; // YYYY-MM-DD
  type: "income" | "expense";
  amount: number; // 항상 양수
  categoryId?: string; // expense 일 때
  incomeId?: string; // income 일 때
  memo: string;
  payer: Payer;
  account?: string;
  auto?: boolean; // 고정지출 자동생성 여부
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline: string; // YYYY-MM
}

export interface Settings {
  people: string[]; // ["현성","세연"]
  emergencyFund: number; // 현재 비상금/예금 잔액
  currency: string; // "USD"
  benchmarks: {
    housing: number; // 주거비/수입 권장 상한 (0.3)
    savings: number; // 저축률 권장 하한 (0.2)
    needs: number; // 50
    wants: number; // 30
  };
}

export interface AppData {
  version: 1;
  updatedAt: number;
  incomes: IncomeSource[];
  categories: Category[];
  transactions: Txn[];
  goals: Goal[];
  settings: Settings;
  /** 월별 예산 스냅샷: 예산을 바꿔도 과거 달의 예산 대비 분석이 유지되도록 */
  budgetHistory: Record<string, Record<string, number>>;
}
