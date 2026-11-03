import { trainingAccess, check, fail, json, input } from "@/lib/training/server";
import { validateProfile, screening } from "@/lib/training/domain.mjs";
export async function POST(req) {
  try {
    const {
      uid,
      db
    } = await trainingAccess(req);
    const answers = validateProfile(await input(req));
    const row = check(await db.from("training_profiles").upsert({
      user_id: uid,
      answers,
      photo_consent: answers.photoConsent,
      updated_at: new Date().toISOString()
    }).select("*").single());
    return json({
      profile: row,
      screening: screening(answers)
    });
  } catch (e) {
    return fail(e);
  }
}
