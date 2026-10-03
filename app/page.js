"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { RECIPES } from "@/lib/recipes";
import { WORKOUTS } from "@/lib/workouts";
import { PHOTO_TYPES, listDaily, saveDaily } from "@/lib/photos";
import { supabase, spNow, toMin, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, GROUPS, RULES, SUPPLIES, WATER_GOAL, START_WEIGHT, LETTERS, CAFFEINE, CAFFEINE_MAX, WEEKDAYS, PREWORKOUT, PREP, EAT_OUT, PALM, WEEK_BASIC, stockLeft, effectiveNow, weekday, mealTime, trainTime, itemDone, mealIsDone, dayScore, replaceSuggestion, weekShop, fmtQty } from "@/lib/plan";

const EMPTY = { checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null };
const CUP = 250, CUPS = Math.ceil(WATER_GOAL / CUP);
const MFIT_URL = "https://www.mfitpersonal.com.br";

const score = dayScore;
const fmtPortion = (p, measure) => p === 1 ? measure : p === 0.5 ? `½ de ${measure}` : `${p}× ${measure}`;
const b64ToU8 = (b) => { const p = "=".repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
const safe = (q) => Promise.resolve(q).catch(() => ({ error: 1 }));
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const buzz = (ms = 15) => { try { navigator.vibrate?.(ms); } catch {} };
const fmtHM = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fmtDur = (min) => { const a = Math.abs(min); return a < 60 ? `${a} min` : `${Math.floor(a / 60)}h${a % 60 ? String(a % 60).padStart(2, "0") : ""}`; };
const mealDone = (m, checks) => m.items.every((_, i) => checks[`${m.id}-${i}`]);

/* ---------- ícones ---------- */
const I = {
  today: <path d="M4 5h16v15H4zM4 9h16M9 3v4M15 3v4" />,
  prog: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  swap: <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" />,
  plan: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />,
  check: <path d="m5 12 5 5 9-10" />,
  dumbbell: <path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" />,
  camera: <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  cart: <path d="M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M17 20h.01" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};
const Icon = ({ n, s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>;

export default function Home() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="wrap"><p className="tag">Carregando…</p></div>;
  if (!session) return <Login />;
  return <App uid={session.user.id} />;
}

function Login() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState(""); const [msg, setMsg] = useState("");
  async function go(signup) {
    setMsg("");
    const fn = signup ? supabase.auth.signUp : supabase.auth.signInWithPassword;
    const { error } = await fn.call(supabase.auth, { email, password: pass });
    setMsg(error ? error.message : signup ? "Conta criada." : "");
  }
  return (
    <div className="wrap" style={{ paddingTop: 40 }}>
      <h1>Protocolo Victor</h1>
      <div className="card">
        <input id="email" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input id="pass" type="password" placeholder="Senha" value={pass} onChange={(e) => setPass(e.target.value)} />
        <div className="row"><button className="pri" onClick={() => go(false)}>Entrar</button><button onClick={() => go(true)}>Criar conta</button></div>
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
  const [log, setLog] = useState(EMPTY);
  const [week, setWeek] = useState({});
  const [settings, setSettings] = useState({ times: {}, update_date: null, supplies: {} });
  const [swapFor, setSwapFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [party, setParty] = useState(false);

  const timesRef = useRef({});
  const weekRef = useRef({});
  const pending = useRef(0);
  const chain = useRef(Promise.resolve());
  const setWeekBoth = (m) => { weekRef.current = m; setWeek(m); lsSet(`pv_week_${uid}`, m); };
  const outbox = () => lsGet(`pv_out_${uid}`, []);
  const setOutbox = (l) => lsSet(`pv_out_${uid}`, l);
  const [offline, setOffline] = useState(false);
  async function pushDay(d) {
    const l = weekRef.current[d]; if (!l) return true;
    const { error } = await safe(supabase.from("day_logs").upsert({ user_id: uid, day: d, checks: l.checks || {}, swaps: l.swaps || {}, water_ml: l.water_ml || 0, free_meal: !!l.free_meal, workout_at: l.workout_at || null, updated_at: new Date().toISOString() }));
    return !error;
  }
  async function flush() {
    const days = outbox(); if (!days.length && !lsGet(`pv_setdirty_${uid}`, false)) return;
    pending.current++;
    try {
      const left = [];
      for (const d of days) if (!(await pushDay(d).catch(() => false))) left.push(d);
      if (lsGet(`pv_setdirty_${uid}`, false)) {
        const st = lsGet(`pv_set_${uid}`, null);
        if (st) { const { error } = await safe(supabase.from("settings").upsert({ user_id: uid, times: st.times, update_date: st.update_date, supplies: st.supplies })); if (!error) lsSet(`pv_setdirty_${uid}`, false); else left.push("_set"); }
      }
      setOutbox(left.filter((x) => x !== "_set")); setOffline(left.length > 0);
    } finally { pending.current--; }
  }
  const tick = () => { const e = effectiveNow(spNow(), timesRef.current, addDays); setToday(e.day); setNow(e.min); return e; };
  const load = useCallback(async () => {
    if (!Object.keys(weekRef.current).length) {
      const cw = lsGet(`pv_week_${uid}`, null), cs = lsGet(`pv_set_${uid}`, null);
      if (cs) { setSettings(cs); timesRef.current = cs.times || {}; }
      if (cw) { weekRef.current = cw; setWeek(cw); }
      tick();
    }
    await flush();
    if (outbox().length || lsGet(`pv_setdirty_${uid}`, false)) { setOffline(true); return; } // ainda offline: fica com o que está no celular
    const { data: st, error: e1 } = await safe(supabase.from("settings").select("*").eq("user_id", uid).maybeSingle());
    if (e1) { setOffline(true); return; }
    setOffline(false);
    if (st) lsSet(`pv_set_${uid}`, st);
    if (st) { setSettings(st); timesRef.current = st.times || {}; }
    const e = tick();
    const { data: logs, error: e2 } = await safe(supabase.from("day_logs").select("*").eq("user_id", uid).gte("day", addDays(e.day, -119)));
    if (e2) { setOffline(true); return; }
    if (pending.current > 0) return; // não sobrescreve o que ainda está salvando
    const map = Object.fromEntries((logs || []).map((l) => [l.day, l]));
    setWeekBoth(map);
    // atalho da Siri: ?agua=250
    const q = new URLSearchParams(location.search).get("agua");
    if (q && +q > 0) {
      const cur = map[e.day] || EMPTY, nx = { ...cur, water_ml: (cur.water_ml || 0) + +q };
      map[e.day] = nx; setWeekBoth({ ...map });
      await supabase.from("day_logs").upsert({ user_id: uid, day: e.day, checks: nx.checks || {}, swaps: nx.swaps || {}, water_ml: nx.water_ml, free_meal: !!nx.free_meal, workout_at: nx.workout_at || null });
      history.replaceState(null, "", "/"); setToast(`+${q} ml de água`); setTimeout(() => setToast(null), 2500);
    }
    // balança (atalho do app Saúde): ?peso=72.4&gordura=18.2&magra=59.1...
    const bio = parseBio(location.search);
    if (bio) {
      const cur = map[e.day] || EMPTY;
      const nx = { ...cur, checks: { ...(cur.checks || {}), _bio: { ...(cur.checks?._bio || {}), ...bio } } };
      map[e.day] = nx; setWeekBoth({ ...map });
      await supabase.from("day_logs").upsert({ user_id: uid, day: e.day, checks: nx.checks, swaps: nx.swaps || {}, water_ml: nx.water_ml || 0, free_meal: !!nx.free_meal, workout_at: nx.workout_at || null });
      if (bio.peso) {
        await supabase.from("weights").delete().eq("user_id", uid).eq("day", e.day);
        await supabase.from("weights").insert({ user_id: uid, day: e.day, kg: bio.peso });
      }
      history.replaceState(null, "", "/");
      setToast(`Balança importada: ${bio.peso ? String(bio.peso).replace(".", ",") + " kg" : ""}${bio.gordura ? ` · ${String(bio.gordura).replace(".", ",")}% gordura` : ""}`); setTimeout(() => setToast(null), 3500);
    }
  }, [uid]);
  const day = viewDay || today;
  const now = viewDay ? 24 * 60 : nowMin;
  useEffect(() => { setLog(week[day] || EMPTY); }, [week, day]);
  useEffect(() => {
    load();
    const f = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", f);
    const on = () => load(); window.addEventListener("online", on);
    const t = setInterval(tick, 30000);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("online", on); clearInterval(t); };
  }, [load]);

  function say(msg) { setToast(msg); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2200); }

  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  function saveLog(patch) {
    const d = day, cur = weekRef.current[d] || EMPTY;
    const next = { ...cur, ...patch };
    if (patch.checks) next.checks = clean({ ...(cur.checks || {}), ...patch.checks });
    if (patch.swaps) next.swaps = clean({ ...(cur.swaps || {}), ...patch.swaps });
    setWeekBoth({ ...weekRef.current, [d]: next });
    if (patch.checks) {
      const m = MEALS.find((m) => !mealIsDone(cur, m) && mealIsDone(next, m));
      if (m) {
        buzz(40); say(`${m.name} completo`);
        const prep = settings.supplies?._prep || {}, used = next.checks._prepUsed || {};
        const p = PREP.find((x) => x.meals.includes(m.id));
        if (p && !used[m.id] && !next.checks._out?.[m.id] && (prep[p.id] || 0) > 0 && d === today) {
          next.checks = { ...next.checks, _prepUsed: { ...used, [m.id]: true } };
          setWeekBoth({ ...weekRef.current, [d]: next });
          saveSettings({ supplies: { ...settings.supplies, _prep: { ...prep, [p.id]: prep[p.id] - 1 } } });
        }
      }
    }
    if (score(cur) < 100 && score(next) === 100) { setParty(true); setTimeout(() => setParty(false), 3500); }
    if (!outbox().includes(d)) setOutbox([...outbox(), d]);
    pending.current++;
    chain.current = chain.current.then(async () => {
      for (let tries = 0; tries < 2; tries++) {
        if (await pushDay(d).catch(() => false)) { setOutbox(outbox().filter((x) => x !== d)); if (!outbox().length) setOffline(false); return; }
        await new Promise((r) => setTimeout(r, 700));
      }
      setOffline(true); // fica salvo no celular e sincroniza quando voltar a internet
    }).catch(() => setOffline(true)).finally(() => { pending.current--; });
    return chain.current;
  }
  async function saveSettings(patch) {
    const next = { ...settings, ...patch }; setSettings(next); timesRef.current = next.times || {};
    lsSet(`pv_set_${uid}`, next); lsSet(`pv_setdirty_${uid}`, true);
    const { error } = await safe(supabase.from("settings").upsert({ user_id: uid, times: next.times, update_date: next.update_date, supplies: next.supplies }));
    if (!error) lsSet(`pv_setdirty_${uid}`, false); else setOffline(true);
  }

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
          <div className="tag">{s === 100 ? "Dia 100% cumprido" : "Dr. Victor Rocha · 2.239 kcal · 199 g PTN"}</div>
        </div>
      </header>

      {offline && <div className="offline">Sem internet: tudo fica salvo no celular e sincroniza sozinho quando a conexão voltar.</div>}
      {viewDay && tab === "hoje" && <div className="card editing"><span>Editando <b>{fmtDay(day, { weekday: "long", day: "2-digit", month: "2-digit" })}</b></span><button className="sm pri" onClick={() => setViewDay(null)}>Voltar para hoje</button></div>}
      {tab === "hoje" && <Today {...{ uid, log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }} />}
      {tab === "prog" && <Progress {...{ uid, week, day, settings, saveLog }} />}
      {tab === "treino" && <TrainTab {...{ log, saveLog, settings, saveSettings, week, day }} />}
      {tab === "compras" && <Shopping {...{ settings, saveSettings, say }} />}
      {tab === "plano" && <Plan {...{ uid, settings, saveSettings, today, say }} />}

      {swapFor && <SwapSheet {...swapFor} addShop={addShop} current={log.swaps?.[swapFor.key]} onClose={() => setSwapFor(null)}
        onPick={(v) => { saveLog({ swaps: { [swapFor.key]: v || undefined } }); setSwapFor(null); say(v ? "Alimento trocado" : "Voltou ao original"); }} />}

      {toast && <div className="toast" role="status">{toast}</div>}
      {party && <Confetti />}

      <nav>
        {[["hoje", "Hoje", "today"], ["treino", "Treino", "dumbbell"], ["prog", "Progresso", "prog"], ["compras", "Compras", "cart"], ["plano", "Plano", "plan"]].map(([k, l, ic]) =>
          <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); scrollTo(0, 0); }}>
            <span className="nav-ic"><Icon n={ic} s={22} />{k === "compras" && shopCount > 0 && <i className="badge">{shopCount}</i>}</span><span>{l}</span></button>)}
      </nav>
    </div>
  );
}

