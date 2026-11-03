"use client";
import { useData } from "@/lib/data-context";
import { useEffect, useState, useCallback } from "react";
import { myWorkouts } from "@/lib/builder";
import { PHOTO_TYPES, listDaily } from "@/lib/photos";
import { supabase, spNow, addDays, fmtDay } from "@/lib/supabase";
import { MEALS, WATER_GOAL, START_WEIGHT, weekday, itemDone, dayScore } from "@/lib/plan";
import { score, buzz, CI_FIELDS, CheckinForm, MEAS, MeasureForm, GOAL, DAY_TIPS, FAT_TIPS, VIRADA, SKIN_P, ageOn, BODY, dnum, KCAL_GOAL } from "@/components/shared";
import { WeightChart, WeekBars } from "@/components/charts";



function Progress({ uid, week, day, settings, saveLog }) {
  const { weights, saveWeight } = useData(); const [kg, setKg] = useState("");
  const [photos, setPhotos] = useState([]); const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(""); const [copied, setCopied] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: p } = await supabase.from("photos").select("*").eq("user_id", uid).order("day", { ascending: false }).limit(12);
    if (p?.length) {
      const { data: urls } = await supabase.storage.from("fotos").createSignedUrls(p.map((x) => x.path), 3600);
      setPhotos(p.map((x, i) => ({ ...x, url: urls?.[i]?.signedUrl })));
    } else setPhotos([]);
  }, [uid]);
  useEffect(() => { loadAll(); }, [loadAll]);

  async function addWeight() {
    const v = parseFloat(kg.replace(",", ".")); if (!v) return;
    try { await saveWeight(day, v); setKg(""); } catch (e) { alert(e.message); }
  }
  async function upload(e) {
    setBusy(true);
    try {
      for (const f of e.target.files) {
        const path = `${uid}/${day}-${crypto.randomUUID()}-${f.name.replace(/[^\w.]/g, "")}`;
        const { error } = await supabase.storage.from("fotos").upload(path, f);
        if (error) throw error;
        const { error: recordError } = await supabase.from("photos").insert({ user_id: uid, day, path });
        if (recordError) throw recordError;
      }
      e.target.value = ""; await loadAll();
    } catch { alert("Não consegui salvar todas as fotos. Confira a conexão e tente novamente."); }
    finally { setBusy(false); }
  }

  const firstDay = Object.keys(week).sort()[0] || day;
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(day, i - 13)).filter((d) => d >= firstDay);
  const adh = Math.round(days14.reduce((a, d) => a + score(week[d]), 0) / Math.max(1, days14.length));
  const waterAvg = Math.round(days14.reduce((a, d) => a + (week[d]?.water_ml || 0), 0) / Math.max(1, days14.length));
  const free = days14.filter((d) => week[d]?.free_meal).length;
  const trained = days14.filter((d) => week[d]?.workout_at).length;
  let streak = 0; for (let i = 0; i < 120; i++) { if (score(week[addDays(day, -i)]) >= 95) streak++; else if (i > 0) break; }
  const last = weights.at(-1);
  const ciDays = Object.keys(week).filter((d) => week[d]?.checks?._ci).sort();
  const lastCi = ciDays.length ? week[ciDays.at(-1)].checks._ci : null;
  const [ciOpen, setCiOpen] = useState(false);
  const medDays = Object.keys(week).filter((d) => week[d]?.checks?._med).sort();
  const lastMed = medDays.length ? week[medDays.at(-1)].checks._med : null;
  const bioDays = Object.keys(week).filter((d) => week[d]?.checks?._bio).sort();
  const lastBio = bioDays.length ? week[bioDays.at(-1)].checks._bio : null;
  const days120 = Array.from({ length: 120 }, (_, i) => addDays(day, i - 119));
  const bestRun = (ok) => { let b = 0, c = 0; days120.forEach((d) => { c = ok(d) ? c + 1 : 0; b = Math.max(b, c); }); return b; };
  const bestDiet = bestRun((d) => score(week[d]) >= 95), bestWater = bestRun((d) => (week[d]?.water_ml || 0) >= WATER_GOAL);
  const totalTrain = days120.filter((d) => week[d]?.workout_at).length, totalCi = days120.filter((d) => week[d]?.checks?._ci).length;
  const BADGES = [
    ["3 dias", "dieta 95%+ seguidos", bestDiet >= 3], ["7 dias", "dieta 95%+ seguidos", bestDiet >= 7], ["30 dias", "dieta 95%+ seguidos", bestDiet >= 30],
    ["100 dias", "dieta 95%+ seguidos", bestDiet >= 100], ["Hidratado", "7 dias com 2,6 L", bestWater >= 7], ["Camelo", "30 dias com 2,6 L", bestWater >= 30],
    ["20 treinos", "registrados", totalTrain >= 20], ["50 treinos", "registrados", totalTrain >= 50], ["Disciplina", "4 check-ins", totalCi >= 4],
  ];
  const days30 = Array.from({ length: 28 }, (_, i) => addDays(day, i - 27));
  const pad = (weekday(days30[0]) + 6) % 7;

  const kit = `Atualização — ${fmtDay(day, { day: "2-digit", month: "2-digit", year: "numeric" })}
Peso em jejum: ${last ? String(last.kg).replace(".", ",") + " kg" : "—"} (inicial 72,4 kg${last ? `, ${(last.kg - START_WEIGHT >= 0 ? "+" : "")}${(last.kg - START_WEIGHT).toFixed(1).replace(".", ",")} kg` : ""})
Adesão à dieta (${days14.length} dias): ${adh}%
Água média: ${(waterAvg / 1000).toFixed(1).replace(".", ",")} L/dia (meta 2,6 L)
Treinos (${days14.length} dias): ${trained}${lastCi ? `
${lastBio?.gordura ? `Bioimpedância: gordura ${String(lastBio.gordura).replace(".", ",")}%${lastBio.magra ? ` · massa magra ${String(lastBio.magra).replace(".", ",")} kg` : ""}
` : ""}Medidas: ${lastMed ? MEAS.map(([k, l]) => lastMed[k] ? `${l.split(" ")[0].toLowerCase()} ${String(lastMed[k]).replace(".", ",")}` : null).filter(Boolean).join(" · ") + " cm" : "—"}
Check-in (1-5): fome ${lastCi.fome} · energia ${lastCi.energia} · sono ${lastCi.sono} · intestino ${lastCi.intestino} · treinos ${lastCi.treino}` : ""}
Refeições livres: ${free} em ${days14.length} dias
Feedback: ${feedback || "—"}`;

  return (
    <>
      <MeuCorpo weights={weights} week={week} day={day} settings={settings} />
      <ProjetoVirada week={week} day={day} settings={settings} />
      <Expenditure weights={weights} week={week} day={day} />
      <CardioHist week={week} day={day} />
      <WeighReport weights={weights} week={week} day={day} settings={settings} />

      <div className="card">
        <h2>Resumo 14 dias</h2>
        <div className="stats">
          {[["Adesão", adh + "%"], ["Água/dia", (waterAvg / 1000).toFixed(1).replace(".", ",") + " L"], ["Treinos", trained], ["Sequência", streak + " d"]].map(([l, v]) =>
            <div key={l}><div className="lbl">{l}</div><div className="num stat">{v}</div></div>)}
        </div>
      </div>

      <div className="card">
        <div className="mh"><h2>Conquistas</h2><span className="tag num">{BADGES.filter((b) => b[2]).length}/{BADGES.length}</span></div>
        <div className="badges">{BADGES.map(([t, d, on]) => <div key={t} className={"bdg" + (on ? " on" : "")}><b>{t}</b><span>{d}</span></div>)}</div>
      </div>

      <Evolution uid={uid} day={day} />

      <div className="card">
        <div className="mh"><h2>Últimas 4 semanas</h2><span className="tag">adesão por dia</span></div>
        <div className="cal">
          {["S", "T", "Q", "Q", "S", "S", "D"].map((l, i) => <span key={i} className="lbl">{l}</span>)}
          {Array.from({ length: pad }, (_, i) => <span key={"p" + i} />)}
          {days30.map((d) => { const sc = score(week[d]); return <span key={d} title={`${d}: ${sc}%`} className={"cal-d" + (sc >= 95 ? " full" : sc >= 60 ? " mid" : sc > 0 ? " low" : "") + (d === day ? " today" : "")}>{+d.slice(8)}</span>; })}
        </div>
        <div className="tag">Verde: 95%+ · azul: 60%+ · cinza claro: abaixo · vazio: sem registro</div>
      </div>

      <div className="card">
        <div className="mh"><h2>Check-in semanal</h2>{!ciOpen && <button className="sm" onClick={() => setCiOpen(true)}>Fazer agora</button>}</div>
        {lastCi ? <div className="tag">Último ({fmtDay(ciDays.at(-1), { day: "2-digit", month: "2-digit" })}): {CI_FIELDS.map(([k, l]) => `${l} ${lastCi[k]}`).join(" · ")}</div> : <div className="tag">Nenhum check-in ainda. Ele entra no resumo para compartilhar.</div>}
        {ciOpen && <CheckinForm initial={week[day]?.checks?._ci} onSave={(ci) => { saveLog({ checks: { _ci: ci } }); setCiOpen(false); }} />}
      </div>

      <BodyComp week={week} />

      <Measures week={week} day={day} onSave={(med) => saveLog({ checks: { _med: med } })} />
      <Skinfolds week={week} day={day} onSave={(sk) => saveLog({ checks: { _skin: sk } })} />

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
        <h2>Resumo para compartilhar</h2>
        <div className="tag">Escreva o feedback, copie e mande no WhatsApp junto com as fotos.</div>
        <textarea id="fb" rows="3" placeholder="Como está se sentindo, dificuldades, progresso…" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <pre className="kit">{kit}</pre>
        <button className="pri" onClick={async () => { try { await navigator.clipboard.writeText(kit); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} }}>{copied ? "Copiado" : "Copiar resumo"}</button>
      </div>
    </>
  );
}

