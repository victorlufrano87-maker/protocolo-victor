import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { MEALS, WATER_GOAL, SUPPLIES } from "@/lib/plan";
import { spNow, toMin, addDays } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Chamado a cada 5 min pelo pg_cron do Supabase
export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response("unauthorized", { status: 401 });

  webpush.setVapidDetails("mailto:" + (process.env.VAPID_EMAIL || "admin@example.com"),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { day, min } = spNow();

  const { data: subs } = await db.from("push_subs").select("*");
  const users = [...new Set((subs || []).map((s) => s.user_id))];
  let sent = 0;

  for (const uid of users) {
    const [{ data: log }, { data: st }] = await Promise.all([
      db.from("day_logs").select("*").eq("user_id", uid).eq("day", day).maybeSingle(),
      db.from("settings").select("*").eq("user_id", uid).maybeSingle(),
    ]);
    const checks = log?.checks || {};
    const times = st?.times || {};
    const msgs = [];

    for (const m of MEALS) {
      const done = m.items.every((_, i) => checks[`${m.id}-${i}`]);
      if (m.workout) {
        // pós-treino: lembra 20 min depois do botão "Terminei o treino" se não marcou
        if (log?.workout_at && !done) {
          const w = spNow(new Date(log.workout_at));
          if (w.day === day && min - w.min >= 20) msgs.push([`pt-late`, "Pós-treino pendente", "40 g de whey + 1 col. de mel. Marque no app."]);
        }
        continue;
      }
      const t = toMin(times[m.id] || m.time);
      const sups = m.items.filter((x) => x.sup).map((x) => x.t.replace(/\s*\(.*\)/, "")).join(", ");
      if (min >= t && min < t + 15 && !done)
        msgs.push([`${m.id}-on`, `Hora do ${m.name}`, sups ? `Não esqueça: ${sups}` : "Toque para ver o que comer."]);
      if (min >= t + 45 && min < t + 60 && !done)
        msgs.push([`${m.id}-late`, `${m.name} ainda pendente`, "Se perdeu, una com a próxima refeição (mas não com frequência)."]);
    }

    // água: confere o ritmo às 10h, 12h, 14h, 16h, 18h e 20h
    const water = log?.water_ml || 0;
    for (const h of [10, 12, 14, 16, 18, 20]) {
      if (min >= h * 60 && min < h * 60 + 15) {
        const expected = Math.round((WATER_GOAL * (h - 7)) / 14 / 50) * 50;
        if (water < expected) msgs.push([`water-${h}`, "Bora beber água", `Você está em ${water} ml. Ideal agora: ${expected} ml de 2.600.`]);
      }
    }
    if (min >= 21 * 60 + 30 && min < 21 * 60 + 45 && water < WATER_GOAL)
      msgs.push(["water-end", "Meta de água", `Faltam ${WATER_GOAL - water} ml para fechar o dia.`]);

    // atualização com o personal
    if (st?.update_date && min >= 7 * 60 + 30 && min < 7 * 60 + 45) {
      if (st.update_date === day) msgs.push(["upd", "Dia de atualização", "Peso em jejum, fotos e feedback para o personal. O app monta o resumo."]);
      if (st.update_date === addDays(day, 1)) msgs.push(["upd-eve", "Atualização amanhã", "Amanhã: pese em jejum e tire as fotos."]);
    }

    // suplementos acabando (5 dias antes)
    for (const s of SUPPLIES) {
      const start = st?.supplies?.[s.id];
      if (start && addDays(start, s.days - 5) === day && min >= 9 * 60 && min < 9 * 60 + 15)
        msgs.push([`sup-${s.id}`, "Suplemento acabando", `${s.name} acaba em ~5 dias. Hora de reabastecer.`]);
    }

    for (const [k, title, body] of msgs) {
      const key = `${day}:${k}`;
      const { error } = await db.from("sent_log").insert({ user_id: uid, key });
      if (error) continue; // já enviado
      for (const s of subs.filter((x) => x.user_id === uid)) {
        try { await webpush.sendNotification(s.sub, JSON.stringify({ title, body, tag: k })); sent++; }
        catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint); }
      }
    }
  }
  await db.from("sent_log").delete().lt("key", addDays(day, -3));
  return Response.json({ ok: true, sent });
}
