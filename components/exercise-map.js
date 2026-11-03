"use client";
import { EXMETA } from "@/lib/exmeta";
import { LIBRARY } from "@/lib/library";
import { myWorkouts } from "@/lib/builder";
import { addDays } from "@/lib/supabase";
import { weekday } from "@/lib/plan";



const MUSCLE_MAP = {
  "peitoral": [["f", 23, 30, 7, 5], ["f", 37, 30, 7, 5]],
  "ombros": [["f", 14, 26, 4, 5], ["f", 46, 26, 4, 5], ["b", 14, 26, 4, 5], ["b", 46, 26, 4, 5]],
  "bíceps": [["f", 12, 38, 3, 6], ["f", 48, 38, 3, 6]],
  "tríceps": [["b", 12, 38, 3, 6], ["b", 48, 38, 3, 6]],
  "antebraço": [["f", 10, 52, 2.5, 6], ["f", 50, 52, 2.5, 6], ["b", 10, 52, 2.5, 6], ["b", 50, 52, 2.5, 6]],
  "abdômen": [["f", 30, 46, 6, 9]],
  "dorsal": [["b", 22, 38, 6, 9], ["b", 38, 38, 6, 9]],
  "meio das costas": [["b", 30, 34, 5, 6]],
  "trapézio": [["b", 30, 22, 9, 4]],
  "lombar": [["b", 30, 52, 5, 4]],
  "glúteos": [["b", 24, 62, 6, 5], ["b", 36, 62, 6, 5]],
  "quadríceps": [["f", 24, 74, 5, 10], ["f", 36, 74, 5, 10]],
  "posterior de coxa": [["b", 24, 76, 5, 9], ["b", 36, 76, 5, 9]],
  "adutores": [["f", 30, 70, 2.5, 6]],
  "abdutores": [["f", 19, 64, 2.5, 5], ["f", 41, 64, 2.5, 5]],
  "panturrilha": [["b", 24, 96, 3.5, 7], ["b", 36, 96, 3.5, 7]],
};

function BodyFig({ view, pm = [], sm = [] }) {
  const reg = (list, op) => list.flatMap((m) => (MUSCLE_MAP[m] || []).filter((r) => r[0] === view).map((r, i) => <ellipse key={m + i + op} cx={r[1]} cy={r[2]} rx={r[3]} ry={r[4]} fill="#ff3b3b" opacity={op} />));
  return (
    <svg viewBox="0 0 60 112" className="bodyfig">
      <g fill="var(--card2)" stroke="var(--mute)" strokeWidth=".6">
        <circle cx="30" cy="9" r="6" /><rect x="17" y="18" width="26" height="40" rx="8" />
        <rect x="8" y="22" width="8" height="38" rx="4" /><rect x="44" y="22" width="8" height="38" rx="4" />
        <rect x="18" y="56" width="11" height="52" rx="5" /><rect x="31" y="56" width="11" height="52" rx="5" />
      </g>
      {reg(sm, 0.4)}{reg(pm, 0.9)}
      <text x="30" y="111" fontSize="5" textAnchor="middle" fill="var(--mute)">{view === "f" ? "frente" : "costas"}</text>
    </svg>
  );
}

const E = (cx, cy, rx, ry, r = 0) => ({ cx, cy, rx, ry, r });

