"use client";
import { useState } from "react";
import { myWorkouts, dayWorkout, FOCUS_LIST } from "@/lib/builder";
import { spNow, addDays, fmtDay } from "@/lib/supabase";
import { weekday, trainTime } from "@/lib/plan";
import dynamic from "next/dynamic";
import { buzz, Icon } from "@/components/shared";
import { weekMuscleSets, WeekMuscles } from "@/components/exercise-map";

const Gym = dynamic(() => import("@/components/gym").then((m) => m.Gym), { ssr: false, loading: () => <p role="status">Carregando…</p> });
const WorkoutEditor = dynamic(() => import("@/components/exercises").then((m) => m.WorkoutEditor), { ssr: false, loading: () => <p role="status">Carregando…</p> });

function TrainTab({ log, saveLog, settings, saveSettings, week, day }) {
  const T = settings.times || {};
  const WS = myWorkouts(settings);
  const [edit, setEdit] = useState(false);
  const checks = log.checks || {};
  const divs = Math.min(+(T.divs || 5), WS.length), nextIdx = +(T.next || 0) % divs;
  const [gym, setGym] = useState(null);
  const done = !!log.workout_at;
  const sets = checks._sets || {};
  async function finish(w) {
    setGym(null); buzz(60);
    const idx = WS.indexOf(w);
    const saved = await saveLog({ workout_at: new Date().toISOString(), checks: { _wk: w.id } });
    if (saved?.error) return;
    saveSettings({ times: { ...T, next: (idx + 1) % divs } });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey", icon: "/icon-192.png" }); } catch {}
  }
  // treinos feitos nesta semana (segunda a domingo)
  const mon = addDays(day, -((weekday(day) + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((d) => d <= day);
  const doneWeek = {};
  weekDays.forEach((d) => { const l = week[d]; if (l?.workout_at) doneWeek[l.checks?._wk || "?"] = d; });
  const nDone = weekDays.filter((d) => week[d]?.workout_at).length;
  const heatCard = <WeekMuscles settings={settings} day={day} />;
  if (edit) return <WorkoutEditor settings={settings} saveSettings={saveSettings} week={week} onClose={() => setEdit(false)} />;
  return (
    <>
      <section className="card now">
        <div className="lbl now-lbl">{done ? "Treino de hoje feito" : `Hoje · ${trainTime(T, spNow().day)}`}</div>
        <h2 className="now-title">Treino {WS[nextIdx].id} · {WS[nextIdx].name}</h2>
        <div className="tag">{WS[nextIdx].ex.length} exercícios · pré-treino 30 min antes · siga a ordem A→E, não o dia da semana</div>
        <button className="pri big" onClick={() => setGym(WS[nextIdx])}><Icon n="dumbbell" s={18} /> {done ? "Ver próximo treino" : "Começar treino"}</button>
      </section>
      {heatCard}
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
        {WS.slice(0, divs).map((w, i) => {
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
        <button className="pri" style={{ marginTop: 10 }} onClick={() => setEdit(true)}>✏️ Montar / editar treinos</button>
      </div>
      {gym && <Gym w={gym} checks={checks} saveLog={saveLog} settings={settings} saveSettings={saveSettings} onClose={() => setGym(null)} onDone={() => finish(gym)} />}
    </>
  );
}

function DayPlanner({ settings, saveSettings, log, saveLog, day, say }) {
  const [goal, setGoal] = useState(null), [focus, setFocus] = useState("Automático"), [gym, setGym] = useState(null), [seed, setSeed] = useState(0);
  const cnt = weekMuscleSets(settings, day);
  const pri = [["Peito", ["peitoral"], 14], ["Costas", ["dorsal", "meio das costas"], 14], ["Braço", ["bíceps", "tríceps"], 24], ["Ombros", ["ombros"], 12], ["Pernas", ["quadríceps", "posterior de coxa", "glúteos"], 12]];
  const low = pri.map(([g, ms, goalN]) => [g, ms.reduce((a, m) => a + (cnt[m] || 0), 0) / goalN]).sort((a, b) => a[1] - b[1])[0][0];
  const w = goal ? dayWorkout({ goal, focus, seed: day + seed, favs: settings.supplies?._fav || [], lowGroup: low }) : null;
  const GOALS = [["massa", "💪 Ganhar massa", "4×8–10 pesado, descanso longo"], ["gordura", "🔥 Queimar gordura", "circuito 3×15, descanso curto + 25 min de cardio"], ["rapido", "⚡ Rápido 30 min", "o essencial em pouco tempo"]];
  return (
    <section className="card now" style={{ marginBottom: 12 }}>
      <div className="lbl now-lbl">O que você quer hoje?</div>
      <div className="goalbtns">{GOALS.map(([k, l, d]) => <button key={k} className={goal === k ? "on" : ""} onClick={() => { buzz(); setGoal(goal === k ? null : k); }}><b>{l}</b><span className="tag">{d}</span></button>)}</div>
      {goal && <>
        <div className="lbl" style={{ marginTop: 8 }}>Foco</div>
        <div className="seg">{["Automático", ...FOCUS_LIST].map((f) => <button key={f} className={focus === f ? "on" : ""} onClick={() => setFocus(f)}>{f === "Automático" ? `🤖 Automático (${low})` : f}</button>)}</div>
        <div className="tag" style={{ fontSize: 12 }}>{focus === "Automático" ? `Escolhi ${low.toLowerCase()} porque é o que menos treinou nesta semana.` : ""}</div>
        <div className="lbl" style={{ marginTop: 8 }}>{w.name} · {w.ex.length} exercícios</div>
        {w.ex.map((e, i) => <div key={i} className="mh" style={{ fontSize: 13, padding: "3px 0" }}><span style={{ flex: 1, minWidth: 0 }}>{i + 1}. {e.n}</span><span className="num tag">{e.s}×{e.r}{e.rest ? ` · ${e.rest}s` : ""}</span></div>)}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="pri big grow" onClick={() => { buzz(); setGym(w); }}><Icon n="dumbbell" s={18} /> Começar</button>
          <button className="sm" onClick={() => setSeed(seed + 1)}>🔄 Outros exercícios</button>
        </div>
      </>}
      {gym && <Gym w={gym} checks={log.checks || {}} saveLog={saveLog} settings={settings} saveSettings={saveSettings} onClose={() => setGym(null)}
        onDone={async () => { setGym(null); await saveLog({ workout_at: new Date().toISOString(), checks: { _wk: "H" } }); say("Treino registrado"); }} />}
    </section>
  );
}

export { TrainTab, DayPlanner };
