import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { MEALS, WATER_GOAL, SUPPLIES, PREP, WEEK_BASIC, PREWORKOUT, stockLeft, effectiveNow, LETTERS, mealTime, trainTime, mealIsDone, dayScore, weekday, weekShop, fmtQty } from "@/lib/plan";
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
    const divs = +(times.divs || 5), nextL = LETTERS[(+(times.next || 0)) % divs];
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

    // pesagem: toda segunda + sábado 03/10/2026 (primeira execução), 06:40
    if ((wd === 1 || day === "2026-10-03") && inWin(min, 6 * 60 + 40)) {
      const { data: w } = await db.from("weights").select("id").eq("user_id", uid).eq("day", day);
      if (!w?.length) msgs.push(["pesar", "⚖️ Hora de se pesar", "Em jejum, depois do banheiro e antes de comer ou beber. Pese no OKOK e feche o app: os dados vão sozinhos para o Protocolo."]);
    }

    // fotos do dia (07:10 e reforço 19:00)
    for (const h of [7 * 60 + 10, 19 * 60]) {
      if (inWin(min, h)) {
        const { data: ph } = await db.from("photos").select("path").eq("user_id", uid).eq("day", day).like("path", `${uid}/daily/%`);
        const has = (t) => (ph || []).some((p) => p.path.includes(`-${t}-`));
        const miss = [["rosto", "rosto"], ["corpo", "corpo de frente"]].filter(([t]) => !has(t)).map(([, l]) => l);
        if (miss.length) msgs.push([`foto-${h}`, "📸 Fotos do dia", `Falta: ${miss.join(" e ")}. Mesmo lugar, luz e distância.`]);
      }
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

    // suplementos pendentes: reforço 30 e 60 min depois do horário
    for (const m of MEALS) {
      if (m.workout || checks._free === m.id) continue;
      const tgt = merge[m.id] && merge[m.id] !== "skip" ? MEALS.find((x) => x.id === merge[m.id]) : m;
      if (merge[m.id] === "skip") continue;
      const pend = m.items.map((it, i) => ({ it, k: `${m.id}-${i}` })).filter(({ it, k }) => it.sup && !checks[k]);
      if (!pend.length) continue;
      const t = toMin(tOf(tgt)), names = pend.map(({ it }) => it.short).join(", ");
      for (const extra of [30, 60]) if (inWin(min, t + extra, 5)) msgs.push([`sup-${m.id}-${extra}`, "💊 Falta tomar", `${names} (${m.name.toLowerCase()}). Já tomou? Marque no app.`]);
    }

    // treino não feito às 20:00 (se a semana ainda não fechou 5 treinos)
    if (!log?.workout_at && inWin(min, 20 * 60)) {
      const mon = addDays(day, -((wd + 6) % 7));
      const { data: wl } = await db.from("day_logs").select("workout_at").eq("user_id", uid).gte("day", mon).lte("day", day);
      const n = (wl || []).filter((x) => x.workout_at).length;
      if (n < 5) msgs.push(["treino-20", `Treino ${nextL} ainda não feito`, `Semana: ${n}/5 treinos. Ainda dá tempo? Se não, o treino ${nextL} fica para amanhã.`]);
    }

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

    // hora de dormir (30 min antes)
    if (times.sleep_on !== false) {
      const sl = toMin(times.sleep || "23:00");
      if (inWin(min, sl - 30)) msgs.push(["sono", `Dormir às ${times.sleep || "23:00"}`, "Hora de desacelerar: tela mais escura, sem cafeína. Sono bom = menos fome e treino melhor."]);
    }

    // marmitas acabando (19:00)
    if (inWin(min, 19 * 60)) {
      const prep = st?.supplies?._prep || {};
      const low = PREP.filter((p) => prep[p.id] !== undefined && prep[p.id] <= 2);
      if (low.length) msgs.push(["marmitas", "Marmitas acabando", low.map((p) => `${p.name}: ${prep[p.id]}`).join("\n") + "\nProgramar cozinhar amanhã."]);
    }

    // compras da semana (sábado 09:00)
    if (wd === 6 && inWin(min, 9 * 60)) {
      const extra = (st?.supplies?._shop || []).filter((n) => !WEEK_BASIC.includes(n));
      const lowStock = SUPPLIES.map((s) => [s, stockLeft(s, st?.supplies?._stock?.[s.id], day)]).filter(([, r]) => r && r.days <= 10).map(([s]) => s.name);
      msgs.push(["compras", "Compras da semana", `Básico: frango 2,8 kg, arroz 1 kg, feijão, aveia, pão integral, requeijão, frutas, folhas.${extra.length ? `\nNa lista: ${extra.slice(0, 6).join(", ")}` : ""}${lowStock.length ? `\nAcabando: ${lowStock.join(", ")}` : ""}\nAba Compras → "Adicionar compra básica da semana".`]);
    }

    // Mounjaro (sábado 21:00 + reforço 22:00 se não marcou)
    if (wd === 6 && inWin(min, 21 * 60)) msgs.push(["mounjaro", "Mounjaro hoje", "Dia da aplicação. Depois de aplicar, marque no app (Hoje → Mounjaro)."]);
    if (wd === 6 && inWin(min, 22 * 60) && !checks._mj) msgs.push(["mounjaro-2", "Mounjaro ainda não marcado", "Já aplicou? Marque no app."]);

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