function Evolution({ uid, day }) {
  const [type, setType] = useState("corpo");
  const [month, setMonth] = useState(day.slice(0, 7));
  const [list, setList] = useState([]); const [mode, setMode] = useState("carrossel");
  const [idx, setIdx] = useState(0); const [playing, setPlaying] = useState(false);
  const [msg, setMsg] = useState("");
  const from = `${month}-01`, to = addDays(addDays(`${month}-28`, 4).slice(0, 7) + "-01", -1);
  useEffect(() => { listDaily(uid, type, from, to).then((l) => { setList(l); setIdx(0); setMsg(""); }).catch(() => setMsg("Não consegui carregar as fotos. Confira a conexão.")); }, [uid, type, from, to]);
  useEffect(() => {
    if (!playing || list.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), 350);
    return () => clearInterval(t);
  }, [playing, list.length]);
  const shift = (n) => { const d = new Date(from + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); const m = d.toISOString().slice(0, 7); if (m <= day.slice(0, 7)) setMonth(m); };
  const lbl = (d) => fmtDay(d, { day: "2-digit", month: "2-digit" });

  async function share() {
    setMsg("Preparando…");
    const n = Math.min(10, list.length);
    const pick = Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / Math.max(1, n - 1))]);
    try {
      const files = await Promise.all(pick.map(async (p, i) => new File([await (await fetch(p.url)).blob()], `evolucao-${type}-${String(i + 1).padStart(2, "0")}-${p.day}.jpg`, { type: "image/jpeg" })));
      if (navigator.canShare?.({ files })) { await navigator.share({ files, title: `Evolução ${month}` }); setMsg(""); }
      else setMsg("Seu navegador não permite compartilhar arquivos. Abra pelo app na tela de início do iPhone.");
    } catch { setMsg(""); }
  }

  return (
    <div className="card">
      <div className="mh"><h2>Evolução</h2>
        <div className="seg">{PHOTO_TYPES.map(([t, l]) => <button key={t} className={type === t ? "on" : ""} onClick={() => setType(t)}>{l.split(" ")[0]}</button>)}</div></div>
      <div className="mh">
        <button className="sm" onClick={() => shift(-1)} aria-label="Mês anterior">‹</button>
        <b>{new Date(from + "T12:00:00Z").toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })}</b>
        <button className="sm" onClick={() => shift(1)} aria-label="Próximo mês" disabled={month >= day.slice(0, 7)}>›</button>
      </div>
      {list.length === 0 ? <div className="tag">Nenhuma foto neste mês. Tire a primeira em Hoje → Fotos do dia.</div> : <>
        <div className="seg wide">
          {[["carrossel", "Carrossel"], ["timelapse", "Timelapse"], ["comparar", "1º × último"]].map(([k, l]) =>
            <button key={k} className={mode === k ? "on" : ""} onClick={() => { setMode(k); setPlaying(k === "timelapse"); }}>{l}</button>)}
        </div>
        {mode === "carrossel" && <div className="carousel">{list.map((p) => <figure key={p.id}><img src={p.url} alt={"Foto " + p.day} loading="lazy" /><figcaption>{lbl(p.day)}</figcaption></figure>)}</div>}
        {mode === "timelapse" && <figure className="tl-frame" onClick={() => setPlaying(!playing)}>
          <img src={list[idx]?.url} alt={"Foto " + list[idx]?.day} /><figcaption>{lbl(list[idx]?.day)} · {idx + 1}/{list.length} · {playing ? "toque para pausar" : "toque para tocar"}</figcaption></figure>}
        {mode === "comparar" && <div className="compare">
          {[list[0], list.at(-1)].map((p, i) => <figure key={i}><img src={p.url} alt={"Foto " + p.day} /><figcaption>{i ? "Último" : "Primeiro"} · {lbl(p.day)}</figcaption></figure>)}</div>}
        <button className="pri" onClick={share}>Compartilhar fotos do mês ({Math.min(10, list.length)})</button>
        <div className="tag">{msg || "Envia até 10 fotos espaçadas pelo mês, em ordem, prontas para um carrossel no Instagram ou para salvar no rolo da câmera."}</div>
      </>}
    </div>
  );
}

