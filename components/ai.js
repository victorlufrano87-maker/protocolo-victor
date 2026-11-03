"use client";
import { useData } from "@/lib/data-context";
import { useState } from "react";
import { myWorkouts } from "@/lib/builder";
import { supabase, spNow, addDays, fmtDay } from "@/lib/supabase";
import { trainTime, dayScore } from "@/lib/plan";
import { buzz, Icon, spNowTime, KCAL_GOAL, PTN_GOAL, BIO_ALL } from "@/components/shared";
import { weekMuscleSets } from "@/components/exercise-map";



async function shrink(file, max = 1024) {
  const url = URL.createObjectURL(file);
  let img;
  try { img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }); }
  finally { URL.revokeObjectURL(url); }
  const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

function FoodPhoto({ checks, saveLog, say, mealName }) {
  const trackAI = useAIUsage();
  const [st, setSt] = useState(null), [res, setRes] = useState(null), [prev, setPrev] = useState(null), [note, setNote] = useState(""), [err, setErr] = useState(null);
  const foods = checks._foods || [];
  const day = foods.reduce((a, f) => ({ kcal: a.kcal + (f.total?.kcal || 0), ptn: a.ptn + (f.total?.ptn || 0) }), { kcal: 0, ptn: 0 });
  async function go(file) {
    setErr(null); setRes(null); setSt("lendo");
    try {
      const url = await shrink(file); setPrev(url);
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/food", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ image: url.split(",")[1], note }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "nokey" ? "Falta configurar a chave da IA na Vercel (ANTHROPIC_API_KEY)." : j.error === "auth" ? "Faça login de novo." : "Não consegui ler a foto. Tente com mais luz e o prato inteiro.");
      trackAI(j.usage); setRes(j); buzz(40);
    } catch (e) { setErr(e.message); }
    setSt(null);
  }
  const f1 = (v) => Math.round(v);
  return (
    <section className="card">
      <div className="mh"><h3>📸 Foto do prato</h3><span className="tag num">hoje {f1(day.kcal)}/{KCAL_GOAL} kcal · {f1(day.ptn)}/{PTN_GOAL} g PTN</span></div>
      {!res && <>
        <input className="exsearch" placeholder="Dica opcional (ex.: 150 g de frango)" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="btn pri big" style={{ display: "flex", justifyContent: "center", gap: 8, cursor: "pointer" }}>
          <Icon n="camera" s={18} /> {st ? "Lendo o prato..." : "Tirar foto do prato"}
          <input type="file" accept="image/*" capture="environment" hidden disabled={!!st} onChange={(e) => e.target.files?.[0] && go(e.target.files[0])} />
        </label>
      </>}
      {err && <div className="tag warn">{err}</div>}
      {res && <>
        {prev && <img src={prev} alt="Seu prato" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, margin: "6px 0" }} />}
        {res.itens?.length ? <table><tbody>{res.itens.map((i, k) => <tr key={k}><td>{i.nome}</td><td className="q">{f1(i.g)} g</td><td className="q">{f1(i.kcal)} kcal</td><td className="q">{f1(i.ptn)} g PTN</td></tr>)}</tbody></table> : null}
        <div className="pre-grid">
          <div><div className="lbl">Calorias</div><b className="num">{res.total.kcal}</b></div>
          <div><div className="lbl">Proteína</div><b className="num">{res.total.ptn} g</b></div>
          <div><div className="lbl">Carbo · Gord.</div><b className="num">{res.total.carb} · {res.total.gord} g</b></div>
        </div>
        <div className="tag" style={{ fontSize: 12 }}>Estimativa por foto (confiança {res.confianca || "média"}). {res.obs || ""} Pode errar 20–30% nas quantidades.</div>
        <div className="row">
          <button className="ok grow" onClick={() => { saveLog({ checks: { _foods: [...foods, { at: new Date().toISOString(), meal: mealName || null, itens: res.itens, total: res.total }] } }); say("Prato registrado"); setRes(null); setPrev(null); setNote(""); }}>Salvar{mealName ? ` no ${mealName.toLowerCase()}` : ""}</button>
          <button className="sm" onClick={() => { setRes(null); setPrev(null); }}>Descartar</button>
        </div>
      </>}
      {foods.length > 0 && !res && <div className="tag" style={{ fontSize: 12, marginTop: 6 }}>Hoje: {foods.map((f) => `${f.meal || spNowTime(f.at)} ${f.total?.kcal || 0} kcal`).join(" · ")}</div>}
    </section>
  );
}

