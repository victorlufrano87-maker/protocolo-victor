"use client";
import { useRestTimer } from "@/lib/use-rest-timer";
import { useEffect, useState } from "react";
import { EXMETA } from "@/lib/exmeta";
import { LIBRARY, subOf } from "@/lib/library";
import { myWorkouts, nextLoad, fromLib } from "@/lib/builder";
import { spNow, fmtDay } from "@/lib/supabase";
import { buzz, Icon } from "@/components/shared";
import { BodyMap } from "@/components/exercise-map";



function quickFilter(ex) {
  const main = ex.filter((e) => !e.fin), fin = ex.filter((e) => e.fin);
  let keep = main.filter((e) => (e.rest || 0) >= 90 || e.s >= 4);
  if (keep.length < 3) keep = [...keep, ...main.filter((e) => !keep.includes(e))].slice(0, 3);
  keep = main.filter((e) => keep.includes(e)).slice(0, 4);
  const abs = fin.find((e) => !/min/.test(String(e.r))), card = fin.find((e) => /min/.test(String(e.r)));
  return [...keep, ...(abs ? [abs] : []), ...(card ? [{ ...card, r: "10 min" }] : [])];
}

let _actx = null;

function beep() { try { _actx = _actx || new (window.AudioContext || window.webkitAudioContext)(); const o = _actx.createOscillator(), g = _actx.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(_actx.destination); o.start(); o.stop(_actx.currentTime + 0.35); } catch {} }

