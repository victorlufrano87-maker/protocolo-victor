export class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export async function readJson(req, maxBytes) {
  const length = Number(req.headers.get("content-length"));
  if (length > maxBytes) throw new RequestError(413, "size");
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new RequestError(415, "json");
  const reader = req.body?.getReader();
  if (!reader) throw new RequestError(400, "json");
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RequestError(413, "size"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch (e) { if (e instanceof RequestError) throw e; throw new RequestError(400, "json"); }
  finally { reader.releaseLock(); }
}

export async function requireOwner(req, { env = process.env, createClient }) {
  if (!env.APP_OWNER_ID || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new RequestError(503, "config");
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new RequestError(401, "auth");
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) throw new RequestError(401, "auth");
  if (data.user.id !== env.APP_OWNER_ID) throw new RequestError(403, "owner");
  return data.user.id;
}

export async function consumeQuota(uid, { env = process.env, createClient }) {
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const limit = Number(env.AI_DAILY_LIMIT || 40);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new RequestError(503, "config");
  const { data, error } = await db.rpc("consume_ai_quota", { p_uid: uid, p_daily_limit: limit });
  if (error) throw new RequestError(503, "quota");
  if (data !== true) throw new RequestError(429, "limit");
}

export function foodInput(body) {
  const imgs = body.images ?? (body.image ? [body.image] : []);
  if (!Array.isArray(imgs) || imgs.length < 1 || imgs.length > 3 || imgs.some((x) => typeof x !== "string" || !x.length || x.length > 4_000_000 || x.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(x)))
    throw new RequestError(400, "image");
  if (body.mode != null && body.mode !== "scale") throw new RequestError(400, "mode");
  if (body.note != null && (typeof body.note !== "string" || body.note.length > 200)) throw new RequestError(400, "note");
  return imgs;
}

export const requestFailure = (e) => Response.json({ error: e instanceof RequestError ? e.code : "unavailable" }, { status: e instanceof RequestError ? e.status : 502 });
