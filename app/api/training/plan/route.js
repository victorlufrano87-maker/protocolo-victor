import { trainingAccess, generateTraining, fail, json } from "@/lib/training/server";
export const maxDuration = 30;
export async function POST(req) {
  try {
    const {
      uid,
      db
    } = await trainingAccess(req);
    return json({
      plan: await generateTraining(db, uid)
    });
  } catch (e) {
    return fail(e);
  }
}
