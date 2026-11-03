// Lê a foto do prato com o Claude e devolve calorias e macros estimados.
// Precisa de ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel.
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const PROMPT = `Você é um nutricionista. Analise a foto do prato e estime cada alimento visível.
Use porções realistas brasileiras (ex.: 1 colher de servir de arroz ≈ 45 g). Se houver texto do usuário, use-o como dica de quantidade ou alimento.
Responda APENAS com JSON válido, sem texto fora dele, no formato:
{"itens":[{"nome":"arroz branco","g":150,"kcal":190,"ptn":4,"carb":42,"gord":0.5}],"total":{"kcal":0,"ptn":0,"carb":0,"gord":0},"confianca":"alta|media|baixa","obs":"uma frase curta"}
Se não houver comida na foto, devolva itens vazio e obs explicando.`;

export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "nokey" }, { status: 501 });
  // só o dono do app pode usar
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user) return Response.json({ error: "auth" }, { status: 401 });

  const { image, note } = await req.json();
  if (!image || image.length > 4_000_000) return Response.json({ error: "image" }, { status: 400 });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.FOOD_MODEL || "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
        { type: "text", text: PROMPT + (note ? `\nDica do usuário: ${String(note).slice(0, 200)}` : "") },
      ] }],
    }),
  });
  if (!r.ok) return Response.json({ error: "api", detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const j = await r.json();
  const txt = (j.content || []).map((c) => c.text || "").join("");
  try {
    const out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    const t = { kcal: 0, ptn: 0, carb: 0, gord: 0 };
    (out.itens || []).forEach((i) => { for (const k in t) t[k] += +i[k] || 0; });
    out.total = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
    return Response.json(out);
  } catch { return Response.json({ error: "parse" }, { status: 502 }); }
}
