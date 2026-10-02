"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { RECIPES } from "@/lib/recipes";
import { supabase, spNow, toMin, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, GROUPS, RULES, SUPPLIES, WATER_GOAL, START_WEIGHT, LETTERS, CAFFEINE, CAFFEINE_MAX, WEEKDAYS, PREWORKOUT, stockLeft, effectiveNow, weekday, mealTime, trainTime, itemDone, mealIsDone, dayScore, replaceSuggestion, weekShop, fmtQty } from "@/lib/plan";

const EMPTY = { checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null };
const CUP = 250, CUPS = Math.ceil(WATER_GOAL / CUP);
const MFIT_URL = "https://www.mfitpersonal.com.br";

const score = dayScore;
const fmtPortion = (p, measure) => p === 1 ? measure : p === 0.5 ? `½ de ${measure}` : `${p}× ${measure}`;
const b64ToU8 = (b) => { const p = "=".repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
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
  const setWeekBoth = (m) => { weekRef.current = m; setWeek(m); };
  const tick = () => { const e = effectiveNow(spNow(), timesRef.current, addDays); setToday(e.day); setNow(e.min); return e; };
  const load = useCallback(async () => {
    const { data: st } = await supabase.from("settings").select("*").eq("user_id", uid).maybeSingle();
    if (st) { setSettings(st); timesRef.current = st.times || {}; }
    const e = tick();
    const { data: logs } = await supabase.from("day_logs").select("*").eq("user_id", uid).gte("day", addDays(e.day, -119));
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
  }, [uid]);
  const day = viewDay || today;
  const now = viewDay ? 24 * 60 : nowMin;
  useEffect(() => { setLog(week[day] || EMPTY); }, [week, day]);
  useEffect(() => {
    load();
    const f = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", f);
    const t = setInterval(tick, 30000);
    return () => { document.removeEventListener("visibilitychange", f); clearInterval(t); };
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
      if (m) { buzz(40); say(`${m.name} completo`); }
    }
    if (score(cur) < 100 && score(next) === 100) { setParty(true); setTimeout(() => setParty(false), 3500); }
    pending.current++;
    chain.current = chain.current.then(async () => {
      const l = weekRef.current[d] || next; // sempre grava a versão mais recente
      for (let tries = 0; tries < 3; tries++) {
        const { error } = await supabase.from("day_logs").upsert({ user_id: uid, day: d, checks: l.checks || {}, swaps: l.swaps || {}, water_ml: l.water_ml || 0, free_meal: !!l.free_meal, workout_at: l.workout_at || null, updated_at: new Date().toISOString() });
        if (!error) break;
        if (tries === 2) say("Sem conexão: tente de novo");
        await new Promise((r) => setTimeout(r, 800));
      }
    }).catch(() => say("Sem conexão: tente de novo")).finally(() => { pending.current--; });
    return chain.current;
  }
  async function saveSettings(patch) {
    const next = { ...settings, ...patch }; setSettings(next); timesRef.current = next.times || {};
    await supabase.from("settings").upsert({ user_id: uid, times: next.times, update_date: next.update_date, supplies: next.supplies });
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

      {viewDay && tab === "hoje" && <div className="card editing"><span>Editando <b>{fmtDay(day, { weekday: "long", day: "2-digit", month: "2-digit" })}</b></span><button className="sm pri" onClick={() => setViewDay(null)}>Voltar para hoje</button></div>}
      {tab === "hoje" && <Today {...{ uid, log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }} />}
      {tab === "prog" && <Progress {...{ uid, week, day, settings, onRefresh: load }} />}
      {tab === "compras" && <Shopping {...{ settings, saveSettings, say }} />}
      {tab === "plano" && <Plan {...{ uid, settings, saveSettings, today, say }} />}

      {swapFor && <SwapSheet {...swapFor} addShop={addShop} current={log.swaps?.[swapFor.key]} onClose={() => setSwapFor(null)}
        onPick={(v) => { saveLog({ swaps: { [swapFor.key]: v || undefined } }); setSwapFor(null); say(v ? "Alimento trocado" : "Voltou ao original"); }} />}

      {toast && <div className="toast" role="status">{toast}</div>}
      {party && <Confetti />}

      <nav>
        {[["hoje", "Hoje", "today"], ["prog", "Progresso", "prog"], ["compras", "Compras", "cart"], ["plano", "Plano", "plan"]].map(([k, l, ic]) =>
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
  const divs = +(T.divs || 4), nextIdx = +(T.next || 0) % divs;
  const doneIdx = (nextIdx - 1 + divs) % divs;
  async function workoutDone() {
    buzz(60);
    await saveLog({ workout_at: new Date().toISOString() });
    saveSettings({ times: { ...T, next: (nextIdx + 1) % divs } });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey + 1 col. de mel", icon: "/icon-192.png" }); } catch {}
  }
  async function undoWorkout() { await saveLog({ workout_at: null }); saveSettings({ times: { ...T, next: doneIdx } }); say("Treino desmarcado"); }

  const weighDay = T.weigh !== undefined && T.weigh !== "" && +T.weigh === wd;

  return (
    <>
      <PushBanner />

      {weighDay && <WeighCard uid={uid} day={day} say={say} hasCheckin={!!checks._ci} saveCheckin={(ci) => saveLog({ checks: { _ci: ci } })} />}

      {missedList.map((m) => {
        const nx = nextOf(m);
        return (
          <section key={m.id} className="card missed">
            <div className="lbl warn">Refeição perdida · {tOf(m)}</div>
            <h3>{m.name}</h3>
            <div className="tag">Comeu e esqueceu de marcar? Toque em "Já comi". Se perdeu, o plano manda juntar com a próxima refeição ({nx.name}, {tOf(nx)}):</div>
            <ul className="sugg">{replaceSuggestion(m, nx).map((l) => <li key={l.text} className={l.sup ? "sup" : ""}>{l.text}</li>)}</ul>
            {mergesWeek >= 2 && <div className="tag warn">Atenção: você já repôs refeições {mergesWeek} vezes nos últimos 7 dias. O plano pede que isso não vire hábito.</div>}
            <div className="row">
              <button className="pri grow" onClick={() => doMerge(m, nx.id)}>Repor no {nx.name.toLowerCase()}</button>
              <button onClick={() => markAll(m)}>Já comi</button>
            </div>
            <button className="link" onClick={() => doMerge(m, "skip")}>Pular sem repor</button>
          </section>
        );
      })}

      {focus ? <NowCard m={focus} time={tOf(focus)} now={now} checks={checks} swaps={log.swaps || {}} toggle={toggle} markAll={markAll} setSwapFor={setSwapFor}
          extras={extrasFor(focus)} target={focus} freeBlocked={freeUsedOn} onFree={() => useFree(focus)}
          onSnooze={(m) => { const at = Math.max(now, toMin(tOf(m))) + 15; saveLog({ checks: { _snooze: { ...(checks._snooze || {}), [m.id]: at } } }); say(`Te lembro às ${fmtHM(at)}`); }} />
        : <div className="card complete"><h2>Dieta do dia completa</h2><div className="tag">Todas as refeições marcadas. Confira água e suplementos abaixo.</div></div>}

      {/* Suplementos */}
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

      {/* Água */}
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

      {/* Pré-treino */}
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

      {/* Treino */}
      <section className="card">
        <div className="mh"><h3>Treino</h3><span className="tag num">{trainTime(T, day)}</span></div>
        {workoutToday ? (
          <>
            <div className="big-line"><Icon n="check" /> Treino {LETTERS[doneIdx]} feito · próximo: <b>{LETTERS[nextIdx]}</b></div>
            <button className="link" onClick={undoWorkout}>Desfazer</button>
          </>
        ) : (
          <>
            <div className="big-line">Hoje: <b className="letter">Treino {LETTERS[nextIdx]}</b></div>
            <div className="row">
              <a className="btn" href={MFIT_URL} target="_blank" rel="noreferrer"><Icon n="ext" s={16} /> Abrir MFIT</a>
              <button className="ok grow" onClick={workoutDone}><Icon n="dumbbell" s={18} /> Terminei o treino</button>
            </div>
            <div className="tag">Ao terminar, o pós-treino entra na sua lista e o próximo treino avança.</div>
          </>
        )}
      </section>

      {/* Cafeína */}
      <section className="card">
        <div className="mh"><h3>Cafeína</h3><span className={"num" + (cafTotal > CAFFEINE_MAX ? " bad" : cafTotal >= 400 ? " warn" : "")}>{cafTotal} / {CAFFEINE_MAX} mg</span></div>
        <div className="bar"><i style={{ width: `${Math.min((cafTotal / CAFFEINE_MAX) * 100, 100)}%`, background: cafTotal > CAFFEINE_MAX ? "var(--bad)" : cafTotal >= 400 ? "var(--warn)" : "var(--accent)" }} /></div>
        {cafTotal >= 400 && <div className={"tag " + (cafTotal > CAFFEINE_MAX ? "bad" : "warn")}>{cafTotal > CAFFEINE_MAX ? "Passou do limite de 500 mg do plano." : `Restam ${CAFFEINE_MAX - cafTotal} mg para o limite.`}</div>}
        <div className="chips">
          {CAFFEINE.map(([n, mg]) => <button key={n} className="chip" onClick={() => { buzz(); saveLog({ checks: { _caf: [...caf, mg] } }); }}><span className="num">{mg} mg</span><b>{n}</b></button>)}
        </div>
        {caf.length > 0 && <button className="link" onClick={() => saveLog({ checks: { _caf: caf.slice(0, -1) } })}>Desfazer último</button>}
      </section>

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

function NowCard({ m, time, now, checks, swaps, toggle, markAll, setSwapFor, extras, target, freeBlocked, onFree, onSnooze }) {
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
      {!m.workout && !checks._free && !freeBlocked && <button className="link" onClick={onFree}>Usar a refeição livre da semana aqui</button>}
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
            {src.items.map((it, i) => <ItemRow key={i} {...{ m: src, it, i, checks, swaps, toggle, setSwapFor }} note={sugg[i]?.text} />)}
          </div>
        );
      })}
    </>
  );
}

