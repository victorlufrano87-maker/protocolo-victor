import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { MEALS, WATER_GOAL, SUPPLIES, PREWORKOUT, stockLeft, effectiveNow, LETTERS, mealTime, trainTime, mealIsDone, dayScore, weekday, weekShop, fmtQty } from "@/lib/plan";
import { spNow, toMin, addDays } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const inWin = (min, t, len = 15) => min >= t && min < t + len;

// Chamado a cada 5 min pelo pg_cron do Supabase
export async function GET(req) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return new Response("unauthorized", { status: 401 });

  webpush.setVapidDetails("mailto:" + (process.env.VAPID_EMAIL || "admin@example.com"),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: subs } = await db.from("push_subs").select("*");
  const users = [...new Set((subs || []).map((s) => s.user_id))];
  let sent = 0;

  for (const uid of users) {
    const { data: st } = await db.from("settings").select("*").eq("user_id", uid).maybeSingle();
    const { day, min } = effectiveNow(spNow(), st?.times || {}, addDays);
    const wd = weekday(day);
    const { data: log } = await db.from("day_logs").select("*").eq("user_id", uid).eq("day", day).maybeSingle();
    const checks = log?.checks || {};
    const swaps = log?.swaps || {};
    const merge = checks._merge || {};
    const times = st?.times || {};
    const tOf = (m) => mealTime(m, times, day);
    const msgs = [];
    const divs = +(times.divs || 4), nextL = LETTERS[(+(times.next || 0)) % divs];
    const weighDay = times.weigh !== undefined && times.weigh !== "" && +times.weigh === wd;

    const pendingText = (m) => {
      const srcs = [m, ...Object.entries(merge).filter(([, t]) => t === m.id).map(([s]) => MEALS.find((x) => x.id === s)).filter(Boolean)];
      const pend = srcs.flatMap((x) => x.items.map((it, i) => ({ it, k: `${x.id}-${i}` }))).filter(({ k }) => !checks[k]);
      const foods = pend.filter(({ it }) => !it.sup).map(({ it, k }) => (swaps[k] || it.t).replace(/ \(.*\)$/, "")).join(" · ");
      const sups = pend.filter(({ it }) => it.sup).map(({ it }) => it.short || it.t).join(", ");
      return [foods, sups && `💊 ${sups}`].filter(Boolean).join("\n");
    };

    // bom dia (06:45)
    if (inWin(min, 6 * 60 + 45)) {
      const first = MEALS.filter((m) => !m.workout).sort((a, b) => toMin(tOf(a)) - toMin(tOf(b)))[0];
      const lines = [`Treino ${nextL} às ${trainTime(times, day)}`, `1ª refeição: ${first.name} às ${tOf(first)}`, "Meta: 2,6 L de água"];
      if (weighDay) lines.unshift("⚖️ Dia de pesagem: pese em jejum antes de comer e faça o check-in");
      msgs.push(["bomdia", "Bom dia! Plano de hoje", lines.join("\n")]);
    }

    for (const m of MEALS) {
      const done = mealIsDone(log, m);
      if (m.workout) {
        if (log?.workout_at && !done) {
          const w = spNow(new Date(log.workout_at));
          if (w.day === day && min - w.min >= 20) msgs.push([`pt-late`, "Pós-treino pendente", "40 g de whey + 1 col. de mel. Marque no app."]);
        }
        continue;
      }
      if (done || merge[m.id] || checks._free === m.id) continue;
      const t = toMin(tOf(m)), body = pendingText(m);
      if (inWin(min, t)) msgs.push([`${m.id}-on`, `${tOf(m)} · ${m.name}`, body]);
      const snz = checks._snooze?.[m.id];
      if (snz && inWin(min, snz, 5)) msgs.push([`${m.id}-snz-${snz}`, `Lembrete adiado · ${m.name}`, body]);
      if (!snz && inWin(min, t + 45)) msgs.push([`${m.id}-late`, `${m.name} ainda pendente`, `Falta: ${body}\nSe perdeu, o app sugere como repor.`]);
    }

    // pré-treino (25 min antes)
    if (!log?.workout_at && inWin(min, toMin(trainTime(times, day)) - 30))
      { if (!checks._pre) msgs.push(["pre", `Dila Pump: ${PREWORKOUT.dose}`, `Tome agora em 260 ml de água gelada. Treino ${nextL} às ${trainTime(times, day)}.`]); }

    // treino
    if (!log?.workout_at && inWin(min, toMin(trainTime(times, day))))
      msgs.push(["treino", `Hora do treino ${nextL}`, 'Abra o MFIT. Ao terminar, toque em "Terminei o treino" para liberar o pós-treino.']);

    // água no ritmo
    const water = log?.water_ml || 0;
    for (const h of [10, 12, 14, 16, 18, 20]) {
      if (inWin(min, h * 60)) {
        const expected = Math.round((WATER_GOAL * (h - 7)) / 14 / 50) * 50;
        if (water < expected) msgs.push([`water-${h}`, "Bora beber água", `Você está em ${water} ml. Ideal agora: ${expected} ml de 2.600.`]);
      }
    }

    // resumo da noite (22:00)
    if (inWin(min, 22 * 60)) {
      const sc = dayScore(log);
      const missSup = MEALS.filter((m) => !m.workout && checks._free !== m.id).flatMap((m) => m.items.map((it, i) => ({ it, k: `${m.id}-${i}` }))).filter(({ it, k }) => it.sup && !checks[k]).map(({ it }) => it.short);
      const lines = [];
      if (water < WATER_GOAL) lines.push(`Água: faltam ${WATER_GOAL - water} ml`);
      if (missSup.length) lines.push(`Suplementos pendentes: ${missSup.join(", ")}`);
      if (!lines.length) lines.push("Tudo cumprido. Bom descanso!");
      msgs.push(["noite", `Resumo do dia: ${sc}%`, lines.join("\n")]);
    }

    // meal prep (domingo 10:00)
    if (wd === 0 && inWin(min, 10 * 60)) {
      const top = weekShop(+(times.trainings || 5)).filter(([n]) => /frango|arroz|feij/i.test(n)).map(([n, { q, u }]) => `${n.replace(/ \(.*\)/, "")}: ${fmtQty(q, u)}`);
      msgs.push(["prep", "Meal prep da semana", `${top.join(" · ")}\nLista completa na aba Compras.`]);
    }

    // atualização com o personal
    if (st?.update_date && inWin(min, 7 * 60 + 30)) {
      if (st.update_date === day) msgs.push(["upd", "Dia de atualização", "Peso em jejum, fotos e feedback. O app monta o resumo em Progresso."]);
      if (st.update_date === addDays(day, 1)) msgs.push(["upd-eve", "Atualização amanhã", "Amanhã: pese em jejum e tire as fotos."]);
    }

    // estoque acabando (5 dias antes) — o app já põe na lista de compras
    if (inWin(min, 9 * 60)) {
      const low = SUPPLIES.map((s) => [s, stockLeft(s, st?.supplies?._stock?.[s.id], day)]).filter(([, r]) => r && r.days <= 5);
      if (low.length) msgs.push(["estoque", "Estoque acabando", low.map(([s, r]) => `${s.name}: ~${r.days} dias`).join("\n") + "\nJá está na aba Compras."]);
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
  await db.from("sent_log").delete().lt("key", addDays(spNow().day, -3));
  return Response.json({ ok: true, sent });
}
