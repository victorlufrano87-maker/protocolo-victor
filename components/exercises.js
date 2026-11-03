"use client";
import { useEffect, useState } from "react";
import { LIBRARY, GROUPS_EX, EQUIP, SUBS, subOf } from "@/lib/library";
import { myWorkouts, suggestPlan, suggestWhy, nextLoad, fromLib } from "@/lib/builder";
import { spNow, fmtDay } from "@/lib/supabase";
import { buzz, Icon, VIRADA, dnum } from "@/components/shared";
import { LineChart } from "@/components/charts";
import { BodyMap } from "@/components/exercise-map";



function ExAnim({ img, name }) {
  const [f, setF] = useState(0), [play, setPlay] = useState(true), [has2, setHas2] = useState(true);
  useEffect(() => { if (!play || !has2) return; const t = setInterval(() => setF((x) => 1 - x), 1100); return () => clearInterval(t); }, [play, has2]);
  return (
    <div className="exanim" onClick={() => setPlay(!play)}>
      <img src={`/ex/${img}.jpg`} alt={`${name}: início`} style={{ opacity: f === 0 ? 1 : 0 }} />
      {has2 && <img src={`/ex/${img}_1.jpg`} alt={`${name}: fim`} style={{ opacity: f === 1 ? 1 : 0 }} onError={() => { setHas2(false); setF(0); }} />}
      <span className="exanim-tag">{f === 0 ? "1 · início" : "2 · fim"}{has2 ? (play ? " · toque para pausar" : " · pausado") : ""}</span>
    </div>
  );
}

