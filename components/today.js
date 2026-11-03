"use client";
import { useData } from "@/lib/data-context";
import { useEffect, useState, useCallback, useRef } from "react";
import { myWorkouts } from "@/lib/builder";
import { PHOTO_TYPES, listDaily, saveDaily } from "@/lib/photos";
import { supabase, toMin, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, GROUPS, WATER_GOAL, LETTERS, CAFFEINE, CAFFEINE_MAX, PREWORKOUT, EAT_OUT, PALM, weekday, mealTime, trainTime, itemDone, mealIsDone, dayScore, replaceSuggestion } from "@/lib/plan";
import dynamic from "next/dynamic";
import { CUP, CUPS, fmtPortion, b64ToU8, buzz, fmtHM, fmtDur, Icon, spNowTime, CheckinForm, Fold, MeasureForm, KCAL_GOAL } from "@/components/shared";
import { WeightOverview, ViradaMini, SleepCard, CardioCard } from "@/components/today-widgets";
import { FoodPhoto, CoachCard } from "@/components/ai";

const Gym = dynamic(() => import("@/components/gym").then((m) => m.Gym), { ssr: false, loading: () => <p role="status">Carregando…</p> });

function Today({ uid, log, saveLog, settings, saveSettings, week, day, now, setSwapFor, say }) {
  const T = settings.times || {};
  const WS = myWorkouts(settings);
  const checks = log.checks || {};
  const merge = checks._merge || {};
  const freeId = checks._free;
  const workoutToday = !!log.workout_at;
  const ptTime = () => { const t0 = toMin(trainTime(T, day)) + 75, w = log.workout_at ? toMin(spNowTime(log.workout_at)) : null; return fmtHM(w != null && Math.abs(w - t0) <= 180 ? w : t0); };
  const tOf = (m) => m.workout ? ptTime() : mealTime(m, T, day, checks);
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
  const [confirmAll, setConfirmAll] = useState(false);
  const [more, setMore] = useState(false);
  const [missOpen, setMissOpen] = useState(false);

  // semana atual (segunda a domingo) para refeição livre e reposições
  const wd = weekday(day), monday = addDays(day, -((wd + 6) % 7));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => d <= day);
  const freeUsedOn = weekDays.find((d) => d !== day && week[d]?.checks?._free);
  const mergesWeek = Array.from({ length: 7 }, (_, i) => addDays(day, -i)).filter((d) => Object.values(week[d]?.checks?._merge || {}).some((v) => v !== "skip")).length;

  const toggle = (k, v) => { buzz(); saveLog({ checks: { [k]: v } }); };
  const markAll = (m) => {
    const c = {};
    [m, ...extrasFor(m)].forEach((x) => x.items.forEach((it, i) => { if (!it.sup) c[`${x.id}-${i}`] = true; }));
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
  const divs = Math.min(+(T.divs || 5), WS.length), nextIdx = +(T.next || 0) % divs;
  const doneIdx = (nextIdx - 1 + divs) % divs;
  async function workoutDone() {
    buzz(60);
    const saved = await saveLog({ workout_at: new Date().toISOString(), checks: { _wk: LETTERS[nextIdx] } });
    if (saved?.error) return;
    saveSettings({ times: { ...T, next: (nextIdx + 1) % divs } });
    try { const r = await navigator.serviceWorker.ready; r.showNotification("Pós-treino agora", { body: "40 g de whey", icon: "/icon-192.png" }); } catch {}
  }
  const [gym, setGym] = useState(null);
  async function undoWorkout() { const saved = await saveLog({ workout_at: null }); if (saved?.error) return; saveSettings({ times: { ...T, next: doneIdx } }); say("Treino desmarcado"); }

  const trainMin = toMin(trainTime(T, day));
  const eve = !workoutToday && now >= trainMin - 150 && now < 24 * 60;
  const morning = now < 11 * 60;
  const supDue = sups.some((x) => !checks[x.k] && toMin(x.time) <= now + 30);
  const weighDay = T.weigh !== undefined && T.weigh !== "" && +T.weigh === wd;

  return (
    <>
      <PushBanner />
      {missedList.length > 0 && (() => {
        const tgt = main.find((x) => !done(x) && !merge[x.id] && !missed(x));
        return (
          <section className="card missed">
            <div className="lbl warn">{missedList.length === 1 ? "Refeição não marcada" : `${missedList.length} refeições não marcadas`}</div>
            <div className="tag">{missedList.map((m) => `${m.name} (${tOf(m)})`).join(" · ")}</div>
            <div className="row"><button className="ok grow" onClick={() => { const c = {}; missedList.forEach((m) => m.items.forEach((_, i) => { c[`${m.id}-${i}`] = true; })); buzz(40); saveLog({ checks: c }); say("Marcado como comido"); }}>Já comi {missedList.length > 1 ? "todas" : ""}</button>
              <button className="sm" onClick={() => setMissOpen(!missOpen)}>{missOpen ? "Fechar" : "Não comi: repor"}</button></div>
            {missOpen && <>
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
            </>}
          </section>
        );
      })()}
      {eve && <>
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
            <div className="big-line">Hoje: <b className="letter">Treino {LETTERS[nextIdx]}</b>{WS[nextIdx] && <span className="tag">· {WS[nextIdx].name}</span>}</div>
            {WS[nextIdx] && <button className="pri big" onClick={() => setGym(WS[nextIdx])}><Icon n="dumbbell" s={18} /> Começar treino ({WS[nextIdx].ex.length} exercícios)</button>}
            <div className="row">
              <button className="ok grow" onClick={workoutDone}><Icon n="dumbbell" s={18} /> Terminei o treino</button>
            </div>
            <div className="tag">Ao terminar, o pós-treino entra na sua lista e o próximo treino avança.</div>
          </>
        )}
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
      </>}
      {wd === 0 && <CardioCard checks={checks} saveLog={saveLog} say={say} />}
      {focus ? <NowCard m={focus} time={tOf(focus)} now={now} checks={checks} swaps={log.swaps || {}} toggle={toggle} markAll={markAll} setSwapFor={setSwapFor}
          extras={extrasFor(focus)} target={focus} freeBlocked={freeUsedOn} onFree={() => useFree(focus)}
          onOut={(m) => { const c = { _out: { ...(checks._out || {}), [m.id]: true } }; m.items.forEach((_, i) => { c[`${m.id}-${i}`] = true; }); saveLog({ checks: c }); }}
          onWhey={(m) => { const c = { _whey: { ...(checks._whey || {}), [m.id]: true } }; m.items.forEach((it, i) => { if (!it.sup) c[`${m.id}-${i}`] = true; }); saveLog({ checks: c }); say("Registrado: só whey"); }}
          onSnooze={(m) => { const at = Math.max(now, toMin(tOf(m))) + 15; saveLog({ checks: { _snooze: { ...(checks._snooze || {}), [m.id]: at } } }); say(`Te lembro às ${fmtHM(at)}`); }} />
        : <div className="card complete"><h2>Dieta do dia completa</h2><div className="tag">Todas as refeições marcadas. Confira água e suplementos abaixo.</div></div>}
      <FoodPhoto checks={checks} saveLog={saveLog} say={say} mealName={focus?.name} />
      {checks._burn && (() => { const b = checks._burn, tot = (b.ativa || 0) + (b.repouso || 0), eat = (checks._foods || []).reduce((a, f) => a + (f.total?.kcal || 0), 0) || KCAL_GOAL;
        return <section className="card"><div className="mh"><h3>⌚ Apple Watch</h3><span className="tag">atualizado {spNowTime(b.at)}</span></div>
          <div className="pre-grid">
            <div><div className="lbl">Ativas</div><b className="num">{b.ativa} kcal</b><span className="tag">meta 500</span></div>
            <div><div className="lbl">Total gasto</div><b className="num">{tot ? tot.toLocaleString("pt-BR") : "—"}</b><span className="tag">ativas + repouso</span></div>
            <div><div className="lbl">Passos</div><b className="num">{(b.passos || 0).toLocaleString("pt-BR")}</b><span className="tag">meta 8.000</span></div>
          </div>
          {tot > 0 && <div className="tag" style={{ fontSize: 12 }}>Balanço do dia: comendo ~{eat.toLocaleString("pt-BR")} − gastando ~{tot.toLocaleString("pt-BR")} = <b>{(eat - tot > 0 ? "+" : "") + (eat - tot).toLocaleString("pt-BR")} kcal</b> {eat - tot < 0 ? "(déficit ✓)" : "(superávit)"}. O Watch costuma superestimar um pouco.</div>}
        </section>; })()}
      <section className="card quick">
        <button onClick={() => { buzz(); saveLog({ water_ml: log.water_ml + 250 }); }}><span className="lbl">Água · toque +250</span><b className="num">{(log.water_ml / 1000).toFixed(1).replace(".", ",")}/2,6 L</b></button>
        <button onClick={() => setMore(true)}><span className="lbl">Suplementos</span><b className="num">{sups.filter((x) => checks[x.k]).length}/{sups.length}</b></button>
        <button onClick={() => (workoutToday ? null : WS[nextIdx] && setGym(WS[nextIdx]))}><span className="lbl">Treino {workoutToday ? LETTERS[doneIdx] : LETTERS[nextIdx]}</span><b>{workoutToday ? "feito ✓" : "começar"}</b></button>
      </section>
      {supDue && <>
      {/* Suplementos */}
      <Fold done={sups.length > 0 && sups.every((x) => checks[x.k])} label="Suplementos (separado da comida)" summary={`${sups.length}/${sups.length} tomados`}>
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
      </>}
      {morning && <>
      {weighDay && <WeighCard uid={uid} day={day} say={say} hasCheckin={!!checks._ci} saveCheckin={(ci) => saveLog({ checks: { _ci: ci } })} hasMed={!!checks._med} saveMed={(m) => saveLog({ checks: { _med: m } })} />}
      <SleepCard checks={checks} saveLog={saveLog} />
      {!viewing && <DailyPhotos uid={uid} day={day} say={say} />}
      </>}
      {gym && <Gym w={gym} checks={checks} saveLog={saveLog} settings={settings} saveSettings={saveSettings} onClose={() => setGym(null)} onDone={() => { setGym(null); workoutDone(); }} />}
      <button className="more-btn" onClick={() => setMore(!more)}>{more ? "Mostrar menos ▲" : "Ver mais: semana, peso, água, cafeína, dia completo ▼"}</button>
      {more && <>
      {wd !== 0 && <CardioCard checks={checks} saveLog={saveLog} say={say} />}
      {(() => {
        const mon2 = addDays(day, -((weekday(day) + 6) % 7));
        const ds = Array.from({ length: 7 }, (_, i) => addDays(mon2, i)).filter((d) => d <= day);
        const good = ds.filter((d) => dayScore(week[d]) >= 90).length, tr = ds.filter((d) => week[d]?.workout_at).length;
        return (
          <div className="goals">
            <div><span className="lbl">Dieta 90%+</span><b className="num">{good}/7</b><i className="gbar"><i style={{ width: `${(good / 7) * 100}%` }} /></i></div>
            <div><span className="lbl">Treinos</span><b className="num">{tr}/5</b><i className="gbar"><i style={{ width: `${Math.min(tr / 5, 1) * 100}%` }} /></i></div>
          </div>
        );
      })()}
      {(() => {
        const allDone = main.every((m) => done(m)) && log.water_ml >= WATER_GOAL;
        if (allDone) return null;
        return <section className="card">
          <div className="mh"><h3>Seguiu o PDF hoje?</h3></div>
          <div className="tag" style={{ fontSize: 12 }}>Marca todas as refeições, suplementos e 2,6 L de água de uma vez. Use só se cumpriu mesmo: é isso que entra no seu progresso.</div>
          <button className={confirmAll ? "ok big" : "pri"} onClick={() => {
            if (!confirmAll) { setConfirmAll(true); setTimeout(() => setConfirmAll(false), 4000); return; }
            const c = {}; main.forEach((m) => { if (checks._free === m.id) return; m.items.forEach((_, i) => { c[`${m.id}-${i}`] = true; }); });
            buzz(60); saveLog({ checks: c, water_ml: Math.max(log.water_ml || 0, WATER_GOAL) }); setConfirmAll(false); say("Dia marcado como cumprido");
          }}>{confirmAll ? "Toque de novo para confirmar" : "Segui tudo hoje"}</button>
        </section>;
      })()}
      <WeightOverview uid={uid} day={day} week={week} />
      <ViradaMini week={week} day={day} settings={settings} />
      {!supDue && <>
      {/* Suplementos */}
      <Fold done={sups.length > 0 && sups.every((x) => checks[x.k])} label="Suplementos (separado da comida)" summary={`${sups.length}/${sups.length} tomados`}>
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
      </>}
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
      {!eve && <>
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
            <div className="big-line">Hoje: <b className="letter">Treino {LETTERS[nextIdx]}</b>{WS[nextIdx] && <span className="tag">· {WS[nextIdx].name}</span>}</div>
            {WS[nextIdx] && <button className="pri big" onClick={() => setGym(WS[nextIdx])}><Icon n="dumbbell" s={18} /> Começar treino ({WS[nextIdx].ex.length} exercícios)</button>}
            <div className="row">
              <button className="ok grow" onClick={workoutDone}><Icon n="dumbbell" s={18} /> Terminei o treino</button>
            </div>
            <div className="tag">Ao terminar, o pós-treino entra na sua lista e o próximo treino avança.</div>
          </>
        )}
      </section>
      </Fold>
      </>}
      {!morning && <>
      {weighDay && <WeighCard uid={uid} day={day} say={say} hasCheckin={!!checks._ci} saveCheckin={(ci) => saveLog({ checks: { _ci: ci } })} hasMed={!!checks._med} saveMed={(m) => saveLog({ checks: { _med: m } })} />}
      <SleepCard checks={checks} saveLog={saveLog} />
      {!viewing && <DailyPhotos uid={uid} day={day} say={say} />}
      </>}
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
            const isDone = done(m), food = m.items.filter((it) => !it.sup).length, n = m.items.filter((it, i) => !it.sup && itemDone(log, m, i)).length;
            const mg = merge[m.id], isOpen = open === m.id, late = !isDone && !mg && toMin(tOf(m)) + 30 < now;
            const status = freeId === m.id ? "livre" : isDone ? "feito" : mg === "skip" ? "pulada" : mg ? `→ ${MEALS.find((x) => x.id === mg)?.name.toLowerCase()}` : checks._whey?.[m.id] ? "só whey" : missed(m) ? "perdida" : late ? "atrasada" : `${n}/${food}`;
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
                    {!m.workout && <div className="row" style={{ alignItems: "center", gap: 8 }}>
                      <span className="tag">Inverter com:</span>
                      <select value={checks._swapT?.[m.id] || ""} onChange={(e) => {
                        const st = { ...(checks._swapT || {}) }, old = st[m.id], o = e.target.value;
                        if (old) { delete st[old]; delete st[m.id]; }
                        if (o) { if (st[o]) delete st[st[o]]; st[m.id] = o; st[o] = m.id; }
                        buzz(); saveLog({ checks: { _swapT: st } }); say(o ? `${m.name} trocado de horário com ${MEALS.find((x) => x.id === o).name}` : "Ordem original");
                      }}>
                        <option value="">ordem original</option>
                        {MEALS.filter((x) => !x.workout && x.id !== m.id).map((x) => <option key={x.id} value={x.id}>{x.name} ({mealTime(x, T, day)})</option>)}
                      </select>
                    </div>}
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
      </>}
      <details className="card"><summary>Coach · orientação opcional</summary><CoachCard week={week} day={day} settings={settings} log={log} saveLog={saveLog} uid={uid} /></details>
    </>
  );
}