function Ring({ pct }) {
  return (
    <svg width="76" height="76" viewBox="0 0 84 84" style={{ flex: "none" }}>
      <circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle cx="42" cy="42" r="36" fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray="226" strokeDashoffset={226 - (226 * pct) / 100} transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset .5s" }} />
      <text x="42" y="48" textAnchor="middle" fill="var(--fg)" fontSize="18">{pct}%</text>
    </svg>
  );
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 40 }, (_, i) => ({ l: Math.random() * 100, d: Math.random() * 0.8, c: ["var(--ok)", "var(--accent)", "var(--warn)"][i % 3], r: Math.random() * 360 })), []);
  return <div className="confetti" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ left: b.l + "%", animationDelay: b.d + "s", background: b.c, transform: `rotate(${b.r}deg)` }} />)}<div className="party">Dia 100%!</div></div>;
}

/* ---------- HOJE ---------- */
function Today({ uid, log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }) {
  const T = settings.times || {};
  const checks = log.checks || {};
  const merge = checks._merge || {};
  const freeId = checks._free;
  const workoutToday = !!log.workout_at;
  const tOf = (m) => m.workout ? (log.workout_at ? spNowTime(log.workout_at) : m.time) : mealTime(m, T, day);
  const meals = MEALS.filter((m) => !m.workout || workoutToday).sort((a, b) => toMin(tOf(a)) - toMin(tOf(b)));
  const main = meals.filter((m) => !m.workout);
  const done = (m) => mealIsDone(log, m);
  const nextOf = (m) => main[main.indexOf(m) + 1];
  const missed = (m) => !done(m) && !merge[m.id] && !!nextOf(m) && toMin(tOf(nextOf(m))) <= now;
  const extrasFor = (m) => Object.entries(merge).filter(([, t]) => t === m.id).map(([s]) => MEALS.find((x) => x.id === s)).filter(Boolean);

  const pt = meals.find((m) => m.workout && !done(m));
  const focus = pt || main.find((m) => !done(m) && !merge[m.id] && !missed(m)) || main.find((m) => !done(m) && !merge[m.id]);
  const missedList = main.filter(missed);
  const [open, setOpen] = useState(null);

  // semana atual (segunda a domingo) para refeição livre e reposições
  const wd = weekday(day), monday = addDays(day, -((wd + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => d <= day);
  const freeUsedOn = weekDays.find((d) => d !== day && week[d]?.checks?._free);
  const mergesWeek = Array.from({ length: 7 }, (_, i) => addDays(day, -i)).filter((d) => Object.values(week[d]?.checks?._merge || {}).some((v) => v !== "skip")).length;

  const toggle = (k, v) => { buzz(); saveLog({ checks: { [k]: v } }); };
  const markAll = (m) => {
    const c = {};
    [m, ...extrasFor(m)].forEach((x) => x.items.forEach((_, i) => { c[`${x.id}-${i}`] = true; }));
    saveLog({ checks: c });
  };
  const doMerge = (src, target) => { buzz(30); saveLog({ checks: { _merge: { ...merge, [src.id]: target } } }); say(target === "skip" ? `${src.name} pulado` : `${src.name} vai junto com o ${nextOf(src).name}`); };
  const undoMerge = (src) => { const m2 = { ...merge }; delete m2[src.id]; saveLog({ checks: { _merge: m2 } }); };
  const useFree = (m) => { buzz(40); saveLog({ checks: { _free: m.id }, free_meal: true }); say("Refeição livre registrada"); };
  const undoFree = () => { saveLog({ checks: { _free: undefined }, free_meal: false }); };

  // suplementos do dia em ordem de horário (inclui os que foram para outra refeição)
  const sups = meals.flatMap((m) => m.items.map((it, i) => ({ it, k: `${m.id}-${i}`, time: merge[m.id] && merge[m.id] !== "skip" ? tOf(MEALS.find((x) => x.id === merge[m.id])) : tOf(m) })).filter((x) => x.it.sup))
    .sort((a, b) => toMin(a.time) - toMin(b.time));

  const bottle = +(T.bottle || 500);
  const viewing = now >= 24 * 60;
  // cafeína
  const caf = checks._caf || [];
  const cafTotal = caf.reduce((a, b) => a + b, 0);

  // treino
  const divs = +(T.divs || 5), nextIdx = +(T.next || 0) % divs;
  const doneIdx = (nextIdx - 1 + divs) % divs;
  async function workoutDone() {
    buzz(60);
    await saveLog({ workout_at: new Date().toISOString(), checks: { _wk: LETTERS[nextIdx] } });
    saveSettings({ times: { ...T, next: (nextIdx + 1) % divs } });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey + 1 col. de mel", icon: "/icon-192.png" }); } catch {}
  }
  const [gym, setGym] = useState(null);
  async function undoWorkout() { await saveLog({ workout_at: null }); saveSettings({ times: { ...T, next: doneIdx } }); say("Treino desmarcado"); }

  const weighDay = T.weigh !== undefined && T.weigh !== "" && +T.weigh === wd;

  return (
    <>
      <PushBanner />

      {weighDay && <WeighCard uid={uid} day={day} say={say} hasCheckin={!!checks._ci} saveCheckin={(ci) => saveLog({ checks: { _ci: ci } })} hasMed={!!checks._med} saveMed={(m) => saveLog({ checks: { _med: m } })} />}

      {missedList.length > 0 && (() => {
        const tgt = main.find((x) => !done(x) && !merge[x.id] && !missed(x));
        return (
          <section className="card missed">
            <div className="lbl warn">{missedList.length === 1 ? "Refeição perdida" : `${missedList.length} refeições perdidas`}</div>
            {missedList.map((m) => (
              <div key={m.id} className="miss-item">
                <div className="mh"><b>{m.name} · {tOf(m)}</b><button className="link" onClick={() => markAll(m)}>Já comi</button></div>
                {tgt && <ul className="sugg">{replaceSuggestion(m, tgt).map((l) => <li key={l.text} className={l.sup ? "sup" : ""}>{l.text}</li>)}</ul>}
              </div>
            ))}
            {mergesWeek >= 2 && <div className="tag warn">Você já repôs refeições {mergesWeek} vezes nos últimos 7 dias. O plano pede que isso não vire hábito.</div>}
            {tgt ? <button className="pri" onClick={() => { const c = { _merge: { ...merge } }; missedList.forEach((m) => { c._merge[m.id] = tgt.id; }); buzz(30); saveLog({ checks: c }); say(`Reposição junto com o ${tgt.name.toLowerCase()}`); }}>
              Repor {missedList.length > 1 ? "tudo " : ""}no {tgt.name.toLowerCase()} ({tOf(tgt)})</button>
              : <div className="tag">Não há próxima refeição hoje: tome ao menos os suplementos.</div>}
            <button className="link" onClick={() => { const c = { _merge: { ...merge } }; missedList.forEach((m) => { c._merge[m.id] = "skip"; }); saveLog({ checks: c }); }}>Pular sem repor</button>
          </section>
        );
      })()}

      {focus ? <NowCard m={focus} time={tOf(focus)} now={now} checks={checks} swaps={log.swaps || {}} toggle={toggle} markAll={markAll} setSwapFor={setSwapFor}
          extras={extrasFor(focus)} target={focus} freeBlocked={freeUsedOn} onFree={() => useFree(focus)}
          onOut={(m) => { const c = { _out: { ...(checks._out || {}), [m.id]: true } }; m.items.forEach((_, i) => { c[`${m.id}-${i}`] = true; }); saveLog({ checks: c }); }}
          onSnooze={(m) => { const at = Math.max(now, toMin(tOf(m))) + 15; saveLog({ checks: { _snooze: { ...(checks._snooze || {}), [m.id]: at } } }); say(`Te lembro às ${fmtHM(at)}`); }} />
        : <div className="card complete"><h2>Dieta do dia completa</h2><div className="tag">Todas as refeições marcadas. Confira água e suplementos abaixo.</div></div>}

      {!viewing && <DailyPhotos uid={uid} day={day} say={say} />}

      {/* Suplementos */}
      <Fold done={sups.length > 0 && sups.every((x) => checks[x.k])} label="Suplementos" summary={`${sups.length}/${sups.length} tomados`}>
      <section className="card">
        <div className="mh"><h3>Suplementos de hoje</h3><span className="tag num">{sups.filter((x) => checks[x.k]).length}/{sups.length}</span></div>
        <div className="chips">
          {sups.map(({ it, k, time }) => (
            <button key={k} className={"chip" + (checks[k] ? " on" : "") + (!checks[k] && toMin(time) < now ? " late" : "")} onClick={() => toggle(k, !checks[k])}>
              <span className="num">{time}</span><b>{it.short}</b>
            </button>
          ))}
        </div>
      </section>
      </Fold>
      {gym && <Gym w={gym} checks={checks} saveLog={saveLog} settings={settings} saveSettings={saveSettings} onClose={() => setGym(null)} onDone={() => { setGym(null); workoutDone(); }} />}

      {/* Água */}
      <Fold done={log.water_ml >= WATER_GOAL} label="Água" summary={`${(log.water_ml / 1000).toFixed(1).replace(".", ",")} L · meta batida`}>
      <section className="card">
        <div className="mh"><h3>Água</h3><span className="num">{(log.water_ml / 1000).toFixed(2).replace(".", ",")} / 2,6 L</span></div>
        <div className="cups">
          {Array.from({ length: CUPS }, (_, i) => {
            const full = log.water_ml >= (i + 1) * CUP;
            return <button key={i} aria-label={`Copo ${i + 1}`} className={"cup" + (full ? " full" : "")}
              onClick={() => { buzz(); saveLog({ water_ml: full && log.water_ml < (i + 2) * CUP ? i * CUP : (i + 1) * CUP }); }} />;
          })}
        </div>
        <div className="row">
          <button className="pri grow" onClick={() => { buzz(); saveLog({ water_ml: log.water_ml + 250 }); }}>+ 1 copo (250 ml)</button>
          <button onClick={() => { buzz(); saveLog({ water_ml: log.water_ml + bottle }); }}>+ garrafa {bottle}</button>
          <button aria-label="Remover 250 ml" onClick={() => saveLog({ water_ml: Math.max(0, log.water_ml - 250) })}>−</button>
        </div>
      </section>
      </Fold>

      {/* Pré-treino */}
      <Fold done={!!checks._pre} label="Pré-treino" summary="Dila Pump tomado">
      <section className={"card" + (checks._pre ? " complete" : "")}>
        <div className="mh"><h3>Pré-treino</h3><span className="time">{fmtHM(toMin(trainTime(T, day)) - 30)}</span></div>
        <div className="item pre" style={{ borderTop: 0 }}>
          <button className={"ck" + (checks._pre ? " on" : "")} aria-label="Tomei o pré-treino" onClick={() => toggle("_pre", !checks._pre)}>{checks._pre && <Icon n="check" s={16} />}</button>
          <div className="t" onClick={() => toggle("_pre", !checks._pre)}><b>{PREWORKOUT.name}</b></div>
        </div>
        <div className="pre-grid">
          <div><div className="lbl">Quantidade</div><b>2 dosadores</b><span className="tag">10,6 g</span></div>
          <div><div className="lbl">Quando</div><b>30 min antes</b><span className="tag">treino às {trainTime(T, day)}</span></div>
          <div><div className="lbl">Misturar em</div><b>260 ml</b><span className="tag">água gelada</span></div>
        </div>
        <div className="tag">{PREWORKOUT.rest} Não passar de 10,6 g/dia.</div>
      </section>
      </Fold>

      {/* Treino */}
      <Fold done={workoutToday} label={`Treino ${LETTERS[doneIdx]}`} summary={`feito · próximo: ${LETTERS[nextIdx]}`}>
      <section className="card">
        <div className="mh"><h3>Treino</h3><span className="tag num">{trainTime(T, day)}</span></div>
        {workoutToday ? (
          <>
            <div className="big-line"><Icon n="check" /> Treino {LETTERS[doneIdx]} feito · próximo: <b>{LETTERS[nextIdx]}</b></div>
            <button className="link" onClick={undoWorkout}>Desfazer</button>
          </>
        ) : (
          <>
            <div className="big-line">Hoje: <b className="letter">Treino {LETTERS[nextIdx]}</b>{WORKOUTS[nextIdx] && <span className="tag">· {WORKOUTS[nextIdx].name}</span>}</div>
            {WORKOUTS[nextIdx] && <button className="pri big" onClick={() => setGym(WORKOUTS[nextIdx])}><Icon n="dumbbell" s={18} /> Começar treino ({WORKOUTS[nextIdx].ex.length} exercícios)</button>}
            <div className="row">
              <a className="btn" href={MFIT_URL} target="_blank" rel="noreferrer"><Icon n="ext" s={16} /> MFIT</a>
              <button className="ok grow" onClick={workoutDone}><Icon n="dumbbell" s={18} /> Terminei o treino</button>
            </div>
            <div className="tag">Ao terminar, o pós-treino entra na sua lista e o próximo treino avança.</div>
          </>
        )}
      </section>
      </Fold>

      {/* Cafeína */}
      <Fold done={cafTotal < 400} neutral label="Cafeína" summary={`${cafTotal}/${CAFFEINE_MAX} mg · toque para registrar`}>
      <section className="card">
        <div className="mh"><h3>Cafeína</h3><span className={"num" + (cafTotal > CAFFEINE_MAX ? " bad" : cafTotal >= 400 ? " warn" : "")}>{cafTotal} / {CAFFEINE_MAX} mg</span></div>
        <div className="bar"><i style={{ width: `${Math.min((cafTotal / CAFFEINE_MAX) * 100, 100)}%`, background: cafTotal > CAFFEINE_MAX ? "var(--bad)" : cafTotal >= 400 ? "var(--warn)" : "var(--accent)" }} /></div>
        {cafTotal >= 400 && <div className={"tag " + (cafTotal > CAFFEINE_MAX ? "bad" : "warn")}>{cafTotal > CAFFEINE_MAX ? "Passou do limite de 500 mg do plano." : `Restam ${CAFFEINE_MAX - cafTotal} mg para o limite.`}</div>}
        <div className="chips">
          {CAFFEINE.map(([n, mg]) => <button key={n} className="chip" onClick={() => { buzz(); saveLog({ checks: { _caf: [...caf, mg] } }); }}><span className="num">{mg} mg</span><b>{n}</b></button>)}
        </div>
        {caf.length > 0 && <button className="link" onClick={() => saveLog({ checks: { _caf: caf.slice(0, -1) } })}>Desfazer último</button>}
      </section>
      </Fold>

      {/* Linha do dia */}
      <section className="card">
        <h3>Dia completo</h3>
        <div className="timeline">
          {meals.map((m) => {
            const isDone = done(m), n = m.items.filter((_, i) => itemDone(log, m, i)).length;
            const mg = merge[m.id], isOpen = open === m.id, late = !isDone && !mg && toMin(tOf(m)) + 30 < now;
            const status = freeId === m.id ? "livre" : isDone ? "feito" : mg === "skip" ? "pulada" : mg ? `→ ${MEALS.find((x) => x.id === mg)?.name.toLowerCase()}` : missed(m) ? "perdida" : late ? "atrasada" : `${n}/${m.items.length}`;
            return (
              <div key={m.id} className={"tl" + (isDone ? " done" : "") + (focus?.id === m.id ? " focus" : "")}>
                <button className="tl-head" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen}>
                  <span className="dot">{isDone && <Icon n="check" s={14} />}</span>
                  <span className="num tl-time">{tOf(m)}</span>
                  <span className="tl-name">{m.name}</span>
                  <span className={"tag num" + (late || missed(m) ? " warn" : "")}>{status}</span>
                </button>
                {isOpen && <div className="tl-body">
                  {freeId === m.id ? <><div className="tag">Substituída pela refeição livre da semana.</div><button className="link" onClick={undoFree}>Desfazer refeição livre</button></> : <>
                    <Items m={m} checks={checks} swaps={log.swaps || {}} toggle={toggle} setSwapFor={setSwapFor} extras={extrasFor(m)} target={m} />
                    {!isDone && <button className="ok" onClick={() => markAll(m)}>Marcar tudo</button>}
                    {mg && <button className="link" onClick={() => undoMerge(m)}>Desfazer reposição/pulo</button>}
                    {!m.workout && !isDone && !freeId && !freeUsedOn && <button className="link" onClick={() => useFree(m)}>Usar refeição livre aqui</button>}
                  </>}
                </div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Semana */}
      <section className="card">
        <div className="mh"><h3>Semana</h3><span className="tag">verde = 100% · contorno laranja = livre</span></div>
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map((d) => {
            const sc = dayScore(week[d]);
            return <div key={d} className={"d" + (sc >= 95 ? " full" : sc > 0 ? " part" : "") + (week[d]?.checks?._free ? " free" : "") + (d === day ? " today" : "")}>
              {fmtDay(d, { weekday: "short" }).slice(0, 3)}<b>{sc}</b></div>;
          })}
        </div>
        <div className="tag">{freeId ? "Refeição livre usada hoje." : freeUsedOn ? `Refeição livre da semana já usada (${fmtDay(freeUsedOn, { weekday: "long" })}).` : "Refeição livre da semana disponível: use pelo card da refeição."}</div>
      </section>
    </>
  );
}
function spNowTime(iso) { const m = spNow(new Date(iso)).min; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

function NowCard({ m, time, now, checks, swaps, toggle, markAll, setSwapFor, extras, target, freeBlocked, onFree, onSnooze, onOut }) {
  const [out, setOut] = useState(false);
  const diff = toMin(time) - now;
  const status = m.workout ? "Agora · pós-treino" : diff > 0 ? `Próxima · em ${fmtDur(diff)}` : diff > -30 ? "Agora" : `Atrasada · ${fmtDur(diff)}`;
  const all = [m, ...extras];
  const total = all.reduce((a, x) => a + x.items.length, 0);
  const n = all.reduce((a, x) => a + x.items.filter((_, i) => checks[`${x.id}-${i}`]).length, 0);
  return (
    <section className={"card now" + (diff <= -30 && !m.workout ? " late" : "")}>
      <div className="mh"><span className="lbl now-lbl">{status}</span><span className="time">{time}</span></div>
      <div className="mh"><h2 className="now-title">{m.name}</h2><span className="tag num">{n}/{total}</span></div>
      <Items m={m} checks={checks} swaps={swaps} toggle={toggle} setSwapFor={setSwapFor} extras={extras} target={target} />
      <div className="row">
        <button className="ok big grow" onClick={() => markAll(m)}><Icon n="check" /> Comi tudo</button>
        {diff <= 15 && !m.workout && <button className="snz" onClick={() => onSnooze(m)}>{checks._snooze?.[m.id] ? `Aviso às ${fmtHM(checks._snooze[m.id])}` : "Adiar 15 min"}</button>}
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        {EAT_OUT[m.id] && <button className="link" onClick={() => setOut(true)}>Vou comer fora</button>}
        {!m.workout && !checks._free && !freeBlocked && <button className="link" onClick={onFree}>Usar refeição livre aqui</button>}
      </div>
      {out && <div className="sheet-bg" onClick={() => setOut(false)}><div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="mh"><h2>{m.name} fora de casa</h2><button className="sm" onClick={() => setOut(false)}>Fechar</button></div>
        <ul className="sugg">{EAT_OUT[m.id].map((x) => <li key={x}>{x}</li>)}</ul>
        {m.items.some((x) => x.sup) && <div className="tag warn">Leve os suplementos: {m.items.filter((x) => x.sup).map((x) => x.short).join(", ")}.</div>}
        <div className="tag">{PALM}</div>
        <button className="ok big" onClick={() => { onOut(m); setOut(false); }}><Icon n="check" /> Comi fora seguindo isso</button>
      </div></div>}
    </section>
  );
}

function ItemRow({ m, it, i, checks, swaps, toggle, setSwapFor, note }) {
  const k = `${m.id}-${i}`, on = !!checks[k], sw = swaps[k];
  return (
    <div className={"item" + (on ? " done" : "")}>
      <button className={"ck" + (on ? " on" : "")} aria-pressed={on} aria-label={on ? "Desmarcar" : "Marcar"} onClick={() => toggle(k, !on)}>{on && <Icon n="check" s={16} />}</button>
      <div className="t" onClick={() => toggle(k, !on)}>
        <b>{it.sup && <span className="supl">SUPL</span>}{sw || it.t}</b>
        {sw && <div className="swapped">trocado · original: {it.t}</div>}
        {note ? <div className="s accent">{note}</div> : !sw && it.s && <div className="s">{it.s}</div>}
      </div>
      {it.g && <button className="icon-btn" aria-label="Trocar alimento" onClick={() => setSwapFor({ key: k, item: it })}><Icon n="swap" s={18} /></button>}
    </div>
  );
}

function Items({ m, checks, swaps, toggle, setSwapFor, extras = [], target }) {
  return (
    <>
      {m.items.map((it, i) => <ItemRow key={i} {...{ m, it, i, checks, swaps, toggle, setSwapFor }} />)}
      {extras.map((src) => {
        const sugg = replaceSuggestion(src, target);
        return (
          <div key={src.id} className="extra">
            <div className="lbl warn">Repor do {src.name.toLowerCase()}</div>
            {src.items.map((it, i) => <ItemRow key={i} {...{ m: src, it, i, checks, swaps, toggle, setSwapFor }} note={sugg[i]?.text?.includes(" some ") ? sugg[i].text : undefined} />)}
          </div>
        );
      })}
    </>
  );
}

function WeighCard({ uid, day, say, hasCheckin, saveCheckin, hasMed, saveMed }) {
  const [kg, setKg] = useState(""); const [saved, setSaved] = useState(false);
  useEffect(() => { supabase.from("weights").select("id").eq("user_id", uid).eq("day", day).then(({ data }) => setSaved(!!data?.length)); }, [uid, day]);
  if (saved && hasCheckin && hasMed) return null;
  return (
    <section className="card now">
      <div className="lbl now-lbl">Dia de pesagem e check-in</div>
      {!saved && <>
        <div className="tag">Pese em jejum, depois do banheiro e antes de comer ou beber.</div>
        <div className="row"><input id="wkg" inputMode="decimal" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} style={{ width: 110 }} />
          <button className="pri" onClick={async () => { const v = parseFloat(kg.replace(",", ".")); if (!v) return; await supabase.from("weights").insert({ user_id: uid, day, kg: v }); setSaved(true); buzz(40); say("Peso registrado"); }}>Registrar peso</button></div>
      </>}
      {!hasMed && <MeasureForm onSave={(m) => { saveMed(m); say("Medidas salvas"); }} />}
      {!hasCheckin && <CheckinForm onSave={(ci) => { saveCheckin(ci); say("Check-in salvo"); }} />}
    </section>
  );
}

const CI_FIELDS = [["fome", "Fome"], ["energia", "Energia"], ["sono", "Sono"], ["intestino", "Intestino"], ["treino", "Treinos"]];
function CheckinForm({ onSave, initial }) {
  const [ci, setCi] = useState(initial || {});
  return (
    <div className="ci">
      <div className="tag">Como foi a semana? 1 = ruim, 5 = ótimo{" "}(fome: 1 = muita fome)</div>
      {CI_FIELDS.map(([k, l]) => (
        <div key={k} className="ci-row"><span>{l}</span>
          <div className="ci-opts">{[1, 2, 3, 4, 5].map((v) => <button key={v} className={ci[k] === v ? "on" : ""} onClick={() => { buzz(); setCi({ ...ci, [k]: v }); }}>{v}</button>)}</div>
        </div>
      ))}
      <button className="pri" disabled={CI_FIELDS.some(([k]) => !ci[k])} onClick={() => onSave(ci)}>Salvar check-in</button>
    </div>
  );
}

function SwapSheet({ item, current, onPick, onClose, addShop }) {
  const g = GROUPS[item.g];
  const [q, setQ] = useState("");
  const foods = g.foods.filter((f) => f.n.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="mh"><h2>Trocar alimento</h2><button className="sm" onClick={onClose}>Fechar</button></div>
        <div className="tag">Trocando <b style={{ color: "var(--fg)" }}>{item.t}</b>. Quantidades já ajustadas para {item.p === 0.5 ? "½ porção" : `${item.p} porç${item.p > 1 ? "ões" : "ão"}`} do grupo {g.name.toLowerCase()}.</div>
        {item.shop && <button onClick={() => { addShop(item.shop[0]); onClose(); }}><Icon n="cart" s={16} /> Acabou: pôr {item.shop[0]} na lista</button>}
        <input id="swapq" placeholder="Buscar alimento" value={q} onChange={(e) => setQ(e.target.value)} />
        {current && <button onClick={() => onPick(null)}>Voltar ao original</button>}
        {foods.map((f) => {
          const grams = Math.round(f.g * item.p);
          return <button key={f.n} className="opt" onClick={() => onPick(`${f.n}: ${grams} g (${fmtPortion(item.p, f.m)})`)}>
            <span>{f.n}<div className="tag">{fmtPortion(item.p, f.m)}</div></span><span className="q">{grams} g</span></button>;
        })}
      </div>
    </div>
  );
}

function PushBanner() {
  const [state, setState] = useState("?");
  useEffect(() => {
    if (!("Notification" in window) || !("PushManager" in window)) setState("unsupported");
    else setState(Notification.permission);
  }, []);
  async function enable() {
    const perm = await Notification.requestPermission(); setState(perm);
    if (perm !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
    const { data } = await supabase.auth.getUser();
    await supabase.from("push_subs").upsert({ endpoint: sub.endpoint, user_id: data.user.id, sub: sub.toJSON() });
    reg.showNotification("Notificações ativadas", { body: "Você vai receber os lembretes do protocolo.", icon: "/icon-192.png" });
  }
  if (state === "granted" || state === "?") return null;
  return (
    <div className="card" style={{ borderColor: "var(--warn)" }}>
      {state === "unsupported"
        ? <span className="tag">Para receber notificações no iPhone: Safari → Compartilhar → <b>Adicionar à Tela de Início</b>, e abra pelo ícone.</span>
        : <div className="mh"><span className="tag">Ative os lembretes de refeição, água e suplementos.</span><button className="pri sm" onClick={enable}>Ativar</button></div>}
    </div>
  );
}

/* ---------- PROGRESSO ---------- */
function Progress({ uid, week, day, settings, saveLog }) {
  const [weights, setWeights] = useState([]); const [kg, setKg] = useState("");
  const [photos, setPhotos] = useState([]); const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(""); const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: w } = await supabase.from("weights").select("*").eq("user_id", uid).order("day");
    setWeights(w || []);
    const { data: p } = await supabase.from("photos").select("*").eq("user_id", uid).order("day", { ascending: false }).limit(12);
    if (p?.length) {
      const { data: urls } = await supabase.storage.from("fotos").createSignedUrls(p.map((x) => x.path), 3600);
      setPhotos(p.map((x, i) => ({ ...x, url: urls?.[i]?.signedUrl })));
    } else setPhotos([]);
  }, [uid]);
  useEffect(() => { loadAll(); }, [loadAll]);

  async function addWeight() {
    const v = parseFloat(kg.replace(",", ".")); if (!v) return;
    await supabase.from("weights").insert({ user_id: uid, day, kg: v }); setKg(""); loadAll();
  }
  async function upload(e) {
    setBusy(true);
    for (const f of e.target.files) {
      const path = `${uid}/${day}-${Date.now()}-${f.name.replace(/[^\w.]/g, "")}`;
      const { error } = await supabase.storage.from("fotos").upload(path, f);
      if (!error) await supabase.from("photos").insert({ user_id: uid, day, path });
    }
    setBusy(false); e.target.value = ""; loadAll();
  }

  const firstDay = Object.keys(week).sort()[0] || day;
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(day, i - 13)).filter((d) => d >= firstDay);
  const adh = Math.round(days14.reduce((a, d) => a + score(week[d]), 0) / Math.max(1, days14.length));
  const waterAvg = Math.round(days14.reduce((a, d) => a + (week[d]?.water_ml || 0), 0) / Math.max(1, days14.length));
  const free = days14.filter((d) => week[d]?.free_meal).length;
  const trained = days14.filter((d) => week[d]?.workout_at).length;
  let streak = 0; for (let i = 0; i < 120; i++) { if (score(week[addDays(day, -i)]) >= 95) streak++; else if (i > 0) break; }
  const last = weights.at(-1);
  const ciDays = Object.keys(week).filter((d) => week[d]?.checks?._ci).sort();
  const lastCi = ciDays.length ? week[ciDays.at(-1)].checks._ci : null;
  const [ciOpen, setCiOpen] = useState(false);
  const medDays = Object.keys(week).filter((d) => week[d]?.checks?._med).sort();
  const lastMed = medDays.length ? week[medDays.at(-1)].checks._med : null;
  const bioDays = Object.keys(week).filter((d) => week[d]?.checks?._bio).sort();
  const lastBio = bioDays.length ? week[bioDays.at(-1)].checks._bio : null;
  const days120 = Array.from({ length: 120 }, (_, i) => addDays(day, i - 119));
  const bestRun = (ok) => { let b = 0, c = 0; days120.forEach((d) => { c = ok(d) ? c + 1 : 0; b = Math.max(b, c); }); return b; };
  const bestDiet = bestRun((d) => score(week[d]) >= 95), bestWater = bestRun((d) => (week[d]?.water_ml || 0) >= WATER_GOAL);
  const totalTrain = days120.filter((d) => week[d]?.workout_at).length, totalCi = days120.filter((d) => week[d]?.checks?._ci).length;
  const BADGES = [
    ["3 dias", "dieta 95%+ seguidos", bestDiet >= 3], ["7 dias", "dieta 95%+ seguidos", bestDiet >= 7], ["30 dias", "dieta 95%+ seguidos", bestDiet >= 30],
    ["100 dias", "dieta 95%+ seguidos", bestDiet >= 100], ["Hidratado", "7 dias com 2,6 L", bestWater >= 7], ["Camelo", "30 dias com 2,6 L", bestWater >= 30],
    ["20 treinos", "registrados", totalTrain >= 20], ["50 treinos", "registrados", totalTrain >= 50], ["Disciplina", "4 check-ins", totalCi >= 4],
  ];
  const days30 = Array.from({ length: 28 }, (_, i) => addDays(day, i - 27));
  const pad = (weekday(days30[0]) + 6) % 7;

  const kit = `Atualização — ${fmtDay(day, { day: "2-digit", month: "2-digit", year: "numeric" })}
Peso em jejum: ${last ? String(last.kg).replace(".", ",") + " kg" : "—"} (inicial 72,4 kg${last ? `, ${(last.kg - START_WEIGHT >= 0 ? "+" : "")}${(last.kg - START_WEIGHT).toFixed(1).replace(".", ",")} kg` : ""})
Adesão à dieta (${days14.length} dias): ${adh}%
Água média: ${(waterAvg / 1000).toFixed(1).replace(".", ",")} L/dia (meta 2,6 L)
Treinos (${days14.length} dias): ${trained}${lastCi ? `
${lastBio?.gordura ? `Bioimpedância: gordura ${String(lastBio.gordura).replace(".", ",")}%${lastBio.magra ? ` · massa magra ${String(lastBio.magra).replace(".", ",")} kg` : ""}
` : ""}Medidas: ${lastMed ? MEAS.map(([k, l]) => lastMed[k] ? `${l.split(" ")[0].toLowerCase()} ${String(lastMed[k]).replace(".", ",")}` : null).filter(Boolean).join(" · ") + " cm" : "—"}
Check-in (1-5): fome ${lastCi.fome} · energia ${lastCi.energia} · sono ${lastCi.sono} · intestino ${lastCi.intestino} · treinos ${lastCi.treino}` : ""}
Refeições livres: ${free} em ${days14.length} dias
Feedback: ${feedback || "—"}`;

  return (
    <>
      <div className="card">
        <h2>Resumo 14 dias</h2>
        <div className="stats">
          {[["Adesão", adh + "%"], ["Água/dia", (waterAvg / 1000).toFixed(1).replace(".", ",") + " L"], ["Treinos", trained], ["Sequência", streak + " d"]].map(([l, v]) =>
            <div key={l}><div className="lbl">{l}</div><div className="num stat">{v}</div></div>)}
        </div>
      </div>

      <div className="card">
        <div className="mh"><h2>Conquistas</h2><span className="tag num">{BADGES.filter((b) => b[2]).length}/{BADGES.length}</span></div>
        <div className="badges">{BADGES.map(([t, d, on]) => <div key={t} className={"bdg" + (on ? " on" : "")}><b>{t}</b><span>{d}</span></div>)}</div>
      </div>

      <Evolution uid={uid} day={day} />

      <div className="card">
        <div className="mh"><h2>Últimas 4 semanas</h2><span className="tag">adesão por dia</span></div>
        <div className="cal">
          {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => <span key={i} className="lbl">{l}</span>)}
          {Array.from({ length: pad }, (_, i) => <span key={"p" + i} />)}
          {days30.map((d) => { const sc = score(week[d]); return <span key={d} title={`${d}: ${sc}%`} className={"cal-d" + (sc >= 95 ? " full" : sc >= 60 ? " mid" : sc > 0 ? " low" : "") + (d === day ? " today" : "")}>{+d.slice(8)}</span>; })}
        </div>
        <div className="tag">Verde: 95%+ · azul: 60%+ · cinza claro: abaixo · vazio: sem registro</div>
      </div>

      <div className="card">
        <div className="mh"><h2>Check-in semanal</h2>{!ciOpen && <button className="sm" onClick={() => setCiOpen(true)}>Fazer agora</button>}</div>
        {lastCi ? <div className="tag">Último ({fmtDay(ciDays.at(-1), { day: "2-digit", month: "2-digit" })}): {CI_FIELDS.map(([k, l]) => `${l} ${lastCi[k]}`).join(" · ")}</div> : <div className="tag">Nenhum check-in ainda. Ele entra no kit de atualização para o personal.</div>}
        {ciOpen && <CheckinForm initial={week[day]?.checks?._ci} onSave={(ci) => { saveLog({ checks: { _ci: ci } }); setCiOpen(false); }} />}
      </div>

      <BodyComp week={week} />

      <Measures week={week} day={day} onSave={(med) => saveLog({ checks: { _med: med } })} />

      <div className="card">
        <div className="mh"><h2>Peso em jejum</h2><span className="tag num">inicial 72,4 kg</span></div>
        <WeightChart data={weights} />
        <div className="row"><input id="kg" inputMode="decimal" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} style={{ width: 110 }} /><button className="pri" onClick={addWeight}>Registrar</button></div>
      </div>

      <div className="card">
        <div className="mh"><h2>Fotos de evolução</h2><label className="tag" style={{ cursor: "pointer" }}><input type="file" accept="image/*" multiple hidden onChange={upload} /><span style={{ color: "var(--accent)" }}>{busy ? "Enviando…" : "+ Adicionar"}</span></label></div>
        <div className="tag">Mesma luz, ângulo e posição da anamnese.</div>
        {photos.length ? <div className="photos">{photos.map((p) => <img key={p.id} src={p.url} alt={"Foto " + p.day} />)}</div> : <div className="tag">Nenhuma foto ainda.</div>}
      </div>

      <div className="card">
        <h2>Kit de atualização</h2>
        <div className="tag">{settings.update_date ? `Próxima: ${fmtDay(settings.update_date, { day: "2-digit", month: "2-digit" })}. ` : "Defina a data em Plano. "}Escreva o feedback, copie e mande no WhatsApp junto com as fotos.</div>
        <textarea id="fb" rows="3" placeholder="Como está se sentindo, dificuldades, progresso…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <pre className="kit">{kit}</pre>
        <button className="pri" onClick={async () => { try { await navigator.clipboard.writeText(kit); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>{copied ? "Copiado" : "Copiar resumo"}</button>
      </div>
    </>
  );
}

function WeightChart({ data }) {
  const pts = [{ day: "início", kg: START_WEIGHT }, ...data.map((d) => ({ day: d.day, kg: +d.kg }))];
  if (pts.length < 2) return <div className="tag">Registre o peso para ver o gráfico.</div>;
  const W = 320, H = 120, P = 30, vals = pts.map((p) => p.kg);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const x = (i) => P + (i * (W - P - 10)) / (pts.length - 1), y = (v) => 10 + ((hi - v) * (H - 30)) / (hi - lo);
  const line = pts.map((p, i) => `${x(i)},${y(p.kg)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={P} x2={W - 10} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x="0" y={y(v) + 4} fontSize="10" fill="var(--mute)">{v.toFixed(1)}</text></g>)}
      <polygon points={`${x(0)},${H - 20} ${line} ${x(pts.length - 1)},${H - 20}`} fill="var(--accent-soft)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={x(pts.length - 1)} cy={y(vals.at(-1))} r="4" fill="var(--accent)" />
      <text x={x(pts.length - 1)} y={y(vals.at(-1)) - 8} fontSize="11" textAnchor="end" fill="var(--fg)">{vals.at(-1).toFixed(1)} kg</text>
    </svg>
  );
}

/* ---------- TROCAS ---------- */
function SubsTable() {
  const [g, setG] = useState("1");
  return (
    <div className="card">
      <h2>Tabela de substituição</h2>
      <div className="tag">Mesmo grupo, mesma quantidade de porções. Para o cálculo automático, use o botão de troca ao lado de cada alimento em Hoje.</div>
      <select id="grp" value={g} onChange={(e) => setG(e.target.value)}>
        {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>Grupo {k} · {v.name} ({v.kcal} kcal)</option>)}
      </select>
      <table><tbody>{GROUPS[g].foods.map((f) => <tr key={f.n}><td>{f.n}</td><td className="q">{f.g} g</td><td className="tag">{f.m}</td></tr>)}</tbody></table>
    </div>
  );
}

/* ---------- PLANO ---------- */
function Plan({ uid, settings, saveSettings, today, say }) {
  const T = settings.times || {};
  const left = settings.update_date ? Math.round((new Date(settings.update_date) - new Date(spNow().day)) / 864e5) : null;
  const setT = (k, v) => saveSettings({ times: { ...T, [k]: v } });
  const divs = +(T.divs || 5);

  return (
    <>
      <div className="card">
        <h2>Horários</h2>
        <div className="tag">As notificações seguem estes horários.</div>
        {MEALS.filter((m) => !m.workout).map((m) => (
          <div key={m.id} className="mh"><span>{m.name}</span><input id={"tm-" + m.id} type="time" value={T[m.id] || m.time} onChange={(e) => setT(m.id, e.target.value)} /></div>
        ))}
        <div className="mh"><span>Treino</span><input id="tm-treino" type="time" value={T.treino || "18:00"} onChange={(e) => setT("treino", e.target.value)} /></div>
        <div className="mh"><span>Dormir<div className="tag">aviso 30 min antes para desacelerar</div></span><input id="tm-sleep" type="time" value={T.sleep || "23:00"} onChange={(e) => setT("sleep", e.target.value)} /></div>
        <div className="mh"><span>Lembrete de dormir</span><label className="switch"><input id="sleep-on" type="checkbox" checked={T.sleep_on !== false} onChange={(e) => setT("sleep_on", e.target.checked)} /><span /></label></div>
      </div>

      <div className="card">
        <div className="mh"><h2>Fim de semana</h2>
          <label className="switch"><input id="we-on" type="checkbox" checked={!!T.we_on} onChange={(e) => setT("we_on", e.target.checked)} /><span /></label></div>
        <div className="tag">{T.we_on ? "Sábado e domingo usam estes horários (avisos também)." : "Ligue para usar horários diferentes no sábado e domingo."}</div>
        {T.we_on && <>
          {MEALS.filter((m) => !m.workout).map((m) => (
            <div key={m.id} className="mh"><span>{m.name}</span><input id={"we-" + m.id} type="time" value={T["we_" + m.id] || T[m.id] || m.time} onChange={(e) => setT("we_" + m.id, e.target.value)} /></div>
          ))}
          <div className="mh"><span>Treino</span><input id="we-treino" type="time" value={T.we_treino || T.treino || "18:00"} onChange={(e) => setT("we_treino", e.target.value)} /></div>
        </>}
      </div>

      <div className="card">
        <h2>Pesagem e check-in semanal</h2>
        <div className="tag">No dia escolhido: aviso às 6h45 para pesar em jejum e card de check-in no app.</div>
        <div className="mh"><span>Dia da semana</span>
          <select id="weigh" value={T.weigh ?? ""} onChange={(e) => setT("weigh", e.target.value === "" ? "" : +e.target.value)}>
            <option value="">Não definido</option>{WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}</select></div>
      </div>

      <div className="card">
        <h2>Treino (MFIT)</h2>
        <div className="tag">Siga a ordem das divisões, não o dia da semana.</div>
        <div className="mh"><span>Divisões</span>
          <select id="divs" value={divs} onChange={(e) => setT("divs", +e.target.value)}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{LETTERS.slice(0, n).split("").join("-")}</option>)}</select></div>
        <div className="mh"><span>Próximo treino</span>
          <select id="next" value={+(T.next || 0) % divs} onChange={(e) => setT("next", +e.target.value)}>{LETTERS.slice(0, divs).split("").map((l, i) => <option key={l} value={i}>Treino {l}</option>)}</select></div>
      </div>

      <div className="card">
        <h2>Atualização com o personal</h2>
        <div className="tag">Aviso na véspera e no dia, às 7h30.</div>
        <div className="row"><input id="upd" type="date" value={settings.update_date || ""} onChange={(e) => saveSettings({ update_date: e.target.value || null })} />
          {left !== null && <span className="tag">{left > 0 ? `faltam ${left} dias` : left === 0 ? "é hoje" : "atrasada"}</span>}</div>
      </div>

      <Stock {...{ settings, saveSettings, today }} />

      <div className="card">
        <h2>Pré-treino</h2>
        <div className="tag">{PREWORKOUT.name}: <b style={{ color: "var(--fg)" }}>{PREWORKOUT.dose}</b> {PREWORKOUT.how}. {PREWORKOUT.rest}</div>
        <div className="tag">{PREWORKOUT.note}</div>
        <div className="tag">Não está no plano do nutricionista: vale avisar o personal que você usa.</div>
      </div>

      <div className="card">
        <h2>Dia e água</h2>
        <div className="mh"><span>O dia termina às<div className="tag">ir dormir 1h ainda conta como hoje</div></span>
          <select id="dayEnd" value={T.dayEnd || 0} onChange={(e) => setT("dayEnd", +e.target.value)}>
            <option value={0}>00:00</option><option value={2}>02:00</option><option value={3}>03:00</option><option value={4}>04:00</option></select></div>
        <div className="mh"><span>Sua garrafa</span>
          <select id="bottle" value={T.bottle || 500} onChange={(e) => setT("bottle", +e.target.value)}>
            {[300, 400, 500, 600, 750, 1000].map((v) => <option key={v} value={v}>{v} ml</option>)}</select></div>
      </div>

      <ScaleShortcut />
      <Shortcuts />
      <PersonalLink {...{ settings, saveSettings, say }} />

      <div className="card">
        <h2>Receitas do plano</h2>
        <div className="tag">Ideias de preparo usando só os alimentos e quantidades da sua dieta.</div>
        {RECIPES.map((r) => (
          <details key={r.name} className="recipe"><summary><b>{r.name}</b><span className="tag">{r.when}</span></summary>
            <ul>{r.items.map((x) => <li key={x}>{x}</li>)}</ul><p>{r.how}</p></details>
        ))}
      </div>

      <SubsTable />

      <div className="card">
        <h2>Regras do plano</h2>
        <ul className="rules">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>

      <button onClick={() => supabase.auth.signOut()}>Sair</button>
    </>
  );
}

/* ---------- COMPRAS ---------- */
const SUP_ITEMS = ["Ômega 3", "Cápsula 1 (manhã)", "Cápsula 2 (jantar)", "Creatina", "Centrum Adulto", "Whey concentrado", "Dila Pump tangerina (pré-treino)"];
const FOOD_ITEMS = [...new Set(MEALS.flatMap((m) => m.items.filter((it) => it.shop).map((it) => it.shop[0])))].filter((n) => n !== "Whey concentrado");

function Prep({ settings, saveSettings, say }) {
  const prep = settings.supplies?._prep || {};
  const set = (id, v) => saveSettings({ supplies: { ...settings.supplies, _prep: { ...prep, [id]: Math.max(0, v) } } });
  const low = PREP.filter((p) => (prep[p.id] ?? 0) <= 2);
  return (
    <div className="card">
      <div className="mh"><h2>Marmitas na geladeira</h2>{low.length > 0 && <span className="tag warn">cozinhar logo</span>}</div>
      <div className="tag">Desconta sozinho quando você conclui a refeição. Fez comida? Toque em + (ou +5).</div>
      {PREP.map((p) => (
        <div key={p.id} className="stock">
          <div className="mh"><b>{p.name}</b><span className={"num" + ((prep[p.id] ?? 0) <= 2 ? " warn" : "")} style={{ fontSize: 20 }}>{prep[p.id] ?? 0}</span></div>
          <div className="row tag"><span style={{ flex: 1 }}>{p.tip}</span>
            <button className="sm" aria-label="Menos uma" onClick={() => set(p.id, (prep[p.id] ?? 0) - 1)}>−</button>
            <button className="sm" onClick={() => set(p.id, (prep[p.id] ?? 0) + 1)}>+1</button>
            <button className="sm pri" onClick={() => { set(p.id, (prep[p.id] ?? 0) + 5); say("Marmitas adicionadas"); }}>+5</button></div>
        </div>
      ))}
    </div>
  );
}

function Shopping({ settings, saveSettings, say }) {
  const list = settings.supplies?._shop || [];
  const [txt, setTxt] = useState("");
  const [trainings, setTrainings] = useState(5);
  const save = (l) => saveSettings({ supplies: { ...settings.supplies, _shop: l } });
  const add = (n) => { n = n.trim(); if (!n) return; if (list.some((x) => x.toLowerCase() === n.toLowerCase())) return say("Já está na lista"); buzz(); save([...list, n]); };
  const bought = (n) => { buzz(30); save(list.filter((x) => x !== n)); say(`${n} comprado`); };
  const [copied, setCopied] = useState(false);
  const text = "Lista de compras:\n" + list.map((n) => "• " + n).join("\n");
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  async function copyList() {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    buzz(30); setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  async function shareList() { try { await navigator.share({ title: "Lista de compras", text }); } catch {} }

  const week = useMemo(() => weekShop(trainings), [trainings]);
  const fmtQ = fmtQty;

  const Quick = ({ title, items }) => (
    <div className="card">
      <h3>{title}</h3>
      <div className="chips">{items.map((n) => {
        const inList = list.includes(n);
        return <button key={n} className={"chip" + (inList ? " picked" : "")} onClick={() => inList ? bought(n) : add(n)}><b>{n}</b></button>;
      })}</div>
    </div>
  );

  return (
    <>
      <div className="card">
        <div className="mh"><h2>Para comprar</h2><span className="tag num">{list.length} {list.length === 1 ? "item" : "itens"}</span></div>
        {list.length > 0 && <div className="row">
          <button className="pri grow big" onClick={copyList}>{copied ? "Copiado ✓" : "Copiar lista"}</button>
          {canShare && <button className="ok grow big" onClick={shareList}>Enviar</button>}
        </div>}
        {list.length === 0 ? <div className="tag">Nada na lista. Quando algo acabar, toque nele abaixo.</div> :
          list.map((n) => (
            <div key={n} className="item">
              <button className="ck" aria-label={"Comprei " + n} onClick={() => bought(n)} />
              <div className="t" onClick={() => bought(n)}><b>{n}</b></div>
            </div>
          ))}
        <div className="row">
          <input id="shopadd" placeholder="Adicionar outro item" value={txt} onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { add(txt); setTxt(""); } }} style={{ flex: 1, minWidth: 0 }} />
          <button className="pri" onClick={() => { add(txt); setTxt(""); }}>Adicionar</button>
        </div>
      </div>

      <button onClick={() => { const add = WEEK_BASIC.filter((n) => !list.includes(n)); save([...list, ...add]); buzz(30); say(add.length ? `${add.length} itens da semana adicionados` : "A lista da semana já está aí"); }}>+ Adicionar compra básica da semana</button>

      <Prep {...{ settings, saveSettings, say }} />

      <div className="tag">O que acabou? Toque para pôr na lista (toque de novo para tirar).</div>
      <Quick title="Suplementos" items={SUP_ITEMS} />
      <Quick title="Alimentos da dieta" items={FOOD_ITEMS} />

      <div className="card">
        <div className="mh"><h3>Quantidade por semana</h3><span className="tag">referência</span></div>
        <div className="row tag">Treinos/semana <input id="trn" type="number" min="0" max="7" value={trainings} onChange={(e) => setTrainings(+e.target.value)} style={{ width: 70 }} /></div>
        <table><tbody>{week.map(([n, { q, u }]) => <tr key={n}><td>{n}</td><td className="q">{fmtQ(q, u)}</td></tr>)}</tbody></table>
        <div className="tag">Arroz e feijão em peso cozido. Mais Ômega 3 (3 g/dia), Centrum e cápsulas.</div>
      </div>
    </>
  );
}

/* ---------- ESTOQUE ---------- */
function Stock({ settings, saveSettings, today }) {
  const stock = settings.supplies?._stock || {};
  const set = (id, patch) => saveSettings({ supplies: { ...settings.supplies, _stock: { ...stock, [id]: { ...stock[id], ...patch } } } });
  return (
    <div className="card">
      <h2>Estoque</h2>
      <div className="tag">Ao abrir um pote, toque em "Abri um novo". Ele calcula quanto resta pelo consumo do plano e, faltando 5 dias, coloca na lista de compras e te avisa.</div>
      {SUPPLIES.map((s) => {
        const info = stock[s.id], r = stockLeft(s, info, today);
        return (
          <div key={s.id} className="stock">
            <div className="mh"><b>{s.name}</b>{r && <span className={"tag num" + (r.days <= 5 ? " warn" : "")}>~{r.left} {s.unit.split(" ")[0]} · {r.days} dias</span>}</div>
            {r && <div className="bar"><i style={{ width: `${Math.min(100, (r.left / (+info.qty || s.def)) * 100)}%`, background: r.days <= 5 ? "var(--warn)" : "var(--ok)" }} /></div>}
            <div className="row tag">
              <span>Pote com</span>
              <input id={"qty-" + s.id} type="number" inputMode="numeric" value={info?.qty ?? s.def} onChange={(e) => set(s.id, { qty: +e.target.value })} style={{ width: 84 }} />
              <span>{s.unit}</span>
              <button className="sm" onClick={() => set(s.id, { start: today, qty: info?.qty ?? s.def, auto: null })}>Abri um novo</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- ATALHOS ---------- */
function Shortcuts() {
  const base = typeof location !== "undefined" ? location.origin : "https://protocolo-victor.vercel.app";
  const [c, setC] = useState(null);
  const copy = async (t) => { try { await navigator.clipboard.writeText(t); setC(t); setTimeout(() => setC(null), 2000); } catch {} };
  return (
    <div className="card">
      <h2>Atalho "Bebi água" (Siri)</h2>
      <ol className="steps">
        <li>Abra o app <b>Atalhos</b> do iPhone → <b>+</b> → <b>Adicionar Ação</b> → busque <b>Abrir URLs</b></li>
        <li>Cole o endereço abaixo e dê o nome <b>Bebi água</b></li>
        <li>Diga "E aí Siri, bebi água", ou adicione o atalho na tela de início / Toque Atrás (Ajustes → Acessibilidade → Toque)</li>
      </ol>
      {[250, 500].map((v) => { const u = `${base}/?agua=${v}`; return <button key={v} className="opt" onClick={() => copy(u)}><span className="num" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{u}</span><span className="q">{c === u ? "copiado" : "copiar"}</span></button>; })}
    </div>
  );
}

/* ---------- LINK DO PERSONAL ---------- */
function PersonalLink({ settings, saveSettings, say }) {
  const token = settings.supplies?._token;
  const url = token ? `${typeof location !== "undefined" ? location.origin : ""}/p/${token}` : null;
  const gen = () => { const t = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); saveSettings({ supplies: { ...settings.supplies, _token: t } }); };
  return (
    <div className="card">
      <h2>Link para o personal</h2>
      <div className="tag">Página só de leitura com adesão, água, treinos, peso e check-ins dos últimos 28 dias. Dá para salvar em PDF por lá.</div>
      {url ? <>
        <button className="opt" onClick={async () => { try { await navigator.clipboard.writeText(url); say("Link copiado"); } catch {} }}><span className="num" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{url}</span><span className="q">copiar</span></button>
        <div className="row"><a className="btn" href={url} target="_blank" rel="noreferrer">Ver como o personal vê</a>
          <button onClick={() => { const s2 = { ...settings.supplies }; delete s2._token; saveSettings({ supplies: s2 }); say("Link desativado"); }}>Desativar link</button></div>
      </> : <button className="pri" onClick={gen}>Gerar link</button>}
    </div>
  );
}

/* ---------- FOTOS DO DIA ---------- */
function DailyPhotos({ uid, day, say }) {
  const [shots, setShots] = useState({}); const [ghosts, setGhosts] = useState({});
  const [busy, setBusy] = useState(null); const [cam, setCam] = useState(null);
  const load = useCallback(async () => {
    const r = {}, g = {};
    for (const [t] of PHOTO_TYPES) {
      const l = await listDaily(uid, t, addDays(day, -60), day);
      const todays = l.filter((x) => x.day === day), prev = l.filter((x) => x.day < day);
      if (todays.length) r[t] = todays.at(-1).url;
      if (prev.length) g[t] = prev.at(-1).url;
    }
    setShots(r); setGhosts(g);
  }, [uid, day]);
  useEffect(() => { load(); }, [load]);
  async function save(t, file) {
    setBusy(t); setCam(null);
    try { await saveDaily(uid, day, t, file); buzz(40); say("Foto salva"); await load(); }
    catch { say("Não consegui salvar a foto. Tente de novo."); }
    setBusy(null);
  }
  const done = PHOTO_TYPES.filter(([t]) => shots[t]).length;
  return (
    <Fold done={done === PHOTO_TYPES.length} label="Fotos do dia" summary="rosto e corpo salvos">
    <section className={"card" + (done === PHOTO_TYPES.length ? " complete" : "")}>
      <div className="mh"><h3>Fotos do dia</h3><span className="tag num">{done}/{PHOTO_TYPES.length}</span></div>
      <div className="shots">
        {PHOTO_TYPES.map(([t, l]) => (
          <button key={t} className={"shot" + (shots[t] ? " has" : "")} onClick={() => setCam(t)}>
            {shots[t] ? <img src={shots[t]} alt={l} /> : <span className="shot-empty"><Icon n="camera" s={26} />{busy === t ? "Salvando…" : l}</span>}
            {shots[t] && <span className="shot-lbl">{busy === t ? "Salvando…" : `${l} · refazer`}</span>}
          </button>
        ))}
      </div>
      <div className="tag">A câmera mostra a foto anterior transparente para você se alinhar na mesma posição.</div>
    </section>
    {cam && <CameraSheet type={cam} label={PHOTO_TYPES.find(([t]) => t === cam)[1]} ghost={ghosts[cam]} onClose={() => setCam(null)} onShot={(f) => save(cam, f)} />}
    </Fold>
  );
}

function CameraSheet({ type, label, ghost, onClose, onShot }) {
  const video = useRef(null); const streamRef = useRef(null);
  const [facing, setFacing] = useState(type === "rosto" ? "user" : "environment");
  const [err, setErr] = useState(null); const [opacity, setOpacity] = useState(0.35);
  const [timer, setTimer] = useState(type === "corpo" ? 10 : 3); const [count, setCount] = useState(0);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1920 } }, audio: false });
        if (off) { st.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = st; if (video.current) { video.current.srcObject = st; await video.current.play().catch(() => {}); }
        setErr(null);
      } catch { setErr("Não consegui abrir a câmera. Libere em Ajustes → Protocolo → Câmera, ou escolha da galeria."); }
    })();
    return () => { off = true; };
  }, [facing]);
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);
  const mirror = facing === "user";
  function capture() {
    const v = video.current; if (!v?.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    const ctx = c.getContext("2d"); if (mirror) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    c.toBlob((b) => b && onShot(new File([b], `${type}.jpg`, { type: "image/jpeg" })), "image/jpeg", 0.9);
  }
  function shoot() {
    if (!timer) return capture();
    let n = timer; setCount(n);
    const t = setInterval(() => { n -= 1; setCount(n); buzz(10); if (n <= 0) { clearInterval(t); capture(); } }, 1000);
  }
  return (
    <div className="cam">
      <div className="cam-top"><b>{label}</b><button className="sm" onClick={onClose}>Fechar</button></div>
      <div className="cam-view">
        {err ? <div className="tag cam-err">{err}</div> : <video ref={video} playsInline muted autoPlay style={{ transform: mirror ? "scaleX(-1)" : "none" }} />}
        {ghost && !err && <img className="ghost" src={ghost} alt="" style={{ opacity }} />}
        {count > 0 && <div className="countdown">{count}</div>}
        <div className="cam-grid" aria-hidden="true" />
      </div>
      <div className="cam-ctl">
        {ghost && <label className="row tag">Guia <input id="ghostop" type="range" min="0" max="0.7" step="0.05" value={opacity} onChange={(e) => setOpacity(+e.target.value)} style={{ flex: 1 }} /></label>}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="seg">{[0, 3, 10].map((t) => <button key={t} className={timer === t ? "on" : ""} onClick={() => setTimer(t)}>{t ? `${t}s` : "Já"}</button>)}</div>
          <button className="sm" onClick={() => setFacing(facing === "user" ? "environment" : "user")}>Virar câmera</button>
        </div>
        <button className="shutter" onClick={shoot} disabled={!!err || count > 0} aria-label="Tirar foto" />
        <label className="link" style={{ alignSelf: "center" }}><input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onShot(f); }} />Escolher da galeria</label>
      </div>
    </div>
  );
}

/* ---------- EVOLUÇÃO ---------- */
function Evolution({ uid, day }) {
  const [type, setType] = useState("corpo");
  const [month, setMonth] = useState(day.slice(0, 7));
  const [list, setList] = useState([]); const [mode, setMode] = useState("carrossel");
  const [idx, setIdx] = useState(0); const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("");
  const from = `${month}-01`, to = addDays(addDays(`${month}-28`, 4).slice(0, 7) + "-01", -1);
  useEffect(() => { listDaily(uid, type, from, to).then((l) => { setList(l); setIdx(0); }); }, [uid, type, from, to]);
  useEffect(() => {
    if (!playing || list.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), 350);
    return () => clearInterval(t);
  }, [playing, list.length]);
  const shift = (n) => { const d = new Date(from + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); const m = d.toISOString().slice(0, 7); if (m <= day.slice(0, 7)) setMonth(m); };
  const lbl = (d) => fmtDay(d, { day: "2-digit", month: "2-digit" });

  async function share() {
    setMsg("Preparando…");
    const n = Math.min(10, list.length);
    const pick = Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / Math.max(1, n - 1))]);
    try {
      const files = await Promise.all(pick.map(async (p, i) => new File([await (await fetch(p.url)).blob()], `evolucao-${type}-${String(i + 1).padStart(2, "0")}-${p.day}.jpg`, { type: "image/jpeg" })));
      if (navigator.canShare?.({ files })) { await navigator.share({ files, title: `Evolução ${month}` }); setMsg(""); }
      else setMsg("Seu navegador não permite compartilhar arquivos. Abra pelo app na tela de início do iPhone.");
    } catch { setMsg(""); }
  }

  return (
    <div className="card">
      <div className="mh"><h2>Evolução</h2>
        <div className="seg">{PHOTO_TYPES.map(([t, l]) => <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{l.split(" ")[0]}</button>)}</div></div>
      <div className="mh">
        <button className="sm" onClick={() => shift(-1)} aria-label="Mês anterior">‹</button>
        <b>{new Date(from + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
        <button className="sm" onClick={() => shift(1)} aria-label="Próximo mês" disabled={month >= day.slice(0, 7)}>›</button>
      </div>
      {list.length === 0 ? <div className="tag">Nenhuma foto neste mês. Tire a primeira em Hoje → Fotos do dia.</div> : <>
        <div className="seg wide">
          {[["carrossel", "Carrossel"], ["timelapse", "Timelapse"], ["comparar", "1º × último"]].map(([k, l]) =>
            <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setPlaying(k === "timelapse"); }}>{l}</button>)}
        </div>
        {mode === "carrossel" && <div className="carousel">{list.map((p) => <figure key={p.id}><img src={p.url} alt={"Foto " + p.day} loading="lazy" /><figcaption>{lbl(p.day)}</figcaption></figure>)}</div>}
        {mode === "timelapse" && <figure className="tl-frame" onClick={() => setPlaying(!playing)}>
          <img src={list[idx]?.url} alt={"Foto " + list[idx]?.day} /><figcaption>{lbl(list[idx]?.day)} · {idx + 1}/{list.length} · {playing ? "toque para pausar" : "toque para tocar"}</figcaption></figure>}
        {mode === "comparar" && <div className="compare">
          {[list[0], list.at(-1)].map((p, i) => <figure key={i}><img src={p.url} alt={"Foto " + p.day} /><figcaption>{i ? "Último" : "Primeiro"} · {lbl(p.day)}</figcaption></figure>)}</div>}
        <button className="pri" onClick={share}>Compartilhar fotos do mês ({Math.min(10, list.length)})</button>
        <div className="tag">{msg || "Envia até 10 fotos espaçadas pelo mês, em ordem, prontas para um carrossel no Instagram ou para salvar no rolo da câmera."}</div>
      </>}
    </div>
  );
}

/* item concluído vira uma linha compacta (toque para abrir) */
function Fold({ done, label, summary, neutral, children }) {
  const [open, setOpen] = useState(false);
  if (!done || open) return children;
  return (
    <button className={"fold" + (neutral ? " neutral" : "")} onClick={() => setOpen(true)}>
      <span className="dot">{!neutral && <Icon n="check" s={14} />}</span><b>{label}</b><span className="tag">{summary}</span>
    </button>
  );
}

/* ---------- MEDIDAS ---------- */
const MEAS = [["cintura", "Cintura"], ["abdomen", "Abdômen (umbigo)"], ["quadril", "Quadril"], ["braco", "Braço (contraído)"], ["coxa", "Coxa"]];
function MeasureForm({ onSave, initial }) {
  const [m, setM] = useState(initial || {});
  const val = (k) => m[k] ?? "";
  return (
    <div className="ci">
      <div className="tag">Medidas em cm, com fita, sempre no mesmo ponto. Deixe em branco o que não medir.</div>
      {MEAS.map(([k, l]) => (
        <div key={k} className="ci-row"><span>{l}</span>
          <input id={"med-" + k} inputMode="decimal" placeholder="cm" value={val(k)} onChange={(e) => setM({ ...m, [k]: e.target.value })} style={{ width: 90 }} /></div>
      ))}
      <button className="pri" disabled={!MEAS.some(([k]) => parseFloat(String(m[k] || "").replace(",", ".")))} onClick={() => {
        const out = {}; MEAS.forEach(([k]) => { const v = parseFloat(String(m[k] || "").replace(",", ".")); if (v) out[k] = v; }); onSave(out);
      }}>Salvar medidas</button>
    </div>
  );
}
function Measures({ week, day, onSave }) {
  const [open, setOpen] = useState(false);
  const days = Object.keys(week).filter((d) => week[d]?.checks?._med).sort();
  const first = days.length ? week[days[0]].checks._med : null, last = days.length ? week[days.at(-1)].checks._med : null;
  return (
    <div className="card">
      <div className="mh"><h2>Medidas</h2>{!open && <button className="sm" onClick={() => setOpen(true)}>Registrar hoje</button>}</div>
      {last ? <table><tbody>{MEAS.filter(([k]) => last[k]).map(([k, l]) => {
        const dlt = first?.[k] ? last[k] - first[k] : 0;
        return <tr key={k}><td>{l}</td><td className="q">{String(last[k]).replace(".", ",")} cm</td><td className={"tag num" + (dlt < 0 ? " okc" : "")}>{days.length > 1 && first?.[k] ? `${dlt > 0 ? "+" : ""}${dlt.toFixed(1).replace(".", ",")}` : ""}</td></tr>;
      })}</tbody></table> : <div className="tag">Nenhuma medida ainda. Registre junto com a pesagem semanal: às vezes a balança não mexe, mas a fita sim.</div>}
      {days.length > 1 && <div className="tag">Variação desde {fmtDay(days[0], { day: "2-digit", month: "2-digit" })}.</div>}
      {open && <MeasureForm initial={week[day]?.checks?._med} onSave={(m) => { onSave(m); setOpen(false); }} />}
    </div>
  );
}

/* ---------- BALANÇA / BIOIMPEDÂNCIA ---------- */
const BIO = [
  ["peso", "Peso", "kg"], ["gordura", "Gordura corporal", "%"], ["magra", "Massa magra", "kg"], ["musculo", "Massa muscular", "kg"],
  ["agua", "Água corporal", "%"], ["visceral", "Gordura visceral", ""], ["imc", "IMC", ""],
];
// aceita "72,4 kg", "72.4", "0,182" (vira 18,2%) etc.
function parseBio(search) {
  const q = new URLSearchParams(search); const out = {};
  BIO.forEach(([k, , u]) => {
    const raw = q.get(k); if (!raw) return;
    const m = String(raw).replace(",", ".").match(/-?\d+(\.\d+)?/); if (!m) return;
    let v = parseFloat(m[0]); if (!isFinite(v) || v <= 0) return;
    if (u === "%" && v < 1) v *= 100;
    out[k] = Math.round(v * 10) / 10;
  });
  return Object.keys(out).length ? out : null;
}
function BodyComp({ week }) {
  const [selRaw, setSel] = useState(null);
  const days = Object.keys(week).filter((d) => week[d]?.checks?._bio).sort();
  if (!days.length) return (
    <div className="card"><h2>Composição corporal</h2>
      <div className="tag">Os dados da balança (peso, % de gordura, massa magra e IMC) aparecem aqui com a evolução semana a semana. Configure o atalho em Plano → Balança.</div></div>
  );
  // agrupa por semana (segunda a domingo) usando a média da semana
  const monday = (d) => addDays(d, -((weekday(d) + 6) % 7));
  const weeks = {};
  days.forEach((d) => { const w = monday(d); (weeks[w] = weeks[w] || []).push(week[d].checks._bio); });
  const wkeys = Object.keys(weeks).sort().slice(-12);
  const avg = (w, k) => { const v = weeks[w].map((b) => b[k]).filter(Boolean); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  const METRICS = [["gordura", "Gordura corporal", "%", "down"], ["magra", "Massa magra", "kg", "up"], ["peso", "Peso", "kg", null], ["imc", "IMC", "", null], ["musculo", "Massa muscular", "kg", "up"], ["visceral", "Gordura visceral", "", "down"]];
  const shown = METRICS.filter(([k]) => wkeys.some((w) => avg(w, k) !== null));
  const sel = selRaw || shown[0]?.[0];
  const cur = METRICS.find(([k]) => k === sel) || shown[0];
  const serie = wkeys.map((w) => ({ day: w, kg: avg(w, cur[0]) })).filter((p) => p.kg !== null);
  const fmt = (v) => String(v).replace(".", ",");
  return (
    <div className="card">
      <div className="mh"><h2>Composição corporal</h2><span className="tag">média por semana</span></div>
      <div className="bio-tiles">
        {shown.map(([k, l, u, dir]) => {
          const s2 = wkeys.map((w) => avg(w, k)).filter((v) => v !== null);
          const last = s2.at(-1), prev = s2.at(-2), d = prev != null ? Math.round((last - prev) * 10) / 10 : null;
          const good = d == null || d === 0 || !dir ? "" : (dir === "down" ? d < 0 : d > 0) ? " okc" : " warn";
          return (
            <button key={k} className={"bio-tile" + (sel === k ? " on" : "")} onClick={() => setSel(k)}>
              <span className="lbl">{l}</span>
              <b className="num">{fmt(last)}{u && <small> {u}</small>}</b>
              <span className={"tag num" + good}>{d == null ? "1ª semana" : `${d > 0 ? "+" : ""}${fmt(d)} na semana`}</span>
            </button>
          );
        })}
      </div>
      {serie.length > 1
        ? <><div className="lbl">{cur[1]} · semana a semana</div><WeekBars data={serie} unit={cur[2]} dir={cur[3]} /></>
        : <div className="tag">O gráfico semanal aparece a partir da 2ª semana de pesagens.</div>}
      {serie.length > 1 && (() => { const t = Math.round((serie.at(-1).kg - serie[0].kg) * 10) / 10; return <div className="tag">Desde a semana de {fmtDay(serie[0].day, { day: "2-digit", month: "2-digit" })}: <b className={cur[3] && t !== 0 ? ((cur[3] === "down" ? t < 0 : t > 0) ? "okc" : "warn") : ""}>{t > 0 ? "+" : ""}{fmt(t)}{cur[2] ? ` ${cur[2]}` : ""}</b>. Pese sempre em jejum, no mesmo horário: bioimpedância varia com água.</div>; })()}
    </div>
  );
}
function WeekBars({ data, unit, dir }) {
  const W = 330, H = 140, P = 8, B = 22, vals = data.map((p) => p.kg);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(0.5, (hi - lo) * 0.25);
  const min = lo - pad, max = hi + pad;
  const x = (i) => P + 4 + (i * (W - 2 * P - 8)) / Math.max(1, data.length - 1);
  const y = (v) => 18 + ((max - v) * (H - 18 - B)) / (max - min);
  const line = data.map((p, i) => `${x(i)},${y(p.kg)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      <polygon points={`${x(0)},${H - B} ${line} ${x(data.length - 1)},${H - B}`} fill="var(--accent-soft)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((p, i) => {
        const d = i ? p.kg - data[i - 1].kg : 0, good = !dir || !i || d === 0 ? "var(--accent)" : (dir === "down" ? d < 0 : d > 0) ? "var(--ok)" : "var(--warn)";
        return <g key={p.day}>
          <circle cx={x(i)} cy={y(p.kg)} r={i === data.length - 1 ? 5 : 3.5} fill={good} />
          {(i === data.length - 1 || i === 0 || data.length <= 6) && <text x={x(i)} y={y(p.kg) - 9} fontSize="10.5" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="var(--fg)">{String(p.kg).replace(".", ",")}{unit === "%" ? "%" : ""}</text>}
          <text x={x(i)} y={H - 6} fontSize="9.5" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="var(--mute)">{p.day.slice(8)}/{p.day.slice(5, 7)}</text>
        </g>;
      })}
    </svg>
  );
}
function LineChart({ data, unit }) {
  const W = 320, H = 110, P = 30, vals = data.map((p) => p.kg);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const x = (i) => P + (i * (W - P - 10)) / Math.max(1, data.length - 1), y = (v) => 10 + ((hi - v) * (H - 30)) / (hi - lo);
  const line = data.map((p, i) => `${x(i)},${y(p.kg)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      {[lo, hi].map((v) => <g key={v}><line x1={P} x2={W - 10} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x="0" y={y(v) + 4} fontSize="10" fill="var(--mute)">{v}</text></g>)}
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={x(data.length - 1)} cy={y(vals.at(-1))} r="4" fill="var(--accent)" />
      <text x={x(data.length - 1)} y={y(vals.at(-1)) - 8} fontSize="11" textAnchor="end" fill="var(--fg)">{String(vals.at(-1)).replace(".", ",")}{unit}</text>
    </svg>
  );
}
function ScaleShortcut() {
  const base = typeof location !== "undefined" ? location.origin : "https://protocolo-victor.vercel.app";
  const [c, setC] = useState(false);
  const url = `${base}/?peso=`;
  return (
    <div className="card">
      <h2>Balança (bioimpedância)</h2>
      <div className="tag">Sua balança manda os dados para o app <b>Saúde</b>. Este atalho pega de lá e joga aqui sozinho.</div>
      <ol className="steps">
        <li>No app da balança: ative a sincronização com o <b>Saúde</b> (Apple Health).</li>
        <li>App <b>Atalhos</b> → <b>+</b> → adicione <b>Encontrar Amostras de Saúde</b>: tipo <b>Peso</b>, ordenar por <b>Data de Início, mais recente</b>, limite <b>1</b>.</li>
        <li>Repita a ação para <b>Percentual de Gordura Corporal</b> e <b>Massa Corporal Magra</b>.</li>
        <li>Adicione <b>Abrir URLs</b> e monte: o endereço abaixo + a variável Peso, depois <b>&amp;gordura=</b> + variável Gordura, <b>&amp;magra=</b> + variável Massa Magra.</li>
        <li>Nome: <b>Pesagem</b>. Para ficar automático: aba <b>Automação</b> → <b>App</b> → escolha o app da balança → <b>For fechado</b> → <b>Executar imediatamente</b> → atalho Pesagem.</li>
      </ol>
      <button className="opt" onClick={async () => { try { await navigator.clipboard.writeText(url); setC(true); setTimeout(() => setC(false), 2000); } catch {} }}>
        <span className="num" style={{ fontSize: 12.5, wordBreak: "break-all" }}>{url}<i style={{ color: "var(--mute)" }}>[Peso]&amp;gordura=[Gordura]&amp;magra=[Magra]</i></span><span className="q">{c ? "copiado" : "copiar"}</span></button>
      <div className="tag">Também aceita: &amp;musculo= &amp;agua= &amp;visceral= &amp;imc=. Resultado: você se pesa, fecha o app da balança e tudo aparece em Progresso.</div>
    </div>
  );
}

/* ---------- TREINO GUIADO ---------- */
function Gym({ w, checks, saveLog, settings, saveSettings, onClose, onDone }) {
  const sets = checks._sets || {};
  const loads = settings.supplies?._loads || {};
  const [tip, setTip] = useState(null);
  const [rest, setRest] = useState(0);
  useEffect(() => { if (rest <= 0) return; const t = setTimeout(() => { setRest(rest - 1); if (rest === 1) buzz(300); }, 1000); return () => clearTimeout(t); }, [rest]);
  const key = (i) => `${w.id}${i}`;
  const total = w.ex.reduce((a, e) => a + e.s, 0), done = w.ex.reduce((a, e, i) => a + Math.min(e.s, sets[key(i)] || 0), 0);
  const cur = w.ex.findIndex((e, i) => (sets[key(i)] || 0) < e.s);
  function doSet(i, e) { const n = (sets[key(i)] || 0) + 1; buzz(); saveLog({ checks: { _sets: { ...sets, [key(i)]: Math.min(n, e.s) } } }); if (n < e.s || i < w.ex.length - 1) setRest(e.rest || 45); }
  return (
    <div className="gym">
      <div className="mh"><div><div className="lbl">Treino {w.id}</div><h2>{w.name}</h2></div><button className="sm" onClick={onClose}>Fechar</button></div>
      <div className="bar"><i style={{ width: `${(done / total) * 100}%` }} /></div>
      <div className="tag">{done}/{total} séries · siga a ordem de cima para baixo · toque no nome para ver como fazer</div>
      {rest > 0 && <button className="rest" onClick={() => setRest(0)}>Descanso <b className="num">{rest}s</b> <span className="tag">toque para pular</span></button>}
      <div className="gym-list">
        {w.ex.map((e, i) => {
          const n = sets[key(i)] || 0, ok = n >= e.s;
          return (
            <div key={i} className={"gx" + (ok ? " done" : "") + (i === cur ? " cur" : "")}>
              <button className="gx-head" onClick={() => setTip(tip === i ? null : i)}>
                <span className="gx-n num">{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}><b>{e.n}</b><div className="tag">{e.s} séries × {e.r} reps · descanso {e.rest}s{e.load ? ` · ${e.load}` : ""}</div></span>
              </button>
              {tip === i && <div className="gx-tip">{e.img && <img className="gx-img" src={`/ex/${e.img}.jpg`} alt={e.n} loading="lazy" />}{e.tip}</div>}
              <div className="row">
                <div className="dots">{Array.from({ length: e.s }, (_, k) => <i key={k} className={k < n ? "on" : ""} />)}</div>
                <input inputMode="decimal" placeholder="kg" value={loads[e.n] ?? ""} onChange={(ev) => saveSettings({ supplies: { ...settings.supplies, _loads: { ...loads, [e.n]: ev.target.value } } })} style={{ width: 70 }} aria-label="Carga usada" />
                {!ok ? <button className="ok" onClick={() => doSet(i, e)}>Série {n + 1} feita</button> : <button className="sm" onClick={() => saveLog({ checks: { _sets: { ...sets, [key(i)]: 0 } } })}>Refazer</button>}
              </div>
            </div>
          );
        })}
      </div>
      <button className="ok big" onClick={onDone}><Icon n="check" /> Terminei o treino</button>
      <div className="tag">A carga que você digita fica salva para a próxima vez. Na dúvida sobre um aparelho, peça ao instrutor da academia para ajustar na primeira vez.</div>
    </div>
  );
}

/* ---------- ABA TREINO ---------- */
function TrainTab({ log, saveLog, settings, saveSettings, week, day }) {
  const T = settings.times || {};
  const checks = log.checks || {};
  const divs = Math.min(+(T.divs || 5), WORKOUTS.length), nextIdx = +(T.next || 0) % divs;
  const [gym, setGym] = useState(null);
  const done = !!log.workout_at;
  const sets = checks._sets || {};
  async function finish(w) {
    setGym(null); buzz(60);
    const idx = WORKOUTS.indexOf(w);
    await saveLog({ workout_at: new Date().toISOString(), checks: { _wk: w.id } });
    saveSettings({ times: { ...T, next: (idx + 1) % divs } });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey + 1 col. de mel", icon: "/icon-192.png" }); } catch {}
  }
  // treinos feitos nesta semana (segunda a domingo)
  const mon = addDays(day, -((weekday(day) + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((d) => d <= day);
  const doneWeek = {};
  weekDays.forEach((d) => { const l = week[d]; if (l?.workout_at) doneWeek[l.checks?._wk || "?"] = d; });
  const nDone = weekDays.filter((d) => week[d]?.workout_at).length;
  return (
    <>
      <section className="card now">
        <div className="lbl now-lbl">{done ? "Treino de hoje feito" : `Hoje · ${trainTime(T, spNow().day)}`}</div>
        <h2 className="now-title">Treino {WORKOUTS[nextIdx].id} · {WORKOUTS[nextIdx].name}</h2>
        <div className="tag">{WORKOUTS[nextIdx].ex.length} exercícios · pré-treino 30 min antes · siga a ordem A→E, não o dia da semana</div>
        <button className="pri big" onClick={() => setGym(WORKOUTS[nextIdx])}><Icon n="dumbbell" s={18} /> {done ? "Ver próximo treino" : "Começar treino"}</button>
      </section>
      <div className="card">
        <div className="mh"><h3>Esta semana</h3><span className="tag num">{nDone} treino{nDone === 1 ? "" : "s"}</span></div>
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(mon, i)).map((d) => {
            const l = week[d], did = !!l?.workout_at;
            return <div key={d} className={"d" + (did ? " full" : "") + (d === day ? " today" : "")}>{fmtDay(d, { weekday: "short" }).slice(0, 3)}<b>{did ? (l.checks?._wk || "✓") : "·"}</b></div>;
          })}
        </div>
      </div>
      <div className="card">
        <h3>Todos os treinos</h3>
        {WORKOUTS.slice(0, divs).map((w, i) => {
          const tot = w.ex.reduce((a, e) => a + e.s, 0), d = w.ex.reduce((a, e, k) => a + Math.min(e.s, sets[`${w.id}${k}`] || 0), 0);
          return (
            <button key={w.id} className="tl-head" onClick={() => setGym(w)}>
              <span className={"gx-n num" + (i === nextIdx ? " nx" : "")}>{w.id}</span>
              <span className="tl-name">{w.name}<div className="tag">{w.ex.map((e) => e.n.split(" (")[0]).slice(0, 3).join(" · ")}…</div></span>
              <span className={"tag num" + (doneWeek[w.id] ? " okc" : "")}>{doneWeek[w.id] ? `✓ ${fmtDay(doneWeek[w.id], { weekday: "short" }).slice(0, 3)}` : d ? `${d}/${tot}` : i === nextIdx ? "próximo" : `${w.ex.length} ex.`}</span>
            </button>
          );
        })}
        <div className="tag">Toque em qualquer treino para ver os exercícios, como fazer cada um e registrar as cargas.</div>
      </div>
      {gym && <Gym w={gym} checks={checks} saveLog={saveLog} settings={settings} saveSettings={saveSettings} onClose={() => setGym(null)} onDone={() => finish(gym)} />}
    </>
  );
}
