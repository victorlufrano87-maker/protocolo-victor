import { trainingAccess, check, fail, json, input } from "@/lib/training/server";
import { TrainingError } from "@/lib/training/domain.mjs";
export async function POST(req) {
  try {
    const {
        uid,
        db
      } = await trainingAccess(req),
      body = await input(req),
      {
        path
      } = body;
    if (body.consent === true) {
      const current = check(await db.from("training_profiles").select("answers").eq("user_id", uid).maybeSingle());
      if (!current) throw new TrainingError("Preencha seu perfil antes de enviar fotos.");
      check(await db.from("training_profiles").update({
        photo_consent: true,
        answers: {
          ...current.answers,
          photoConsent: true
        }
      }).eq("user_id", uid));
      return json({
        ok: true
      });
    }
    const profile = check(await db.from("training_profiles").select("photo_consent").eq("user_id", uid).maybeSingle());
    if (!profile?.photo_consent || typeof path !== "string" || !new RegExp(`^${uid}/[a-f0-9-]{36}\\.jpg$`).test(path)) throw new TrainingError("Confirme o consentimento para guardar a foto.");
    const files = check(await db.storage.from("training-photos").list(uid, {
      search: path.split("/")[1]
    }));
    if (!files?.some(f => `${uid}/${f.name}` === path)) throw new TrainingError("Envie a foto antes de confirmar.");
    const photo = check(await db.from("training_photos").upsert({
      user_id: uid,
      path
    }, {
      onConflict: "path"
    }).select("*").single());
    return json({
      photo
    });
  } catch (e) {
    return fail(e);
  }
}
export async function DELETE(req) {
  try {
    const {
        uid,
        db
      } = await trainingAccess(req),
      {
        id
      } = await input(req);
    const row = check(await db.from("training_photos").select("*").eq("id", id).eq("user_id", uid).maybeSingle());
    if (!row) throw new TrainingError("Foto não encontrada.", 404);
    check(await db.storage.from("training-photos").remove([row.path]));
    check(await db.from("training_photos").delete().eq("id", row.id).eq("user_id", uid));
    return json({
      ok: true
    });
  } catch (e) {
    return fail(e);
  }
}
