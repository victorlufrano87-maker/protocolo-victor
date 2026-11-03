"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TrainingLibrary, TrainingMuscles, ExerciseGuide } from "./exercises";
import { TrainingLogin, SetPassword } from "./auth";
import { supabase, fmtDay } from "@/lib/supabase";
import { compress } from "@/lib/photos";
import { useRestTimer } from "@/lib/use-rest-timer";
import { QUESTIONS, DAYS, GOALS, CATALOG, validateAnswer, screening } from "@/lib/training/domain.mjs";
const messages = {
  config: "Esta área ainda precisa ser ativada na hospedagem.",
  database: "Não consegui acessar o banco de treino. Confira se a atualização foi aplicada.",
  invitation: "Seu acesso está pausado ou ainda não foi liberado. Fale com o responsável.",
  email_confirmation: "Confirme seu e-mail antes de continuar. Confira sua caixa de entrada e o spam.",
  auth: "Entre novamente para continuar.",
  owner: "Só o responsável pode gerenciar convites.",
  unavailable: "Não consegui concluir agora. Tente novamente."
};
async function request(path = "", body, method) {
  const {
    data
  } = await supabase.auth.getSession();
  if (!data.session) throw Object.assign(new Error(messages.auth), {
    status: 401
  });
  const r = await fetch(`/api/training${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
      "content-type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(messages[j.error] || j.error || messages.unavailable), {
    status: r.status
  });
  return j;
}
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const date = d => new Date(d).toLocaleDateString("pt-BR", {
  day: "2-digit",
  month: "short"
});
export default function TrainingApp() {
  const [session, setSession] = useState(),
    [error, setError] = useState(""),
    [recovering, setRecovering] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("redefinir") === "1" || new URLSearchParams(location.hash.slice(1)).get("type") === "recovery") setRecovering(true);
    supabase.auth.getSession().then(({
      data
    }) => setSession(data.session)).catch(() => setError("Não consegui iniciar sua sessão."));
    const {
      data
    } = supabase.auth.onAuthStateChange((event, s) => { setSession(s); if (event === "PASSWORD_RECOVERY") setRecovering(true); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => data.subscription.unsubscribe();
  }, []);
  if (error) return <main className="training"><p role="alert">{error}</p><button onClick={() => location.reload()}>Tentar novamente</button></main>;
  if (session === undefined) return <main className="training"><p role="status">Abrindo seu espaço…</p></main>;
  if (!session) return <TrainingLogin brand={<Brand />} />;
  if (recovering || (session.user.user_metadata?.training_pilot && !session.user.user_metadata?.training_password_set)) return <SetPassword brand={<Brand />} onDone={() => setRecovering(false)} />;
  return <TrainingSpace key={session.user.id} uid={session.user.id} />;
}
function Brand() {
  return <header className="tr-brand"><span className="tr-mark">↗</span><span>PROTOCOLO<span className="tr-small">TREINO PESSOAL</span></span><span className="tr-beta">PILOTO</span></header>;
}
function TrainingSpace({
  uid
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [pending, setPending] = useState([]),
    [tab, setTab] = useState("plan"),
    [mode, setMode] = useState("dashboard"),
    [active, setActive] = useState(null);
  const flight = useRef(null),
    queueKey = `training_queue_${uid}`,
    cacheKey = `training_cache_${uid}`;
  const load = useCallback(async () => {
    try {
      const fresh = await request();
      setData(fresh);
      localStorage.setItem(cacheKey, JSON.stringify(fresh));
      setOffline(false);
      setError("");
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        setData(null);
        setError(e.message);
        return;
      }
      const cached = read(cacheKey, null);
      if (cached) {
        setData(cached);
        setOffline(true);
      } else setError(e.message);
    }
  }, [uid]);
  const flush = useCallback(() => {
    if (flight.current) return flight.current;
    flight.current = (async () => {
      while (true) {
        const queue = read(queueKey, []);
        if (!queue.length) break;
        await request("/sessions", queue[0]);
        const next = read(queueKey, []).filter(s => s.id !== queue[0].id);
        localStorage.setItem(queueKey, JSON.stringify(next));
        setPending(next);
      }
      await load();
    })().catch(() => setOffline(true)).finally(() => {
      flight.current = null;
    });
    return flight.current;
  }, [uid, load]);
  useEffect(() => {
    setPending(read(queueKey, []));
    load().then(flush);
    const on = () => flush();
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [load, flush]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      if (read(queueKey, []).length) throw new Error("Reconecte para sincronizar suas sessões antes de ajustar a proposta.");
      const r = await request("/plan", {});
      setData(d => ({
        ...d,
        plan: r.plan
      }));
      setMode("dashboard");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function profileSaved(answers) {
    setBusy(true);
    setError("");
    try {
      const r = await request("/profile", answers);
      localStorage.removeItem(`training_draft_${uid}`);
      setData(d => ({
        ...d,
        profile: r.profile
      }));
      setMode(r.screening.ready ? "photo" : "dashboard");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function completed(record) {
    const next = [...read(queueKey, []).filter(s => s.id !== record.id), {
      ...record,
      created_at: new Date().toISOString(),
      completedAt: new Date().toISOString()
    }];
    try {
      localStorage.setItem(queueKey, JSON.stringify(next));
      setPending(next);
      setActive(null);
      localStorage.removeItem(`training_session_${uid}`);
      flush();
    } catch {
      setError("O celular está sem espaço para guardar a sessão. Libere espaço e tente concluir novamente.");
    }
  }
  const allSessions = [...new Map([...(data?.sessions || []), ...pending].map(s => [s.id, s])).values()].sort((a, b) => new Date(b.completed_at || b.completedAt || b.created_at) - new Date(a.completed_at || a.completedAt || a.created_at));
  if (!data) return <main className="training"><Brand /><div className="tr-card"><h1>{error ? "Vamos conferir seu acesso" : "Carregando seu espaço…"}</h1>{error && <p role="alert">{error}</p>}<button onClick={load}>Tentar novamente</button><button onClick={() => supabase.auth.signOut()}>Sair</button></div></main>;
  const profile = data.profile?.answers,
    gate = profile ? screening(profile) : null,
    hasPain = allSessions.some(s => s.feedback?.pain),
    stale = data.plan && new Date(data.plan.profile_version).getTime() !== new Date(data.profile?.updated_at).getTime();
  if (active) return <Session uid={uid} sessions={allSessions} plan={data.plan} workout={active} onClose={() => setActive(null)} onComplete={completed} />;
  if (mode === "wizard") return <main className="training"><Brand />{error && <p className="tr-alert" role="alert">{error}</p>}<Wizard uid={uid} initial={profile} busy={busy} onSave={profileSaved} onExit={() => setMode("dashboard")} /></main>;
  if (mode === "photo") return <main className="training"><Brand /><PhotoPanel uid={uid} profile={profile} photos={data.photos} onChange={load} /><button className="tr-primary" disabled={busy} onClick={generate}>{busy ? "Preparando sua proposta…" : "Continuar e montar meu treino"}</button>{error && <p role="alert">{error}</p>}</main>;
  return <main className="training"><Brand /><div className="tr-topline"><span>{profile ? `Olá, ${profile.name.split(" ")[0]}` : "BEM-VINDO AO SEU ESPAÇO"}</span><span className="tr-small" role="status">{pending.length ? `${pending.length} sessão(ões) aguardando envio` : offline ? "Modo offline" : "Conectado"}</span></div>{error && <p className="tr-alert" role="alert">{error}</p>}
 {tab === "plan" && <>
 {!profile ? <><div className="tr-hero"><span className="tr-eyebrow">COMECE PELO QUE IMPORTA</span><h1>Seu treino começa<br />com você.</h1><p>Objetivo, rotina e equipamentos. Algumas perguntas para criar uma proposta possível de manter.</p></div><div className="tr-metrics"><span><b>{QUESTIONS.length}</b>perguntas curtas</span><span><b>1</b>passo por vez</span><span><b>Você</b>no controle</span></div><button className="tr-primary" onClick={() => setMode("wizard")}>Montar meu primeiro treino →</button><p className="tr-small">Foto opcional. Suas respostas ficam separadas das de outras pessoas.</p></> : !gate.ready || hasPain ? <section className="tr-card tr-caution"><span className="tr-eyebrow">ANTES DO PRÓXIMO TREINO</span><h1>Vamos cuidar da base.</h1><p>{hasPain ? "Você registrou dor em uma sessão. Pause os exercícios dolorosos e busque orientação profissional antes de continuar uma rotina automática." : gate.message}</p><p className="tr-small">Se tiver agora dor no peito, desmaio ou falta de ar intensa, interrompa o esforço e procure atendimento imediato.</p><button onClick={() => setMode("wizard")}>Revisar minhas respostas</button></section> : !data.plan || stale ? <section className="tr-card"><h1>Suas respostas estão prontas.</h1><p>{stale ? "Você atualizou seu perfil. Gere uma proposta compatível antes de iniciar outra sessão." : "Agora podemos montar sua proposta inicial."}</p><button className="tr-primary" disabled={busy || offline} onClick={generate}>{busy ? "Montando…" : "Montar meu treino"}</button><button onClick={() => setMode("wizard")}>Revisar respostas</button></section> : <PlanView record={data.plan} profile={profile} sessions={allSessions} busy={busy} onGenerate={generate} onStart={w => {
        const old = read(`training_session_${uid}`, null);
        if (old?.sets?.length && old.workoutId !== w.id && !confirm("Existe uma sessão pausada neste aparelho. Deseja descartar o rascunho dela e iniciar este treino?")) return;
        setActive(w);
      }} />}
 </>}
 {tab === "exercises" && <TrainingLibrary />}
 {tab === "progress" && <><div className="tr-hero"><span className="tr-eyebrow">CONSISTÊNCIA, UM DIA POR VEZ</span><h1>Seu caminho<br />até aqui.</h1></div><div className="tr-metrics"><span><b>{allSessions.length}</b>sessões registradas</span><span><b>{allSessions[0]?.feedback?.effort || "—"}</b>último esforço /10</span></div>{!allSessions.length && <p>Seu primeiro registro aparece aqui depois do treino.</p>}{allSessions.map(s => <article className="tr-card" key={s.id}><div className="tr-row"><b>{date(s.completed_at || s.completedAt || s.created_at)}</b><span className="tr-tag">{pending.some(x => x.id === s.id) ? "No celular" : "Sincronizado"}</span></div><p>{s.sets.length} séries · esforço {s.feedback.effort}/10 · {s.feedback.pain ? "Dor relatada — avaliação necessária" : "Sem dor relatada"}</p></article>)}{profile && <PhotoPanel uid={uid} profile={profile} photos={data.photos} onChange={load} />}</>}
 {tab === "account" && <><h1>Seu espaço.</h1><section className="tr-card"><h2>Seu perfil</h2><p>{profile ? `${profile.name} · ${profile.age} anos` : "Seu perfil ainda não foi preenchido."}</p><button onClick={() => setMode("wizard")}>Revisar perguntas e preferências</button><p className="tr-small">Ao salvar novas respostas, a proposta anterior fica desatualizada. Suas sessões anteriores continuam no histórico.</p></section><section className="tr-card"><h2>Privacidade e limites</h2><p>A foto é opcional, privada dentro do aplicativo e não é enviada à IA. Não estimamos gordura nem diagnosticamos condições pela imagem.</p><p>O responsável técnico pelo banco pode administrar os arquivos. Evite mostrar o rosto ou outras pessoas.</p><p>O plano é uma proposta inicial de treino, não uma avaliação presencial. Técnica, sintomas e recuperação importam mais que uma meta de carga.</p><p className="tr-small">Você pode excluir fotos na área Evolução. Respostas e registros ficam na sua conta.</p></section><button onClick={() => supabase.auth.signOut()}>Sair da conta</button>{data.isOwner && <a className="tr-link" href="/">Voltar ao meu aplicativo pessoal</a>}</>}
 {tab === "invites" && data.isOwner && <Invites />}
 <nav className="tr-nav">{[["plan", "Treino"], ["exercises", "Exercícios"], ["progress", "Evolução"], ["account", "Conta"], ...(data.isOwner ? [["invites", "Clientes"]] : [])].map(([key, label]) => <button key={key} className={tab === key ? "on" : ""} onClick={() => {
        setTab(key);
        window.scrollTo(0, 0);
      }}>{label}</button>)}</nav>
 </main>;
}
function Wizard({
  uid,
  initial,
  busy,
  onSave,
  onExit
}) {
  const key = `training_draft_${uid}`,
    [answers, setAnswers] = useState(() => read(key, initial || {
      priorities: [],
      equipment: [],
      days: [],
      avoid: []
    })),
    [index, setIndex] = useState(-1),
    [error, setError] = useState("");
  const q = QUESTIONS[index];
  function update(id, value) {
    const next = {
      ...answers,
      [id]: value
    };
    setAnswers(next);
    setError("");
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      setError("Não consegui guardar o rascunho neste aparelho. Não feche a tela antes de enviar suas respostas.");
    }
  }
  function next() {
    if (index < 0) {
      if (!answers.consent) {
        setError("Confirme o consentimento para continuar.");
        return;
      }
      setIndex(0);
      return;
    }
    const e = validateAnswer(q, answers[q.id]);
    if (e) {
      setError(e);
      return;
    }
    setError("");
    setIndex(index + 1);
    window.scrollTo(0, 0);
  }
  if (index < 0) return <section className="tr-card"><span className="tr-eyebrow">ANTES DE COMEÇAR</span><h1>Vamos conhecer<br />sua rotina.</h1><p>As respostas serão usadas para criar e acompanhar seu treino. Perguntas de saúde ajudam a identificar situações que precisam de orientação presencial.</p><p>Suas respostas ficam guardadas neste aparelho durante o preenchimento. Ao concluir, serão salvas na sua conta. A foto e o uso da IA são opcionais.</p><label className="tr-check"><input type="checkbox" checked={!!answers.consent} onChange={e => update("consent", e.target.checked)} />Tenho 18 anos ou mais e concordo com esse uso das minhas respostas.</label>{error && <p role="alert">{error}</p>}<button className="tr-primary" onClick={next}>Começar as perguntas →</button><button onClick={onExit}>Voltar</button></section>;
  if (index >= QUESTIONS.length) return <section className="tr-card"><span className="tr-eyebrow">TUDO NO SEU RITMO</span><h1>Confira seu ponto<br />de partida.</h1><dl className="tr-review">{QUESTIONS.map((q, i) => <div key={q.id}><dt>{q.title}</dt><dd>{displayAnswer(q, answers[q.id])}<button className="tr-text-button" onClick={() => setIndex(i)}>Editar</button></dd></div>)}</dl><p>Você poderá voltar e atualizar essas respostas. Não informe uma resposta diferente apenas para liberar o treino.</p><button className="tr-primary" disabled={busy} onClick={() => onSave(answers)}>{busy ? "Salvando…" : "Salvar minhas respostas"}</button></section>;
  const value = answers[q.id];
  return <section className="tr-question"><div className="tr-row"><span className="tr-eyebrow">{q.section}</span><span className="tr-small">{index + 1} de {QUESTIONS.length}</span></div><progress max={QUESTIONS.length} value={index + 1} /><h1>{q.title}</h1>{q.hint && <p className="tr-hint">{q.hint}</p>}
 {q.type === "choice" || q.type === "multi" ? <div className="tr-options">{q.options.map(([id, label]) => {
        const selected = q.type === "multi" ? (value || []).includes(id) : value === id;
        return <button key={String(id)} aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => update(q.id, q.type === "choice" ? id : selected ? value.filter(v => v !== id) : [...(value || []), id])}><span>{label}</span><span className="tr-option-mark">{selected ? "✓" : ""}</span></button>;
      })}</div> : <label className="tr-field">{q.type === "number" ? "Sua resposta" : "Escreva aqui"}{q.type === "text" && q.max > 100 ? <textarea maxLength={q.max} value={value || ""} onChange={e => update(q.id, e.target.value)} /> : <input inputMode={q.type === "number" ? "decimal" : "text"} maxLength={q.max} value={value ?? ""} onChange={e => update(q.id, q.type === "number" ? e.target.value.replace(",", ".") : e.target.value)} />}</label>}
 {error && <p className="tr-alert" role="alert">{error}</p>}<div className="tr-wizard-actions"><button onClick={() => {
        setError("");
        setIndex(index - 1);
      }}>← Voltar</button><button className="tr-primary" onClick={next}>{q.optional && (value == null || value === "" || !value.length) ? "Pular esta pergunta" : "Continuar →"}</button></div><button className="tr-text-button" onClick={onExit}>Sair e continuar depois</button></section>;
}
function displayAnswer(q, value) {
  if (value == null || value === "" || Array.isArray(value) && !value.length) return "Não informado";
  if (q.type === "multi") return value.map(v => q.options.find(([id]) => id === v)?.[1]).join(", ");
  if (q.type === "choice") return q.options.find(([id]) => id === value)?.[1] || "Não informado";
  return String(value);
}
function PlanView({
  record,
  profile,
  sessions,
  busy,
  onGenerate,
  onStart
}) {
  const plan = record.plan;
  return <><div className="tr-hero"><span className="tr-eyebrow">UMA PROPOSTA PARA AS PRÓXIMAS 4 SEMANAS</span><h1>Seu próximo passo<br />está aqui.</h1><p>{GOALS.find(([id]) => id === plan.goal)?.[1]} · {profile.minutes} min disponíveis</p></div><div className="tr-row"><span className="tr-tag">{plan.source === "ai_assisted" ? "Com apoio da IA" : "Plano base personalizado"}</span><span className="tr-small">Criado em {date(record.created_at)}</span></div><p className="tr-intro">{plan.explanation}</p>{profile.aiConsent && plan.source !== "ai_assisted" && <p className="tr-small">A explicação opcional da IA não ficou disponível. A proposta base usa suas respostas e pode ser utilizada sem ela.</p>}
 <TrainingMuscles plan={plan} sessions={sessions} />
 {plan.workouts.map((w, i) => <article className="tr-card tr-workout" key={w.id}><div className="tr-row"><span className="tr-eyebrow">{DAYS.find(([id]) => id === w.day)?.[1]}</span><span className="tr-tag">~{w.minutes} min</span></div><h2>{w.kind === "strength" ? `Treino ${String.fromCharCode(65 + i)} · corpo todo` : w.name}</h2><p>{w.kind === "strength" ? `${w.exercises.length} exercícios · reserva de 2–3 repetições` : w.guidance}</p>{w.kind === "strength" && <div className="tr-exercise-list">{w.exercises.map(x => <div key={x.id}><span>{x.name}</span><b>{x.sets} × {x.reps}</b></div>)}</div>}<button className="tr-primary" onClick={() => onStart(w)}>{w.kind === "strength" ? "Começar este treino" : "Registrar atividade leve"}</button></article>)}
 <details className="tr-card"><summary>Como evoluir sem atropelar etapas</summary><p>{plan.progression}</p>{plan.notes.map(n => <p key={n}>{n}</p>)}<p>Desconforto muscular comum não é o mesmo que dor forte, aguda ou articular. Pare um movimento doloroso e busque orientação.</p></details><button disabled={busy} onClick={onGenerate}>{busy ? "Ajustando…" : "Reavaliar proposta com meus registros"}</button><p className="tr-small">O app reavalia a proposta após 3 sessões sincronizadas desta versão, ou quando você pedir. Esforço e recuperação ajudam a reduzir volume; dor pausa a rotina. Cargas nunca aumentam sozinhas.</p></>;
}
function PhotoPanel({
  uid,
  profile,
  photos = [],
  onChange
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [urls, setUrls] = useState({}),
    [consent, setConsent] = useState(!!profile.photoConsent);
  useEffect(() => {
    let live = true;
    if (photos.length) supabase.storage.from("training-photos").createSignedUrls(photos.map(p => p.path), 900).then(({
      data
    }) => {
      if (live) setUrls(Object.fromEntries(photos.map((p, i) => [p.id, data?.[i]?.signedUrl])));
    });
    return () => {
      live = false;
    };
  }, [photos]);
  async function upload(file) {
    if (!file || !consent) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 15000000) throw new Error("Escolha uma foto menor que 15 MB.");
      await request("/photos", {
        consent: true
      });
      const blob = await compress(file, 1080);
      if (!blob) throw new Error("Não consegui preparar a imagem.");
      const path = `${uid}/${crypto.randomUUID()}.jpg`;
      const result = await supabase.storage.from("training-photos").upload(path, blob, {
        contentType: "image/jpeg"
      });
      if (result.error) throw new Error("Não consegui enviar a foto. Confira a conexão e tente novamente.");
      await request("/photos", {
        path
      });
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    setBusy(true);
    try {
      await request("/photos", {
        id
      }, "DELETE");
      await onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <section className="tr-card"><span className="tr-eyebrow">VOCÊ ESCOLHE</span><h2>Foto de evolução.<br />Opcional, de verdade.</h2><p>Se quiser, fotografe o corpo com roupa de treino e sem mostrar o rosto. Use distância e iluminação semelhantes nas próximas fotos.</p><p className="tr-small">A foto não é analisada para montar o treino nem enviada à IA. Dentro do app, só sua conta acessa a imagem. O administrador técnico do banco pode administrar arquivos.</p><label className="tr-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Autorizo guardar minhas fotos privadas para acompanhar a evolução.</label><label className={`tr-upload ${!consent || busy ? "disabled" : ""}`}>{busy ? "Aguarde…" : "+ Escolher foto opcional"}<input type="file" accept="image/*" hidden disabled={!consent || busy} onChange={e => upload(e.target.files?.[0])} /></label>{error && <p role="alert">{error}</p>}<div className="tr-photo-grid">{photos.map(p => <figure key={p.id}>{urls[p.id] && <img src={urls[p.id]} alt={`Sua foto de evolução de ${date(p.created_at)}`} />}<figcaption>{date(p.created_at)}<button disabled={busy} onClick={() => remove(p.id)}>Excluir</button></figcaption></figure>)}</div></section>;
}
function Session({
  uid,
  sessions,
  plan,
  workout,
  onClose,
  onComplete
}) {
  const key = `training_session_${uid}`;
  const [draft, setDraft] = useState(() => {
    const old = read(key, null);
    return old?.planId === plan.id && old.workoutId === workout.id ? old : {
      id: crypto.randomUUID(),
      planId: plan.id,
      workoutId: workout.id,
      sets: [],
      swaps: {},
      feedback: {
        effort: 6,
        recovery: "good",
        pain: false,
        note: ""
      }
    };
  });
  const [index, setIndex] = useState(0),
    [review, setReview] = useState(false),
    [error, setError] = useState("");
  const [rest, startRest] = useRestTimer(`training:${uid}:${draft.id}`, () => {});
  function update(next) {
    setDraft(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setError("");
      return true;
    } catch {
      setError("Não consegui guardar o rascunho no celular. Libere espaço antes de fechar.");
      return false;
    }
  }
  const slot = workout.exercises[index],
    exercise = slot ? CATALOG.find(x => x.id === draft.swaps[slot.id]) || slot : null;
  const lastExercise = [...sessions].sort((a, b) => String(b.completed_at || b.completedAt || b.created_at).localeCompare(String(a.completed_at || a.completedAt || a.created_at))).find(s => s.sets?.some(x => x.exerciseId === exercise?.id));
  const lastSets = lastExercise?.sets.filter(x => x.exerciseId === exercise?.id) || [];
  function setDone(i, reps, kg) {
    if (!reps || !Number.isFinite(+reps) || +reps < 1 || !Number.isFinite(+kg) || +kg < 0 || +kg > 500 || +reps > 100) {
      setError("Preencha repetições e carga. Para peso do corpo, use 0 kg.");
      return;
    }
    const sets = [...draft.sets.filter(s => !(s.slotId === slot.id && s.index === i)), {
      slotId: slot.id,
      exerciseId: exercise.id,
      index: i,
      reps: +reps,
      kg: +kg
    }];
    if (update({
      ...draft,
      sets
    })) startRest(slot.rest);
  }
  return <main className="training tr-session"><div className="tr-row"><button onClick={onClose}>← Pausar</button><span className="tr-small">{workout.name}</span></div>{rest > 0 && <button className="tr-rest" onClick={() => startRest(0)}>Descanso · {rest}s <span>Pular</span></button>}
 {review || workout.kind === "recovery" ? <section className="tr-card"><span className="tr-eyebrow">ANTES DE FECHAR</span><h1>Como foi<br />para você?</h1><p>{draft.sets.length} séries registradas. Uma sessão parcial também conta como registro.</p><label>Esforço da sessão: {draft.feedback.effort}/10<input type="range" min="1" max="10" value={draft.feedback.effort} onChange={e => update({
          ...draft,
          feedback: {
            ...draft.feedback,
            effort: +e.target.value
          }
        })} /></label><label>Recuperação hoje<select value={draft.feedback.recovery} onChange={e => update({
          ...draft,
          feedback: {
            ...draft.feedback,
            recovery: e.target.value
          }
        })}><option value="good">Boa</option><option value="tired">Cansado</option><option value="poor">Muito ruim</option></select></label><fieldset><legend>Sentiu dor, além do esforço muscular habitual?</legend><label><input type="radio" name="pain" checked={!draft.feedback.pain} onChange={() => update({
            ...draft,
            feedback: {
              ...draft.feedback,
              pain: false
            }
          })} />Não</label><label><input type="radio" name="pain" checked={draft.feedback.pain} onChange={() => update({
            ...draft,
            feedback: {
              ...draft.feedback,
              pain: true
            }
          })} />Sim</label></fieldset>{draft.feedback.pain && <p className="tr-alert">Pare os exercícios dolorosos. A rotina automática ficará pausada para você buscar orientação. Se o sintoma for forte ou súbito, procure atendimento.</p>}<label>Quer anotar algo? (opcional)<textarea maxLength={500} value={draft.feedback.note} onChange={e => update({
          ...draft,
          feedback: {
            ...draft.feedback,
            note: e.target.value
          }
        })} /></label><button className="tr-primary" onClick={() => {
        if (workout.kind === "strength" && !draft.sets.length) {
          setError("Registre pelo menos uma série antes de concluir.");
          return;
        }
        onComplete(draft);
      }}>Guardar minha sessão</button>{workout.kind === "strength" && <button onClick={() => setReview(false)}>Voltar aos exercícios</button>}</section> : <><div className="tr-hero"><span className="tr-eyebrow">EXERCÍCIO {index + 1} DE {workout.exercises.length}</span><h1>{exercise.name}</h1><p>{slot.sets} séries · {slot.reps} repetições · {slot.rest}s de descanso</p></div><details className="tr-card"><summary>Antes da primeira série: aquecimento</summary><p>{workout.warmup}</p></details><section className="tr-card tr-prescription"><h2>Seu objetivo neste exercício</h2><strong>{slot.sets} séries de {slot.reps} repetições</strong><p>Descanse {slot.rest} segundos entre as séries. Termine sentindo que conseguiria fazer mais {slot.rir} repetições com boa técnica.</p><p className="tr-small">Escolha uma carga leve o suficiente para manter o movimento controlado. Para exercícios sem peso externo, registre 0 kg.</p>{lastSets.length > 0 && <p>Último registro: {lastSets.map(s => `${s.reps} repetições × ${s.kg} kg`).join(" · ")}</p>}</section><ExerciseGuide exercise={exercise} /><section className="tr-card"><h2>Faça com controle.</h2><ol>{exercise.cues.map(c => <li key={c}>{c}</li>)}</ol><p className="tr-small">Termine com cerca de {slot.rir} repetições de reserva. Se sentir dor, pare.</p>{slot.alternatives.length > 0 && <label>Precisa de uma alternativa?<select value={exercise.id} onChange={e => {
            if (draft.sets.some(s => s.slotId === slot.id)) {
              setError("Para manter seu registro consistente, escolha a alternativa antes de registrar as séries deste exercício.");
              return;
            }
            update({
              ...draft,
              swaps: {
                ...draft.swaps,
                [slot.id]: e.target.value
              }
            });
          }}>{[slot.id, ...slot.alternatives].map(id => <option key={id} value={id}>{CATALOG.find(x => x.id === id)?.name}</option>)}</select></label>}</section><div className="tr-sets">{Array.from({
          length: slot.sets
        }, (_, i) => <SetRow key={`${exercise.id}:${i}`} number={i + 1} target={slot.reps} initial={draft.sets.find(s => s.slotId === slot.id && s.index === i)} onDone={(r, k) => setDone(i, r, k)} />)}</div><div className="tr-row"><button disabled={index === 0} onClick={() => setIndex(index - 1)}>Anterior</button><button className="tr-primary" onClick={() => index === workout.exercises.length - 1 ? setReview(true) : setIndex(index + 1)}>{index === workout.exercises.length - 1 ? "Revisar e concluir" : "Próximo exercício →"}</button></div><button className="tr-text-button" onClick={() => setReview(true)}>Encerrar e registrar sessão parcial</button></>}{error && <p className="tr-alert" role="alert">{error}</p>}</main>;
}
function SetRow({
  number,
  target,
  initial,
  onDone
}) {
  const [reps, setReps] = useState(initial?.reps || ""),
    [kg, setKg] = useState(initial?.kg ?? 0);
  return <div className={`tr-set ${initial ? "done" : ""}`}><b>Série {number}<span className="tr-set-target">Meta: {target} reps</span></b><label>Repetições feitas<input placeholder={target}  aria-label={`Repetições da série ${number}`} inputMode="numeric" value={reps} onChange={e => setReps(e.target.value)} /></label><label>Carga (kg)<input aria-label={`Carga da série ${number}`} inputMode="decimal" value={kg} onChange={e => setKg(e.target.value.replace(",", "."))} /></label><button aria-label={`Registrar série ${number}`} onClick={() => onDone(reps, kg)}>{initial ? "✓ Salva" : "Feito"}</button></div>;
}
function Invites() {
  const [email, setEmail] = useState(""),
    [members, setMembers] = useState([]),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () => request("/invites").then(r => setMembers(r.members)).catch(e => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await request("/invites", {
        email
      });
      setLink(r.link);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return <><div className="tr-hero"><span className="tr-eyebrow">SEUS CLIENTES, UM SÓ ENDEREÇO</span><h1>Seu link de<br />cadastro.</h1><p>Cada pessoa tem sua conta, suas respostas e seu histórico. Você gerencia o acesso, sem ver fotos ou respostas de saúde nesta tela.</p></div><section className="tr-card"><h2>Compartilhe este link fixo</h2><p>A pessoa cria a própria conta e senha e começa o questionário. Você não precisa gerar um convite para cada acesso.</p><button onClick={() => navigator.clipboard.writeText(`${location.origin}/treino?cadastro=1`).then(() => setError("Link de cadastro copiado.")).catch(() => setError("Não consegui copiar. Use o endereço da página com ?cadastro=1."))}>Copiar link de cadastro</button></section><details className="tr-card"><summary>Convite individual (opcional)</summary><form className="tr-card" onSubmit={create}><label>E-mail do amigo adulto<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><button className="tr-primary" disabled={busy}>{busy ? "Gerando…" : "Gerar link de convite"}</button><p className="tr-small">Nenhum e-mail é enviado automaticamente. O link é pessoal: compartilhe apenas com a pessoa indicada.</p></form></details>{error && <p role="alert">{error}</p>}{link && <section className="tr-card"><h2>Convite pronto</h2><p>Este link dá acesso à conta convidada. Não publique em grupos.</p><button onClick={() => navigator.clipboard.writeText(link).then(() => setError("Link copiado. Envie ao seu amigo em uma conversa privada.")).catch(() => setError("Não consegui copiar. Tente novamente."))}>Copiar link pessoal</button></section>}{members.map(m => <article className="tr-card" key={m.user_id}><b>{m.email}</b><p>{m.status === "active" ? "Acesso ativo" : "Acesso pausado"}</p><button onClick={async () => {
        try {
          await request("/invites", {
            userId: m.user_id,
            status: m.status === "active" ? "paused" : "active"
          });
          await load();
        } catch (e) {
          setError(e.message);
        }
      }}>{m.status === "active" ? "Pausar acesso" : "Reativar acesso"}</button></article>)}</>;
}