const BODY_PARTS = {
  // frente (x ~50)
  pecL: { d: "M50 41 C42 39 33 40 29 46 C28 54 32 61 40 62 C45 62 49 59 50 55 Z" }, pecR: { d: "M50 41 C58 39 67 40 71 46 C72 54 68 61 60 62 C55 62 51 59 50 55 Z" },
  deltFL: { e: E(26, 46, 7, 9, -15) }, deltFR: { e: E(74, 46, 7, 9, 15) },
  bicL: { e: E(23, 65, 5, 11, -8) }, bicR: { e: E(77, 65, 5, 11, 8) },
  foreFL: { e: E(19, 90, 4.5, 12, -10) }, foreFR: { e: E(81, 90, 4.5, 12, 10) },
  abs: { d: "M43 64 H57 Q59 82 57 104 Q50 108 43 104 Q41 82 43 64 Z" },
  oblL: { e: E(37, 84, 4.5, 13, 5) }, oblR: { e: E(63, 84, 4.5, 13, -5) },
  quadL: { e: E(40, 134, 8, 22, 4) }, quadR: { e: E(60, 134, 8, 22, -4) },
  addL: { e: E(46.5, 120, 2.6, 10) }, addR: { e: E(53.5, 120, 2.6, 10) },
  shinL: { e: E(41, 176, 4.5, 15) }, shinR: { e: E(59, 176, 4.5, 15) },
  // costas (x ~150)
  traps: { d: "M150 30 L162 42 L156 66 L150 70 L144 66 L138 42 Z" },
  deltBL: { e: E(126, 46, 7, 9, -15) }, deltBR: { e: E(174, 46, 7, 9, 15) },
  latL: { d: "M141 52 C134 56 131 70 135 88 C139 94 144 90 146 84 L147 60 Z" }, latR: { d: "M159 52 C166 56 169 70 165 88 C161 94 156 90 154 84 L153 60 Z" },
  low: { e: E(150, 96, 8, 7) },
  triL: { e: E(123, 65, 5, 11, -8) }, triR: { e: E(177, 65, 5, 11, 8) },
  foreBL: { e: E(119, 90, 4.5, 12, -10) }, foreBR: { e: E(181, 90, 4.5, 12, 10) },
  gluL: { e: E(142, 114, 8.5, 9) }, gluR: { e: E(158, 114, 8.5, 9) },
  hamL: { e: E(141, 143, 7, 18, 3) }, hamR: { e: E(159, 143, 7, 18, -3) },
  calfL: { e: E(141, 176, 5.5, 14) }, calfR: { e: E(159, 176, 5.5, 14) },
};

const MUSCLE_PARTS = {
  "peitoral": ["pecL", "pecR"], "ombros": ["deltFL", "deltFR", "deltBL", "deltBR"], "bíceps": ["bicL", "bicR"], "tríceps": ["triL", "triR"],
  "antebraço": ["foreFL", "foreFR", "foreBL", "foreBR"], "abdômen": ["abs", "oblL", "oblR"], "dorsal": ["latL", "latR"], "meio das costas": ["traps"],
  "trapézio": ["traps"], "pescoço": ["traps"], "lombar": ["low"], "glúteos": ["gluL", "gluR"], "abdutores": ["gluL", "gluR"], "adutores": ["addL", "addR"],
  "quadríceps": ["quadL", "quadR"], "posterior de coxa": ["hamL", "hamR"], "panturrilha": ["calfL", "calfR", "shinL", "shinR"],
};