function Measures({ week, day, onSave }) {
  const [open, setOpen] = useState(false);
  const days = Object.keys(week).filter((d) => week[d]?.checks?._med).sort();
  const first = days.length ? week[days[0]].checks._med : null, last = days.length ? week[days.at(-1)].checks._med : null;
  return (
    <div className="card">
      <div className="mh"><h2>Medidas</h2>{!open && <button className="sm" onClick={() => setOpen(true)}>Registrar hoje</button>}</div>
      {last ? <table><tbody>{MEAS.filter(([k]) => last[k]).map(([k, l]) => {
        const dlt = first?.[k] ? last[k] - first[k] : 0;
        return <tr key={k}><td>{l}</td><td className="q">{String(last[k]).replace(".", ",")} cm</td><td className={"tag num" + ((["peito", "ombro", "braco"].includes(k) ? dlt > 0 : dlt < 0) ? " okc" : "")}>{days.length > 1 && first?.[k] ? `${dlt > 0 ? "+" : ""}${dlt.toFixed(1).replace(".", ",")}` : ""}</td></tr>;
      })}</tbody></table> : <div className="tag">Nenhuma medida ainda. Registre junto com a pesagem semanal: às vezes a balança não mexe, mas a fita sim.</div>}
      {days.length > 1 && <div className="tag">Variação desde {fmtDay(days[0], { day: "2-digit", month: "2-digit" })}.</div>}
      {open && <MeasureForm initial={week[day]?.checks?._med} onSave={(m) => { onSave(m); setOpen(false); }} />}
    </div>
  );
}

