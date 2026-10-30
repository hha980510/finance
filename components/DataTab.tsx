"use client";
import { useRef, useState } from "react";
import type { TabProps } from "./types";
import { defaultData } from "@/lib/defaults";
import { download, exportReport, importLegacyExcel, transactionsCSV } from "@/lib/io";
import { migrate } from "@/lib/store";
import { usd } from "@/lib/format";
import { Card } from "./ui";

export default function DataTab({ d, store, month }: TabProps) {
  const xl = useRef<HTMLInputElement>(null);
  const js = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [pass, setPass] = useState(store.passcode);
  const [busy, setBusy] = useState(false);

  const onExcel = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const r = await importLegacyExcel(f, d);
      if (!r.fresh.length) setMsg(`새로 가져올 거래가 없어요 (중복 ${r.skipped}건 건너뜀).`);
      else if (confirm(`${r.fresh.length}건 (지출 ${usd(r.fresh.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0), 2)})을 가져올까요?`)) {
        store.update((x) => ({ ...x, transactions: [...x.transactions, ...r.fresh] }));
        setMsg(`${r.fresh.length}건을 가져왔어요. 중복 ${r.skipped}건 건너뜀.${r.unmapped.length ? ` 매핑 안 된 종류(미분류 처리): ${r.unmapped.join(", ")}` : ""} 보증금 같은 일회성 지출은 ‘미분류’로 들어가니 거래내역에서 확인하세요.`);
      }
    } catch (e) {
      setMsg("엑셀을 읽지 못했어요: " + (e as Error).message);
    } finally {
      setBusy(false);
      if (xl.current) xl.current.value = "";
    }
  };
  const onJSON = async (f?: File) => {
    if (!f) return;
    try {
      const data = migrate(JSON.parse(await f.text()));
      if (confirm(`백업(거래 ${data.transactions.length}건)으로 현재 데이터를 덮어쓸까요?`)) {
        store.replace(data);
        setMsg("백업을 복원했어요.");
      }
    } catch {
      setMsg("올바른 백업 파일이 아니에요.");
    }
    if (js.current) js.current.value = "";
  };

  const people = d.settings.people;
  const b = d.settings.benchmarks;
  const setB = (k: keyof typeof b, v: number) => store.update((x) => ({ ...x, settings: { ...x.settings, benchmarks: { ...x.settings.benchmarks, [k]: v } } }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {msg && <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm lg:col-span-2">{msg}</div>}

      <Card title="가져오기" sub="기존 ‘현성 세연 가계부’ 엑셀(월별 시트) 형식을 그대로 읽습니다. 같은 거래는 중복으로 들어가지 않아요.">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={() => xl.current?.click()}>{busy ? "읽는 중…" : "엑셀 가계부 가져오기 (.xlsx)"}</button>
          <button className="btn" onClick={() => js.current?.click()}>백업 복원 (.json)</button>
          <input ref={xl} type="file" accept=".xlsx" hidden onChange={(e) => onExcel(e.target.files?.[0])} />
          <input ref={js} type="file" accept=".json,application/json" hidden onChange={(e) => onJSON(e.target.files?.[0])} />
        </div>
      </Card>

      <Card title="내보내기" sub="분석 리포트는 요약·예산대비실적(수식 포함)·거래내역 3개 시트로 만들어집니다.">
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => exportReport(d, month)}>분석 리포트 (.xlsx)</button>
          <button className="btn" onClick={() => download("거래내역_전체.csv", transactionsCSV(d), "text/csv;charset=utf-8")}>전체 거래 CSV</button>
          <button className="btn" onClick={() => download(`가계부_백업_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(d, null, 2), "application/json")}>전체 백업 (.json)</button>
        </div>
      </Card>

      <Card title="클라우드 동기화 (선택)" sub="기본은 이 브라우저에만 저장돼요. 두 사람이 폰·PC에서 같이 보려면 Vercel에 Upstash Redis를 연결하고 APP_PASSCODE를 설정한 뒤, 여기 같은 비밀번호를 입력하세요.">
        <div className="flex gap-2">
          <input type="password" className="field" placeholder="APP_PASSCODE" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="btn btn-primary" onClick={() => store.setPasscode(pass)}>연결</button>
          {store.passcode && <button className="btn" onClick={() => { setPass(""); store.setPasscode(""); }}>해제</button>}
        </div>
        <p className="mt-2 text-xs text-muted">
          상태: {store.sync === "cloud" ? "동기화됨" : store.sync === "unconfigured" ? "서버에 Redis/비밀번호 환경변수가 없어요" : store.sync === "error" ? "오류 (비밀번호 확인)" : store.sync === "syncing" ? "동기화 중" : "로컬 저장"}
        </p>
      </Card>

      <Card title="설정">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {people.map((p, i) => (
            <label key={i} className="text-xs text-muted">구성원 {i + 1}
              <input className="field text-sm" value={p} onChange={(e) => store.update((x) => ({ ...x, settings: { ...x.settings, people: x.settings.people.map((y, j) => (j === i ? e.target.value : y)) } }))} />
            </label>
          ))}
          <label className="text-xs text-muted">주거비 권장 상한 (%)<input type="number" className="field tnum text-sm" value={Math.round(b.housing * 100)} onChange={(e) => setB("housing", Number(e.target.value) / 100)} /></label>
          <label className="text-xs text-muted">저축률 권장 하한 (%)<input type="number" className="field tnum text-sm" value={Math.round(b.savings * 100)} onChange={(e) => setB("savings", Number(e.target.value) / 100)} /></label>
          <label className="text-xs text-muted">필수지출 기준 (%)<input type="number" className="field tnum text-sm" value={Math.round(b.needs * 100)} onChange={(e) => setB("needs", Number(e.target.value) / 100)} /></label>
          <label className="text-xs text-muted">선택지출 기준 (%)<input type="number" className="field tnum text-sm" value={Math.round(b.wants * 100)} onChange={(e) => setB("wants", Number(e.target.value) / 100)} /></label>
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <button className="btn btn-danger" onClick={() => confirm("모든 데이터를 지우고 처음 예산으로 되돌릴까요? (먼저 백업을 권장해요)") && store.replace(defaultData())}>전체 초기화</button>
        </div>
      </Card>
    </div>
  );
}
