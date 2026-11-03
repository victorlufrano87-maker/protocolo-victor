import { trainingAccess, check, fail, json } from "@/lib/training/server";
export const dynamic = "force-dynamic";
export async function GET(req) {
  try {
    const {
      uid,
      isOwner,
      db
    } = await trainingAccess(req);
    const [profile, plans, sessions, photos] = await Promise.all([db.from("training_profiles").select("*").eq("user_id", uid).maybeSingle(), db.from("training_plans").select("*").eq("user_id", uid).order("created_at", {
      ascending: false
    }).limit(1), db.from("training_sessions").select("*").eq("user_id", uid).order("completed_at", {
      ascending: false
    }).limit(30), db.from("training_photos").select("*").eq("user_id", uid).order("created_at", {
      ascending: false
    }).limit(12)]);
    return json({
      isOwner,
      profile: check(profile),
      plan: check(plans)?.[0] || null,
      sessions: check(sessions) || [],
      photos: check(photos) || []
    });
  } catch (e) {
    return fail(e);
  }
}
