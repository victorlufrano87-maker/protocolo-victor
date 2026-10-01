"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { supabase, spNow, toMin, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, GROUPS, RULES, SUPPLIES, WATER_GOAL, START_WEIGHT, mainItemsCount } from "@/lib/plan";

const EMPTY = { checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null };
const CUP = 250, CUPS = Math.ceil(WATER_GOAL / CUP);
const MFIT_URL = "https://www.mfitpersonal.com.br";
const LETTERS = "ABCDEF";

function score(log) {
  if (!log) return 0;
  let done = 0;
  MEALS.filter((m) => !m.workout).forEach((m) => m.items.forEach((_, i) => { if (log.checks?.[`${m.id}-${i}`]) done++; }));
  return Math.round(((done / mainItemsCount()) * 0.75 + Math.min((log.water_ml || 0) / WATER_GOAL, 1) * 0.25) * 100);
}
const fmtPortion = (p, measure) => p === 1 ? measure : p === 0.5 ? `½ de ${measure}` : `${p}× ${measure}`;
const b64ToU8 = (b) => { const p = "=".repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
const buzz = (ms = 15) => { try { navigator.vibrate?.(ms); } catch {} };
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
  const [day, setDay] = useState(spNow().day);
  const [now, setNow] = useState(spNow().min);
  const [log, setLog] = useState(EMPTY);
  const [week, setWeek] = useState({});
  const [settings, setSettings] = useState({ times: {}, update_date: null, supplies: {} });
  const [swapFor, setSwapFor] = useState(null);
  const [toast, setToast] = useState(null);
  const [party, setParty] = useState(false);

  const load = useCallback(async () => {
    const d = spNow().day; setDay(d); setNow(spNow().min);
    const [{ data: logs }, { data: st }] = await Promise.all([
      supabase.from("day_logs").select("*").eq("user_id", uid).gte("day", addDays(d, -29)),
      supabase.from("settings").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const map = Object.fromEntries((logs || []).map((l) => [l.day, l]));
    setWeek(map); setLog(map[d] || EMPTY);
    if (st) setSettings(st);
  }, [uid]);
  useEffect(() => {
    load();
    const f = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", f);
    const t = setInterval(() => setNow(spNow().min), 30000);
    return () => { document.removeEventListener("visibilitychange", f); clearInterval(t); };
  }, [load]);

  function say(msg) { setToast(msg); clearTimeout(say.t); say.t = setTimeout(() => setToast(null), 2200); }

  async function saveLog(patch) {
    const before = score(log);
    const next = { ...log, ...patch }; setLog(next); setWeek((w) => ({ ...w, [day]: next }));
    if (patch.checks) {
      const m = MEALS.find((m) => !mealDone(m, log.checks) && mealDone(m, next.checks));
      if (m) { buzz(40); say(`${m.name} completo`); }
    }
    if (before < 100 && score(next) === 100) { setParty(true); setTimeout(() => setParty(false), 3500); }
    await supabase.from("day_logs").upsert({ user_id: uid, day, checks: next.checks, swaps: next.swaps, water_ml: next.water_ml, free_meal: next.free_meal, workout_at: next.workout_at, updated_at: new Date().toISOString() });
  }
  async function saveSettings(patch) {
    const next = { ...settings, ...patch }; setSettings(next);
    await supabase.from("settings").upsert({ user_id: uid, times: next.times, update_date: next.update_date, supplies: next.supplies });
  }

  const s = score(log);
  const shopCount = (settings.supplies?._shop || []).length;
  async function addShop(name) {
    const list = settings.supplies?._shop || [];
    if (list.some((x) => x.toLowerCase() === name.toLowerCase())) { say("Já está na lista"); return; }
    await saveSettings({ supplies: { ...settings.supplies, _shop: [...list, name] } }); buzz(); say(`${name} na lista de compras`);
  }
  return (
    <div className="wrap">
      <header className="top">
        <Ring pct={s} />
        <div style={{ minWidth: 0 }}>
          <div className="lbl">{fmtDay(day, { weekday: "long", day: "2-digit", month: "long" })}</div>
          <h1>Protocolo Victor</h1>
          <div className="tag">{s === 100 ? "Dia 100% cumprido" : "Dr. Victor Rocha · 2.239 kcal · 199 g PTN"}</div>
        </div>
      </header>

      {tab === "hoje" && <Today {...{ log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }} />}
      {tab === "prog" && <Progress {...{ uid, week, day, settings }} />}
      {tab === "compras" && <Shopping {...{ settings, saveSettings, say }} />}
      {tab === "plano" && <Plan {...{ settings, saveSettings }} />}

      {swapFor && <SwapSheet {...swapFor} addShop={addShop} current={log.swaps?.[swapFor.key]} onClose={() => setSwapFor(null)}
        onPick={(v) => { const swaps = { ...log.swaps }; if (v) swaps[swapFor.key] = v; else delete swaps[swapFor.key]; saveLog({ swaps }); setSwapFor(null); say(v ? "Alimento trocado" : "Voltou ao original"); }} />}

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
function Today({ log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }) {
  const T = settings.times || {};
  const tOf = (m) => T[m.id] || m.time;
  const checks = log.checks || {};
  const workoutToday = !!log.workout_at;
  const meals = MEALS.filter((m) => !m.workout || workoutToday)
    .map((m) => m.workout ? { ...m, time: log.workout_at ? spNowTime(log.workout_at) : m.time } : m)
    .sort((a, b) => toMin(a.workout ? a.time : tOf(a)) - toMin(b.workout ? b.time : tOf(b)));
  const timeOf = (m) => m.workout ? m.time : tOf(m);

  // refeição em foco: pós-treino pendente > primeira pendente
  const pt = meals.find((m) => m.workout && !mealDone(m, checks));
  const main = meals.filter((m) => !m.workout);
  const missed = (m) => { const nx = main[main.indexOf(m) + 1]; return !mealDone(m, checks) && !!nx && toMin(timeOf(nx)) <= now; };
  const focus = pt || main.find((m) => !mealDone(m, checks) && !missed(m)) || main.find((m) => !mealDone(m, checks));
  const missedCount = main.filter(missed).length;
  const [open, setOpen] = useState(null);

  const toggle = (k, v) => { buzz(); saveLog({ checks: { ...checks, [k]: v } }); };
  const markAll = (m) => { const c = { ...checks }; m.items.forEach((_, i) => { c[`${m.id}-${i}`] = true; }); saveLog({ checks: c }); };

  // suplementos do dia em ordem de horário
  const sups = meals.flatMap((m) => m.items.map((it, i) => ({ it, k: `${m.id}-${i}`, time: timeOf(m) })).filter((x) => x.it.sup));

  // treino
  const divs = +(T.divs || 4), nextIdx = +(T.next || 0) % divs;
  const doneIdx = (nextIdx - 1 + divs) % divs;
  async function workoutDone() {
    buzz(60);
    await saveLog({ workout_at: new Date().toISOString() });
    saveSettings({ times: { ...T, next: (nextIdx + 1) % divs } });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey + 1 col. de mel", icon: "/icon-192.png" }); } catch {}
  }
  async function undoWorkout() {
    await saveLog({ workout_at: null });
    saveSettings({ times: { ...T, next: doneIdx } }); say("Treino desmarcado");
  }

  return (
    <>
      <PushBanner />

      {focus ? <NowCard m={focus} time={timeOf(focus)} now={now} checks={checks} swaps={log.swaps || {}} toggle={toggle} markAll={markAll} setSwapFor={setSwapFor} />
        : <div className="card complete"><h2>Dieta do dia completa</h2><div className="tag">Todas as refeições marcadas. Confira água e suplementos abaixo.</div></div>}

      {missedCount > 0 && <div className="tag warn">{missedCount} refeição(ões) anterior(es) não marcada(s). Se comeu, marque em "Dia completo". Se perdeu, una com a próxima (sem virar hábito).</div>}

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
          <button onClick={() => { buzz(); saveLog({ water_ml: log.water_ml + 500 }); }}>+ 500</button>
          <button aria-label="Remover 250 ml" onClick={() => saveLog({ water_ml: Math.max(0, log.water_ml - 250) })}>−</button>
        </div>
      </section>

      {/* Treino */}
      <section className="card">
        <div className="mh">
          <h3>Treino</h3>
          <span className="tag num">{T.treino || "18:00"}</span>
        </div>
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

      {/* Linha do dia */}
      <section className="card">
        <h3>Dia completo</h3>
        <div className="timeline">
          {meals.map((m) => {
            const done = mealDone(m, checks), n = m.items.filter((_, i) => checks[`${m.id}-${i}`]).length;
            const isOpen = open === m.id, late = !done && toMin(timeOf(m)) + 30 < now;
            return (
              <div key={m.id} className={"tl" + (done ? " done" : "") + (focus?.id === m.id ? " focus" : "")}>
                <button className="tl-head" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen}>
                  <span className="dot">{done && <Icon n="check" s={14} />}</span>
                  <span className="num tl-time">{timeOf(m)}</span>
                  <span className="tl-name">{m.name}</span>
                  <span className={"tag num" + (late ? " warn" : "")}>{done ? "feito" : !m.workout && missed(m) ? "perdida" : late ? "atrasada" : `${n}/${m.items.length}`}</span>
                </button>
                {isOpen && <div className="tl-body"><Items m={m} checks={checks} swaps={log.swaps || {}} toggle={toggle} setSwapFor={setSwapFor} />
                  {!done && <button className="ok" onClick={() => markAll(m)}>Marcar tudo</button>}</div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Semana */}
      <section className="card">
        <div className="mh"><h3>Semana</h3><span className="tag">verde = 100%</span></div>
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map((d) => {
            const sc = score(week[d]);
            return <div key={d} className={"d" + (sc >= 95 ? " full" : sc > 0 ? " part" : "") + (week[d]?.free_meal ? " free" : "") + (d === day ? " today" : "")}>
              {fmtDay(d, { weekday: "short" }).slice(0, 3)}<b>{sc}</b></div>;
          })}
        </div>
        <button onClick={() => saveLog({ free_meal: !log.free_meal })}>{log.free_meal ? "Refeição livre usada hoje ✓" : "Usei a refeição livre hoje"}</button>
      </section>
    </>
  );
}
function spNowTime(iso) { const m = spNow(new Date(iso)).min; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

function NowCard({ m, time, now, checks, swaps, toggle, markAll, setSwapFor }) {
  const diff = toMin(time) - now;
  const status = m.workout ? "Agora · pós-treino" : diff > 0 ? `Próxima · em ${fmtDur(diff)}` : diff > -30 ? "Agora" : `Atrasada · ${fmtDur(diff)}`;
  const n = m.items.filter((_, i) => checks[`${m.id}-${i}`]).length;
  return (
    <section className={"card now" + (diff <= -30 && !m.workout ? " late" : "")}>
      <div className="mh"><span className="lbl now-lbl">{status}</span><span className="time">{time}</span></div>
      <div className="mh"><h2 className="now-title">{m.name}</h2><span className="tag num">{n}/{m.items.length}</span></div>
      <Items m={m} checks={checks} swaps={swaps} toggle={toggle} setSwapFor={setSwapFor} />
      <button className="ok big" onClick={() => markAll(m)}><Icon n="check" /> Comi tudo</button>
    </section>
  );
}

function Items({ m, checks, swaps, toggle, setSwapFor }) {
  return m.items.map((it, i) => {
    const k = `${m.id}-${i}`, on = !!checks[k], sw = swaps[k];
    return (
      <div key={k} className={"item" + (on ? " done" : "")}>
        <button className={"ck" + (on ? " on" : "")} aria-pressed={on} aria-label={on ? "Desmarcar" : "Marcar"} onClick={() => toggle(k, !on)}>{on && <Icon n="check" s={16} />}</button>
        <div className="t" onClick={() => toggle(k, !on)}>
          <b>{it.sup && <span className="supl">SUPL</span>}{sw || it.t}</b>
          {sw && <div className="swapped">trocado · original: {it.t}</div>}
          {!sw && it.s && <div className="s">{it.s}</div>}
        </div>
        {it.g && <button className="icon-btn" aria-label="Trocar alimento" onClick={() => setSwapFor({ key: k, item: it })}><Icon n="swap" s={18} /></button>}
      </div>
    );
  });
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
function Progress({ uid, week, day, settings }) {
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
  let streak = 0; for (let i = 0; i < 30; i++) { if (score(week[addDays(day, -i)]) >= 95) streak++; else if (i > 0) break; }
  const last = weights.at(-1);

  const kit = `Atualização — ${fmtDay(day, { day: "2-digit", month: "2-digit", year: "numeric" })}
Peso em jejum: ${last ? String(last.kg).replace(".", ",") + " kg" : "—"} (inicial 72,4 kg${last ? `, ${(last.kg - START_WEIGHT >= 0 ? "+" : "")}${(last.kg - START_WEIGHT).toFixed(1).replace(".", ",")} kg` : ""})
Adesão à dieta (14 dias): ${adh}%
Água média: ${(waterAvg / 1000).toFixed(1).replace(".", ",")} L/dia (meta 2,6 L)
Treinos (14 dias): ${trained}
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
function Plan({ settings, saveSettings }) {
  const T = settings.times || {};
  const [trainings, setTrainings] = useState(5);
  const shop = useMemo(() => {
    const acc = {};
    MEALS.forEach((m) => m.items.forEach((it) => {
      if (!it.shop) return; const [n, q, u] = it.shop; const mult = m.workout ? trainings : 7;
      acc[n] = acc[n] || { q: 0, u }; acc[n].q += q * mult;
    }));
    acc["Creatina"] = { q: 42, u: "g" };
    return Object.entries(acc);
  }, [trainings]);
  const fmtQ = (q, u) => u === "g" && q >= 1000 ? `${(q / 1000).toFixed(2).replace(".", ",")} kg` : `${q} ${u}`;
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

      <div className="card">
        <h2>Estoque de suplementos</h2>
        <div className="tag">Informe quando abriu o pote. Aviso 5 dias antes de acabar.</div>
        {SUPPLIES.map((s) => {
          const start = settings.supplies?.[s.id]; const end = start && addDays(start, s.days);
          return <div key={s.id} className="mh"><span>{s.name}{end && <div className="tag">acaba em {fmtDay(end, { day: "2-digit", month: "2-digit" })}</div>}</span>
            <input id={"sup-" + s.id} type="date" value={start || ""} onChange={(e) => saveSettings({ supplies: { ...settings.supplies, [s.id]: e.target.value } })} /></div>;
        })}
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
const SUP_ITEMS = ["Ômega 3", "Cápsula 1 (manhã)", "Cápsula 2 (jantar)", "Creatina", "Centrum Adulto", "Whey concentrado"];
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

  const week = useMemo(() => {
    const acc = {};
    MEALS.forEach((m) => m.items.forEach((it) => {
      if (!it.shop) return; const [n, q, u] = it.shop; const mult = m.workout ? trainings : 7;
      acc[n] = acc[n] || { q: 0, u }; acc[n].q += q * mult;
    }));
    acc["Creatina"] = { q: 42, u: "g" };
    return Object.entries(acc);
  }, [trainings]);
  const fmtQ = (q, u) => u === "g" && q >= 1000 ? `${(q / 1000).toFixed(2).replace(".", ",")} kg` : `${q} ${u}`;

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