function BodyMap({ pm = [], sm = [], heat = null }) {
  const lvl = {}; sm.forEach((m) => (MUSCLE_PARTS[m] || []).forEach((p) => { lvl[p] = 1; })); pm.forEach((m) => (MUSCLE_PARTS[m] || []).forEach((p) => { lvl[p] = 2; }));
  const mix = (t) => { const a = [232, 233, 238], b = [229, 57, 53]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, t))).join(",")})`; };
  const fill = (k) => (heat ? (heat[k] ? mix(heat[k]) : "#e8e9ee") : lvl[k] === 2 ? "#e53935" : lvl[k] === 1 ? "#f4a3a1" : "#e8e9ee");
  return (
    <svg viewBox="0 0 200 200" className="bodymap" role="img" aria-label={`Músculos: ${pm.join(", ")}`}>
      <g fill="#d9dbe2">
        {[50, 150].map((x) => <g key={x}><circle cx={x} cy="18" r="10" /><rect x={x - 5} y="26" width="10" height="8" rx="3" />
          <rect x={x - 22} y="36" width="44" height="74" rx="14" /><rect x={x - 19} y="104" width="38" height="16" rx="8" />
          <ellipse cx={x - 31} cy="104" rx="3.5" ry="5" /><ellipse cx={x + 31} cy="104" rx="3.5" ry="5" />
          <ellipse cx={x - 9} cy="194" rx="6" ry="3" /><ellipse cx={x + 9} cy="194" rx="6" ry="3" /></g>)}
      </g>
      {Object.entries(BODY_PARTS).map(([k, p]) => p.d
        ? <path key={k} d={p.d} fill={fill(k)} stroke="#b9bcc6" strokeWidth=".7" />
        : <ellipse key={k} cx={p.e.cx} cy={p.e.cy} rx={p.e.rx} ry={p.e.ry} transform={`rotate(${p.e.r} ${p.e.cx} ${p.e.cy})`} fill={fill(k)} stroke="#b9bcc6" strokeWidth=".7" />)}
      <text x="50" y="200" fontSize="7" textAnchor="middle" fill="var(--mute)">frente</text>
      <text x="150" y="200" fontSize="7" textAnchor="middle" fill="var(--mute)">costas</text>
    </svg>
  );
}

const HEAT_GROUPS = [["Peito", ["peitoral"], 14], ["Costas", ["dorsal", "meio das costas"], 14], ["Ombros", ["ombros"], 12], ["Bíceps", ["bíceps"], 12], ["Tríceps", ["tríceps"], 12], ["Pernas", ["quadríceps", "posterior de coxa", "glúteos"], 12], ["Abdômen", ["abdômen"], 10]];

function weekMuscleSets(settings, day) {
  const mon = addDays(day, -((weekday(day) + 6) % 7)), eh = settings.supplies?._exHist || {}, cnt = {};
  const metaOf = (n) => { const l = LIBRARY.find((x) => x.n === n); if (l) return l; for (const w of myWorkouts(settings)) { const e = w.ex.find((x) => x.n === n); if (e) return EXMETA[e.img] || null; } return null; };
  Object.entries(eh).forEach(([n, byDay]) => {
    const m = metaOf(n); if (!m) return;
    Object.entries(byDay).forEach(([d, sl]) => { if (d < mon || d > day) return; const k = (sl || []).length;
      (m.pm || []).forEach((x) => { cnt[x] = (cnt[x] || 0) + k; }); (m.sm || []).forEach((x) => { cnt[x] = (cnt[x] || 0) + k * 0.5; }); });
  });
  return cnt;
}

function WeekMuscles({ settings, day }) {
  const cnt = weekMuscleSets(settings, day);
  const heat = {};
  Object.entries(MUSCLE_PARTS).forEach(([m, parts]) => { const g = HEAT_GROUPS.find(([, ms]) => ms.includes(m)); const t = (cnt[m] || 0) / (g ? g[2] : 10); parts.forEach((p) => { heat[p] = Math.max(heat[p] || 0, t); }); });
  const any = Object.values(cnt).some((v) => v > 0);
  return (
    <div className="card">
      <div className="mh"><h3>Músculos da semana</h3><span className="tag">séries feitas / meta</span></div>
      <div style={{ maxWidth: 300, margin: "0 auto" }}><BodyMap heat={heat} /></div>
      {HEAT_GROUPS.map(([g, ms, goal]) => { const v = ms.reduce((a, m) => a + (cnt[m] || 0), 0) / (ms.length > 1 && g !== "Pernas" ? 1 : 1); const pct = Math.min(1, v / goal);
        return <div key={g} className="hrow"><span>{g}</span><i className="gbar"><i style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--ok)" : pct >= 0.6 ? "var(--accent)" : "var(--warn)" }} /></i><b className="num">{Math.round(v)}/{goal}</b></div>; })}
      <div className="tag" style={{ fontSize: 12 }}>{any ? "Mais vermelho = mais trabalhado. Meta para crescer: 12–16 séries por semana em peito, costas e braço." : "Marque as séries no treino (com reps) para o mapa encher."}</div>
    </div>
  );
}

export { E, BODY_PARTS, MUSCLE_PARTS, MUSCLE_MAP, BodyFig, BodyMap, HEAT_GROUPS, weekMuscleSets, WeekMuscles };
