import { createClient } from "@supabase/supabase-js";
import { readJson, RequestError } from "@/lib/ai-guard.mjs";
import { forgetMember } from "@/lib/challenge/domain.mjs";
export const maxDuration = 60;
const json = (x, status = 200) => Response.json(x, { status, headers: { "Cache-Control": "no-store" } });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const must = (r, step) => { if (r.error) throw Object.assign(new Error(step), { status: 503, step }); return r.data; };

// Exclusão da própria conta (LGPD). Funciona também para contas pausadas.
// Ordem: arquivos → anonimização nos desafios → tabelas → usuário. Se algo falhar, nada do usuário de autenticação é apagado
// e a pessoa pode repetir: cada etapa é segura para rodar de novo.
export async function DELETE(req) {
  try {
    const env = process.env;
    if (!env.APP_OWNER_ID || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new RequestError(503, "config");
    const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new RequestError(401, "auth");
    const { data, error } = await createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options).auth.getUser(token);
    if (error || !data?.user) throw new RequestError(401, "auth");
    const uid = data.user.id;
    if (uid === env.APP_OWNER_ID) return json({ error: "A conta do proprietário não pode ser excluída por aqui." }, 403);
    const body = await readJson(req, 1000);
    if (body.confirm !== "EXCLUIR") return json({ error: "Digite EXCLUIR para confirmar." }, 400);
    const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);

    // 1. Fotos privadas de treino
    const own = must(await db.storage.from("training-photos").list(uid, { limit: 1000 }), "training_photos_list") || [];
    if (own.length) must(await db.storage.from("training-photos").remove(own.map(f => `${uid}/${f.name}`)), "training_photos_remove");

    // 2. Desafios: anonimiza e apaga as comprovações (inclui desafios com pedido de entrada pendente)
    const asMember = must(await db.from("gym_challenges").select("id,version,state").contains("member_ids", [uid]), "challenges_members") || [];
    const asRequest = must(await db.from("gym_challenges").select("id,version,state").filter("state->requests", "cs", JSON.stringify([{ id: uid }])), "challenges_requests") || [];
    const rows = [...new Map([...asMember, ...asRequest].map(r => [r.id, r])).values()];
    for (const row of rows) {
      let current = row, done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        const { state, files } = forgetMember(current.state, uid, Date.now());
        if (files.length) must(await db.storage.from("challenge-proofs").remove(files), "proofs_remove");
        const live = must(await db.from("gym_challenge_live").select("activity_id").eq("user_id", uid).eq("challenge_id", current.id).maybeSingle(), "live_read");
        const ok = must(await db.rpc("gym_challenge_commit", { p_id: current.id, p_version: current.version, p_state: state, p_actor: uid, p_live: live ? "end" : null, p_activity: live?.activity_id || null }), "challenge_commit");
        if (ok) done = true; else current = must(await db.from("gym_challenges").select("id,version,state").eq("id", row.id).single(), "challenge_reload");
      }
      if (!done) throw Object.assign(new Error("challenge_busy"), { status: 409 });
    }

    // 3. Dados de treino e pessoais (as FKs com cascade cobrem o resto quando o usuário é apagado)
    for (const table of ["training_sessions", "training_plans", "training_photos", "training_profiles", "training_members", "gym_challenge_live"]) must(await db.from(table).delete().eq("user_id", uid), table);

    // 4. Usuário de autenticação
    const removed = await db.auth.admin.deleteUser(uid);
    if (removed.error) throw Object.assign(new Error("auth_delete"), { status: 503 });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof RequestError) return json({ error: e.code === "auth" ? "Entre novamente para excluir a conta." : "Não consegui concluir agora. Tente novamente." }, e.status);
    return json({ error: e.status === 409 ? "Um desafio está sendo atualizado agora. Tente de novo em instantes." : "Não consegui concluir a exclusão. Tente novamente; as etapas já feitas não se repetem." }, e.status || 500);
  }
}
