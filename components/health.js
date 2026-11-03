"use client";
import { addDays, fmtDay } from "@/lib/supabase";
import { spNowTime, HMET, BIO_ALL } from "@/components/shared";
import { ScalePrint } from "@/components/ai";



function HealthTab({ week, day, uid, saveLog, say }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(day, i - 6));
  const val = (d, k) => week[d]?.checks?._burn?.[k];
  const lastDay = [...days].reverse().find((d) => week[d]?.checks?._burn);
  const has = (k) => days.some((d) => val(d, k) != null);
  const f = (v, u) => v == null ? "—" : (u === "h" || u === "km" ? String(Math.round(v * 10) / 10).replace(".", ",") : Math.round(v).toLocaleString("pt-BR"));
  const bodyDays = Object.keys(week).filter((d) => week[d]?.checks?._bio).sort(), bio = bodyDays.length ? week[bodyDays.at(-1)].checks._bio : null;
  return (
    <>
      <div className="card"><div className="mh"><h2>Saúde</h2><span className="tag">{lastDay ? `último envio: ${fmtDay(lastDay, { day: "2-digit", month: "2-digit" })} ${spNowTime(week[lastDay].checks._burn.at)}` : "sem dados ainda"}</span></div>
        <div className="tag">Dados do app Saúde do iPhone (Apple Watch e balança), enviados pelo atalho <b>Watch</b>.</div></div>
      <div className="card"><div className="mh"><h3>Corpo{bio ? ` · ${fmtDay(bodyDays.at(-1), { day: "2-digit", month: "2-digit" })}` : ""}</h3></div>
        {bio && <div className="biogrid">{BIO_ALL.filter(([k]) => bio[k] != null).map(([k, l, u]) => {
          const prevD = bodyDays.slice(0, -1).reverse().find((d) => week[d].checks._bio[k] != null), pv = prevD ? week[prevD].checks._bio[k] : null, dl = pv != null ? bio[k] - pv : null;
          return <div key={k}><span className="lbl">{l}</span><b className="num">{f(bio[k], "km")}{u}</b>{dl != null && Math.abs(dl) >= 0.05 && <span className="tag">{dl > 0 ? "+" : ""}{String(Math.round(dl * 10) / 10).replace(".", ",")}</span>}</div>; })}</div>}
        <ScalePrint uid={uid} saveLog={saveLog} say={say} />
      </div>
      {HMET.map(([g, ms]) => { const list = ms.filter(([k]) => has(k)); return (
        <div key={g} className="card">
          <h3>{g}</h3>
          {list.length ? list.map(([k, l, u, goal, dir, hint]) => {
            const vs = days.map((d) => val(d, k)), today = vs.at(-1), got = vs.filter((v) => v != null), avg = got.reduce((a, b) => a + b, 0) / got.length, mx = Math.max(...got, goal || 0);
            const good = goal == null ? null : dir === "up" ? (today ?? avg) >= goal : (today ?? avg) <= goal;
            return (
              <div key={k} className="hmet">
                <div className="mh"><span>{l}</span><b className={"num" + (good == null ? "" : good ? " okc" : " warn")}>{f(today ?? got.at(-1), u)} {u}</b></div>
                <div className="hbars">{vs.map((v, i) => <i key={i} title={days[i]} style={{ height: v != null ? `${15 + ((v - Math.min(...got) * 0.8) / Math.max(1e-6, mx - Math.min(...got) * 0.8)) * 85}%` : "3px", opacity: v != null ? 1 : 0.25, background: i === 6 ? "var(--accent)" : undefined }} />)}</div>
                <div className="tag" style={{ fontSize: 12 }}>média 7 dias: {f(avg, u)} {u}{goal ? ` · meta ${f(goal, u)}` : ""}{hint ? ` · ${hint}` : ""}</div>
              </div>);
          }) : <div className="tag">Sem dados. Adicione ao atalho: {ms.map(([, l]) => l).join(", ")}.</div>}
        </div>); })}
      <div className="card">
        <h3>Como mandar mais dados</h3>
        <div className="tag">No atalho <b>Watch</b>, repita "Localizar Amostras de Saúde + Calcular Estatísticas (Soma ou Média)" para cada dado e acrescente no link:</div>
        <pre className="kit">{"&dist=  Distância (km, soma)\n&exerc= Minutos de exercício (soma)\n&andares= Andares (soma)\n&fc=    FC em repouso (média)\n&vfc=   Variabilidade da FC (média)\n&vo2=   VO₂ máx (último)\n&spo2=  Oxigênio no sangue (média)\n&resp=  Freq. respiratória (média)\n&sono=  Sono: horas (veja abaixo)"}</pre>
        <div className="tag" style={{ fontSize: 12 }}>Sono: "Localizar Amostras de Saúde" tipo <b>Análise do Sono</b>, valor <b>Dormindo</b>, últimas 24 h → "Obter Detalhes" <b>Duração</b> → "Calcular Estatísticas" <b>Soma</b> → "Converter Medida" para <b>horas</b>.</div>
      </div>
    </>
  );
}

export { HealthTab };