function BodyComp({ week }) {
  const [selRaw, setSel] = useState(null);
  const days = Object.keys(week).filter((d) => week[d]?.checks?._bio).sort();
  if (!days.length) return (
    <div className="card"><h2>Composição corporal</h2>
      <div className="tag">Os dados da balança (peso, % de gordura, massa magra e IMC) aparecem aqui com a evolução semana a semana. Configure o atalho em Plano → Balança.</div></div>
  );
  // agrupa por semana (segunda a domingo) usando a média da semana
  const monday = (d) => addDays(d, -((weekday(d) + 6) % 7));
  const weeks = {};
  days.forEach((d) => { const w = monday(d); (weeks[w] = weeks[w] || []).push(week[d].checks._bio); });
  const wkeys = Object.keys(weeks).sort().slice(-12);
  const avg = (w, k) => { const v = weeks[w].map((b) => b[k]).filter(Boolean); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  const METRICS = [["gordura", "Gordura corporal", "%", "down"], ["magra", "Massa magra", "kg", "up"], ["peso", "Peso", "kg", null], ["imc", "IMC", "", null], ["musculo", "Massa muscular", "kg", "up"], ["visceral", "Gordura visceral", "", "down"]];
  const shown = METRICS.filter(([k]) => wkeys.some((w) => avg(w, k) !== null));
  const sel = selRaw || shown[0]?.[0];
  const cur = METRICS.find(([k]) => k === sel) || shown[0];
  const serie = wkeys.map((w) => ({ day: w, kg: avg(w, cur[0]) })).filter((p) => p.kg !== null);
  const fmt = (v) => String(v).replace(".", ",");
  return (
    <div className="card">
      <div className="mh"><h2>Composição corporal</h2><span className="tag">média por semana</span></div>
      <div className="bio-tiles">
        {shown.map(([k, l, u, dir]) => {
          const s2 = wkeys.map((w) => avg(w, k)).filter((v) => v !== null);
          const last = s2.at(-1), prev = s2.at(-2), d = prev != null ? Math.round((last - prev) * 10) / 10 : null;
          const good = d == null || d === 0 || !dir ? "" : (dir === "down" ? d < 0 : d > 0) ? " okc" : " warn";
          return (
            <button key={k} className={"bio-tile" + (sel === k ? " on" : "")} onClick={() => setSel(k)}>
              <span className="lbl">{l}</span>
              <b className="num">{fmt(last)}{u && <small> {u}</small>}</b>
              <span className={"tag num" + good}>{d == null ? "1ª semana" : `${d > 0 ? "+" : ""}${fmt(d)} na semana`}</span>
            </button>
          );
        })}
      </div>
      {serie.length > 1
        ? <><div className="lbl">{cur[1]} · semana a semana</div><WeekBars data={serie} unit={cur[2]} dir={cur[3]} /></>
        : <div className="tag">O gráfico semanal aparece a partir da 2ª semana de pesagens.</div>}
      {serie.length > 1 && (() => { const t = Math.round((serie.at(-1).kg - serie[0].kg) * 10) / 10; return <div className="tag">Desde a semana de {fmtDay(serie[0].day, { day: "2-digit", month: "2-digit" })}: <b className={cur[3] && t !== 0 ? ((cur[3] === "down" ? t < 0 : t > 0) ? "okc" : "warn") : ""}>{t > 0 ? "+" : ""}{fmt(t)}{cur[2] ? ` ${cur[2]}` : ""}</b>. Pese sempre em jejum, no mesmo horário: bioimpedância varia com água.</div>; })()}
    </div>
  );
}

function WeighReport({ weights, week, day, settings }) {
  if (!weights.length) return null;
  const f1 = (v) => (v == null ? "—" : String(Math.round(v * 10) / 10).replace(".", ","));
  const sg = (v) => (v > 0 ? "+" : "") + f1(v);
  const bioOn = (d) => week[d]?.checks?._bio || {};
  const medOn = (d) => week[d]?.checks?._med || {};
  const cur = weights.at(-1), prev = weights.length > 1 ? weights.at(-2) : null;
  const firstBioDay = Object.keys(week).filter((d) => week[d]?.checks?._bio?.gordura).sort();
  const lastFat = firstBioDay.length ? week[firstBioDay.at(-1)].checks._bio.gordura : null;
  const prevFat = firstBioDay.length > 1 ? week[firstBioDay.at(-2)].checks._bio.gordura : null;
  const firstFat = firstBioDay.length ? week[firstBioDay[0]].checks._bio.gordura : null;
  const magraDays = Object.keys(week).filter((d) => week[d]?.checks?._bio?.magra).sort();
  const lastMagra = magraDays.length ? week[magraDays.at(-1)].checks._bio.magra : null;
  const prevMagra = magraDays.length > 1 ? week[magraDays.at(-2)].checks._bio.magra : null;
  const waistDays = Object.keys(week).filter((d) => medOn(d).cintura).sort();
  const lastW = waistDays.length ? medOn(waistDays.at(-1)).cintura : null, prevW = waistDays.length > 1 ? medOn(waistDays.at(-2)).cintura : null;

  // período avaliado: desde a pesagem anterior (ou 7 dias)
  const from = prev ? addDays(prev.day, 1) : addDays(cur.day, -6);
  const days = []; for (let d = from; d <= cur.day; d = addDays(d, 1)) days.push(d);
  const n = Math.max(1, days.length);
  const adh = Math.round(days.reduce((a, d) => a + dayScore(week[d]), 0) / n);
  const water = days.reduce((a, d) => a + (week[d]?.water_ml || 0), 0) / n;
  const trains = days.filter((d) => week[d]?.workout_at).length;
  const supTot = days.length * MEALS.reduce((a, m) => a + m.items.filter((x) => x.sup).length, 0);
  const supOk = days.reduce((a, d) => a + MEALS.reduce((b, m) => b + m.items.filter((x, i) => x.sup && week[d]?.checks?.[`${m.id}-${i}`]).length, 0), 0);
  const free = days.filter((d) => week[d]?.checks?._free).length;
  const missed = days.reduce((a, d) => a + Object.keys(week[d]?.checks?._merge || {}).length, 0);
  const caf = Math.max(0, ...days.map((d) => (week[d]?.checks?._caf || []).reduce((x, y) => x + y, 0)));
  const expTrains = Math.round((5 * n) / 7);

  const dW = prev ? cur.kg - prev.kg : null, dTot = cur.kg - START_WEIGHT;
  const dFat = lastFat != null && prevFat != null ? lastFat - prevFat : null;
  const dMag = lastMagra != null && prevMagra != null ? lastMagra - prevMagra : null;

  // leitura
  const ok = [], fix = [];
  if (adh >= 85) ok.push(`Dieta em ${adh}%: ótima adesão.`); else fix.push(`Dieta em ${adh}%: a meta é 85%+. ${missed ? `${missed} refeição(ões) repostas/puladas.` : ""} Use as marmitas e o "Comi tudo" para não perder refeição.`);
  if (water >= 2400) ok.push(`Água média ${f1(water / 1000)} L.`); else fix.push(`Água média ${f1(water / 1000)} L de 2,6 L: use o atalho "Bebi água" e a garrafa sempre por perto.`);
  if (trains >= expTrains) ok.push(`${trains} treino(s) no período.`); else fix.push(`${trains} de ~${expTrains} treinos: priorize não pular, mesmo que seja treino mais curto.`);
  if (supOk / Math.max(1, supTot) >= 0.9) ok.push("Suplementos em dia."); else fix.push(`Suplementos: ${supOk}/${supTot} doses. Use o atalho "Tomei os suplementos".`);
  if (free > Math.ceil(n / 7)) fix.push(`${free} refeições livres no período: o plano permite 1 por semana.`);
  if (caf > 500) fix.push("Cafeína passou de 500 mg em algum dia.");

  const bv = bodyVerdict(weights, week, settings, day);
  let verdict;
  if (bv.k || /Recomposi|gordura|água|músculo/.test(bv.t)) verdict = bv.t;
  else if (dW == null) verdict = "Primeira pesagem do relatório. A partir da próxima, o app compara e orienta.";
  else if (Math.abs(dW) < 0.5) verdict = adh >= 85 ? `Peso estável (${sg(dW)} kg), dentro da oscilação normal de água. ${dFat != null && dFat < 0 ? "Gordura caiu: você está trocando gordura por massa magra." : "Se ficar estável por 2–3 semanas com adesão alta, ajuste o treino (mais carga ou cardio)."}` : `Peso estável (${sg(dW)} kg), mas a adesão foi ${adh}%. Antes de mudar o plano, cumpra o que já está nele.`;
  else if (dW < 0) verdict = `Desceu ${f1(-dW)} kg. ${dFat != null ? (dFat <= 0 ? "Gordura também caiu: é perda de gordura." : "A gordura subiu: pode ser água/medição; compare com a cintura e as fotos.") : "Confira a cintura e as fotos para confirmar que é gordura."} ${adh >= 85 ? "Mantenha o que está fazendo." : "Com a adesão baixa, o resultado tende a não se manter: veja os ajustes abaixo."}`;
  else verdict = adh >= 85 && dMag != null && dMag > 0 ? `Subiu ${f1(dW)} kg com massa magra ${sg(dMag)} kg: parte é ganho muscular. Acompanhe a cintura.` : adh >= 85 ? `Subiu ${f1(dW)} kg com boa adesão. Pode ser água, sal ou intestino. Se repetir na próxima, revise a dieta.` : `Subiu ${f1(dW)} kg e a adesão foi ${adh}%. O ajuste está na rotina: veja os pontos abaixo.`;

  const Row = ({ l, a, b, d, good }) => <tr><td>{l}</td><td className="q">{a}</td><td className="q">{b}</td><td className={"tag num" + (d == null || d === 0 ? "" : (good ? d < 0 : d > 0) ? " okc" : " warn")}>{d == null ? "" : sg(d)}</td></tr>;
  return (
    <div className="card now">
      <div className="mh"><span className="lbl now-lbl">Relatório da pesagem · {fmtDay(cur.day, { day: "2-digit", month: "2-digit" })}</span><span className="tag">{prev ? `vs ${fmtDay(prev.day, { day: "2-digit", month: "2-digit" })}` : "1ª"}</span></div>
      <table><thead><tr><td></td><td className="tag">Antes</td><td className="tag">Agora</td><td className="tag">Δ</td></tr></thead><tbody>
        <Row l="Peso (kg)" a={prev ? f1(prev.kg) : "—"} b={f1(cur.kg)} d={dW} good />
        {lastFat != null && <Row l="Gordura (%)" a={f1(prevFat)} b={f1(lastFat)} d={dFat} good />}
        {lastMagra != null && <Row l="Massa magra (kg)" a={f1(prevMagra)} b={f1(lastMagra)} d={dMag} good={false} />}
        {lastW != null && <Row l="Cintura (cm)" a={f1(prevW)} b={f1(lastW)} d={prevW != null ? lastW - prevW : null} good />}
      </tbody></table>
      <div className="tag">Desde o início: <b className={dTot <= 0 ? "okc" : "warn"}>{sg(dTot)} kg</b>{firstFat != null && lastFat != null && firstBioDay.length > 1 ? <> · gordura <b className={lastFat - firstFat <= 0 ? "okc" : "warn"}>{sg(lastFat - firstFat)}%</b></> : null}</div>
      <div className="verdict">{verdict}</div>
      <div className="lbl">No período ({n} dia{n > 1 ? "s" : ""})</div>
      {ok.length > 0 && <ul className="sugg okl">{ok.map((x) => <li key={x}>{x}</li>)}</ul>}
      {fix.length > 0 && <><div className="lbl warn">O que ajustar</div><ul className="sugg">{fix.map((x) => <li key={x}>{x}</li>)}</ul></>}
      <div className="tag">Orientação automática a partir dos seus registros. Mudanças grandes na dieta: confirme com um nutricionista.</div>
    </div>
  );
}

function GoalCard({ weights, week, day }) {
  const wk = (d) => Math.floor((new Date(d + "T12:00:00Z") - new Date(GOAL.start + "T12:00:00Z")) / (7 * 864e5));
  const totalW = wk(GOAL.end) + 1, nowW = Math.max(0, wk(day));
  const left = Math.max(0, Math.round((new Date(GOAL.end + "T12:00:00Z") - new Date(day + "T12:00:00Z")) / 864e5));
  const base = weights.filter((w) => w.day <= GOAL.start).at(-1) || weights[0];
  const bio = Object.keys(week).filter((d) => week[d]?.checks?._bio?.gordura).sort();
  const fat0 = bio.find((d) => d >= addDays(GOAL.start, -7)), fatNow = bio.at(-1);
  const waist = Object.keys(week).filter((d) => week[d]?.checks?._med?.cintura).sort();
  const f1 = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  const rows = [];
  if (base) { const tgt = base.kg - GOAL.kgWeek * nowW, cur = weights.at(-1).kg, end = base.kg - GOAL.kgWeek * totalW; rows.push(["Peso", f1(cur) + " kg", f1(tgt) + " kg", f1(end) + " kg", cur <= tgt + 0.3]); }
  if (fat0) { const b = week[fat0].checks._bio.gordura, tgt = b - GOAL.fatWeek * nowW, cur = week[fatNow].checks._bio.gordura; rows.push(["Gordura", f1(cur) + "%", f1(tgt) + "%", f1(b - GOAL.fatWeek * totalW) + "%", cur <= tgt + 0.3]); }
  if (waist.length) { const b = week[waist[0]].checks._med.cintura, cur = week[waist.at(-1)].checks._med.cintura, tgt = b - GOAL.waistWeek * nowW; rows.push(["Cintura", f1(cur) + " cm", f1(tgt) + " cm", f1(b - GOAL.waistWeek * totalW) + " cm", cur <= tgt + 0.5]); }
  const onTrack = rows.length && rows.every((r) => r[4]);
  return (
    <div className="card">
      <div className="mh"><h2>Meta até a virada</h2><span className="tag num">{left} dias · semana {Math.min(nowW + 1, totalW)}/{totalW}</span></div>
      <div className="bar"><i style={{ width: `${Math.min(100, ((nowW + 1) / totalW) * 100)}%`, background: "var(--ok)" }} /></div>
      {rows.length ? <table><thead><tr><td></td><td className="tag">Agora</td><td className="tag">Alvo hoje</td><td className="tag">31/12</td></tr></thead><tbody>
        {rows.map(([l, c, t, e, ok]) => <tr key={l}><td>{l}</td><td className={"q" + (ok ? " okc" : " warn")}>{c}</td><td className="q">{t}</td><td className="q">{e}</td></tr>)}
      </tbody></table> : <div className="tag">Pese-se e meça a cintura para o app calcular seus alvos semanais.</div>}
      {rows.length > 0 && <div className="verdict">{onTrack ? "No ritmo da meta. Mantenha a constância." : "Abaixo do ritmo nesta semana: veja o Relatório da pesagem para saber o que ajustar."}</div>}
      <div className="tag">Ritmo saudável: ~0,5 kg e ~0,5 cm de cintura por semana, preservando músculo. Mais rápido que isso costuma custar massa magra. Mudanças grandes nas calorias: confirme com um nutricionista.</div>
    </div>
  );
}



function ProjetoVirada({ week, day, settings }) {
  const left = Math.max(0, Math.round((new Date(VIRADA.end + "T12:00:00Z") - new Date(day + "T12:00:00Z")) / 864e5));
  const total = Math.round((new Date(VIRADA.end + "T12:00:00Z") - new Date(VIRADA.start + "T12:00:00Z")) / 864e5);
  const md = Object.keys(week).filter((d) => week[d]?.checks?._med).sort();
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  const hist = settings.supplies?._loadHist || {};
  const groups = [["Peito", "A"], ["Costas", "B"], ["Braço", "E"]].map(([g, id]) => {
    const w = myWorkouts(settings).find((x) => x.id === id);
    const ex = (w?.ex || []).filter((e) => !e.fin && !/Hiperext/.test(e.n)).map((e) => {
      const cur0 = parseFloat(String(settings.supplies?._loads?.[e.n] || "").replace(",", ".")); const h = Object.entries(hist[e.n] || (cur0 > 0 ? { [VIRADA.start]: cur0 } : {})).sort(([a], [b]) => (a < b ? -1 : 1));
      if (!h.length) return { n: e.n, none: true };
      let best = 0, bestDay = h[0][0]; h.forEach(([d, v]) => { if (v > best) { best = v; bestDay = d; } });
      const stale = h.length > 0 && addDays(bestDay, 14) <= day;
      return { n: e.n, best, bestDay, first: h[0][1], stale };
    });
    return [g, ex];
  });
  const stale = groups.flatMap(([, ex]) => ex.filter((e) => e.stale));
  return (
    <div className="card">
      <div className="mh"><h2>Recordes de carga</h2><span className="tag">peito · costas · braço</span></div>
      {groups.map(([g, ex]) => (
        <div key={g}><div className="lbl">{g}</div>
          {ex.filter((e) => !e.none).length ? ex.filter((e) => !e.none).map((e) => (
            <div key={e.n} className="mh" style={{ fontSize: 13 }}><span style={{ flex: 1, minWidth: 0 }}>{e.n}</span>
              <span className={"num" + (e.stale ? " warn" : "")}>{f1(e.best)} kg{e.best > e.first ? ` (+${f1(e.best - e.first)})` : ""}</span></div>
          )) : <div className="tag">Anote as cargas no treino para registrar.</div>}
        </div>
      ))}
      {stale.length > 0 && <div className="tag warn">2 semanas sem subir: {stale.slice(0, 3).map((e) => e.n).join(", ")}. Tente +1 repetição ou +1–2 kg no próximo treino.</div>}
      <div className="tag" style={{ fontSize: 12 }}>Regra: fez todas as repetições com folga, sobe a carga. Proteína todo dia e 5 treinos por semana.</div>
    </div>
  );
}



function skinPct(sk, proto = "jp") {
  const F = SKIN_P[proto].f, S = F.reduce((a, [k]) => a + (+sk[k] || 0), 0); if (!F.every(([k]) => +sk[k] > 0)) return null;
  if (proto === "gu") return Math.round((495 / (1.17136 - 0.06706 * Math.log10(S)) - 450) * 10) / 10;
  const D = 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * ageOn(spNow().day);
  return Math.round((495 / D - 450) * 10) / 10;
}

function Skinfolds({ week, day, onSave }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({});
  const [proto, setProto] = useState("gu");
  const PF = SKIN_P[proto].f;
  const days = Object.keys(week).filter((d) => week[d]?.checks?._skin?.pct).sort();
  const last = days.length ? week[days.at(-1)].checks._skin : null, first = days.length ? week[days[0]].checks._skin : null;
  const bioD = Object.keys(week).filter((d) => week[d]?.checks?._bio?.gordura).sort().at(-1);
  const f1 = (x) => String(x).replace(".", ",");
  const num = (x) => parseFloat(String(x || "").replace(",", "."));
  const prev = skinPct(Object.fromEntries(PF.map(([k]) => [k, num(v[k])])), proto);
  return (
    <div className="card">
      <div className="mh"><h2>Adipômetro</h2>{!open && <button className="sm" onClick={() => { setV(week[day]?.checks?._skin || {}); setOpen(true); }}>Registrar hoje</button>}</div>
      {last ? <>
        <div className="pre-grid">
          <div><div className="lbl">Gordura (dobras)</div><b className="num">{f1(last.pct)}%</b><span className="tag">{fmtDay(days.at(-1), { day: "2-digit", month: "2-digit" })}</span></div>
          <div><div className="lbl">Desde o início</div><b className="num">{days.length > 1 ? `${last.pct - first.pct > 0 ? "+" : ""}${f1((last.pct - first.pct).toFixed(1))} pp` : "–"}</b><span className="tag">pontos de %</span></div>
          <div><div className="lbl">Balança</div><b className="num">{bioD ? f1(week[bioD].checks._bio.gordura) + "%" : "–"}</b><span className="tag">OKOK</span></div>
        </div>
        <div className="tag" style={{ fontSize: 12 }}>Dobras: {SKIN_P[last.proto || "jp"].f.map(([k, l]) => `${l.toLowerCase()} ${f1(last[k])} mm`).join(" · ")}. Os dois métodos dão números diferentes; compare cada um com ele mesmo.</div>
      </> : <div className="tag">Meça 3 dobras às segundas, lado direito, antes do treino. O app calcula o % de gordura.</div>}
      {open && <div className="ci">
        <div className="seg">{Object.entries(SKIN_P).map(([k, p]) => <button key={k} className={proto === k ? "on" : ""} onClick={() => setProto(k)}>{p.l}</button>)}</div>
        <div className="tag" style={{ fontSize: 12 }}>Use sempre o mesmo protocolo para comparar.</div>
        {PF.map(([k, l, h]) => (
          <div key={k} className="ci-row"><span>{l}<div className="tag">{h}</div></span>
            <input inputMode="decimal" placeholder="mm" value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={{ width: 80 }} /></div>
        ))}
        {prev != null && <div className="tag">Resultado: <b>{f1(prev)}% de gordura</b></div>}
        <div className="row">
          <button className="pri grow" disabled={prev == null} onClick={() => { const o = Object.fromEntries(PF.map(([k]) => [k, num(v[k])])); onSave({ ...o, pct: prev, proto }); setOpen(false); }}>Salvar dobras</button>
          <button className="sm" onClick={() => setOpen(false)}>Cancelar</button>
        </div>
      </div>}
    </div>
  );
}

function bodySeries(m, weights, week) {
  if (m.src === "w") { const by = {}; weights.forEach((w) => { by[w.day] = +w.kg; }); return Object.entries(by).sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, v]) => ({ d, v })); }
  const key = m.src === "bio" ? "_bio" : m.src === "med" ? "_med" : "_skin", f = m.src === "skin" ? "pct" : m.k;
  return Object.keys(week).filter((d) => +week[d]?.checks?.[key]?.[f] > 0).sort().map((d) => ({ d, v: +week[d].checks[key][f] }));
}

