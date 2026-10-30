import type { AppData, Category } from "./types";

export const UNCATEGORIZED = "uncategorized";

export const GROUPS = [
  "주거",
  "헌금·기부",
  "공과금·통신",
  "교통·차량",
  "생활비",
  "건강·미용",
  "경조·회비",
  "용돈",
  "저축",
  "기타",
] as const;

const c = (
  id: string,
  name: string,
  group: string,
  kind: Category["kind"],
  bucket: Category["bucket"],
  budget: number,
  extra: Partial<Category> = {}
): Category => ({ id, name, group, kind, bucket, budget, ...extra });

export const DEFAULT_CATEGORIES: Category[] = [
  c("rent", "월세", "주거", "fixed", "need", 1651, { dueDay: 1 }),
  c("tithe", "헌금", "헌금·기부", "fixed", "giving", 550),
  c("union", "연합관", "헌금·기부", "fixed", "giving", 100),
  c("utilities", "전기·수도·쓰레기", "공과금·통신", "fixed", "need", 150),
  c("internet", "인터넷", "공과금·통신", "fixed", "need", 30),
  c("carins", "자동차 보험", "교통·차량", "fixed", "need", 100),
  c("gas", "기름값", "교통·차량", "variable", "need", 100),
  c("events", "경조사비", "경조·회비", "variable", "want", 100),
  c("allow-hs", "용돈 (현성)", "용돈", "fixed", "want", 50, { payer: "현성" }),
  c("allow-sy", "용돈 (세연)", "용돈", "fixed", "want", 50, { payer: "세연" }),
  c("beauty", "헤어·뷰티", "건강·미용", "variable", "want", 50),
  c("medical", "병원", "건강·미용", "variable", "need", 50),
  c("dues", "수련회비·각종 회비", "경조·회비", "variable", "want", 50),
  c("saving", "저축", "저축", "saving", "saving", 100),
  c("living", "생활비 (식비·생활용품)", "생활비", "variable", "need", 500),
  c(UNCATEGORIZED, "미분류", "기타", "variable", "want", 0),
];

export function defaultData(): AppData {
  return {
    version: 1,
    updatedAt: Date.now(),
    incomes: [{ id: "salary", name: "월 수입 (급여)", amount: 3500, payer: "공동" }],
    categories: DEFAULT_CATEGORIES.map((x) => ({ ...x })),
    transactions: [],
    goals: [
      { id: "efund", name: "비상금 (3개월 생활비)", target: 10000, saved: 0, deadline: "2027-12" },
    ],
    settings: {
      people: ["현성", "세연"],
      emergencyFund: 0,
      currency: "USD",
      benchmarks: { housing: 0.3, savings: 0.2, needs: 0.5, wants: 0.3 },
    },
    budgetHistory: {},
  };
}

/** 엑셀 '종류' 값 → 카테고리 매핑 */
export const EXCEL_CATEGORY_MAP: Record<string, string> = {
  헌금: "tithe",
  "식비-외식비": "living",
  "식비-음료/간식": "living",
  "식비-식자재": "living",
  생활용품: "living",
  학교용품: "living",
  통신비: "internet",
  "의복미용-의류잡화": "living",
  "의복미용-헤어뷰티": "beauty",
  "건강문화-운동취미": UNCATEGORIZED,
  "건강문화-문화생활": UNCATEGORIZED,
  "건강문화-병원/약": "medical",
  "건강문화-멤버쉽": "dues",
  "차량교통-주유,세차비": "gas",
  "경조회비-경조사비": "events",
  "경조회비-모임회비/선물": "dues",
  "금융지출-차보험": "carins",
  "금융지출-집세": "rent",
  "금융지출-전기세": "utilities",
  "금융지출-수도세": "utilities",
  "금융지출-쓰레기": "utilities",
};

export const KIND_LABEL = { fixed: "고정", variable: "변동", saving: "저축" } as const;
export const BUCKET_LABEL = { need: "필수", want: "선택", giving: "헌금·기부", saving: "저축" } as const;
