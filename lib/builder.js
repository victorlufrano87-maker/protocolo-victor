// Montador de treinos + sugestão automática a partir dos dados do Victor
import { LIBRARY } from "./library";
import { WORKOUTS } from "./workouts";

export const LETTERS_W = "ABCDEFG".split("");
export const myWorkouts = (settings) => {
  const c = settings?.supplies?._workouts;
  return Array.isArray(c) && c.length ? c.map((w, i) => ({ ...w, id: LETTERS_W[i] })) : WORKOUTS;
};
const find = (n) => LIBRARY.find((x) => x.n === n) || LIBRARY.find((x) => x.n.startsWith(n));
export const fromLib = (x, o = {}) => {
  const cardio = x.g === "Cardio", abs = x.g === "Abdômen";
  return { img: x.img, n: x.n, s: cardio ? 1 : abs ? 3 : 3, r: cardio ? "20 min" : abs ? 15 : 12, rest: cardio ? 0 : abs ? 30 : 60, tip: x.s.join(" "), ...(cardio || abs ? { fin: true } : {}), ...o };
};
const C = (n) => ({ n, s: 4, r: "8-10", rest: 90 });   // composto
const I = (n, s = 3) => ({ n, s, r: 12, rest: 60 });    // isolado
const F = (n) => ({ n, s: 3, r: 15, rest: 30, fin: true });

// dados: { fat, weight, lean, lag: { braco, peito, ombro } (true = atrás da meta) }
export function suggestPlan(d = {}) {
  const arm = d.lag?.braco ? 4 : 3, chest = d.lag?.peito ? 4 : 3;
  const cardioMin = d.fat == null || d.fat > 18 ? "25 min" : "15 min";
  const card = { n: "Corrida na Esteira", s: 1, r: cardioMin, rest: 0, fin: true };
  const plan = [
    { name: "Peito + Tríceps", ex: [C("Supino Reto (barra)"), C("Supino Inclinado (halteres)"), I("Voador / Peck Deck", chest), I("Crossover Polia Alta", chest), I("Tríceps na Polia (barra V)", arm), I("Tríceps Francês (halter)", arm), F("Abdominal Supra"), card] },
    { name: "Costas + Bíceps", ex: [C("Puxada Frontal Aberta"), C("Remada Curvada (barra)"), I("Remada Unilateral (halter)"), I("Pulldown com Braço Reto"), I("Rosca Direta (barra W)", arm), I("Rosca Martelo", arm), F("Elevação de Pernas na Barra"), card] },
    { name: "Pernas + Abdômen", ex: [C("Agachamento Goblet"), C("Leg Press 45° Unilateral"), I("Cadeira Extensora"), C("Stiff / Terra Romeno"), I("Mesa Flexora"), I("Panturrilha em Pé", 4), F("Giro Russo"), { ...card, r: "15 min" }] },
    { name: "Ombros + Peito superior", ex: [C("Desenvolvimento Sentado (halteres)"), I("Elevação Lateral com Halteres", 4), I("Crucifixo Inverso (halteres)"), C("Supino Inclinado no Banco (barra)"), I("Crossover Polia Baixa", chest), I("Encolhimento (halteres)"), F("Abdominal na Polia"), card] },
    { name: "Braço + Costas", ex: [I("Rosca Scott com Barra W", arm), I("Rosca Alternada (halteres)", arm), I("Tríceps Testa", arm), I("Tríceps na Polia com Corda", arm), C("Barra Fixa no Gráviton"), I("Remada Baixa com Triângulo"), F("Abdominal Bicicleta"), card] },
  ];
  return plan.map((w) => ({ name: w.name, ex: w.ex.map((e) => { const x = find(e.n); return x ? fromLib(x, { s: e.s, r: e.r, rest: e.rest, ...(e.fin ? { fin: true } : {}) }) : null; }).filter(Boolean) }));
}
export function suggestWhy(d = {}) {
  const out = [];
  out.push("5 treinos por semana, peito, costas e braço aparecem 2 vezes cada: é o que mais faz crescer o tronco até a virada.");
  out.push("Compostos (supino, remada, puxada, agachamento): 4 séries de 8–10, descanso 90 s. Isolados: 3 séries de 12, descanso 60 s.");
  if (d.lag?.braco) out.push("Seu braço está atrás da meta: bíceps e tríceps ganharam 1 série a mais.");
  if (d.lag?.peito) out.push("Seu peito está atrás da meta: voador e crossover ganharam 1 série a mais.");
  if (d.fat != null) out.push(d.fat > 18 ? `Gordura em ${String(d.fat).replace(".", ",")}%: cardio de 25 min no fim e abdômen todo treino, para baixar a pochete e o pneu.` : `Gordura em ${String(d.fat).replace(".", ",")}%: cardio de 15 min basta, foco total na carga.`);
  else out.push("Ainda sem % de gordura: cardio de 25 min no fim de cada treino.");
  if (d.lean != null) out.push(`Massa magra ${String(d.lean).replace(".", ",")} kg: o objetivo é manter ou subir enquanto a gordura cai.`);
  out.push("Iniciante: comece leve e suba +1–2 kg quando fizer todas as repetições com folga.");
  return out;
}
// carga sugerida: usa repetições quando houver (bateu a meta em todas as séries → sobe)
export function nextLoad(hist = {}, exHist = null, target = 0) {
  const inc = (kg) => Math.round((kg + (kg < 10 ? 1 : kg < 40 ? 2 : 2.5)) * 2) / 2;
  const sess = exHist ? Object.entries(exHist).sort(([a], [b]) => (a < b ? -1 : 1)).at(-1)?.[1] : null;
  if (sess && sess.length && target > 0) {
    const kg = Math.max(...sess.map((x) => x.kg));
    return sess.every((x) => x.r >= target) ? inc(kg) : kg;
  }
  const e = Object.entries(hist).sort(([a], [b]) => (a < b ? -1 : 1)); if (!e.length) return null;
  const last = e.at(-1)[1], same = e.length >= 2 && e.slice(-2).every(([, v]) => v === last);
  return same ? inc(last) : last;
}