function NowCard({ m, time, now, checks, swaps, toggle, markAll, setSwapFor, extras, target, freeBlocked, onFree, onSnooze, onOut, onWhey }) {
  const [out, setOut] = useState(false);
  const diff = toMin(time) - now;
  const status = m.workout ? "Agora · pós-treino" : diff > 0 ? `Próxima · em ${fmtDur(diff)}` : diff > -30 ? "Agora" : `Atrasada · ${fmtDur(diff)}`;
  const all = [m, ...extras];
  const total = all.reduce((a, x) => a + x.items.filter((it) => !it.sup).length, 0);
  const n = all.reduce((a, x) => a + x.items.filter((it, i) => !it.sup && checks[`${x.id}-${i}`]).length, 0);
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
        {!m.workout && <button className="link" onClick={() => onWhey(m)}>Sem tempo: só whey</button>}
      </div>
      {!m.workout && <div className="tag">Só whey = 1 dose (30 g) com água ou leite; se der, + 1 fruta. Use só em emergência.</div>}
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
      {m.items.map((it, i) => !it.sup && <ItemRow key={i} {...{ m, it, i, checks, swaps, toggle, setSwapFor }} />)}
      {extras.map((src) => {
        const sugg = replaceSuggestion(src, target);
        return (
          <div key={src.id} className="extra">
            <div className="lbl warn">Repor do {src.name.toLowerCase()}</div>
            {src.items.map((it, i) => !it.sup && <ItemRow key={i} {...{ m: src, it, i, checks, swaps, toggle, setSwapFor }} note={sugg[i]?.text?.includes(" some ") ? sugg[i].text : undefined} />)}
          </div>
        );
      })}
    </>
  );
}