function ExDetail({ x, onClose, fav, toggleFav, settings }) {
  const hist = Object.entries(settings?.supplies?._loadHist?.[x.n] || {}).sort(([a], [b]) => (a < b ? -1 : 1));
  const best = hist.length ? Math.max(...hist.map(([, v]) => v)) : null;
  return (
    <div className="exsheet">
      <div className="mh"><button className="sm" onClick={onClose}>← Voltar</button><button className="sm" aria-label="Favorito" onClick={toggleFav}>{fav ? "★ Favorito" : "☆ Favoritar"}</button></div>
      <h2 style={{ margin: "10px 0 4px" }}>{x.n}</h2>
      <div className="seg" style={{ margin: "0 0 10px" }}><span className="pill">{x.g}</span><span className="pill">{x.eq}</span>{x.mine && <span className="pill">no seu treino {x.mine}</span>}</div>
      <ExAnim img={x.img} name={x.n} />
      <div style={{ margin: "12px 0" }}>
        <div style={{ maxWidth: 300, margin: "0 auto 8px" }}><BodyMap pm={x.pm} sm={x.sm} /></div>
        <div>
          <div className="lbl">Onde sentir</div><b style={{ fontSize: 16 }}>{x.foco || x.pm.join(", ")}</b>
          {x.pm.length > 0 && <div className="tag" style={{ marginTop: 6 }}><span className="dotc" style={{ background: "#e53935" }} /> principal: {x.pm.join(", ")}</div>}
          {x.sm.length > 0 && <div className="tag"><span className="dotc" style={{ background: "#f4a3a1" }} /> ajuda: {x.sm.join(", ")}</div>}
        </div>
      </div>
      <div className="lbl">Como fazer</div>
      <ol className="exd-steps" style={{ margin: "6px 0 12px" }}>{[...x.s, ...(x.g !== "Cardio" ? ["Ritmo: 1 segundo fazendo força, 2 segundos voltando.", "Respire: solte o ar na força, puxe na volta."] : [])].map((t, k) => <li key={k}><span>{k + 1}</span>{t}</li>)}</ol>
      {x.erro && <div className="verdict warn" style={{ fontWeight: 500 }}><b>Erro comum:</b> {x.erro}</div>}
      {best != null && <div className="card" style={{ margin: "10px 0" }}>
        <div className="mh"><h3>Sua evolução</h3><span className="tag">recorde <b>{String(best).replace(".", ",")} kg</b></span></div>
        {hist.length > 1 ? <LineChart data={hist.map(([d, v]) => ({ day: d, kg: v }))} unit=" kg" /> : <div className="tag">Faça mais um treino para ver o gráfico.</div>}
        <div className="tag" style={{ fontSize: 12 }}>{fmtDay(hist[0][0], { day: "2-digit", month: "2-digit" })}: {String(hist[0][1]).replace(".", ",")} kg → hoje: {String(hist.at(-1)[1]).replace(".", ",")} kg{(() => { const eh = settings?.supplies?._exHist?.[x.n]; const l = eh && Object.entries(eh).sort(([a], [b]) => (a < b ? -1 : 1)).at(-1); return l ? ` · última sessão: ${l[1].map((y) => `${y.r}×${String(y.kg).replace(".", ",")}`).join(", ")}` : ""; })()}</div>
      </div>}
      <div className="tag" style={{ fontSize: 12, margin: "10px 0" }}>Carga: comece leve, sobrando 2 repetições. Fez todas com folga? Na próxima, +1–2 kg.</div>
      <a className="btn" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(x.n.replace(/\(.*?\)/g, "") + " execução correta")}`} target="_blank" rel="noreferrer"><Icon n="ext" s={16} /> Ver vídeo de como fazer</a>
    </div>
  );
}

function ExLibrary({ settings, saveSettings }) {
  const [q, setQ] = useState(""), [mode, setMode] = useState("todos"), [flt, setFlt] = useState(null), [open, setOpen] = useState(null), [sub, setSub] = useState(null);
  const favs = settings.supplies?._fav || [];
  const toggleFav = (n) => { buzz(); saveSettings({ supplies: { ...settings.supplies, _fav: favs.includes(n) ? favs.filter((x) => x !== n) : [...favs, n] } }); };
  const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let list = LIBRARY;
  if (mode === "fav") list = list.filter((x) => favs.includes(x.n));
  if (mode === "grupo" && flt) list = list.filter((x) => x.g === flt && (!sub || subOf(x) === sub));
  if (mode === "equip" && flt) list = list.filter((x) => x.eq === flt);
  if (q.trim()) { const k = norm(q); list = list.filter((x) => norm(`${x.n} ${x.g} ${x.eq} ${x.foco || ""} ${x.pm.join(" ")}`).includes(k)); }
  useEffect(() => { if (open) scrollTo(0, 0); }, [open]);
  if (open) { const x = LIBRARY.find((y) => y.n === open); return <ExDetail x={x} onClose={() => setOpen(null)} fav={favs.includes(x.n)} toggleFav={() => toggleFav(x.n)} settings={settings} />; }
  return (
    <>
      <input className="exsearch" placeholder="Buscar exercício ou músculo (ex.: peito, tríceps)" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg">
        {[["todos", "Todos"], ["fav", "★ Favoritos"], ["grupo", "Grupos musculares"], ["equip", "Equipamento"]].map(([k, l]) => <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setFlt(null); }}>{l}</button>)}
      </div>
      {(mode === "grupo" || mode === "equip") && <div className="seg">{(mode === "grupo" ? GROUPS_EX : EQUIP).map((g) => <button key={g} className={flt === g ? "on" : ""} onClick={() => { setFlt(flt === g ? null : g); setSub(null); }}>{g}</button>)}</div>}
      {mode === "grupo" && flt && SUBS[flt] && <>
        <div className="lbl" style={{ margin: "4px 0" }}>Qual parte?</div>
        <div className="subs">{SUBS[flt].map((p) => (
          <button key={p} className={"subchip" + (sub === p ? " on" : "")} onClick={() => { buzz(); setSub(sub === p ? null : p); }}>
            <MiniPart g={flt} p={p} /><span>{p}</span>
          </button>))}</div>
      </>}
      <div className="tag" style={{ margin: "4px 0 8px" }}>{list.length} exercícios{mode === "fav" && !list.length ? " · toque na ☆ de um exercício para favoritar" : ""}</div>
      <div className="exgrid">
        {list.map((x) => (
          <button key={x.n} className="excard" onClick={() => { buzz(); setOpen(x.n); }}>
            <span className="eximg"><img src={`/ex/${x.img}.jpg`} alt="" loading="lazy" />
              <span className={"exstar" + (favs.includes(x.n) ? " on" : "")} onClick={(e) => { e.stopPropagation(); toggleFav(x.n); }}>{favs.includes(x.n) ? "★" : "☆"}</span></span>
            <b>{x.n}</b><span className="tag">{x.g}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function bodyData(week, day) {
  const last = (key, f) => { const ds = Object.keys(week).filter((d) => +week[d]?.checks?.[key]?.[f] > 0).sort(); return ds.length ? { v: +week[ds.at(-1)].checks[key][f], first: +week[ds[0]].checks[key][f], n: ds.length, d0: ds[0], d1: ds.at(-1) } : null; };
  const fat = last("_bio", "gordura"), lean = last("_bio", "magra"), skin = last("_skin", "pct");
  const lag = {};
  [["braco", 1.5], ["peito", 2], ["ombro", 2]].forEach(([k, g]) => {
    const m = last("_med", k); if (!m || m.n < 2) return;
    const frac = Math.min(1, (dnum(m.d1) - dnum(m.d0)) / Math.max(1, dnum(VIRADA.end) - dnum(m.d0)));
    lag[k] = m.v - m.first < g * frac - 0.2;
  });
  return { fat: fat?.v ?? skin?.v ?? null, lean: lean?.v ?? null, lag };
}

function ExPicker({ onPick, onClose }) {
  const [q, setQ] = useState(""), [g, setG] = useState(null);
  const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let list = LIBRARY;
  if (g) list = list.filter((x) => x.g === g);
  if (q.trim()) list = list.filter((x) => norm(`${x.n} ${x.g} ${x.pm.join(" ")}`).includes(norm(q)));
  return (
    <div className="sheet-bg" onClick={onClose}><div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "85vh", overflow: "auto" }}>
      <div className="grab" />
      <div className="mh"><h2>Adicionar exercício</h2><button className="sm" onClick={onClose}>Fechar</button></div>
      <input className="exsearch" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg">{GROUPS_EX.map((x) => <button key={x} className={g === x ? "on" : ""} onClick={() => setG(g === x ? null : x)}>{x}</button>)}</div>
      {list.map((x) => (
        <button key={x.n} className="pick-row" onClick={() => { buzz(); onPick(x); }}>
          <img src={`/ex/${x.img}.jpg`} alt="" loading="lazy" /><span><b>{x.n}</b><span className="tag">{x.g} · {x.eq}</span></span><span className="pick-add">+</span>
        </button>
      ))}
    </div></div>
  );
}

function WorkoutEditor({ settings, saveSettings, week, onClose }) {
  const ws = myWorkouts(settings);
  const [open, setOpen] = useState(0), [pick, setPick] = useState(null), [showSug, setShowSug] = useState(false), [conf, setConf] = useState(null);
  const day = spNow().day, data = bodyData(week, day);
  const save = (list) => { buzz(); saveSettings({ supplies: { ...settings.supplies, _workouts: list.map(({ id, ...w }) => w) }, times: { ...(settings.times || {}), divs: list.length, next: Math.min(+(settings.times?.next || 0), Math.max(0, list.length - 1)) } }); };
  const upd = (wi, fn) => save(ws.map((w, i) => (i === wi ? fn({ ...w, ex: [...w.ex] }) : w)));
  const hist = settings.supplies?._loadHist || {};
  const sug = suggestPlan(data), why = suggestWhy(data);
  const ask = (k, fn) => { if (conf === k) { setConf(null); fn(); } else { setConf(k); setTimeout(() => setConf(null), 4000); } };
  return (
    <>
      <div className="mh"><button className="sm" onClick={onClose}>← Voltar</button><h2 style={{ margin: 0 }}>Meus treinos</h2><span /></div>
      <section className="card now">
        <div className="lbl now-lbl">✨ Sugestão do Claude</div>
        <div className="tag">Montada com seus dados: {data.fat != null ? `gordura ${String(data.fat).replace(".", ",")}%` : "sem % de gordura"}{data.lean ? ` · massa magra ${String(data.lean).replace(".", ",")} kg` : ""}{Object.keys(data.lag).length ? ` · medidas: ${Object.entries(data.lag).map(([k, v]) => `${{ braco: "braço", peito: "peito", ombro: "ombros" }[k]} ${v ? "atrás" : "no ritmo"}`).join(", ")}` : " · medidas: registre 2 segundas para eu ajustar"}.</div>
        <ul className="sugg" style={{ fontSize: 13 }}>{why.map((t) => <li key={t}>{t}</li>)}</ul>
        <button className="sm" onClick={() => setShowSug(!showSug)}>{showSug ? "Esconder" : "Ver os 5 treinos sugeridos"}</button>
        {showSug && sug.map((w, i) => <div key={i} className="tag" style={{ margin: "6px 0" }}><b>{"ABCDE"[i]} · {w.name}:</b> {w.ex.map((e) => `${e.n.split(" (")[0]} ${e.s}×${e.r}`).join(" · ")}</div>)}
        <button className={conf === "sug" ? "ok big" : "pri"} onClick={() => ask("sug", () => { save(sug); setOpen(0); })}>{conf === "sug" ? "Toque de novo: troca seus treinos atuais" : "Usar a sugestão"}</button>
      </section>

      {ws.map((w, wi) => (
        <div key={wi} className="card">
          <button className="tl-head" onClick={() => setOpen(open === wi ? null : wi)}>
            <span className="gx-n num">{w.id}</span><span className="tl-name">{w.name}<div className="tag">{w.ex.length} exercícios</div></span><span className="tag">{open === wi ? "▲" : "▼"}</span>
          </button>
          {open === wi && <>
            <input className="exsearch" value={w.name} onChange={(e) => upd(wi, (x) => ({ ...x, name: e.target.value }))} aria-label="Nome do treino" />
            {w.ex.map((e, ei) => {
              const nl = nextLoad(hist[e.n], settings.supplies?._exHist?.[e.n], parseInt(String(e.r)));
              return (
                <div key={ei} className="ed-row">
                  <img src={`/ex/${e.img}.jpg`} alt="" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 14 }}>{e.fin && <span className="supl">FINAL</span>}{e.n}</b>
                    <div className="ed-nums">
                      <label>séries<input inputMode="numeric" value={e.s} onChange={(v) => upd(wi, (x) => { x.ex[ei] = { ...e, s: +v.target.value || 1 }; return x; })} /></label>
                      <label>reps<input value={e.r} onChange={(v) => upd(wi, (x) => { x.ex[ei] = { ...e, r: v.target.value }; return x; })} /></label>
                      <label>desc. s<input inputMode="numeric" value={e.rest} onChange={(v) => upd(wi, (x) => { x.ex[ei] = { ...e, rest: +v.target.value || 0 }; return x; })} /></label>
                    </div>
                    {nl != null && <div className="tag" style={{ fontSize: 12 }}>Carga sugerida: <b>{String(nl).replace(".", ",")} kg</b></div>}
                  </div>
                  <div className="ed-btns">
                    <button disabled={ei === 0} onClick={() => upd(wi, (x) => { [x.ex[ei - 1], x.ex[ei]] = [x.ex[ei], x.ex[ei - 1]]; return x; })}>↑</button>
                    <button disabled={ei === w.ex.length - 1} onClick={() => upd(wi, (x) => { [x.ex[ei + 1], x.ex[ei]] = [x.ex[ei], x.ex[ei + 1]]; return x; })}>↓</button>
                    <button onClick={() => upd(wi, (x) => { x.ex.splice(ei, 1); return x; })}>✕</button>
                  </div>
                </div>
              );
            })}
            <button className="pri" onClick={() => setPick(wi)}>+ Adicionar exercício</button>
            {ws.length > 1 && <button className="link" onClick={() => ask("del" + wi, () => { save(ws.filter((_, i) => i !== wi)); setOpen(null); })}>{conf === "del" + wi ? "Toque de novo para excluir o treino" : "Excluir este treino"}</button>}
          </>}
        </div>
      ))}
      {ws.length < 7 && <button className="more-btn" onClick={() => { save([...ws, { name: "Novo treino", ex: [] }]); setOpen(ws.length); }}>+ Novo treino</button>}
      {settings.supplies?._workouts?.length > 0 && <button className="link" onClick={() => ask("reset", () => saveSettings({ supplies: { ...settings.supplies, _workouts: null }, times: { ...(settings.times || {}), divs: 5 } }))}>{conf === "reset" ? "Toque de novo para voltar ao treino original" : "Voltar ao treino original"}</button>}
      <div className="tag" style={{ fontSize: 12, marginTop: 8 }}>Tudo é salvo na hora. A ordem dos treinos (A, B, C...) segue a lista.</div>
      {pick != null && <ExPicker onClose={() => setPick(null)} onPick={(x) => { upd(pick, (w) => { const fin = w.ex.findIndex((e) => e.fin); const it = fromLib(x); if (fin >= 0 && !it.fin) w.ex.splice(fin, 0, it); else w.ex.push(it); return w; }); setPick(null); }} />}
    </>
  );
}

function MiniPart({ g, p }) {
  const R = "#e53935", B = "#e8e9ee", S = "#b9bcc6";
  const back = g === "Costas" || (g === "Ombros" && p === "posterior") || g === "Tríceps";
  const on = {
      Peito: { superior: ["pecTop"], "médio": ["pecMid"], inferior: ["pecLow"], interno: ["pecIn"] },
      Ombros: { frontal: ["delt"], lateral: ["deltSide"], posterior: ["delt"] },
      Costas: { largura: ["lat"], meio: ["mid"], "trapézio": ["trap"], lombar: ["low"] },
      "Bíceps": { "bíceps": ["arm"], braquial: ["armOut", "fore"] },
      "Tríceps": { "cabeça longa": ["armIn"], "cabeça lateral": ["armOut"] },
      "Abdômen": { superior: ["absTop"], inferior: ["absLow"], "oblíquos": ["obl"] },
  }[g]?.[p] || [];
  const f = (k) => (on.includes(k) ? R : B);
  return (
    <svg viewBox="0 0 60 56" className="minipart">
      <defs>
        <clipPath id="ct"><rect x="0" y="12" width="60" height="7" /></clipPath>
        <clipPath id="cm"><rect x="0" y="18" width="60" height="6" /></clipPath>
        <clipPath id="cl"><rect x="0" y="23" width="60" height="8" /></clipPath>
        <clipPath id="ci"><rect x="25" y="10" width="10" height="22" /></clipPath>
      </defs>
      <circle cx="30" cy="5" r="5" fill="#d9dbe2" />
      {/* braços */}
      <rect x="3" y="14" width="7" height="22" rx="3.5" fill={f("arm")} stroke={S} strokeWidth=".6" />
      <rect x="50" y="14" width="7" height="22" rx="3.5" fill={f("arm")} stroke={S} strokeWidth=".6" />
      {f("armOut") === R && <><rect x="3" y="16" width="3.5" height="18" rx="1.7" fill={R} /><rect x="53.5" y="16" width="3.5" height="18" rx="1.7" fill={R} /></>}
      {f("armIn") === R && <><rect x="6.5" y="16" width="3.5" height="19" rx="1.7" fill={R} /><rect x="50" y="16" width="3.5" height="19" rx="1.7" fill={R} /></>}
      <rect x="2" y="37" width="7" height="16" rx="3.5" fill={f("fore")} stroke={S} strokeWidth=".6" />
      <rect x="51" y="37" width="7" height="16" rx="3.5" fill={f("fore")} stroke={S} strokeWidth=".6" />
      {/* ombros */}
      <ellipse cx="11" cy="14" rx="6" ry="6" fill={f("delt")} stroke={S} strokeWidth=".6" />
      <ellipse cx="49" cy="14" rx="6" ry="6" fill={f("delt")} stroke={S} strokeWidth=".6" />
      {f("deltSide") === R && <><ellipse cx="7.5" cy="14" rx="3" ry="5.5" fill={R} /><ellipse cx="52.5" cy="14" rx="3" ry="5.5" fill={R} /></>}
      {/* tronco */}
      <rect x="16" y="10" width="28" height="44" rx="7" fill={B} stroke={S} strokeWidth=".6" />
      {!back ? <>
        <path d="M30 12 C24 11 18 12 17 16 C16 24 20 30 26 31 C28 31 30 29 30 27 Z M30 12 C36 11 42 12 43 16 C44 24 40 30 34 31 C32 31 30 29 30 27 Z" fill={B} stroke={S} strokeWidth=".6" />
        {["pecTop", "pecMid", "pecLow", "pecIn"].map((k, i) => f(k) === R && <path key={k} clipPath={`url(#${["ct", "cm", "cl", "ci"][i]})`} d="M30 12 C24 11 18 12 17 16 C16 24 20 30 26 31 C28 31 30 29 30 27 Z M30 12 C36 11 42 12 43 16 C44 24 40 30 34 31 C32 31 30 29 30 27 Z" fill={R} />)}
        <rect x="25" y="33" width="10" height="9" rx="2" fill={f("absTop")} stroke={S} strokeWidth=".6" />
        <rect x="25" y="42" width="10" height="10" rx="2" fill={f("absLow")} stroke={S} strokeWidth=".6" />
        <ellipse cx="20" cy="42" rx="3" ry="8" fill={f("obl")} stroke={S} strokeWidth=".6" /><ellipse cx="40" cy="42" rx="3" ry="8" fill={f("obl")} stroke={S} strokeWidth=".6" />
      </> : <>
        <path d="M30 9 L38 15 L34 30 L30 32 L26 30 L22 15 Z" fill={f("trap")} stroke={S} strokeWidth=".6" />
        <path d="M22 18 C17 22 17 34 21 42 L27 40 L26 22 Z M38 18 C43 22 43 34 39 42 L33 40 L34 22 Z" fill={f("lat")} stroke={S} strokeWidth=".6" />
        <ellipse cx="30" cy="34" rx="4" ry="6" fill={f("mid")} stroke={S} strokeWidth=".6" />
        <ellipse cx="30" cy="48" rx="7" ry="4" fill={f("low")} stroke={S} strokeWidth=".6" />
      </>}
    </svg>
  );
}

export { ExAnim, ExDetail, ExLibrary, MiniPart, ExPicker, WorkoutEditor, bodyData };
