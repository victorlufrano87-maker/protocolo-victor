"use client";
import { START_WEIGHT } from "@/lib/plan";



function WeightChart({ data }) {
  const pts = [{ day: "início", kg: START_WEIGHT }, ...data.map((d) => ({ day: d.day, kg: +d.kg }))];
  if (pts.length < 2) return <div className="tag">Registre o peso para ver o gráfico.</div>;
  const W = 320, H = 120, P = 30, vals = pts.map((p) => p.kg);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const x = (i) => P + (i * (W - P - 10)) / (pts.length - 1), y = (v) => 10 + ((hi - v) * (H - 30)) / (hi - lo);
  const line = pts.map((p, i) => `${x(i)},${y(p.kg)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      {[lo, (lo + hi) / 2, hi].map((v) => <g key={v}><line x1={P} x2={W - 10} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x="0" y={y(v) + 4} fontSize="10" fill="var(--mute)">{v.toFixed(1)}</text></g>)}
      <polygon points={`${x(0)},${H - 20} ${line} ${x(pts.length - 1)},${H - 20}`} fill="var(--accent-soft)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={x(pts.length - 1)} cy={y(vals.at(-1))} r="4" fill="var(--accent)" />
      <text x={x(pts.length - 1)} y={y(vals.at(-1)) - 8} fontSize="11" textAnchor="end" fill="var(--fg)">{vals.at(-1).toFixed(1)} kg</text>
    </svg>
  );
}

function WeekBars({ data, unit, dir }) {
  const W = 330, H = 140, P = 8, B = 22, vals = data.map((p) => p.kg);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(0.5, (hi - lo) * 0.25);
  const min = lo - pad, max = hi + pad;
  const x = (i) => P + 4 + (i * (W - 2 * P - 8)) / Math.max(1, data.length - 1);
  const y = (v) => 18 + ((max - v) * (H - 18 - B)) / (max - min);
  const line = data.map((p, i) => `${x(i)},${y(p.kg)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      <polygon points={`${x(0)},${H - B} ${line} ${x(data.length - 1)},${H - B}`} fill="var(--accent-soft)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {data.map((p, i) => {
        const d = i ? p.kg - data[i - 1].kg : 0, good = !dir || !i || d === 0 ? "var(--accent)" : (dir === "down" ? d < 0 : d > 0) ? "var(--ok)" : "var(--warn)";
        return <g key={p.day}>
          <circle cx={x(i)} cy={y(p.kg)} r={i === data.length - 1 ? 5 : 3.5} fill={good} />
          {(i === data.length - 1 || i === 0 || data.length <= 6) && <text x={x(i)} y={y(p.kg) - 9} fontSize="10.5" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="var(--fg)">{String(p.kg).replace(".", ",")}{unit === "%" ? "%" : ""}</text>}
          <text x={x(i)} y={H - 6} fontSize="9.5" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="var(--mute)">{p.day.slice(8)}/{p.day.slice(5, 7)}</text>
        </g>;
      })}
    </svg>
  );
}

function LineChart({ data, unit }) {
  const W = 320, H = 110, P = 30, vals = data.map((p) => p.kg);
  const lo = Math.floor(Math.min(...vals) - 0.5), hi = Math.ceil(Math.max(...vals) + 0.5);
  const x = (i) => P + (i * (W - P - 10)) / Math.max(1, data.length - 1), y = (v) => 10 + ((hi - v) * (H - 30)) / (hi - lo);
  const line = data.map((p, i) => `${x(i)},${y(p.kg)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%" }}>
      {[lo, hi].map((v) => <g key={v}><line x1={P} x2={W - 10} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x="0" y={y(v) + 4} fontSize="10" fill="var(--mute)">{v}</text></g>)}
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx={x(data.length - 1)} cy={y(vals.at(-1))} r="4" fill="var(--accent)" />
      <text x={x(data.length - 1)} y={y(vals.at(-1)) - 8} fontSize="11" textAnchor="end" fill="var(--fg)">{String(vals.at(-1)).replace(".", ",")}{unit}</text>
    </svg>
  );
}

export { WeightChart, WeekBars, LineChart };
