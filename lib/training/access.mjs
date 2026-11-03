import { RequestError } from "../ai-guard.mjs";
export async function requireTrainingAccess(req, {
  ownerOnly = false,
  env = process.env,
  createClient
}) {
  if (!env.APP_OWNER_ID || !env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new RequestError(503, "config");
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new RequestError(401, "auth");
  const options = {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    },
    auth = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
  const {
    data,
    error
  } = await auth.auth.getUser(token);
  if (error || !data?.user) throw new RequestError(401, "auth");
  const uid = data.user.id,
    isOwner = uid === env.APP_OWNER_ID;
  if (ownerOnly && !isOwner) throw new RequestError(403, "owner");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  if (!isOwner) {
    const member = await db.from("training_members").select("status").eq("user_id", uid).maybeSingle();
    if (member.error) throw new RequestError(503, "database");
    if (member.data?.status !== "active") throw new RequestError(403, "invitation");
  }
  return {
    uid,
    isOwner,
    db,
    user: data.user
  };
}