function WeighCard({ uid, day, say, hasCheckin, saveCheckin }) {
  const [kg, setKg] = useState(""); const [saved, setSaved] = useState(false);
  useEffect(() => { supabase.from("weights").select("id").eq("user_id", uid).eq("day", day).then(({ data }) => setSaved(!!data?.length)); }, [uid, day]);
  if (saved && hasCheckin) return null;
  return (
    <section className="card now">
      <div className="lbl now-lbl">Dia de pesagem e check-in</div>
      {!saved && <>
        <div className="tag">Pese em jejum, depois do banheiro e antes de comer ou beber.</div>
        <div className="row"><input id="wkg" inputMode="decimal" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} style={{ width: 110 }} />
          <button className="pri" onClick={async () => { const v = parseFloat(kg.replace(",", ".")); if (!v) return; await supabase.from("weights").insert({ user_id: uid, day, kg: v }); setSaved(true); buzz(40); say("Peso registrado"); }}>Registrar peso</button></div>
      </>}
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
function Progress({ uid, week, day, settings, onRefresh }) {
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

  const days14 = Array.from({ length: 14 }, (_, i) => addDays(day, i - 13));
  const adh = Math.round(days14.reduce((a, d) => a + score(week[d]), 0) / 14);
  const waterAvg = Math.round(days14.reduce((a, d) => a + (week[d]?.water_ml || 0), 0) / 14);
  const free = days14.filter((d) => week[d]?.free_meal).length;
  const trained = days14.filter((d) => week[d]?.workout_at).length;
  let streak = 0; for (let i = 0; i < 120; i++) { if (score(week[addDays(day, -i)]) >= 95) streak++; else if (i > 0) break; }
  const last = weights.at(-1);
  const ciDays = Object.keys(week).filter((d) => week[d]?.checks?._ci).sort();
  const lastCi = ciDays.length ? week[ciDays.at(-1)].checks._ci : null;
  const [ciOpen, setCiOpen] = useState(false);
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
Adesão à dieta (14 dias): ${adh}%
Água média: ${(waterAvg / 1000).toFixed(1).replace(".", ",")} L/dia (meta 2,6 L)
Treinos (14 dias): ${trained}${lastCi ? `
Check-in (1-5): fome ${lastCi.fome} · energia ${lastCi.energia} · sono ${lastCi.sono} · intestino ${lastCi.intestino} · treinos ${lastCi.treino}` : ""}
Refeições livres: ${free} em 14 dias
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
        {ciOpen && <CheckinForm initial={week[day]?.checks?._ci} onSave={async (ci) => {
          const cur = week[day] || EMPTY;
          await supabase.from("day_logs").upsert({ user_id: uid, day, checks: { ...(cur.checks || {}), _ci: ci }, swaps: cur.swaps || {}, water_ml: cur.water_ml || 0, free_meal: !!cur.free_meal, workout_at: cur.workout_at || null });
          setCiOpen(false); onRefresh?.();
        }} />}
      </div>

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
  const divs = +(T.divs || 4);

  return (
    <>
      <div className="card">
        <h2>Horários</h2>
        <div className="tag">As notificações seguem estes horários.</div>
        {MEALS.filter((m) => !m.workout).map((m) => (
          <div key={m.id} className="mh"><span>{m.name}</span><input id={"tm-" + m.id} type="time" value={T[m.id] || m.time} onChange={(e) => setT(m.id, e.target.value)} /></div>
        ))}
        <div className="mh"><span>Treino</span><input id="tm-treino" type="time" value={T.treino || "18:00"} onChange={(e) => setT("treino", e.target.value)} /></div>
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
