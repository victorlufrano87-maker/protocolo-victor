import { trainingAccess, check, fail, json, input } from "@/lib/training/server";
import { TrainingError } from "@/lib/training/domain.mjs";
export async function GET(req) {
  try {
    const {
      db
    } = await trainingAccess(req, {
      ownerOnly: true
    });
    return json({
      members: check(await db.from("training_members").select("user_id,email,status,created_at").order("created_at", {
        ascending: false
      })) || []
    });
  } catch (e) {
    return fail(e);
  }
}
export async function POST(req) {
  try {
    const {
        uid,
        db,
        user
      } = await trainingAccess(req, {
        ownerOnly: true
      }),
      body = await input(req);
    if (body.userId) {
      if (!["active", "paused"].includes(body.status)) throw new TrainingError("Status inválido.");
      check(await db.from("training_members").update({
        status: body.status
      }).eq("user_id", body.userId));
      return json({
        ok: true
      });
    }
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new TrainingError("Informe um e-mail válido.");
    if (email === user.email?.toLowerCase()) throw new TrainingError("Sua conta já tem acesso. Use o e-mail do seu amigo.");
    const origin = new URL(req.url).origin;
    let {
      data,
      error
    } = await db.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: `${origin}/treino`,
        data: {
          training_pilot: true
        }
      }
    });
    if (error) {
      const retry = await db.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: {
          redirectTo: `${origin}/treino`
        }
      });
      data = retry.data;
      error = retry.error;
    }
    if (error || !data?.user || !data?.properties?.action_link) throw new TrainingError("Não consegui gerar o convite. Confira se esse e-mail já tem cadastro e a configuração de redirecionamento no Supabase.");
    const updated = await db.auth.admin.updateUserById(data.user.id, {
      user_metadata: {
        ...data.user.user_metadata,
        training_pilot: true
      }
    });
    if (updated.error) throw new TrainingError("Não consegui preparar a conta convidada.", 503);
    check(await db.from("training_members").upsert({
      user_id: data.user.id,
      email,
      invited_by: uid,
      status: "active"
    }));
    return json({
      link: data.properties.action_link
    });
  } catch (e) {
    return fail(e);
  }
}
