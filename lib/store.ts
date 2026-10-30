"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppData } from "./types";
import { defaultData } from "./defaults";
import { todayISO } from "./format";

const KEY = "hf:data:v1";
const PASS_KEY = "hf:passcode";

export type SyncState = "local" | "syncing" | "cloud" | "error" | "unconfigured";

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
}

/** 예전 버전 데이터에 빠진 필드 채우기 */
export function migrate(raw: unknown): AppData {
  const base = defaultData();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AppData>;
  return {
    ...base,
    ...r,
    version: 1,
    settings: { ...base.settings, ...(r.settings ?? {}), benchmarks: { ...base.settings.benchmarks, ...(r.settings?.benchmarks ?? {}) } },
    budgetHistory: r.budgetHistory ?? {},
    categories: r.categories?.length ? r.categories : base.categories,
    incomes: r.incomes ?? base.incomes,
    transactions: r.transactions ?? [],
    goals: r.goals ?? [],
  };
}

/** 예산이 바뀌면, 이미 거래가 있는 지난 달들의 예산을 고정(스냅샷)해서 과거 분석이 바뀌지 않게 함 */
function snapshotBudgets(prev: AppData, next: AppData): AppData {
  const changed = prev.categories.some((c) => next.categories.find((n) => n.id === c.id)?.budget !== c.budget);
  if (!changed) return next;
  const cur = todayISO().slice(0, 7);
  const months = new Set(prev.transactions.map((t) => t.date.slice(0, 7)).filter((m) => m < cur));
  const old: Record<string, number> = {};
  for (const c of prev.categories) old[c.id] = c.budget;
  const hist = { ...next.budgetHistory };
  for (const m of months) if (!hist[m]) hist[m] = old;
  return { ...next, budgetHistory: hist };
}

async function cloud(method: "GET" | "PUT", pass: string, body?: AppData) {
  const res = await fetch("/api/data", {
    method,
    headers: { "x-passcode": pass, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 501) throw Object.assign(new Error("unconfigured"), { code: 501 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as { data: AppData | null };
}

export function useFinanceStore() {
  const [data, setData] = useState<AppData | null>(null);
  const [sync, setSync] = useState<SyncState>("local");
  const [passcode, setPasscodeState] = useState<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const passRef = useRef("");

  const pull = useCallback(async (pass: string, local: AppData) => {
    setSync("syncing");
    try {
      const { data: remote } = await cloud("GET", pass);
      if (remote && remote.updatedAt > local.updatedAt) {
        const m = migrate(remote);
        setData(m);
        safeSet(KEY, JSON.stringify(m));
      } else await cloud("PUT", pass, local);
      setSync("cloud");
    } catch (e) {
      setSync((e as { code?: number }).code === 501 ? "unconfigured" : "error");
    }
  }, []);

  useEffect(() => {
    let d: AppData;
    try {
      d = migrate(JSON.parse(safeGet(KEY) ?? "null"));
    } catch {
      d = defaultData();
    }
    setData(d);
    const p = safeGet(PASS_KEY) ?? "";
    passRef.current = p;
    setPasscodeState(p);
    if (p) pull(p, d);
  }, [pull]);

  const persist = useCallback((d: AppData) => {
    safeSet(KEY, JSON.stringify(d));
    if (!passRef.current) return;
    if (timer.current) clearTimeout(timer.current);
    setSync("syncing");
    timer.current = setTimeout(async () => {
      try {
        await cloud("PUT", passRef.current, d);
        setSync("cloud");
      } catch (e) {
        setSync((e as { code?: number }).code === 501 ? "unconfigured" : "error");
      }
    }, 800);
  }, []);

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      setData((prev) => {
        if (!prev) return prev;
        const next = snapshotBudgets(prev, { ...fn(prev), updatedAt: Date.now() });
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const replace = useCallback(
    (d: AppData) => {
      const m = { ...migrate(d), updatedAt: Date.now() };
      setData(m);
      persist(m);
    },
    [persist]
  );

  const setPasscode = useCallback(
    (p: string) => {
      passRef.current = p;
      setPasscodeState(p);
      safeSet(PASS_KEY, p || null);
      if (p && data) pull(p, data);
      else setSync("local");
    },
    [data, pull]
  );

  return { data, update, replace, sync, passcode, setPasscode };
}
export type Store = ReturnType<typeof useFinanceStore>;
