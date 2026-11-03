"use client";
import { DataProvider, useData } from "@/lib/data-context";
import { useEffect, useState, useCallback, useRef } from "react";
import { heavyPlan, HEAVY_V } from "@/lib/builder";
import { supabase, spNow, toMin, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, SUPPLIES, PREP, stockLeft, effectiveNow, weekday, mealTime, mealIsDone } from "@/lib/plan";
import dynamic from "next/dynamic";
import { EMPTY, score, buzz, Icon, Ring, Confetti, parseBio } from "@/components/shared";
import { Today, SwapSheet } from "@/components/today";

const Progress = dynamic(() => import("@/components/progress").then((m) => m.Progress), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const Plan = dynamic(() => import("@/components/plan").then((m) => m.Plan), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const Shopping = dynamic(() => import("@/components/plan").then((m) => m.Shopping), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const TrainTab = dynamic(() => import("@/components/train").then((m) => m.TrainTab), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const ExLibrary = dynamic(() => import("@/components/exercises").then((m) => m.ExLibrary), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const DayPlanner = dynamic(() => import("@/components/train").then((m) => m.DayPlanner), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const HealthTab = dynamic(() => import("@/components/health").then((m) => m.HealthTab), { ssr: false, loading: () => <p role="status">Carregando…</p> });

function Home() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="wrap"><p className="tag">Carregando…</p></div>;
  if (!session) return <Login />;
  return <DataProvider key={session.user.id} uid={session.user.id}><App uid={session.user.id} /></DataProvider>;
}

function Login() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [msg, setMsg] = useState("");
  async function go() {
    setMsg("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    setMsg(error ? "Não consegui entrar. Confira seu e-mail e senha." : "");
  }
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <h1>Protocolo Victor</h1>
      <div className="card">
        <input id="email" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input id="pass" type="password" placeholder="Senha" value={pass} onChange={(e) => setPass(e.target.value)} />
        <div className="row"><button className="pri" onClick={go}>Entrar</button></div>
        {msg && <p className="tag">{msg}</p>}
      </div>
    </div>
  );
}

function App({ uid }) {
  const [tab, setTab] = useState("hoje");
  const [today, setToday] = useState(spNow().day);
  const [nowMin, setNow] = useState(spNow().min);
  const [viewDay, setViewDay] = useState(null);
  const { week, settings, status, error: storageError, refresh, saveDay, saveSettings: persistSettings, current } = useData();
  const offline = status === "pending";
  const [swapFor, setSwapFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [party, setParty] = useState(false);

  const [planSub, setPlanSub] = useState(null);
  const shortcutHandled = useRef(false);
  const tick = () => { const e = effectiveNow(spNow(), current().settings.times || {}, addDays); setToday(e.day); setNow(e.min); return e; };
  const load = useCallback(async () => {
    await refresh();
    const e = tick();
    if (shortcutHandled.current || !location.search) return;
    shortcutHandled.current = true;
    const map = current().week, st = current().settings;
    try {
    // atalho "Tomei os suplementos": ?sup=1 marca os suplementos de até 60 min à frente
    if (new URLSearchParams(location.search).get("sup")) {
      const cur = map[e.day] || EMPTY, c = { ...(cur.checks || {}) }, T2 = st?.times || {}; let n = 0;
      MEALS.forEach((m) => { if (m.workout || toMin(mealTime(m, T2, e.day)) > e.min + 60) return; m.items.forEach((it, i) => { if (it.sup && !c[`${m.id}-${i}`]) { c[`${m.id}-${i}`] = true; n++; } }); });
      await saveDay(e.day, { checks: c });
      history.replaceState(null, "", "/"); setToast(n ? `${n} suplemento(s) marcado(s)` : "Nenhum suplemento pendente agora"); setTimeout(() => setToast(null), 2500);
    }
    // atalho da Siri: ?agua=250
    const q = new URLSearchParams(location.search).get("agua");
    if (q && +q > 0) {
      const cur = current().week[e.day] || EMPTY;
      if (Number.isFinite(+q) && +q <= 5000) await saveDay(e.day, { water_ml: (cur.water_ml || 0) + +q });
      history.replaceState(null, "", "/"); setToast(`+${q} ml de água`); setTimeout(() => setToast(null), 2500);
    }
    // Apple Watch (atalho do app Saúde): ?ativa=520&repouso=1700&passos=8400
    { const q2 = new URLSearchParams(location.search), num = (k) => { const m = String(q2.get(k) || "").replace(/\./g, "").replace(",", ".").match(/\d+(\.\d+)?/); return m ? Math.round(+m[0]) : 0; };
      const ativa = num("ativa"), repouso = num("repouso"), passos = num("passos");
      const dec = (k) => { const m = String(q2.get(k) || "").replace(",", ".").match(/\d+(\.\d+)?/); return m ? Math.round(+m[0] * 10) / 10 : undefined; };
      const extra = Object.fromEntries(["dist", "exerc", "andares", "fc", "vfc", "vo2", "spo2", "sono", "resp", "pe"].map((k) => [k, dec(k)]).filter(([, v]) => v != null && v > 0));
      if (extra.spo2 && extra.spo2 <= 1) extra.spo2 = Math.round(extra.spo2 * 1000) / 10;
      if (ativa || passos || Object.keys(extra).length) {
        const dd = q2.get("dia") === "ontem" ? addDays(e.day, -1) : e.day;
        const cur = map[dd] || EMPTY, nx = { ...cur, checks: { ...(cur.checks || {}), _burn: { ...(cur.checks?._burn || {}), ...(ativa ? { ativa } : {}), ...(repouso ? { repouso } : {}), ...(passos ? { passos } : {}), ...extra, at: new Date().toISOString() } } };
        await saveDay(dd, { checks: nx.checks });
        history.replaceState(null, "", "/"); setToast(`Watch: ${ativa} kcal ativas${passos ? ` · ${passos.toLocaleString("pt-BR")} passos` : ""}`); setTimeout(() => setToast(null), 3500);
      } }
    // balança (atalho do app Saúde): ?peso=72.4&gordura=18.2&magra=59.1...
    const bio = parseBio(location.search);
    if (bio) {
      const cur = map[e.day] || EMPTY;
      const nx = { ...cur, checks: { ...(cur.checks || {}), _bio: { ...(cur.checks?._bio || {}), ...bio } } };
      await saveDay(e.day, { checks: nx.checks });
      if (bio.peso) await saveWeight(e.day, bio.peso);
      history.replaceState(null, "", "/");
      setToast(`Balança importada: ${bio.peso ? String(bio.peso).replace(".", ",") + " kg" : ""}${bio.gordura ? ` · ${String(bio.gordura).replace(".", ",")}% gordura` : ""}`); setTimeout(() => setToast(null), 3500);
    }
    } catch { shortcutHandled.current = false; say("Não consegui guardar o atalho. Tente novamente."); }
  }, [uid]);
  const day = viewDay || today;
  const now = viewDay ? 24 * 60 : nowMin;
  const log = week[day] || EMPTY;
  const { saveWeight } = useData();
  useEffect(() => {
    load();
    const f = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", f);
    const on = () => tick(); window.addEventListener("online", on);
    const t = setInterval(tick, 30000);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("online", on); clearInterval(t); };
  }, [load]);

  function say(msg) { setToast(msg); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2200); }

  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  function saveLog(patch) {
    const d = day, cur = current().week[d] || EMPTY;
    const next = { ...cur, ...patch };
    if (patch.checks) next.checks = clean({ ...(cur.checks || {}), ...patch.checks });
    if (patch.swaps) next.swaps = clean({ ...(cur.swaps || {}), ...patch.swaps });

    if (patch.checks) {
      const m = MEALS.find((m) => !mealIsDone(cur, m) && mealIsDone(next, m));
      if (m) {
        buzz(40); say(`${m.name} completo`);
        const prep = settings.supplies?._prep || {}, used = next.checks._prepUsed || {};
        const p = PREP.find((x) => x.meals.includes(m.id));
        if (p && !used[m.id] && !next.checks._out?.[m.id] && (prep[p.id] || 0) > 0 && d === today) {
          next.checks = { ...next.checks, _prepUsed: { ...used, [m.id]: true } };
          patch = { ...patch, checks: { ...patch.checks, _prepUsed: next.checks._prepUsed } };
          saveSettings({ supplies: { ...settings.supplies, _prep: { ...prep, [p.id]: prep[p.id] - 1 } } });
        }
      }
    }
    if (score(cur) < 100 && score(next) === 100) { setParty(true); setTimeout(() => setParty(false), 3500); }
    return saveDay(d, patch, log).catch(() => { say("Não consegui guardar a alteração. Tente novamente."); return { error: true }; });
  }
  function saveSettings(patch) {
    return persistSettings(patch, settings).catch(() => { say("Não consegui guardar a alteração. Tente novamente."); return { error: true }; });
  }

  // aplica uma vez o plano pesado da avaliação de 03/11
  useEffect(() => {
    if (!settings || !settings.user_id || offline) return;
    if ((settings.supplies?._planV || 0) >= HEAVY_V) return;
    const custom = settings.supplies?._workouts?.length;
    saveSettings({ supplies: { ...(settings.supplies || {}), _workouts: custom ? settings.supplies._workouts : heavyPlan(), _planV: HEAVY_V }, ...(custom ? {} : { times: { ...(settings.times || {}), divs: 5, next: Math.max(0, (weekday(spNow().day) + 6) % 7) % 5 } }) });
  }, [settings?.user_id, settings?.supplies?._planV, offline]);
  const s = score(log);
  const shopCount = (settings.supplies?._shop || []).length;
  async function addShop(name) {
    const list = settings.supplies?._shop || [];
    if (list.some((x) => x.toLowerCase() === name.toLowerCase())) { say("Já está na lista"); return; }
    await saveSettings({ supplies: { ...settings.supplies, _shop: [...list, name] } }); buzz(); say(`${name} na lista de compras`);
  }
  // estoque baixo entra sozinho na lista de compras
  useEffect(() => {
    const list = settings.supplies?._shop || [], stock = settings.supplies?._stock || {}, added = [];
    SUPPLIES.forEach((s) => { const r = stockLeft(s, stock[s.id], today); if (r && r.days <= 5 && !list.includes(s.shop) && stock[s.id]?.auto !== today) added.push(s); });
    if (added.length) {
      const st2 = { ...stock }; added.forEach((s) => { st2[s.id] = { ...st2[s.id], auto: today }; });
      saveSettings({ supplies: { ...settings.supplies, _shop: [...list, ...added.map((s) => s.shop)], _stock: st2 } });
    }
  }, [settings.supplies, today]); // eslint-disable-line
  return (
    <div className="wrap">
      <header className="top">
        <Ring pct={s} />
        <div style={{ minWidth: 0 }}>
          <div className="daynav">
            <button aria-label="Dia anterior" onClick={() => setViewDay(addDays(day, -1) < addDays(today, -6) ? day : addDays(day, -1))}>‹</button>
            <span className="lbl">{fmtDay(day, { weekday: "long", day: "2-digit", month: "long" })}</span>
            {viewDay && <button aria-label="Próximo dia" onClick={() => { const n = addDays(day, 1); setViewDay(n >= today ? null : n); }}>›</button>}
          </div>
          <h1>Protocolo Victor</h1>
          <div className="tag">{s === 100 ? "Dia 100% cumprido" : `Dia ${Math.max(1, Math.round((new Date(day + "T12:00:00Z") - new Date((settings.times?.start || "2026-10-09") + "T12:00:00Z")) / 864e5) + 1)} do protocolo · ~1.990 kcal · 199 g PTN`}</div>
        </div>
      </header>

      {storageError ? <div className="offline" role="alert">{storageError}</div> :
        <div className="sync-status" role="status">{status === "pending" ? "Alterações no celular aguardando sincronização. Fotos precisam de conexão." : status === "saving" ? "Sincronizando…" : "Dados sincronizados"}</div>}
      {viewDay && tab === "hoje" && <div className="card editing"><span>Editando <b>{fmtDay(day, { weekday: "long", day: "2-digit", month: "2-digit" })}</b></span><button className="sm pri" onClick={() => setViewDay(null)}>Voltar para hoje</button></div>}
      {tab === "hoje" && <Today {...{ uid, log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }} />}
      {tab === "prog" && <Progress {...{ uid, week, day, settings, saveLog }} />}
      {tab === "treino" && <TrainTab {...{ log, saveLog, settings, saveSettings, week, day }} />}
      {tab === "exer" && <><DayPlanner {...{ settings, saveSettings, log, saveLog, day, say }} /><ExLibrary {...{ settings, saveSettings }} /></>}
      {tab === "saude" && <HealthTab {...{ week, day, uid, saveLog, say }} />}
      {tab === "compras" && <Shopping {...{ settings, saveSettings, say }} />}
      {tab === "plano" && <>
        <div className="seg">{[["plano", "Plano"], ["compras", `Compras${shopCount ? ` (${shopCount})` : ""}`]].map(([k, l]) => <button key={k} className={(planSub || "plano") === k ? "on" : ""} onClick={() => setPlanSub(k)}>{l}</button>)}</div>
        {(planSub || "plano") === "plano" ? <Plan {...{ uid, settings, saveSettings, today, say }} /> : <Shopping {...{ settings, saveSettings, say }} />}
      </>}

      {swapFor && <SwapSheet {...swapFor} addShop={addShop} current={log.swaps?.[swapFor.key]} onClose={() => setSwapFor(null)}
        onPick={(v) => { saveLog({ swaps: { [swapFor.key]: v || undefined } }); setSwapFor(null); say(v ? "Alimento trocado" : "Voltou ao original"); }} />}

      {toast && <div className="toast" role="status">{toast}</div>}
      {party && <Confetti />}

      <nav>
        {[["hoje", "Hoje", "today"], ["treino", "Treino", "dumbbell"], ["exer", "Exercícios", "search"], ["saude", "Saúde", "heart"], ["prog", "Progresso", "prog"], ["plano", "Plano", "plan"]].map(([k, l, ic]) =>
          <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); scrollTo(0, 0); }}>
            <span className="nav-ic"><Icon n={ic} s={22} />{k === "plano" && shopCount > 0 && <i className="badge">{shopCount}</i>}</span><span>{l}</span></button>)}
      </nav>
    </div>
  );
}

export { Home, Login, App };