function ScalePrint({ uid, saveLog, say }) {
  const trackAI = useAIUsage();
  const { saveWeight } = useData();
  const [st, setSt] = useState(null), [res, setRes] = useState(null), [err, setErr] = useState(null);
  async function go(files) {
    setErr(null); setRes(null); setSt(1);
    try {
      const imgs = await Promise.all([...files].slice(0, 3).map((f) => shrink(f, 1400).then((u) => u.split(",")[1])));
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/food", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ images: imgs, mode: "scale" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error === "nokey" ? "Falta configurar a chave da IA na Vercel (ANTHROPIC_API_KEY)." : "Não consegui ler o print.");
      trackAI(j.usage); const { usage: _u, ...jr } = j; setRes(jr); buzz(40);
    } catch (e) { setErr(e.message); }
    setSt(null);
  }
  const save = async () => {
    const { data: _d, ...bio } = res;
    try {
      if (bio.peso) await saveWeight(spNow().day, bio.peso);
      const result = await saveLog({ checks: { _bio: bio } });
      if (result?.error) throw new Error("Não consegui guardar os dados. Tente novamente.");
      say("Bioimpedância guardada no celular"); setRes(null);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div style={{ marginTop: 10 }}>
      {!res && <label className="btn" style={{ display: "flex", justifyContent: "center", gap: 8, cursor: "pointer" }}>
        <Icon n="camera" s={16} /> {st ? "Lendo o print..." : "Ler prints da OKOK (até 3)"}
        <input type="file" accept="image/*" multiple hidden disabled={!!st} onChange={(e) => e.target.files?.length && go(e.target.files)} />
      </label>}
      {!res && <div className="tag" style={{ fontSize: 12 }}>Tire print da tela "Detalhes" da OKOK (role para pegar tudo) e escolha os prints aqui.</div>}
      {err && <div className="tag warn">{err}</div>}
      {res && <>
        <div className="biogrid">{BIO_ALL.filter(([k]) => res[k] != null).map(([k, l, u]) => <div key={k}><span className="lbl">{l}</span><b className="num">{String(res[k]).replace(".", ",")}{u}</b></div>)}</div>
        <div className="tag" style={{ fontSize: 12 }}>Confira se os números batem com o print.</div>
        <div className="row"><button className="ok grow" onClick={save}>Salvar no dia de hoje</button><button className="sm" onClick={() => setRes(null)}>Descartar</button></div>
      </>}
    </div>
  );
}

const AI_PRICE = { in: 3, out: 15 };

const aiCost = (u) => u ? ((u.input_tokens || 0) * AI_PRICE.in + (u.output_tokens || 0) * AI_PRICE.out) / 1e6 : 0;

function useAIUsage() {
  const { current, saveSettings } = useData();
  return (u) => {
    if (!u) return;
    const s = current().settings;
    saveSettings({ supplies: { ...s.supplies, _aiSpent: Math.round(((s.supplies?._aiSpent || 0) + aiCost(u)) * 10000) / 10000 } }, s).catch(() => {});
  };
}

function coachCtx({ week, day, settings, weights }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(day, i - 13));
  const pick = (d) => { const l = week[d]; if (!l) return null; const c = l.checks || {};
    return { d, dieta: dayScore(l), agua: l.water_ml || 0, treino: l.workout_at ? (c._wk || "sim") : null, kcalFoto: (c._foods || []).reduce((a, f) => a + (f.total?.kcal || 0), 0) || undefined,
      sono: c._sleep?.h || c._burn?.sono, ativa: c._burn?.ativa, passos: c._burn?.passos, fc: c._burn?.fc, bio: c._bio, med: c._med, dobras: c._skin?.pct, cardio: c._cardio }; };
  const ws = myWorkouts(settings), T = settings.times || {}, nx = ws[+(T.next || 0) % Math.min(+(T.divs || 5), ws.length)];
  return {
    hoje: day, diaSemana: fmtDay(day, { weekday: "long" }), dietaPlano: `${KCAL_GOAL} kcal, ${PTN_GOAL} g proteína`, treinoHora: trainTime(T, day),
    proximoTreino: nx ? `${nx.id} ${nx.name}: ${nx.ex.slice(0, 6).map((e) => e.n).join(", ")}` : null,
    pesos: (weights || []).slice(-10).map((w) => [w.day, +w.kg]),
    musculosSemana: weekMuscleSets(settings, day),
    dias: days.map(pick).filter(Boolean),
  };
}