function WeighCard({ uid, day, say, hasCheckin, saveCheckin, hasMed, saveMed }) {
  const [kg, setKg] = useState("");
  const { weights, saveWeight } = useData();
  const saved = weights.some((w) => w.day === day);
  if (saved && hasCheckin && hasMed) return null;
  return (
    <section className="card now">
      <div className="lbl now-lbl">Dia de pesagem e check-in</div>
      {!saved && <>
        <div className="tag">Pese em jejum, depois do banheiro e antes de comer ou beber.</div>
        <div className="row"><input id="wkg" inputMode="decimal" placeholder="kg" value={kg} onChange={(e) => setKg(e.target.value)} style={{ width: 110 }} />
          <button className="pri" onClick={async () => { const v = parseFloat(kg.replace(",", ".")); if (!v) return; try { await saveWeight(day, v); buzz(40); say("Peso guardado no celular"); } catch (e) { say(e.message); } }}>Registrar peso</button></div>
      </>}
      {!hasMed && <MeasureForm onSave={(m) => { saveMed(m); say("Medidas salvas"); }} />}
      {!hasCheckin && <CheckinForm onSave={(ci) => { saveCheckin(ci); say("Check-in salvo"); }} />}
    </section>
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

function DailyPhotos({ uid, day, say }) {
  const [shots, setShots] = useState({}); const [ghosts, setGhosts] = useState({});
  const [busy, setBusy] = useState(null); const [cam, setCam] = useState(null);
  const [retry, setRetry] = useState(null);
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
  useEffect(() => { load().catch(() => say("Fotos indisponíveis. Confira a conexão.")); }, [load]);
  async function save(t, file) {
    setBusy(t); setCam(null);
    try { await saveDaily(uid, day, t, file); setRetry(null); buzz(40); say("Foto salva"); await load(); }
    catch { setRetry({ t, file }); say("Não consegui salvar. Você pode tentar novamente nesta tela."); }
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
      {retry && <div role="alert"><p>A foto ainda não foi salva. Mantenha esta tela aberta.</p><button disabled={!!busy} onClick={() => save(retry.t, retry.file)}>Tentar salvar novamente</button></div>}
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

export { Today, NowCard, ItemRow, Items, WeighCard, PushBanner, SwapSheet, DailyPhotos, CameraSheet };
