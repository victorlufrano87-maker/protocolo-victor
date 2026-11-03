// Coach diário: lê o resumo dos dados do Victor e devolve orientações curtas.
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const maxDuration = 30;

const SYS = `Você é o coach pessoal de treino e dieta do Victor, dentro do app dele. Ele tem TDAH: seja curto, direto e prático, em português do Brasil.
Objetivo dele: recomposição até 31/12 (perder gordura da barriga/pneu, ganhar peito, costas e braço), treina à noite, trabalha sentado.
Regras: baseie-se SÓ nos dados recebidos; não invente números; não dê diagnóstico médico; mudanças grandes de dieta → sugerir confirmar com nutricionista.
Sem markdown pesado: no máximo bullets curtos.`;

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "nokey" }, { status: 501 });
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ error: "auth" }, { status: 401 });
  const { ctx, question } = await req.json();
  const ask = question
    ? `Pergunta do Victor: ${String(question).slice(0, 500)}\nResponda em até 6 linhas.`
    : `Monte o plano de HOJE em exatamente este formato (cada linha curta, máx. 15 palavras):
🎯 Foco do dia: ...
🏋️ Treino: ...
🍽️ Comida: ...
💧 Hábito: ...
⚠️ Atenção: ... (só se houver algo nos dados; senão omita a linha)
📈 Leitura do corpo: ... (1 frase sobre a tendência)`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.COACH_MODEL || "claude-sonnet-5-5", max_tokens: 2000, system: SYS,
      messages: [{ role: "user", content: `Dados (JSON):\n${JSON.stringify(ctx).slice(0, 12000)}\n\n${ask}` }] }),
  });
  if (!r.ok) return Response.json({ error: "api", detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const j = await r.json();
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("").trim();
  if (!text) return Response.json({ error: "empty", detail: JSON.stringify(j).slice(0, 300) }, { status: 502 });
  return Response.json({ text });
}