function Gym({ w: w0, checks, saveLog, settings, saveSettings, onClose, onDone }) {
  const swapEx = checks._swapEx || {}, quick = !!checks._quick?.[w0.id];
  let exs = w0.ex.map((e, i) => { const sw = swapEx[`${w0.id}${i}`], lib = sw && LIBRARY.find((x) => x.n === sw); return { ...(lib ? fromLib(lib, { s: e.s, r: e.r, rest: e.rest, ...(e.fin ? { fin: true } : {}) }) : e), k: i, orig: lib ? e.n : null }; });
  if (quick) exs = quickFilter(exs);
  const w = { ...w0, ex: exs };
  const [swapOpen, setSwapOpen] = useState(false);
  const [nextMsg, setNextMsg] = useState(null);
  useEffect(() => {
    let lock = null; const req = async () => { try { lock = await navigator.wakeLock?.request("screen"); } catch {} };
    req(); const vis = () => { if (document.visibilityState === "visible") req(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); try { lock?.release(); } catch {} };
  }, []);
  const sets = checks._sets || {};
  const loads = settings.supplies?._loads || {};
  const [tip, setTip] = useState(null);
  const [rest, setRest] = useRestTimer(`${w0.id}:${spNow().day}`, () => { buzz([200, 100, 200]); beep(); setNextMsg(null); });
  const key = (i) => `${w.id}${w.ex[i]?.k ?? i}`;
  const total = w.ex.reduce((a, e) => a + e.s, 0), done = w.ex.reduce((a, e, i) => a + Math.min(e.s, sets[key(i)] || 0), 0);
  const cur = w.ex.findIndex((e, i) => (sets[key(i)] || 0) < e.s);
  const setlog = checks._setlog || {};
  const [repIn, setRepIn] = useState("");
  const [summary, setSummary] = useState(false);
  function doSet(i, e) {
    const n = (sets[key(i)] || 0) + 1; buzz();
    const kg = parseFloat(String(loads[e.n] ?? "").replace(",", ".")) || 0, r = parseInt(repIn || String(e.r)) || 0;
    const sl = [...(setlog[key(i)] || []), { kg, r }];
    saveLog({ checks: { _sets: { ...sets, [key(i)]: Math.min(n, e.s) }, _setlog: { ...setlog, [key(i)]: sl }, ...(checks._wstart ? {} : { _wstart: new Date().toISOString() }) } });
    if (kg > 0) { const eh = settings.supplies?._exHist || {}, lh = settings.supplies?._loadHist || {}, d = spNow().day; saveSettings({ supplies: { ...settings.supplies, _loadHist: { ...lh, [e.n]: { ...(lh[e.n] || {}), [d]: Math.max(kg, lh[e.n]?.[d] || 0) } }, ...(r > 0 ? { _exHist: { ...eh, [e.n]: { ...(eh[e.n] || {}), [d]: sl } } } : {}) } }); }
    setRepIn(""); beep();
    if (n >= e.s && i < w.ex.length - 1) { setNextMsg(`Próximo: ${w.ex[i + 1].n}`); setIx(i + 1); }
    if (n < e.s || i < w.ex.length - 1) setRest(e.rest || 45);
  }
  const finishW = () => { buzz(80); setSummary(true); };

  const setLoad = (e, val) => { const v = parseFloat(String(val).replace(",", ".")); const h = settings.supplies?._loadHist || {}; saveSettings({ supplies: { ...settings.supplies, _loads: { ...loads, [e.n]: val }, ...(v > 0 ? { _loadHist: { ...h, [e.n]: { ...(h[e.n] || {}), [spNow().day]: v } } } : {}) } }); };
  const [guided, setGuided] = useState(true);
  const [ix, setIx] = useState(Math.max(0, cur));
  if (summary) {
    const today = spNow().day, lh = settings.supplies?._loadHist || {};
    const rows = w.ex.map((e, i) => {
      const sl = setlog[key(i)] || [], kg = Math.max(0, ...sl.map((x) => x.kg));
      const prev = Math.max(0, ...Object.entries(lh[e.n] || {}).filter(([d]) => d < today).map(([, v]) => v));
      return { e, sl, kg, pr: kg > 0 && prev > 0 && kg > prev ? kg - prev : 0, first: kg > 0 && prev === 0 };
    });
    const nSets = rows.reduce((a, x) => a + x.sl.length, 0), vol = rows.reduce((a, x) => a + x.sl.reduce((b, y) => b + y.kg * y.r, 0), 0);
    const mins = checks._wstart ? Math.round((Date.now() - new Date(checks._wstart)) / 60000) : null;
    const prs = rows.filter((x) => x.pr > 0);
    return (
      <div className="gym">
        <div className="done-hero"><div style={{ fontSize: 46 }}>🎉</div><h2>Treino {w.id} concluído!</h2><div className="tag">{w.name}</div></div>
        <div className="pre-grid">
          <div><div className="lbl">Tempo</div><b className="num">{mins != null && mins < 300 ? `${mins} min` : "—"}</b></div>
          <div><div className="lbl">Séries</div><b className="num">{nSets}</b></div>
          <div><div className="lbl">Volume</div><b className="num">{vol ? `${Math.round(vol).toLocaleString("pt-BR")} kg` : "—"}</b><span className="tag">carga × reps</span></div>
        </div>
        {prs.length > 0 ? <div className="verdict ok" style={{ margin: "12px 0" }}>🔥 {prs.length === 1 ? "Recorde novo" : `${prs.length} recordes novos`}: {prs.map((x) => `${x.e.n.split(" (")[0]} +${String(x.pr).replace(".", ",")} kg`).join(" · ")}</div>
          : <div className="verdict" style={{ margin: "12px 0" }}>Treino feito é treino que conta. Na próxima, tente +1 repetição ou +1–2 kg.</div>}
        <div className="lbl">Resumo</div>
        {rows.filter((x) => x.sl.length).map((x) => <div key={x.e.n} className="mh" style={{ fontSize: 13, padding: "4px 0" }}><span style={{ flex: 1, minWidth: 0 }}>{x.e.n}</span><span className="num">{x.sl.map((y) => (y.kg ? `${y.r}×${String(y.kg).replace(".", ",")}` : y.r)).join(" · ")}</span></div>)}
        <button className="ok big" style={{ marginTop: 14 }} onClick={onDone}><Icon n="check" /> Salvar e fechar</button>
      </div>
    );
  }  if (guided) {
    if (!w.ex[ix]) { if (w.ex.length) setTimeout(() => setIx(0), 0); return null; }
    const e = w.ex[ix], n = sets[key(ix)] || 0, ok = n >= e.s;
    const steps = String(e.tip || "").split(/(?<=\.)\s+/).filter(Boolean);
    if (!/min|s$/.test(String(e.r))) steps.push("Ritmo: 1 segundo fazendo força, 2 segundos voltando devagar.", "Respire: solte o ar na hora da força e puxe o ar na volta.");
    const meta = EXMETA[e.img];
    const reps = e.r === "20 min" ? "20 min" : `${e.s} séries × ${e.r}${/s|lado/.test(String(e.r)) ? "" : " reps"}`;
    const hist = Object.entries(settings.supplies?._loadHist?.[e.n] || {}).sort(([a2], [b2]) => (a2 < b2 ? -1 : 1));
    const last = hist.at(-1);
    return (
      <div className="gym">
        <div className="mh"><div><div className="lbl">Treino {w.id} · {w.name} · {ix + 1} de {w.ex.length}</div></div><div className="row" style={{ gap: 6 }}><button className={"sm" + (quick ? " pri" : "")} onClick={() => { buzz(); saveLog({ checks: { _quick: { ...(checks._quick || {}), [w0.id]: !quick } } }); setIx(0); }}>⚡ {quick ? "Rápido ✓" : "Rápido"}</button><button className="sm" onClick={() => setGuided(false)}>Lista</button><button className="sm" onClick={onClose}>✕</button></div></div>
        {quick && <div className="tag" style={{ fontSize: 12 }}>Treino rápido (~40 min): só os principais + abdômen + 10 min de cardio.</div>}
        <div className="bar"><i style={{ width: `${(done / total) * 100}%` }} /></div>
        {rest > 0 ? (
          <button className="rest-big" onClick={() => setRest(0)}>
            <span className="lbl">Descanse</span><b className="num">{rest}s</b>
            <span className="tag">{nextMsg || (ok ? "Último exercício feito!" : `Depois: série ${n + 1} de ${e.s}`)} · toque para pular</span>
          </button>
        ) : <>
          <div className="exd-head"><span className="exd-n">{ix + 1}</span><h2>{e.n}</h2>{e.fin && <span className="supl">FINAL</span>}</div>
          {e.orig ? <div className="tag">Trocado hoje (original: {e.orig}) · <button className="link" onClick={() => { const c = { ...swapEx }; delete c[key(ix)]; saveLog({ checks: { _swapEx: c } }); }}>desfazer</button></div>
            : <button className="sm" style={{ marginBottom: 8 }} onClick={() => setSwapOpen(true)}>🔄 Máquina ocupada? Trocar</button>}
          {swapOpen && <SwapEx e={e} onClose={() => setSwapOpen(false)}
            onToday={(alt) => { buzz(); saveLog({ checks: { _swapEx: { ...swapEx, [key(ix)]: alt.n } } }); setSwapOpen(false); }}
            onAlways={(alt) => { buzz(); const ws = myWorkouts(settings).map(({ id, ...x }) => ({ ...x, ex: [...x.ex] })); const wi = myWorkouts(settings).findIndex((x) => x.id === w0.id);
              if (wi >= 0) { const old = ws[wi].ex[e.k]; ws[wi].ex[e.k] = fromLib(alt, { s: old.s, r: old.r, rest: old.rest, ...(old.fin ? { fin: true } : {}) }); saveSettings({ supplies: { ...settings.supplies, _workouts: ws } }); }
              setSwapOpen(false); }} />}
          {e.img && <div className="exd-photos">
            <figure><img src={`/ex/${e.img}.jpg`} alt={`${e.n}: posição 1`} /><figcaption>1 · início</figcaption></figure>
            <figure><img src={`/ex/${e.img}_1.jpg`} alt={`${e.n}: posição 2`} onError={(ev) => { ev.currentTarget.parentElement.style.display = "none"; }} /><figcaption>2 · fim</figcaption></figure>
          </div>}
          <div className="exd-mid">
            {meta && <div style={{ width: 120, flex: "none" }}><BodyMap pm={meta.pm} sm={meta.sm} /></div>}
            <ol className="exd-steps">{steps.map((t, k) => <li key={t}><span>{k + 1}</span>{t}</li>)}</ol>
          </div>
          {meta && <div className="tag" style={{ fontSize: 12 }}>Trabalha: <b>{meta.pm.join(", ")}</b>{meta.sm.length ? ` · ajuda: ${meta.sm.join(", ")}` : ""}</div>}
          <div className="exd-bar">
            <div><span className="lbl">Séries</span><b>{e.r === "20 min" ? 1 : e.s}</b></div>
            <div><span className="lbl">{/s|lado|min/.test(String(e.r)) ? "Tempo" : "Reps"}</span><b>{e.r}</b></div>
            <div><span className="lbl">Descanso</span><b>{e.rest ? `${e.rest}s` : "—"}</b></div>
          </div>
          {e.load && <div className="tag" style={{ fontSize: 12 }}>Referência: {e.load}</div>}
          <a className="btn" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(e.n.replace(/\(.*?\)/g, "") + " execução correta")}`} target="_blank" rel="noreferrer"><Icon n="ext" s={16} /> Ver vídeo de como fazer</a>
          <div className="row" style={{ alignItems: "center", marginTop: 10 }}>
            <span className="tag">Carga:</span>
            <input inputMode="decimal" placeholder="kg" value={loads[e.n] ?? ""} onChange={(ev) => setLoad(e, ev.target.value)} style={{ width: 80 }} aria-label="Carga usada" />
            <span className="tag" style={{ fontSize: 12 }}>{last ? <>última: {String(last[1]).replace(".", ",")} kg · <b>hoje: {String(nextLoad(settings.supplies?._loadHist?.[e.n], settings.supplies?._exHist?.[e.n], parseInt(String(e.r)))).replace(".", ",")} kg</b></> : "1ª vez: comece leve, sobrando 2 reps"}</span>
          </div>
          {(() => { const ps = Object.entries(settings.supplies?._exHist?.[e.n] || {}).filter(([d]) => d < spNow().day).sort(([a2], [b2]) => (a2 < b2 ? -1 : 1)).at(-1); if (!ps) return null;
            const rm = Math.max(...ps[1].map((y) => (y.kg || 0) * (1 + (y.r || 0) / 30)));
            return <div className="prevbox"><span className="lbl">Anterior ({fmtDay(ps[0], { day: "2-digit", month: "2-digit" })})</span><b className="num">{ps[1].map((y) => `${y.r}×${String(y.kg).replace(".", ",")}`).join(" · ")}</b>{rm > 0 && <span className="tag">1RM estimado: {Math.round(rm)} kg</span>}</div>; })()}
          {!ok && !/min/.test(String(e.r)) && <div className="row" style={{ alignItems: "center" }}><span className="tag">Repetições feitas:</span>
            <input inputMode="numeric" placeholder={String(parseInt(String(e.r)) || "")} value={repIn} onChange={(ev) => setRepIn(ev.target.value)} style={{ width: 70 }} aria-label="Repetições" />
            <span className="tag" style={{ fontSize: 12 }}>vazio = {String(parseInt(String(e.r)) || e.r)}</span></div>}
          <div className="dots" style={{ margin: "10px 0" }}>{Array.from({ length: e.s }, (_, k) => <i key={k} className={k < n ? "on" : ""} />)}</div>
          {(setlog[key(ix)] || []).length > 0 && <div className="tag" style={{ fontSize: 12 }}>Feito: {(setlog[key(ix)] || []).map((y, k) => `${k + 1}ª ${y.r}${y.kg ? `×${String(y.kg).replace(".", ",")} kg` : ""}`).join(" · ")}</div>}
          {!ok ? <button className="ok big" onClick={() => doSet(ix, e)}>Série {n + 1} de {e.s} feita</button>
            : ix < w.ex.length - 1 ? <button className="pri big" onClick={() => { buzz(); setIx(ix + 1); }}>Próximo exercício →</button>
            : <button className="ok big" onClick={finishW}><Icon n="check" /> Terminei o treino</button>}
          <div className="tag" style={{ fontSize: 12 }}>Subir carga: se fez todas as reps com folga, na próxima vez coloque +1–2 kg.</div>
        </>}
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <button className="sm" disabled={ix === 0} onClick={() => setIx(ix - 1)}>← Anterior</button>
          <button className="sm" disabled={ix === w.ex.length - 1} onClick={() => setIx(ix + 1)}>Pular →</button>
        </div>
      </div>
    );
  }
  return (
    <div className="gym">
      <div className="mh"><div><div className="lbl">Treino {w.id}</div><h2>{w.name}</h2></div><div className="row" style={{ gap: 6 }}><button className="sm" onClick={() => setGuided(true)}>Passo a passo</button><button className="sm" onClick={onClose}>Fechar</button></div></div>
      <div className="bar"><i style={{ width: `${(done / total) * 100}%` }} /></div>
      <div className="tag">{done}/{total} séries · siga a ordem de cima para baixo · toque no nome para ver como fazer</div>
      {rest > 0 && <button className="rest" onClick={() => setRest(0)}>Descanso <b className="num">{rest}s</b> <span className="tag">toque para pular</span></button>}
      <div className="gym-list">
        {w.ex.map((e, i) => {
          const n = sets[key(i)] || 0, ok = n >= e.s;
          return (
            <div key={i} className={"gx" + (ok ? " done" : "") + (i === cur ? " cur" : "")}>
              <button className="gx-head" onClick={() => { buzz(); setIx(i); setGuided(true); }}>
                <span className="gx-n num">{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{e.fin && <span className="supl">FINAL</span>}<b>{e.n}</b><div className="tag">{e.r === "20 min" ? "20 min" : `${e.s} séries × ${e.r}${/s|lado/.test(String(e.r)) ? "" : " reps"}`}{e.rest ? ` · descanso ${e.rest}s` : ""}{e.load ? ` · ${e.load}` : ""}</div></span>
              </button>
              {tip === i && <div className="gx-tip">{e.img && <img className="gx-img" src={`/ex/${e.img}.jpg`} alt={e.n} loading="lazy" />}{e.tip}</div>}
              <div className="row">
                <div className="dots">{Array.from({ length: e.s }, (_, k) => <i key={k} className={k < n ? "on" : ""} />)}</div>
                <input inputMode="decimal" placeholder="kg" value={loads[e.n] ?? ""} onChange={(ev) => setLoad(e, ev.target.value)} style={{ width: 70 }} aria-label="Carga usada" />
                {!ok ? <button className="ok" onClick={() => doSet(i, e)}>Série {n + 1} feita</button> : <button className="sm" onClick={() => saveLog({ checks: { _sets: { ...sets, [key(i)]: 0 } } })}>Refazer</button>}
              </div>
            </div>
          );
        })}
      </div>
      <button className="ok big" onClick={finishW}><Icon n="check" /> Terminei o treino</button>
      <div className="tag">A carga que você digita fica salva para a próxima vez. Na dúvida sobre um aparelho, peça ao instrutor da academia para ajustar na primeira vez.</div>
    </div>
  );
}

function SwapEx({ e, onClose, onToday, onAlways }) {
  const cur = LIBRARY.find((x) => x.n === e.n) || LIBRARY.find((x) => x.img === e.img);
  const sub = cur && subOf(cur);
  const alts = cur ? [...LIBRARY.filter((x) => x.n !== cur.n && x.g === cur.g && sub && subOf(x) === sub), ...LIBRARY.filter((x) => x.n !== cur.n && x.g === cur.g && !(sub && subOf(x) === sub))] : [];
  return (
    <div className="sheet-bg" onClick={onClose}><div className="sheet" onClick={(ev) => ev.stopPropagation()} style={{ maxHeight: "80vh", overflow: "auto" }}>
      <div className="grab" />
      <div className="mh"><h2>Trocar exercício</h2><button className="sm" onClick={onClose}>Fechar</button></div>
      <div className="tag">Mesmo músculo{sub ? ` (${cur.g.toLowerCase()} ${sub})` : ""} primeiro. Séries e repetições continuam as mesmas.</div>
      {alts.slice(0, 10).map((x, i) => (
        <div key={x.n} className="pick-row" style={{ cursor: "default" }}>
          <img src={`/ex/${x.img}.jpg`} alt="" loading="lazy" />
          <span><b>{x.n}</b><span className="tag">{x.eq}{sub && subOf(x) === sub ? " · mesma parte ✓" : ""}</span></span>
          <span style={{ display: "flex", flexDirection: "column", gap: 4 }}><button className="sm pri" onClick={() => onToday(x)}>Só hoje</button><button className="sm" onClick={() => onAlways(x)}>Sempre</button></span>
        </div>
      ))}
      {!alts.length && <div className="tag">Sem alternativa cadastrada para este exercício.</div>}
    </div></div>
  );
}

export { Gym, quickFilter, _actx, beep, SwapEx };
