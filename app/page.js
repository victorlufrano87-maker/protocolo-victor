"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase, spNow, toMin, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, GROUPS, RULES, SUPPLIES, WATER_GOAL, START_WEIGHT, mainItemsCount } from "@/lib/plan";

const EMPTY = { checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null };

function score(log) {
  if (!log) return 0;
  let done = 0;
  MEALS.filter((m) => !m.workout).forEach((m) => m.items.forEach((_, i) => { if (log.checks?.[`${m.id}-${i}`]) done++; }));
  return Math.round(((done / mainItemsCount()) * 0.75 + Math.min((log.water_ml || 0) / WATER_GOAL, 1) * 0.25) * 100);
}
const fmtPortion = (p, measure) => p === 1 ? measure : p === 0.5 ? `½ de ${measure}` : `${p}× ${measure}`;
const b64ToU8 = (b) => { const p = "=".repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };

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
    setMsg(error ? error.message : signup ? "Conta criada. Se pedir confirmação, veja seu e-mail." : "");
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
  const [log, setLog] = useState(EMPTY);
  const [week, setWeek] = useState({});
  const [settings, setSettings] = useState({ times: {}, update_date: null, supplies: {} });
  const [swapFor, setSwapFor] = useState(null);

  const load = useCallback(async () => {
    const d = spNow().day; setDay(d);
    const [{ data: logs }, { data: st }] = await Promise.all([
      supabase.from("day_logs").select("*").eq("user_id", uid).gte("day", addDays(d, -29)),
      supabase.from("settings").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const map = Object.fromEntries((logs || []).map((l) => [l.day, l]));
    setWeek(map); setLog(map[d] || EMPTY);
    if (st) setSettings(st);
  }, [uid]);
  useEffect(() => { load(); const f = () => document.visibilityState === "visible" && load(); document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f); }, [load]);

  async function saveLog(patch) {
    const next = { ...log, ...patch }; setLog(next); setWeek((w) => ({ ...w, [day]: next }));
    await supabase.from("day_logs").upsert({ user_id: uid, day, checks: next.checks, swaps: next.swaps, water_ml: next.water_ml, free_meal: next.free_meal, workout_at: next.workout_at, updated_at: new Date().toISOString() });
  }
  async function saveSettings(patch) {
    const next = { ...settings, ...patch }; setSettings(next);
    await supabase.from("settings").upsert({ user_id: uid, times: next.times, update_date: next.update_date, supplies: next.supplies });
  }

  const s = score(log);
  return (
    <div className="wrap">
      <div className="top">
        <Ring pct={s} />
        <div style={{ minWidth: 0 }}>
          <div className="lbl">{fmtDay(day, { weekday: "long", day: "2-digit", month: "long" })}</div>
          <h1>Protocolo Victor</h1>
          <div className="tag">Dr. Victor Rocha · 2.239 kcal · 199 g PTN</div>
        </div>
      </div>

      {tab === "hoje" && <Today {...{ log, saveLog, settings, week, day, setSwapFor }} />}
      {tab === "prog" && <Progress {...{ uid, week, day, settings }} />}
      {tab === "trocas" && <SubsTable />}
      {tab === "plano" && <Plan {...{ uid, settings, saveSettings }} />}

      {swapFor && <SwapSheet {...swapFor} current={log.swaps?.[swapFor.key]} onClose={() => setSwapFor(null)}
        onPick={(v) => { const swaps = { ...log.swaps }; if (v) swaps[swapFor.key] = v; else delete swaps[swapFor.key]; saveLog({ swaps }); setSwapFor(null); }} />}

      <nav>
        {[["hoje", "Hoje"], ["prog", "Progresso"], ["trocas", "Trocas"], ["plano", "Plano"]].map(([k, l]) =>
          <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); scrollTo(0, 0); }}>{l}</button>)}
      </nav>
    </div>
  );
}

function Ring({ pct }) {
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" style={{ flex: "none" }}>
      <circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle cx="42" cy="42" r="36" fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray="226" strokeDashoffset={226 - (226 * pct) / 100} transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset .4s" }} />
      <text x="42" y="48" textAnchor="middle" fill="var(--fg)" fontSize="17">{pct}%</text>
    </svg>
  );
}