function CoachCard({ week, day, settings, log, saveLog, uid }) {
  const trackAI = useAIUsage();
  const { weights } = useData();
  const [busy, setBusy] = useState(false), [q, setQ] = useState(""), [ans, setAns] = useState(null), [err, setErr] = useState(null);
  const saved = log.checks?._coach;
  async function call(question) {
    setBusy(true); setErr(null);
    try {
      const { data } = await supabase.auth.getSession();
      const r = await fetch("/api/coach", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token || ""}` }, body: JSON.stringify({ ctx: coachCtx({ week, day, settings, weights }), question }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error === "nokey" ? "Falta a chave da IA na Vercel." : `Não consegui falar com o coach agora (${j.error || r.status}${j.detail ? ": " + j.detail.slice(0, 120) : ""}).`);
      trackAI(j.usage);
      if (question) setAns(j.text); else saveLog({ checks: { _coach: { text: j.text, at: new Date().toISOString() } } });
      buzz(30);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return (
    <section className="card now">
      <div className="mh"><span className="lbl now-lbl">🧠 Seu coach hoje</span>{saved?.text && <button className="sm" disabled={busy} onClick={() => call()}>{busy ? "..." : "Atualizar"}</button>}</div>
      {saved?.text ? <div className="coach-txt">{saved.text}</div>
        : <button className="pri big" disabled={busy || !weights} onClick={() => call()}>{busy ? "Lendo seus dados..." : "Gerar meu plano de hoje"}</button>}
      <div className="row" style={{ marginTop: 8 }}>
        <input className="exsearch" style={{ margin: 0 }} placeholder="Pergunte: ex. posso comer pizza hoje?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && q.trim() && call(q)} />
        <button className="sm" disabled={busy || !q.trim()} onClick={() => call(q)}>Perguntar</button>
      </div>
      {ans && <div className="coach-txt" style={{ marginTop: 8 }}>{ans}<div><button className="link" onClick={() => { setAns(null); setQ(""); }}>fechar</button></div></div>}
      {err && <div className="tag warn">{err}</div>}
    </section>
  );
}

function AICredit({ settings, saveSettings }) {
  const sp = settings.supplies || {}, bal = sp._aiBalance, spent = sp._aiSpent || 0, since = sp._aiSpentBase || 0;
  const left = bal != null ? bal - (spent - since) : null;
  const [v, setV] = useState("");
  const f = (x) => "US$ " + x.toFixed(2).replace(".", ",");
  return (
    <div className="card">
      <div className="mh"><h2>Créditos da IA</h2>{left != null && <b className={"num " + (left < 1 ? "warn" : "okc")}>{f(Math.max(0, left))}</b>}</div>
      {bal != null ? <div className="tag">Saldo informado {f(bal)} − gasto desde então {f(spent - since)} (estimado). ~{Math.max(0, Math.floor(left / 0.012))} usos restantes.</div>
        : <div className="tag">Informe o saldo que aparece em platform.claude.com para o app ir descontando a cada foto, print ou coach.</div>}
      <div className="row" style={{ marginTop: 6 }}>
        <input inputMode="decimal" placeholder="saldo atual, ex.: 4,05" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 160 }} />
        <button className="sm" onClick={() => { const n = parseFloat(v.replace(",", ".")); if (n >= 0) { saveSettings({ supplies: { ...sp, _aiBalance: n, _aiSpentBase: spent } }); setV(""); } }}>Atualizar saldo</button>
      </div>
      <div className="tag" style={{ fontSize: 12 }}>A Anthropic não deixa o app ler o saldo direto; isto é uma conta aproximada. Total gasto pelo app: {f(spent)}.</div>
    </div>
  );
}

export { shrink, FoodPhoto, ScalePrint, AI_PRICE, aiCost, useAIUsage, coachCtx, CoachCard, AICredit };
