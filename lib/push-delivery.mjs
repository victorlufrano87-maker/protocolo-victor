import { createHash, timingSafeEqual } from "node:crypto";

export function validCronAuthorization(header, secret) {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function deliverPush({ db, uid, key, subscriptions, payload, send }) {
  const legacy = await db.from("sent_log").select("key").eq("user_id", uid).eq("key", key).maybeSingle();
  if (legacy.error) throw legacy.error;
  if (legacy.data) return 0;
  let sent = 0;
  for (const sub of subscriptions) {
    const deliveryKey = `${key}:${createHash("sha256").update(sub.endpoint).digest("hex")}`;
    const claim = await db.rpc("claim_push_delivery", { p_uid: uid, p_key: deliveryKey });
    if (claim.error) throw claim.error;
    if (!claim.data) continue;
    try {
      await send(sub.sub, JSON.stringify(payload)); sent++;
      const ack = await db.from("sent_log").update({ delivered_at: new Date().toISOString(), lease_until: null }).eq("user_id", uid).eq("key", deliveryKey);
      if (ack.error) throw ack.error;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        const removed = await db.from("push_subs").delete().eq("user_id", uid).eq("endpoint", sub.endpoint);
        if (removed.error) throw removed.error;
      }
      const release = await db.from("sent_log").update({ lease_until: new Date(0).toISOString() }).eq("user_id", uid).eq("key", deliveryKey).is("delivered_at", null);
      if (release.error) throw release.error;
    }
  }
  return sent;
}
