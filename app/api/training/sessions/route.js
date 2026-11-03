import { trainingAccess, check, fail, json, input, generateTraining } from "@/lib/training/server";
import { TrainingError, validateSession, screening } from "@/lib/training/domain.mjs";
export const maxDuration = 30;
export async function POST(req) {
  try {
    const {
        uid,
        db
      } = await trainingAccess(req),
      body = await input(req);
    const plan = check(await db.from("training_plans").select("*").eq("id", body.planId).eq("user_id", uid).maybeSingle());
    if (!plan) throw new TrainingError("Proposta não encontrada.", 404);
    const session = validateSession(body, plan.plan);
    const existing = check(await db.from("training_sessions").select("*").eq("id", session.id).eq("user_id", uid).maybeSingle());
    if (existing) return json({
      session: existing
    });
    const profile = check(await db.from("training_profiles").select("answers,updated_at").eq("user_id", uid).maybeSingle());
    // Accept a historical offline record even if the profile changed meanwhile.
    // This records what happened; it never authorizes a new prescription.
    session.feedback.profileChanged = !profile || !screening(profile.answers).ready || new Date(profile.updated_at).getTime() !== new Date(plan.profile_version).getTime();
    const row = check(await db.from("training_sessions").upsert({
      id: session.id,
      user_id: uid,
      plan_id: plan.id,
      workout_id: session.workoutId,
      sets: session.sets,
      feedback: session.feedback,
      completed_at: session.completedAt
    }, {
      onConflict: "id",
      ignoreDuplicates: true
    }).select("*"));
    let adjusted = false;
    if (!session.feedback.pain && !session.feedback.profileChanged) {
      const count = check(await db.from("training_sessions").select("id", {
        count: "exact",
        head: false
      }).eq("user_id", uid).eq("plan_id", plan.id));
      if (count?.length >= 3 && Date.now() - new Date(plan.created_at).getTime() >= 60000) {
        try {
          await generateTraining(db, uid);
          adjusted = true;
        } catch {/* The session stays saved even if re-evaluation is unavailable. */}
      }
    }
    return json({
      session: row?.[0] || {
        id: session.id
      },
      needsReview: session.feedback.pain,
      adjusted
    });
  } catch (e) {
    return fail(e);
  }
}
