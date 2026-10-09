import { createClient } from "@supabase/supabase-js";
import { dayScore, WATER_GOAL, START_WEIGHT } from "@/lib/plan";
import { spNow, addDays, fmtDay } from "@/lib/supabase";
import PrintButton from "./print";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acompanhamento · Protocolo Victor", robots: { index: false } };

export default async function Personal({ params }) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const token = String(params.token || "").replace(/[^a-f0-9]/g, "");
  if (token.length < 16) return <div className="wrap"><h1>Link inválido</h1></div>;
  const { data: st } = await db.from("settings").select("user_id, update_date").eq("supplies->>_token", token).maybeSingle();
  if (!st) return <div className="wrap"><h1>Link desativado</h1><p className="tag">Peça um novo link ao aluno.</p></div>;

  const today = spNow().day, from = addDays(today, -27);
  const [{ data: logs }, { data: weights }] = await Promise.all([
    db.from("day_logs").select("*").eq("user_id", st.user_id).gte("day", from),
    db.from("weights").select("day, kg").eq("user_id", st.user_id).order("day"),
  ]);
  const map = Object.fromEntries((logs || []).map((l) => [l.day, l]));
  const days = Array.from({ length: 28 }, (_, i) => addDays(from, i));
  const avg = (f) => Math.round(days.reduce((a, d) => a + f(map[d]), 0) / days.length);
  const adh = avg((l) => dayScore(l));
  const water = avg((l) => l?.water_ml || 0);
  const trains = days.filter((d) => map[d]?.workout_at).length;
  const free = days.filter((d) => map[d]?.checks?._free).length;
  const merges = days.filter((d) => Object.values(map[d]?.checks?._merge || {}).some((v) => v !== "skip")).length;
  const bios = days.filter((d) => map[d]?.checks?._bio).map((d) => [d, map[d].checks._bio]);
  const meds = days.filter((d) => map[d]?.checks?._med).map((d) => [d, map[d].checks._med]);
  const cis = days.filter((d) => map[d]?.checks?._ci).map((d) => [d, map[d].checks._ci]);
  const last = weights?.at(-1);
  const f = (d) => fmtDay(d, { day: "2-digit", month: "2-digit" });

  return (
    <div className="wrap report">
      <div className="lbl">Relatório de acompanhamento · {f(from)} a {f(today)}</div>
      <h1>Protocolo Victor</h1>
      <div className="tag">Plano: Dr. Victor Rocha · 2.239 kcal · 199 g PTN · água 2,6 L</div>
      <div className="card"><div className="stats">
        {[["Adesão dieta", adh + "%"], ["Água/dia", (water / 1000).toFixed(1).replace(".", ",") + " L"], ["Treinos", trains], ["Peso", last ? `${String(last.kg).replace(".", ",")} kg` : "—"]].map(([l, v]) =>
          <div key={l}><div className="lbl">{l}</div><div className="num stat">{v}</div></div>)}
      </div>
        <div className="tag">Peso inicial 72,4 kg{last ? ` · variação ${(last.kg - START_WEIGHT >= 0 ? "+" : "")}${(last.kg - START_WEIGHT).toFixed(1).replace(".", ",")} kg` : ""} · refeições livres: {free} · refeições repostas: {merges}</div></div>

      <div className="card"><h2>Dia a dia</h2>
        <table><thead><tr><td>Dia</td><td>Dieta</td><td>Água</td><td>Treino</td></tr></thead><tbody>
          {days.slice().reverse().map((d) => { const l = map[d]; return <tr key={d}><td>{fmtDay(d, { weekday: "short", day: "2-digit", month: "2-digit" })}</td><td className="q">{dayScore(l)}%</td><td className="q">{((l?.water_ml || 0) / 1000).toFixed(1).replace(".", ",")} L</td><td>{l?.workout_at ? "✓" : ""}{l?.checks?._free ? " livre" : ""}</td></tr>; })}
        </tbody></table></div>

      <div className="card"><h2>Peso em jejum</h2>
        {weights?.length ? <table><tbody>{weights.slice(-10).reverse().map((w) => <tr key={w.day + w.kg}><td>{f(w.day)}</td><td className="q">{String(w.kg).replace(".", ",")} kg</td></tr>)}</tbody></table> : <div className="tag">Sem registros.</div>}</div>

      <div className="card"><h2>Bioimpedância</h2>
        {bios.length ? <table><thead><tr><td>Dia</td><td>Peso</td><td>Gord.</td><td>Magra</td></tr></thead><tbody>
          {bios.map(([d, m]) => <tr key={d}><td>{f(d)}</td><td className="q">{m.peso ? String(m.peso).replace(".", ",") : "—"}</td><td className="q">{m.gordura ? String(m.gordura).replace(".", ",") + "%" : "—"}</td><td className="q">{m.magra ? String(m.magra).replace(".", ",") : "—"}</td></tr>)}
        </tbody></table> : <div className="tag">Sem dados de balança no período.</div>}</div>

      <div className="card"><h2>Medidas (cm)</h2>
        {meds.length ? <table><thead><tr><td>Dia</td><td>Cint.</td><td>Abd.</td><td>Quad.</td><td>Peito</td><td>Ombro</td><td>Braço</td><td>Coxa</td></tr></thead><tbody>
          {meds.map(([d, m]) => <tr key={d}><td>{f(d)}</td>{["cintura", "abdomen", "quadril", "peito", "ombro", "braco", "coxa"].map((k) => <td key={k} className="q">{m[k] ? String(m[k]).replace(".", ",") : "—"}</td>)}</tr>)}
        </tbody></table> : <div className="tag">Sem medidas no período.</div>}</div>

      <div className="card"><h2>Check-ins (1 a 5)</h2>
        {cis.length ? <table><tbody>{cis.map(([d, c]) => <tr key={d}><td>{f(d)}</td><td className="tag">fome {c.fome} · energia {c.energia} · sono {c.sono} · intestino {c.intestino} · treinos {c.treino}</td></tr>)}</tbody></table> : <div className="tag">Sem check-ins no período.</div>}</div>

      <PrintButton />
    </div>
  );
}
