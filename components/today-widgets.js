"use client";
import { useData } from "@/lib/data-context";
import { useState } from "react";
import { addDays, fmtDay } from "@/lib/supabase";
import { buzz, DAY_TIPS, FAT_TIPS, VIRADA } from "@/components/shared";

function WeightOverview({ uid, day, week }) {
  const { weights: w } = useData();
  if (!w || w.length < 1) return null;
  
  const byDay = {}; w.forEach((x) => { byDay[x.day] = +x.kg; });
  const pts = Object.entries(byDay).sort(([a], [b]) => (a < b ? -1 : 1));
  const avg = (from, to) => { const v = pts.filter(([d]) => d > from && d <= to).map(([, k]) => k); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const a7 = avg(addDays(day, -7), day), p7 = avg(addDays(day, -14), addDays(day, -7));
  const last = pts[pts.length - 1], first = pts[0];
  const tot = last[1] - first[1];
  const wk = a7 != null && p7 != null ? a7 - p7 : null;
  const f = (x, d = 1) => (x > 0 ? "+" : "") + x.toFixed(d).replace(".", ",");
  const bd = Object.keys(week || {}).filter((d) => week[d]?.checks?._bio?.gordura).sort();
  const fat = bd.length ? (() => { const g = (d) => +week[d].checks._bio.gordura, cur = g(bd.at(-1)), prev = bd.length > 1 ? g(bd.at(-2)) : null;
    return { cur, prev, d: prev != null ? cur - prev : 0, day: bd.at(-1), first: bd[0], tot: bd.length > 1 ? cur - g(bd[0]) : null }; })() : null;
  const st = wk == null ? ["", "Pese mais vezes para ver a tendência"] : wk <= -0.2 ? ["ok", "Perdendo peso no ritmo"] : wk < 0.2 ? ["warn", "Estável nesta semana"] : ["bad", "Subindo: revise a dieta"];
  return (
    <section className="card">
      <div className="mh"><h3>Peso e gordura</h3><span className={"tag " + st[0]}>{st[1]}</span></div>
      <div className="pre-grid">
        <div><div className="lbl">Atual</div><b className="num">{last[1].toFixed(1).replace(".", ",")} kg</b><span className="tag">{fmtDay(last[0], { day: "2-digit", month: "2-digit" })}</span></div>
        <div><div className="lbl">Média 7 dias</div><b className="num">{a7 != null ? a7.toFixed(1).replace(".", ",") : "–"}</b><span className="tag">{wk != null ? `${f(wk)} kg vs semana ant.` : "sem semana anterior"}</span></div>
        <div><div className="lbl">Total</div><b className="num">{f(tot)} kg</b><span className="tag">desde {fmtDay(first[0], { day: "2-digit", month: "2-digit" })}</span></div>
      </div>
      {fat && <div className="pre-grid" style={{ marginTop: 8 }}>
        <div><div className="lbl">Gordura</div><b className="num">{fat.cur.toFixed(1).replace(".", ",")}%</b><span className="tag">{fmtDay(fat.day, { day: "2-digit", month: "2-digit" })}</span></div>
        <div><div className="lbl">Vs anterior</div><b className={"num " + (fat.d > 0 ? "bad" : "")}>{fat.prev != null ? f(fat.d) + " pp" : "–"}</b><span className="tag">pontos de %</span></div>
        <div><div className="lbl">Total</div><b className="num">{fat.tot != null ? f(fat.tot) + " pp" : "–"}</b><span className="tag">desde {fmtDay(fat.first, { day: "2-digit", month: "2-digit" })}</span></div>
      </div>}
      {fat && fat.d > 0.3 ? <div className="tag warn">A gordura subiu {f(fat.d)} pp. Calma: bioimpedância oscila com água e sal. {FAT_TIPS[new Date(day + "T12:00:00Z").getUTCDate() % FAT_TIPS.length]}</div>
        : <div className="tag" style={{ fontSize: 12, opacity: .85 }}>{fat && fat.d < 0 ? "Gordura caindo, continue assim. " : ""}Dica: {DAY_TIPS[Math.floor(new Date(day + "T12:00:00Z").getTime() / 864e5) % DAY_TIPS.length]}</div>}
    </section>
  );
}

function ViradaMini({ week, day, settings }) {
  const left = Math.max(0, Math.round((new Date(VIRADA.end + "T12:00:00Z") - new Date(day + "T12:00:00Z")) / 864e5));
  const hist = settings.supplies?._loadHist || {};
  let pr = null;
  Object.entries(hist).forEach(([n, h]) => { const e = Object.entries(h).sort(([a], [b]) => (a < b ? -1 : 1)); let best = 0;
    e.forEach(([d, v]) => { if (v > best) { if (best > 0 && (!pr || d >= pr.d)) pr = { n, v, d, up: v - best }; best = v; } }); });
  const md = Object.keys(week).filter((d) => week[d]?.checks?._med?.braco).sort();
  const br = md.length > 1 ? week[md.at(-1)].checks._med.braco - week[md[0]].checks._med.braco : null;
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  return (
    <section className="card">
      <div className="mh"><h3>Projeto Virada</h3><span className="tag num">{left} dias</span></div>
      <div className="tag" style={{ fontSize: 12 }}>
        {pr ? <>Último recorde: <b>{pr.n}</b> {f1(pr.v)} kg (+{f1(pr.up)}) · </> : "Anote as cargas no treino para registrar recordes · "}
        {br != null ? <>Braço {br >= 0 ? "+" : ""}{f1(br)} cm</> : "Meça braço, peito, ombros e cintura às segundas"} · detalhes em Progresso.
      </div>
    </section>
  );
}

function SleepCard({ checks, saveLog }) {
  const s = checks._sleep || {};
  const set = (o) => { buzz(); saveLog({ checks: { _sleep: { ...s, ...o } } }); };
  return (
    <section className="card">
      <div className="mh"><h3>Sono de ontem</h3><span className="tag">opcional · meta 7 h</span></div>
      <div className="seg">{[5, 5.5, 6, 6.5, 7, 7.5, 8].map((h) => <button key={h} className={s.h === h ? "on" : ""} onClick={() => set({ h })}>{String(h).replace(".5", "h30").replace(/^(\d)$/, "$1h")}</button>)}</div>
      <div className="seg">{[1, 2, 3, 4, 5].map((q) => <button key={q} className={s.q === q ? "on" : ""} onClick={() => set({ q })}>{["😫", "😕", "😐", "🙂", "😴"][q - 1]} {q}</button>)}</div>
      {s.h && s.h < 7 && <div className="tag" style={{ fontSize: 12 }}>Menos de 7 h: hoje evite cafeína depois das 16h e tente deitar 30 min mais cedo.</div>}
    </section>
  );
}

function CardioCard({ checks, saveLog, say }) {
  const c = checks._cardio;
  const [open, setOpen] = useState(!c);
  const [v, setV] = useState({ min: c?.min ?? "", km: c?.km ?? "", kcal: c?.kcal ?? "" });
  const num = (x) => parseFloat(String(x || "").replace(",", "."));
  const f = (x, d = 1) => (+x).toFixed(d).replace(".", ",");
  return (
    <section className={"card" + (c ? " complete" : "")}>
      <div className="mh"><h3>Cardio</h3>{c && !open && <button className="sm" onClick={() => setOpen(true)}>Editar</button>}</div>
      {c && !open ? <div className="pre-grid">
        <div><div className="lbl">Tempo</div><b className="num">{c.min} min</b></div>
        <div><div className="lbl">Distância</div><b className="num">{f(c.km, 2)} km</b><span className="tag">{f(c.km / (c.min / 60))} km/h</span></div>
        <div><div className="lbl">Gasto</div><b className="num">{Math.round(c.kcal || 0)} kcal</b></div>
      </div> : <>
        <div className="tag" style={{ fontSize: 12 }}>Copie do relatório da esteira.</div>
        <div className="ci">
          {[["min", "Tempo (min)"], ["km", "Distância (km)"], ["kcal", "Calorias (kcal)"]].map(([k, l]) => (
            <div key={k} className="ci-row"><span>{l}</span><input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={{ width: 90 }} /></div>
          ))}
        </div>
        <button className="ok big" disabled={!(num(v.min) > 0)} onClick={() => { buzz(40); saveLog({ checks: { _cardio: { min: num(v.min), km: num(v.km) || 0, kcal: num(v.kcal) || 0 } } }); setOpen(false); say("Cardio registrado"); }}>Salvar cardio</button>
      </>}
    </section>
  );
}
export { WeightOverview, ViradaMini, SleepCard, CardioCard };