function strengthTrend(settings, day) {
  const hist = settings?.supplies?._loadHist || {}; let up = 0, down = 0;
  Object.values(hist).forEach((h) => {
    const e = Object.entries(h).sort(([a], [b]) => (a < b ? -1 : 1)); if (e.length < 2) return;
    const recent = e.filter(([d]) => d > addDays(day, -14)), old = e.filter(([d]) => d <= addDays(day, -14));
    const bestOld = Math.max(0, ...old.map(([, v]) => v)), last = e.at(-1)[1], bestRecent = Math.max(0, ...recent.map(([, v]) => v));
    if (recent.length && bestRecent > bestOld && bestOld > 0) up++; else if (bestOld > 0 && last < bestOld) down++;
  });
  return up > down ? 1 : down > up ? -1 : 0;
}

function bodyVerdict(weights, week, settings, day) {
  const W = bodySeries(BODY[3], weights, week), C = bodySeries(BODY[1], weights, week);
  const avg = (a, b) => { const v = W.filter((p) => p.d > a && p.d <= b).map((p) => p.v); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const a1 = avg(addDays(day, -7), day), a0 = avg(addDays(day, -14), addDays(day, -7));
  const dw = a1 != null && a0 != null ? a1 - a0 : null;
  const w = dw == null ? null : dw > 0.3 ? 1 : dw < -0.3 ? -1 : 0, fast = dw != null && dw < -0.8;
  const dc = C.length > 1 ? C.at(-1).v - C.at(-2).v : null, c = dc == null ? null : dc <= -0.5 ? -1 : dc >= 0.5 ? 1 : 0;
  const s = strengthTrend(settings, day);
  if (w == null && c == null) return { t: "Ainda sem dados para ler o corpo: pese-se nesta semana e meça a cintura na segunda.", k: "" };
  if (fast && s < 0) return { t: "Alerta: peso caindo rápido e força caindo. Pode ser perda de músculo: coma todas as refeições e fale com o nutri.", k: "bad" };
  if (w === 1 && c === 1) return { t: "Peso e cintura subindo. Se repetir por 3 semanas, é ganho de gordura: revise a dieta e os treinos.", k: "warn" };
  if (w === 0 && c === -1) return { t: "Recomposição: peso igual e cintura caindo. É exatamente o objetivo. Ótimo!", k: "ok" };
  if (w === -1 && c === -1) return { t: "Perda de gordura: peso e cintura caindo juntos. No ritmo.", k: "ok" };
  if (w === 1 && c !== 1 && s >= 0) return { t: "Peso subindo com cintura estável: é músculo e água (creatina, carboidrato). Tudo ok.", k: "ok" };
  if (w === -1 && c === 0) return { t: "Peso caindo com cintura igual: provavelmente água. Espere a próxima medida.", k: "" };
  if (c == null) return { t: `Peso ${w === 1 ? "subindo" : w === -1 ? "caindo" : "estável"}. Meça a cintura na segunda para o app saber se é gordura, água ou músculo.`, k: "" };
  return { t: "Sem sinal claro ainda. Siga o plano: a tendência aparece em 2 a 3 semanas.", k: "" };
}

function MeuCorpo({ weights, week, day, settings }) {
  const [mi, setMi] = useState(0);
  const [sel, setSel] = useState(null);
  const m = BODY[mi], pts = bodySeries(m, weights, week);
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace(".", ",");
  const verdict = bodyVerdict(weights, week, settings, day);
  const left = Math.max(0, Math.round(dnum(VIRADA.end) - dnum(day)));
  let chart = null, head = null;
  if (pts.length) {
    const b = pts[0], cur = pts.at(-1), goal = m.goal(b.v);
    const x0 = dnum(b.d), x1 = dnum(VIRADA.end), ideal = (d) => b.v + (goal - b.v) * Math.min(1, (dnum(d) - x0) / Math.max(1, x1 - x0));
    const vs = [...pts.map((p) => p.v), goal, ...(m.band || [])], lo = Math.min(...vs) - 0.5, hi = Math.max(...vs) + 0.5;
    const Wd = 340, H = 170, P = 34, X = (d) => P + ((dnum(d) - x0) / Math.max(1, x1 - x0)) * (Wd - P - 14), Y = (v) => 12 + ((hi - v) * (H - 36)) / (hi - lo);
    const diff = cur.v - ideal(cur.d), good = m.dir === 0 ? cur.v <= ideal(cur.d) + 0.5 : m.dir * diff >= -0.3;
    const done = m.dir === 0 ? 1 - Math.min(1, Math.max(0, (cur.v - goal) / Math.max(0.1, b.v - goal))) : Math.max(0, Math.min(1, (cur.v - b.v) / ((goal - b.v) || 1)));
    const p = sel != null && pts[sel] ? pts[sel] : cur;
    head = (
      <div className="pre-grid">
        <div><div className="lbl">{p === cur ? "Agora" : fmtDay(p.d, { day: "2-digit", month: "2-digit" })}</div><b className="num">{f1(p.v)}{m.u}</b><span className="tag">{p.v - b.v >= 0 ? "+" : ""}{f1(p.v - b.v)} desde {fmtDay(b.d, { day: "2-digit", month: "2-digit" })}</span></div>
        <div><div className="lbl">Meta 31/12</div><b className="num">{m.band ? `${f1(m.band[0])}–${f1(m.band[1])}` : f1(goal)}{m.u}</b><span className="tag">{m.k === "magra" ? "manter ou subir" : `${left} dias`}</span></div>
        <div><div className="lbl">Caminho</div><b className={"num " + (pts.length > 1 ? (good ? "okc" : "warn") : "")}>{pts.length > 1 ? (good ? "no ritmo" : "atrás") : "início"}</b><span className="tag">{Math.round(done * 100)}% da meta</span></div>
      </div>
    );
    chart = (
      <svg viewBox={`0 0 ${Wd} ${H}`} style={{ width: "100%", touchAction: "manipulation" }}>
        {m.band && <rect x={P} width={Wd - P - 14} y={Y(m.band[1])} height={Y(m.band[0]) - Y(m.band[1])} fill="var(--ok)" opacity=".12" />}
        {[lo + 0.5, hi - 0.5].map((v) => <g key={v}><line x1={P} x2={Wd - 14} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x="0" y={Y(v) + 4} fontSize="10" fill="var(--mute)">{f1(v)}</text></g>)}
        <line x1={X(b.d)} y1={Y(b.v)} x2={X(VIRADA.end)} y2={Y(goal)} stroke="var(--ok)" strokeDasharray="5 5" strokeWidth="2" />
        <circle cx={X(VIRADA.end)} cy={Y(goal)} r="5" fill="none" stroke="var(--ok)" strokeWidth="2" />
        <text x={X(VIRADA.end)} y={Y(goal) - 9} fontSize="10" textAnchor="end" fill="var(--ok)">31/12</text>
        <polyline points={pts.map((q) => `${X(q.d)},${Y(q.v)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        {pts.map((q, i) => <g key={q.d} onClick={() => { buzz(); setSel(sel === i ? null : i); }} style={{ cursor: "pointer" }}>
          <circle cx={X(q.d)} cy={Y(q.v)} r="14" fill="transparent" />
          <circle cx={X(q.d)} cy={Y(q.v)} r={sel === i || (sel == null && i === pts.length - 1) ? 6 : 3.5} fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5" />
        </g>)}
      </svg>
    );
  }
  return (
    <div className="card">
      <div className="mh"><h2>Meu corpo</h2><span className="tag num">{left} dias para a virada</span></div>
      <div className={"verdict " + verdict.k}>{verdict.t}</div>
      <div className="seg">{BODY.map((b, i) => <button key={b.k} className={i === mi ? "on" : ""} onClick={() => { buzz(); setMi(i); setSel(null); }}>{b.l}</button>)}</div>
      {pts.length ? <>{head}{chart}<div className="tag" style={{ fontSize: 12 }}>Linha azul = você. Tracejado verde = caminho até a meta de 31/12. Toque nos pontos para ver cada medida.</div></>
        : <div className="tag">Sem registros de {m.l.toLowerCase()} ainda. {m.src === "med" ? "Meça com a fita na segunda (Medidas → Registrar hoje)." : m.src === "skin" ? "Use o adipômetro na segunda." : "Pese-se na balança OKOK."}</div>}
    </div>
  );
}





function CardioHist({ week, day }) {
  const ds = Object.keys(week).filter((d) => week[d]?.checks?._cardio?.min).sort().slice(-6);
  if (!ds.length) return null;
  const f = (x, d = 1) => (+x).toFixed(d).replace(".", ",");
  const tot = ds.filter((d) => d > addDays(day, -28)).reduce((a, d) => a + (week[d].checks._cardio.kcal || 0), 0);
  return (
    <div className="card">
      <div className="mh"><h2>Cardio</h2><span className="tag">{Math.round(tot)} kcal em 4 semanas</span></div>
      <table><tbody>{ds.map((d) => { const c = week[d].checks._cardio; return <tr key={d}><td>{fmtDay(d, { day: "2-digit", month: "2-digit" })}</td><td className="q">{c.min} min</td><td className="q">{f(c.km, 2)} km</td><td className="q">{c.km ? f(c.km / (c.min / 60)) + " km/h" : ""}</td></tr>; }).reverse()}</tbody></table>
      <div className="tag" style={{ fontSize: 12 }}>Para evoluir: a cada semana, +2 min de tempo ou +0,2 km/h de velocidade.</div>
    </div>
  );
}

function Expenditure({ weights, week, day }) {
  const from = addDays(day, -27);
  const W = (() => { const by = {}; weights.forEach((w) => { if (w.day >= from) by[w.day] = +w.kg; }); return Object.entries(by).sort(([a], [b]) => (a < b ? -1 : 1)); })();
  const main = MEALS.filter((m) => !m.workout);
  const intake = [];
  for (let d = from; d <= day; d = addDays(d, 1)) {
    const l = week[d]; if (!l) continue;
    const ft = (l.checks?._foods || []).reduce((a, f) => a + (f.total?.kcal || 0), 0);
    const tot = main.reduce((a, m) => a + m.items.filter((x) => !x.sup).length, 0);
    const ok = main.reduce((a, m) => a + m.items.filter((x, i) => !x.sup && itemDone(l, m, i)).length, 0);
    if (ft > 0) intake.push(ft); else if (ok > 0) intake.push(Math.round(KCAL_GOAL * ok / tot) + (l.workout_at ? 220 : 0));
  }
  const f0 = (v) => Math.round(v).toLocaleString("pt-BR");
  if (W.length < 4 || intake.length < 7 || dnum(W.at(-1)[0]) - dnum(W[0][0]) < 10)
    return <div className="card"><div className="mh"><h2>Gasto real</h2></div><div className="tag">Preciso de ~2 semanas com 4+ pesagens e as refeições marcadas para calcular quanto você realmente gasta. Faltam {Math.max(0, 4 - W.length)} pesagens e {Math.max(0, 7 - intake.length)} dias marcados.</div></div>;
  const xs = W.map(([d]) => dnum(d)), ys = W.map(([, v]) => v), mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0); // kg/dia
  const avgIn = intake.reduce((a, b) => a + b) / intake.length, tdee = avgIn - slope * 7700;
  const wk = slope * 7, target = Math.round((tdee - 450) / 10) * 10;
  return (
    <div className="card">
      <div className="mh"><h2>Gasto real</h2><span className="tag">últimas 4 semanas</span></div>
      <div className="pre-grid">
        <div><div className="lbl">Você gasta</div><b className="num">~{f0(tdee)}</b><span className="tag">kcal/dia</span></div>
        <div><div className="lbl">Você come</div><b className="num">~{f0(avgIn)}</b><span className="tag">kcal/dia</span></div>
        <div><div className="lbl">Ritmo</div><b className={"num " + (wk <= -0.2 ? "okc" : wk >= 0.2 ? "warn" : "")}>{wk > 0 ? "+" : ""}{wk.toFixed(2).replace(".", ",")} kg</b><span className="tag">por semana</span></div>
      </div>
      <div className="verdict" style={{ marginTop: 8 }}>{wk <= -0.6 ? "Perdendo rápido demais: risco de perder músculo. Considere comer ~150 kcal a mais." : wk <= -0.2 ? "Ritmo bom de perda. Mantenha." : `Para perder ~0,4 kg/semana, o alvo seria ~${f0(target)} kcal/dia (hoje o plano tem ${f0(KCAL_GOAL)}). Antes de cortar, confira se está marcando tudo.`}</div>
      <div className="tag" style={{ fontSize: 12 }}>Estimativa pela tendência do peso + o que você marcou (fotos do prato contam mais). Água e sal fazem o número oscilar; fica mais preciso com o tempo.</div>
    </div>
  );
}

export { Progress, Evolution, Measures, BodyComp, WeighReport, GoalCard, ProjetoVirada, skinPct, Skinfolds, bodySeries, strengthTrend, bodyVerdict, MeuCorpo, CardioHist, Expenditure };
