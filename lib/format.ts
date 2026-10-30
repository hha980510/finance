export const usd = (n: number, digits = 0) =>
  (n < 0 ? "-" : "") +
  "$" +
  Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const usd2 = (n: number) => usd(n, 2);
export const pct = (n: number, digits = 1) => (isFinite(n) ? (n * 100).toFixed(digits) + "%" : "–");
export const signed = (n: number) => (n > 0 ? "+" : "") + usd(n);

export const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const todayISO = () => {
  const d = new Date();
  return `${ym(d)}-${String(d.getDate()).padStart(2, "0")}`;
};
export const ymLabel = (s: string) => {
  const [y, m] = s.split("-");
  return `${y}년 ${Number(m)}월`;
};
export const ymShort = (s: string) => `${s.slice(2, 4)}.${s.slice(5)}`;
export const addMonths = (s: string, n: number) => {
  const [y, m] = s.split("-").map(Number);
  return ym(new Date(y, m - 1 + n, 1));
};
export const daysInMonth = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
