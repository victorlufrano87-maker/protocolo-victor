// Lê a foto do prato com o Claude e devolve calorias e macros estimados.
// Precisa de ANTHROPIC_API_KEY nas variáveis de ambiente da Vercel.
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 30;

const SCALE = `Leia este print de app de balança de bioimpedância (pode haver mais de uma imagem/trecho). Extraia os números exatamente como aparecem.
Responda APENAS JSON: {"data":"AAAA-MM-DD ou null","peso":0,"gordura":0,"gorduraKg":0,"magra":0,"musculo":0,"smm":0,"smmPct":0,"agua":0,"aguaKg":0,"visceral":0,"bmr":0,"imc":0,"proteina":0,"ossea":0,"idadeCorporal":0}
Use null no que não aparecer. Percentuais como número (21.8), não fração.`;
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

  const { image, images, note, mode } = await req.json();
  const imgs = (images || [image]).filter(Boolean).slice(0, 3);
  if (!imgs.length || imgs.some((x) => x.length > 4_000_000)) return Response.json({ error: "image" }, { status: 400 });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.FOOD_MODEL || "claude-sonnet-5-5",
      max_tokens: 800,
      messages: [{ role: "user", content: [
        ...imgs.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
        { type: "text", text: mode === "scale" ? SCALE : PROMPT + (note ? `\nDica do usuário: ${String(note).slice(0, 200)}` : "") },
      ] }],
    }),
  });
  if (!r.ok) return Response.json({ error: "api", detail: (await r.text()).slice(0, 300) }, { status: 502 });
  const j = await r.json();
  const txt = (j.content || []).map((c) => c.text || "").join("");
  try {
    const out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    if (mode === "scale") return Response.json(Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== 0)));
    const t = { kcal: 0, ptn: 0, carb: 0, gord: 0 };
    (out.itens || []).forEach((i) => { for (const k in t) t[k] += +i[k] || 0; });
    out.total = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
    return Response.json(out);
  } catch { return Response.json({ error: "parse" }, { status: 502 }); }
}
