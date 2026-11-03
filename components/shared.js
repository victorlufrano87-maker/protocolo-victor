"use client";
import { useMemo, useState } from "react";
import { spNow } from "@/lib/supabase";
import { WATER_GOAL, dayScore } from "@/lib/plan";



const EMPTY = { checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null };

const CUP = 250, CUPS = Math.ceil(WATER_GOAL / CUP);

const MFIT_URL = "https://www.mfitpersonal.com.br";

const score = dayScore;

const fmtPortion = (p, measure) => p === 1 ? measure : p === 0.5 ? `½ de ${measure}` : `${String(p).replace(".", ",")}× ${measure}`;

const b64ToU8 = (b) => { const p = "=".repeat((4 - (b.length % 4)) % 4); const r = atob((b + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };

const buzz = (ms = 15) => { try { navigator.vibrate?.(ms); } catch {} };

const fmtHM = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const fmtDur = (min) => { const a = Math.abs(min); return a < 60 ? `${a} min` : `${Math.floor(a / 60)}h${a % 60 ? String(a % 60).padStart(2, "0") : ""}`; };

const mealDone = (m, checks) => m.items.every((_, i) => checks[`${m.id}-${i}`]);

const I = {
  today: <path d="M4 5h16v15H4zM4 9h16M9 3v4M15 3v4" />,
  prog: <path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" />,
  swap: <path d="M7 4 3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8" />,
  plan: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" />,
  check: <path d="m5 12 5 5 9-10" />,
  dumbbell: <path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12" />,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  camera: <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  cart: <path d="M3 4h2l2.5 11h11L21 7H6.5M9 20h.01M17 20h.01" />,
  ext: <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />,
};

const Icon = ({ n, s = 20 }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n]}</svg>;

function Ring({ pct }) {
  return (
    <svg width="76" height="76" viewBox="0 0 84 84" style={{ flex: "none" }}>
      <circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle cx="42" cy="42" r="36" fill="none" stroke="var(--ok)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray="226" strokeDashoffset={226 - (226 * pct) / 100} transform="rotate(-90 42 42)" style={{ transition: "stroke-dashoffset .5s" }} />
      <text x="42" y="48" textAnchor="middle" fill="var(--fg)" fontSize="18">{pct}%</text>
    </svg>
  );
}

function Confetti() {
  const bits = useMemo(() => Array.from({ length: 40 }, (_, i) => ({ l: Math.random() * 100, d: Math.random() * 0.8, c: ["var(--ok)", "var(--accent)", "var(--warn)"][i % 3], r: Math.random() * 360 })), []);
  return <div className="confetti" aria-hidden="true">{bits.map((b, i) => <i key={i} style={{ left: b.l + "%", animationDelay: b.d + "s", background: b.c, transform: `rotate(${b.r}deg)` }} />)}<div className="party">Dia 100%!</div></div>;
}

function spNowTime(iso) { const m = spNow(new Date(iso)).min; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; }

const CI_FIELDS = [["fome", "Fome"], ["energia", "Energia"], ["sono", "Sono"], ["intestino", "Intestino"], ["treino", "Treinos"]];

function CheckinForm({ onSave, initial }) {
  const [ci, setCi] = useState(initial || {});
  return (
    <div className="ci">
      <div className="tag">Como foi a semana? 1 = ruim, 5 = ótimo{" "}(fome: 1 = muita fome)</div>
      {CI_FIELDS.map(([k, l]) => (
        <div key={k} className="ci-row"><span>{l}</span>
          <div className="ci-opts">{[1, 2, 3, 4, 5].map((v) => <button key={v} className={ci[k] === v ? "on" : ""} onClick={() => { buzz(); setCi({ ...ci, [k]: v }); }}>{v}</button>)}</div>
        </div>
      ))}
      <button className="pri" disabled={CI_FIELDS.some(([k]) => !ci[k])} onClick={() => onSave(ci)}>Salvar check-in</button>
    </div>
  );
}

function Fold({ done, label, summary, neutral, children }) {
  const [open, setOpen] = useState(false);
  if (!done || open) return children;
  return (
    <button className={"fold" + (neutral ? " neutral" : "")} onClick={() => setOpen(true)}>
      <span className="dot">{!neutral && <Icon n="check" s={14} />}</span><b>{label}</b><span className="tag">{summary}</span>
    </button>
  );
}

const MEAS = [["cintura", "Cintura (umbigo)"], ["abdomen", "Abdômen (umbigo)"], ["quadril", "Quadril"], ["peito", "Peito (linha dos mamilos)"], ["ombro", "Ombros (contorno)"], ["braco", "Braço (contraído)"], ["coxa", "Coxa"], ["pescoco", "Pescoço"], ["punho", "Punho"]];

function MeasureForm({ onSave, initial }) {
  const [m, setM] = useState(initial || {});
  const val = (k) => m[k] ?? "";
  return (
    <div className="ci">
      <div className="tag">Medidas em cm, com fita, sempre no mesmo ponto. Deixe em branco o que não medir.</div>
      {MEAS.map(([k, l]) => (
        <div key={k} className="ci-row"><span>{l}</span>
          <input id={"med-" + k} inputMode="decimal" placeholder="cm" value={val(k)} onChange={(e) => setM({ ...m, [k]: e.target.value })} style={{ width: 90 }} /></div>
      ))}
      <button className="pri" disabled={!MEAS.some(([k]) => parseFloat(String(m[k] || "").replace(",", ".")))} onClick={() => {
        const out = {}; MEAS.forEach(([k]) => { const v = parseFloat(String(m[k] || "").replace(",", ".")); if (v) out[k] = v; }); onSave(out);
      }}>Salvar medidas</button>
    </div>
  );
}

const BIO = [
  ["peso", "Peso", "kg"], ["gordura", "Gordura corporal", "%"], ["magra", "Massa magra", "kg"], ["musculo", "Massa muscular", "kg"],
  ["agua", "Água corporal", "%"], ["visceral", "Gordura visceral", ""], ["imc", "IMC", ""],
];

function parseBio(search) {
  const q = new URLSearchParams(search); const out = {};
  BIO.forEach(([k, , u]) => {
    const raw = q.get(k); if (!raw) return;
    const m = String(raw).replace(",", ".").match(/-?\d+(\.\d+)?/); if (!m) return;
    let v = parseFloat(m[0]); if (!isFinite(v) || v <= 0) return;
    if (u === "%" && v < 1) v *= 100;
    out[k] = Math.round(v * 10) / 10;
  });
  return Object.keys(out).length ? out : null;
}

const GOAL = { start: "2026-10-09", end: "2026-12-31", kgWeek: 0.5, fatWeek: 0.35, waistWeek: 0.5 };

const DAY_TIPS = [
  "comece cada refeição pela proteína e pela salada; o carboidrato vem por último.",
  "suba a carga quando fizer todas as repetições com folga. Músculo novo gasta mais energia parado.",
  "10 mil passos por dia: desça uma estação antes na Paulista e vá andando.",
  "não pule o cardio de 20 min no fim do treino. É ali que a gordura vai embora.",
  "coma devagar: 20 min por refeição. A saciedade demora a chegar.",
  "beba 500 ml de água antes do almoço e do jantar.",
  "descanse 60–90 s entre as séries: treino mais denso queima mais.",
  "nada de beliscar à tarde. Se bater fome, tome whey com água ou coma uma fruta.",
  "deixe as marmitas prontas no domingo. Quem não planeja acaba no delivery.",
  "durma pelo menos 6 h. Sono curto aumenta a fome no dia seguinte.",
  "treine com intensidade: as 2 últimas repetições têm que ser difíceis.",
  "refrigerante só zero e suco nenhum. Caloria líquida não mata a fome.",
  "fim de semana conta: mantenha os horários de sábado e domingo.",
  "suba de escada sempre que der. São minutos de cardio grátis.",
];

const FAT_TIPS = [
  "Nesta semana: bata a proteína todo dia (frango, ovos, whey). É ela que protege o músculo.",
  "Feche os 2,6 L de água: corpo desidratado faz a balança marcar mais gordura.",
  "Não pule treino: são 5 na semana, e o cardio de 20 min no fim conta muito.",
  "Corte beliscos e líquidos com açúcar. Uma semana limpa já aparece na próxima pesagem.",
  "Durma o máximo que der: menos de 6 h aumenta a fome e segura gordura.",
  "Pese sempre igual: em jejum, depois do banheiro e antes de beber água.",
];

const VIRADA = { start: "2026-10-19", end: "2026-12-31", goals: [["braco", "Braço", 1.5], ["peito", "Peito", 2], ["ombro", "Ombros/costas", 2], ["cintura", "Cintura", -5]] };

const SKIN_P = {
  jp: { l: "Peito · abdômen · coxa (Jackson-Pollock)", f: [["peito", "Peitoral", "diagonal, entre axila e mamilo"], ["abd", "Abdômen", "vertical, 2 cm ao lado do umbigo"], ["coxa", "Coxa", "vertical, frente da coxa, no meio"]] },
  gu: { l: "Tríceps · supra-ilíaca · abdômen (Guedes)", f: [["tri", "Tríceps", "vertical, atrás do braço, entre ombro e cotovelo"], ["supra", "Supra-ilíaca", "diagonal 45°, logo acima do osso do quadril"], ["abd", "Abdômen", "vertical, 2 cm ao lado do umbigo"]] },
};

const SKIN = SKIN_P.jp.f;

const BIRTH = "1998-11-27";

const ageOn = (d) => +d.slice(0, 4) - +BIRTH.slice(0, 4) - (d.slice(5) < BIRTH.slice(5) ? 1 : 0);

const BODY = [
  { k: "gordura", l: "Gordura", u: "%", dir: -1, src: "bio", goal: () => 16.5 },
  { k: "cintura", l: "Cintura", u: " cm", dir: -1, src: "med", goal: (b) => b - 5 },
  { k: "magra", l: "Massa magra", u: " kg", dir: 1, src: "bio", goal: (b) => b },
  { k: "peso", l: "Peso", u: " kg", dir: 0, src: "w", goal: () => 70.8, band: [70, 71.5] },
  { k: "braco", l: "Braço", u: " cm", dir: 1, src: "med", goal: (b) => b + 1.5 },
  { k: "peito", l: "Peito", u: " cm", dir: 1, src: "med", goal: (b) => b + 2 },
  { k: "ombro", l: "Ombros", u: " cm", dir: 1, src: "med", goal: (b) => b + 2 },
  { k: "dobras", l: "Dobras", u: "%", dir: -1, src: "skin", goal: (b) => b - 4 },
];

const dnum = (d) => new Date(d + "T12:00:00Z").getTime() / 864e5;

const KCAL_GOAL = 1990, PTN_GOAL = 199;

const HMET = [
  ["Atividade", [["ativa", "Calorias ativas", "kcal", 500, "up"], ["repouso", "Calorias em repouso", "kcal", null, null], ["passos", "Passos", "", 8000, "up"], ["dist", "Distância", "km", 5, "up"], ["exerc", "Minutos de exercício", "min", 30, "up"], ["andares", "Andares subidos", "", 10, "up"]]],
  ["Coração", [["fc", "FC em repouso", "bpm", null, "down", "60–70 é bom; cair com o tempo = coração mais em forma"], ["vfc", "Variabilidade (VFC)", "ms", null, "up", "mais alta = mais recuperado"], ["vo2", "VO₂ máx", "", 42, "up", "condicionamento aeróbico"], ["spo2", "Oxigenação", "%", 95, "up"], ["resp", "Frequência respiratória", "rpm", null, null]]],
  ["Sono", [["sono", "Horas dormidas", "h", 7, "up", "meta: 7 h em 5+ noites"]]],
];

const BIO_ALL = [["peso", "Peso", " kg"], ["gordura", "Gordura", "%"], ["gorduraKg", "Gordura", " kg"], ["magra", "Massa magra", " kg"], ["musculo", "Massa muscular", " kg"], ["smm", "Músc. esquelético", " kg"], ["smmPct", "Músc. esquelético", "%"], ["agua", "Água", "%"], ["visceral", "Gordura visceral", ""], ["bmr", "Metabolismo", " kcal"], ["imc", "IMC", ""], ["proteina", "Proteína", "%"], ["ossea", "Massa óssea", " kg"], ["idadeCorporal", "Idade corporal", ""]];

export { EMPTY, CUP, CUPS, MFIT_URL, score, fmtPortion, b64ToU8, buzz, fmtHM, fmtDur, mealDone, I, Icon, Ring, Confetti, spNowTime, CI_FIELDS, CheckinForm, Fold, MEAS, MeasureForm, BIO, parseBio, GOAL, DAY_TIPS, FAT_TIPS, VIRADA, SKIN_P, SKIN, BIRTH, ageOn, BODY, dnum, KCAL_GOAL, PTN_GOAL, HMET, BIO_ALL };