function Today({ log, saveLog, settings, week, day, setSwapFor }) {
  const nowMin = spNow().min;
  const meals = [...MEALS].sort((a, b) => toMin(settings.times[a.id] || a.time) - toMin(settings.times[b.id] || b.time));
  const next = meals.find((m) => !m.workout && !m.items.every((_, i) => log.checks[`${m.id}-${i}`]));
  const toggle = (k, v) => saveLog({ checks: { ...log.checks, [k]: v } });

  async function workoutDone() {
    await saveLog({ workout_at: new Date().toISOString() });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey + 1 col. de mel", icon: "/icon-192.png" }); } catch {}
  }

  return (
    <>
      <PushBanner />
      {next && <div className="tag">Próxima: <b style={{ color: "var(--fg)" }}>{next.name}</b> às <span className="num">{settings.times[next.id] || next.time}</span>
        {nowMin > toMin(settings.times[next.id] || next.time) + 30 && <span style={{ color: "var(--warn)" }}> · atrasada</span>}</div>}

      <div className="card">
        <div className="mh"><h2>Água</h2><span className="num">{log.water_ml.toLocaleString("pt-BR")} / 2.600 ml</span></div>
        <div className="bar"><i style={{ width: `${Math.min((log.water_ml / WATER_GOAL) * 100, 100)}%` }} /></div>
        <div className="row">
          <button className="pri" onClick={() => saveLog({ water_ml: log.water_ml + 250 })}>+ 250 ml</button>
          <button onClick={() => saveLog({ water_ml: log.water_ml + 500 })}>+ 500 ml</button>
          <button onClick={() => saveLog({ water_ml: Math.max(0, log.water_ml - 250) })}>− 250</button>
        </div>
      </div>

      {meals.map((m) => {
        const all = m.items.every((_, i) => log.checks[`${m.id}-${i}`]);
        return (
          <div key={m.id} className={"card" + (all ? " complete" : "")}>
            <div className="mh"><h2>{m.name}</h2>{m.workout ? <span className="tag">dia de treino</span> : <span className="time">{settings.times[m.id] || m.time}</span>}</div>
            {m.workout && !log.workout_at && <button className="ok" onClick={workoutDone}>Terminei o treino</button>}
            {m.items.map((it, i) => {
              const k = `${m.id}-${i}`, on = !!log.checks[k], sw = log.swaps?.[k];
              return (
                <div key={k} className={"item" + (on ? " done" : "")}>
                  <input type="checkbox" id={"ck-" + k} checked={on} onChange={(e) => toggle(k, e.target.checked)} />
                  <label className="t" htmlFor={"ck-" + k}>
                    <b>{it.sup && <span className="supl">SUPL</span>}{sw || it.t}</b>
                    {sw && <div className="swapped">trocado · original: {it.t}</div>}
                    {!sw && (it.s || it.g) && <div className="s">{it.s || `${it.p === 0.5 ? "½ porção" : it.p + (it.p > 1 ? " porções" : " porção")} do Grupo ${it.g}`}</div>}
                  </label>
                  {it.g && <button className="sm" onClick={() => setSwapFor({ key: k, item: it })}>Trocar</button>}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="card">
        <div className="mh"><h2>Semana</h2><span className="tag">verde 100% · laranja refeição livre</span></div>
        <div className="week">
          {Array.from({ length: 7 }, (_, i) => addDays(day, i - 6)).map((d) => {
            const sc = score(week[d]);
            return <div key={d} className={"d" + (sc >= 95 ? " full" : sc > 0 ? " part" : "") + (week[d]?.free_meal ? " free" : "")}>
              {fmtDay(d, { weekday: "short" }).slice(0, 3)}<b>{sc}</b></div>;
          })}
        </div>
        <button onClick={() => saveLog({ free_meal: !log.free_meal })}>{log.free_meal ? "Refeição livre usada hoje ✓" : "Usei a refeição livre hoje"}</button>
      </div>
    </>
  );
}

function SwapSheet({ item, current, onPick, onClose }) {
  const g = GROUPS[item.g];
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mh"><h2>Trocar alimento</h2><button className="sm" onClick={onClose}>Fechar</button></div>
        <div className="tag">Original: <b style={{ color: "var(--fg)" }}>{item.t}</b><br />
          = {item.p === 0.5 ? "½ porção" : `${item.p} porç${item.p > 1 ? "ões" : "ão"}`} do Grupo {item.g} ({g.name}). As quantidades abaixo já estão ajustadas.</div>
        {current && <button onClick={() => onPick(null)}>Voltar ao original</button>}
        {g.foods.map((f) => {
          const grams = Math.round(f.g * item.p);
          const label = `${f.n} — ${grams} g (${fmtPortion(item.p, f.m)})`;
          return <button key={f.n} className="opt" onClick={() => onPick(label)}>
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
        ? <span className="tag">Para receber notificações no iPhone: abra no Safari → Compartilhar → <b>Adicionar à Tela de Início</b>, e abra pelo ícone.</span>
        : <div className="mh"><span className="tag">Ative os lembretes de refeição, água e suplementos.</span><button className="pri sm" onClick={enable}>Ativar</button></div>}
    </div>
  );
}

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
  let streak = 0; for (let i = 0; i < 30; i++) { if (score(week[addDays(day, -i)]) >= 95) streak++; else if (i > 0) break; }
  const last = weights.at(-1);

  const kit = `Atualização — ${fmtDay(day, { day: "2-digit", month: "2-digit", year: "numeric" })}
Peso em jejum: ${last ? String(last.kg).replace(".", ",") + " kg" : "—"} (inicial 72,4 kg${last ? `, ${(last.kg - START_WEIGHT >= 0 ? "+" : "")}${(last.kg - START_WEIGHT).toFixed(1).replace(".", ",")} kg` : ""})
Adesão à dieta (14 dias): ${adh}%
Água média: ${(waterAvg / 1000).toFixed(1).replace(".", ",")} L/dia (meta 2,6 L)
Refeições livres: ${free} em 14 dias
Feedback: ${feedback || "—"}`;

  return (
    <>
      <div className="card">
        <h2>Resumo 14 dias</h2>
        <div className="row" style={{ justifyContent: "space-between" }}>
          {[["Adesão", adh + "%"], ["Água/dia", (waterAvg / 1000).toFixed(1).replace(".", ",") + " L"], ["Sequência", streak + " d"], ["Livres", free]].map(([l, v]) =>
            <div key={l}><div className="lbl">{l}</div><div className="num" style={{ fontSize: 20 }}>{v}</div></div>)}
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
        <div className="tag">{settings.update_date ? `Próxima: ${fmtDay(settings.update_date, { day: "2-digit", month: "2-digit" })}` : "Defina a data em Plano."} Escreva o feedback, copie e mande no WhatsApp junto com as fotos.</div>
        <textarea id="fb" rows="3" placeholder="Como está se sentindo, dificuldades, progresso…" value={feedback} onChange={(e) => setFeedback(e.target.value)}
          style={{ font: "500 15px var(--body)", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "var(--card2)", color: "var(--fg)" }} />
        <pre className="kit">{kit}</pre>
        <button className="pri" onClick={async () => { try { await navigator.clipboard.writeText(kit); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>{copied ? "Copiado" : "Copiar resumo"}</button>
      </div>
    </>
  );
}

function WeightChart({ data }) {
  const pts = [{ day: "início", kg: START_WEIGHT }, ...data.map((d) => ({ day: d.day, kg: +d.kg }))];
  if (pts.length < 2) return <div className="tag">Registre o peso para ver o gráfico.</div>;
  const W = 320, H = 120, P = 26, vals = pts.map((p) => p.kg);
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

function SubsTable() {
  const [g, setG] = useState("1");
  return (
    <div className="card">
      <h2>Tabela de substituição</h2>
      <div className="tag">Mesmo grupo, mesma quantidade de porções. Use o botão Trocar em cada alimento para o cálculo automático.</div>
      <select id="grp" value={g} onChange={(e) => setG(e.target.value)}>
        {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>Grupo {k} · {v.name} ({v.kcal} kcal)</option>)}
      </select>
      <table><tbody>{GROUPS[g].foods.map((f) => <tr key={f.n}><td>{f.n}</td><td className="q">{f.g} g</td><td className="tag">{f.m}</td></tr>)}</tbody></table>
    </div>
  );
}

function Plan({ settings, saveSettings }) {
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

  return (
    <>
      <div className="card">
        <h2>Atualização com o personal</h2>
        <div className="tag">Ninguém vai te lembrar, mas o app vai: aviso na véspera e no dia, às 7h30.</div>
        <div className="row"><input id="upd" type="date" value={settings.update_date || ""} onChange={(e) => saveSettings({ update_date: e.target.value || null })} />
          {left !== null && <span className="tag">{left > 0 ? `faltam ${left} dias` : left === 0 ? "é hoje" : "atrasada"}</span>}</div>
      </div>

      <div className="card">
        <h2>Horários das refeições</h2>
        <div className="tag">As notificações seguem estes horários.</div>
        {MEALS.filter((m) => !m.workout).map((m) => (
          <div key={m.id} className="mh"><span>{m.name}</span>
            <input id={"tm-" + m.id} type="time" value={settings.times[m.id] || m.time} onChange={(e) => saveSettings({ times: { ...settings.times, [m.id]: e.target.value } })} /></div>
        ))}
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

      <div className="card">
        <div className="mh"><h2>Lista de compras</h2><span className="tag">por semana</span></div>
        <div className="row tag">Treinos/semana <input id="trn" type="number" min="0" max="7" value={trainings} onChange={(e) => setTrainings(+e.target.value)} style={{ width: 70 }} /></div>
        <table><tbody>{shop.map(([n, { q, u }]) => <tr key={n}><td>{n}</td><td className="q">{fmtQ(q, u)}</td></tr>)}</tbody></table>
        <div className="tag">Arroz e feijão em peso cozido. Mais Ômega 3 (3 g/dia), Centrum e cápsulas.</div>
      </div>

      <div className="card">
        <h2>Regras do plano</h2>
        <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 8 }}>{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>

      <button onClick={() => supabase.auth.signOut()}>Sair</button>
    </>
  );
}