// ---------- Treino do dia por objetivo ----------
const FOCUS = {
  Peito: { g: ["Peito"], plus: ["Tríceps"] }, Costas: { g: ["Costas"], plus: ["Bíceps"] }, Ombros: { g: ["Ombros"], plus: ["Abdômen"] },
  "Braço": { g: ["Bíceps", "Tríceps"], plus: [] }, Pernas: { g: ["Quadríceps", "Posterior", "Glúteos"], plus: ["Panturrilha"] },
  "Corpo todo": { g: ["Peito", "Costas", "Quadríceps", "Ombros"], plus: ["Bíceps", "Tríceps"] },
};
export const FOCUS_LIST = Object.keys(FOCUS);
const rnd = (seed) => { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; }; };
const isComp = (x) => /supino|remada|puxada|barra fixa|agachamento|leg press|terra|stiff|desenvolvimento|paralela|avanço|hip thrust|flexão de braço/i.test(x.n);
const isHome = (x) => x.eq === "Peso do corpo";
// goal: "massa" | "gordura" | "rapido"
export function dayWorkout({ goal, focus, seed, favs = [], lowGroup }) {
  const r = rnd(seed + goal + focus);
  const pick = (pool, n, used) => {
    const out = [], seenSub = new Set();
    const sorted = [...pool].sort((a, b) => (favs.includes(b.n) - favs.includes(a.n)) || (r() - 0.5));
    for (const x of sorted) { if (out.length >= n) break; if (used.has(x.n)) continue; const k = x.g + (x.sub || ""); if (seenSub.has(k) && sorted.length > n * 2) continue; seenSub.add(k); out.push(x); used.add(x.n); }
    for (const x of sorted) { if (out.length >= n) break; if (!used.has(x.n)) { out.push(x); used.add(x.n); } }
    return out;
  };
  const F = FOCUS[focus === "Automático" ? lowGroup || "Corpo todo" : focus] || FOCUS["Corpo todo"];
  const lib = LIBRARY.filter((x) => x.g !== "Cardio");
  const used = new Set();
  const main = F.g.flatMap((g) => lib.filter((x) => x.g === g));
  const comp = pick(main.filter(isComp), goal === "rapido" ? 2 : 2, used);
  const iso = pick(main.filter((x) => !isComp(x)), goal === "massa" ? 3 : 2, used);
  const plus = F.plus.length ? pick(lib.filter((x) => F.plus.includes(x.g)), goal === "massa" ? 2 : 1, used) : [];
  const abs = pick(lib.filter((x) => x.g === "Abdômen"), goal === "gordura" ? 2 : 1, used);
  const cardio = LIBRARY.find((x) => x.n === "Corrida na Esteira");
  const P = {
    massa: { c: { s: 4, r: "8-10", rest: 90 }, i: { s: 3, r: 12, rest: 60 }, card: "10 min" },
    gordura: { c: { s: 3, r: 15, rest: 30 }, i: { s: 3, r: 15, rest: 30 }, card: "25 min" },
    rapido: { c: { s: 3, r: 10, rest: 60 }, i: { s: 3, r: 12, rest: 45 }, card: "10 min" },
  }[goal];
  const ex = [
    ...comp.map((x) => fromLib(x, P.c)), ...iso.map((x) => fromLib(x, P.i)), ...plus.map((x) => fromLib(x, P.i)),
    ...abs.map((x) => fromLib(x, { s: 3, r: 15, rest: 30, fin: true })),
    ...(cardio ? [fromLib(cardio, { s: 1, r: P.card, rest: 0, fin: true })] : []),
  ];
  const name = `${{ massa: "Ganhar massa", gordura: "Queimar gordura", rapido: "Rápido 30 min" }[goal]} · ${focus === "Automático" ? lowGroup || "Corpo todo" : focus}`;
  return { id: "H", name, ex, goal };
}
