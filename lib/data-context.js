"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase, spNow, addDays } from "@/lib/supabase";
import { createSyncStore } from "@/lib/sync-store.mjs";

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

export function DataProvider({ uid, children }) {
  const store = useRef(null), loading = useRef(null), alive = useRef(false);
  const [data, setData] = useState(null), [status, setStatus] = useState("loading"), [error, setError] = useState("");
  const publish = (s) => { if (alive.current) setData({ ...s }); };
  const sync = useCallback(async () => {
    if (!store.current) return;
    try {
      if (alive.current) setStatus("saving");
      await store.current.flush();
      if (alive.current) { setStatus("synced"); setError(""); }
      return true;
    } catch {
      if (alive.current) setStatus("pending");
      return false;
    }
  }, []);
  const refresh = useCallback(() => {
    if (loading.current) return loading.current;
    loading.current = (async () => {
      if (!(await sync())) return;
      const revision = store.current.snapshot().revision;
      const results = await Promise.all([
        supabase.from("settings").select("*").eq("user_id", uid).maybeSingle(),
        supabase.from("day_logs").select("*").eq("user_id", uid).gte("day", addDays(spNow().day, -120)),
        supabase.from("weights").select("*").eq("user_id", uid).order("day").order("id"),
      ]);
      if (results.some((r) => r.error)) throw new Error("Não consegui atualizar os dados da nuvem.");
      if (!alive.current) return;
      const [settings, logs, weights] = results.map((r) => r.data);
      store.current.hydrate({ settings: settings || { times: {}, supplies: {}, update_date: null }, week: Object.fromEntries((logs || []).map((l) => [l.day, l])), weights: weights || [] }, revision);
      if (!store.current.snapshot().queue.length) setStatus("synced");
    })().catch(() => { if (alive.current) setStatus("pending"); }).finally(() => { loading.current = null; });
    return loading.current;
  }, [uid, sync]);
  useEffect(() => {
    alive.current = true;
    try {
      if (!store.current) store.current = createSyncStore({ uid, storage: localStorage, onChange: publish,
        send: (op) => supabase.rpc("apply_sync_operation", { p_id: op.id, p_kind: op.kind, p_day: op.day || null, p_patch: op.patch }),
      });
      publish(store.current.snapshot()); refresh();
    } catch { setError("O armazenamento do celular não está disponível. Libere espaço para salvar com segurança."); setStatus("error"); }
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    const online = () => refresh();
    window.addEventListener("online", online); document.addEventListener("visibilitychange", visible);
    const retry = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
    return () => { alive.current = false; clearInterval(retry); window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visible); };
  }, [uid, refresh]);
  const save = (method, ...args) => {
    try { const result = store.current[method](...args); setError(""); sync(); return Promise.resolve(result); }
    catch (e) { setError(e.message || "Não consegui salvar no celular. Libere espaço e tente de novo."); return Promise.reject(e); }
  };
  if (!data) return <div className="wrap"><p role="status">{error || "Carregando seus dados…"}</p></div>;
  return <DataContext.Provider value={{ ...data, status, error, refresh,
    saveDay: (...args) => save("saveDay", ...args), saveSettings: (...args) => save("saveSettings", ...args), saveWeight: (...args) => save("saveWeight", ...args),
    current: () => store.current.snapshot(),
  }}>{children}</DataContext.Provider>;
}
