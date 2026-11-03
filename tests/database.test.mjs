import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const owner = "11111111-1111-4111-8111-111111111111", other = "22222222-2222-4222-8222-222222222222", day = "2026-11-03";
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table storage.buckets(id text primary key, name text, public boolean);
  create table storage.objects(bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name,'/') $$;
  grant usage on schema public,auth,storage to anon,authenticated,service_role;
  insert into auth.users values('${owner}'),('${other}');
`);
await db.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
  grant usage,select on all sequences in schema public to authenticated,service_role;
  grant select,insert,delete on storage.objects to authenticated;
`);
const migration = await readFile(new URL("../supabase/migrations/20261103_reliability.sql", import.meta.url), "utf8");
await db.exec(migration);
await db.exec(migration); // Safe to rerun after an interrupted deployment.
const as = async (role, uid, fn) => {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub','${uid || ""}',false)`);
  try { return await fn(); } finally { await db.exec("reset role"); }
};
let id = 0;
const op = (kind, patch, opId = `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`) => db.query("select public.apply_sync_operation($1,$2,$3,$4::jsonb)", [opId, kind, day, JSON.stringify(patch)]);

test("database migration, RLS, atomic writes, idempotency and delivery leases", async (t) => {
  await t.test("water retries are idempotent, and independent checks merge", () => as("authenticated", owner, async () => {
    const fixed = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await op("day", { water_delta: 250, checks: { a: true } }, fixed);
    await op("day", { water_delta: 250, checks: { a: true } }, fixed);
    await op("day", { water_delta: 500, checks: { b: true } });
    const { rows: [row] } = await db.query("select * from day_logs");
    assert.equal(row.water_ml, 750); assert.deepEqual(row.checks, { a: true, b: true });
  }));
  await t.test("settings merge nested fields and allow explicit deletion", () => as("authenticated", owner, async () => {
    await op("settings", { supplies: { _loads: { supino: 20 }, _shop: ["arroz"] } });
    await op("settings", { supplies: { _loads: { agachamento: 30 }, _shop: null } });
    const { rows: [row] } = await db.query("select supplies from settings");
    assert.deepEqual(row.supplies, { _loads: { supino: 20, agachamento: 30 } });
  }));
  await t.test("weight updates preserve the original row, and invalid operations roll back", () => as("authenticated", owner, async () => {
    await op("weight", { kg: 72.4 });
    const { rows: [before] } = await db.query("select * from weights");
    await op("weight", { kg: 72 });
    const { rows } = await db.query("select * from weights");
    assert.equal(rows.length, 1); assert.equal(rows[0].id, before.id); assert.equal(+rows[0].kg, 72);
    await assert.rejects(op("weight", { kg: 0 }));
    assert.equal(+(await db.query("select kg from weights")).rows[0].kg, 72);
  }));
  await t.test("another user cannot read or modify the owner's rows", () => as("authenticated", other, async () => {
    assert.equal((await db.query("select * from day_logs")).rows.length, 0);
    assert.equal((await db.query("update weights set kg=99 returning *")).rows.length, 0);
    await op("day", { checks: { private: true } });
    assert.equal((await db.query("select * from day_logs")).rows[0].user_id, other);
    await assert.rejects(db.query("select * from sent_log"));
    await assert.rejects(db.query("select consume_ai_quota($1,40)", [owner]));
    await assert.rejects(db.query("select claim_push_delivery($1,'x')", [owner]));
  }));
  await t.test("anonymous requests cannot execute write functions", () => as("anon", "", async () => {
    await assert.rejects(op("day", { water_delta: 100 }));
    await assert.rejects(db.query("select * from sent_log"));
  }));
  await t.test("photo replacement commits metadata before cleanup and rejects a missing object", () => as("authenticated", owner, async () => {
    const first = `${owner}/daily/${day}-rosto-first.jpg`, next = `${owner}/daily/${day}-rosto-next.jpg`;
    await db.query("insert into storage.objects values('fotos',$1),('fotos',$2)", [first,next]);
    await db.query("select replace_daily_photo($1,'rosto',$2)", [day,first]);
    await assert.rejects(db.query("select replace_daily_photo($1,'rosto',$2)", [day,`${owner}/daily/${day}-rosto-missing.jpg`]));
    assert.equal((await db.query("select path from photos")).rows[0].path, first);
    const { rows: [row] } = await db.query("select replace_daily_photo($1,'rosto',$2) as old", [day,next]);
    assert.deepEqual(row.old, [first]); assert.equal((await db.query("select path from photos")).rows[0].path, next);
    assert.equal((await db.query("select * from storage.objects")).rows.length, 2);
  }));
  await t.test("AI quota is enforced centrally", () => as("service_role", "", async () => {
    for (let i = 0; i < 6; i++) assert.equal((await db.query("select consume_ai_quota($1,40) as ok", [owner])).rows[0].ok, true);
    assert.equal((await db.query("select consume_ai_quota($1,40) as ok", [owner])).rows[0].ok, false);
    assert.equal((await db.query("select consume_ai_quota($1,1) as ok", [other])).rows[0].ok, true);
    assert.equal((await db.query("select consume_ai_quota($1,1) as ok", [other])).rows[0].ok, false);
  }));
  await t.test("delivery lease blocks overlapping runs and allows retry after transient failure", () => as("service_role", "", async () => {
    const claim = () => db.query("select claim_push_delivery($1,'2026-11-03:m1-on:device') as ok", [owner]);
    assert.equal((await claim()).rows[0].ok, true); assert.equal((await claim()).rows[0].ok, false);
    await db.exec("update sent_log set lease_until=now()-interval '1 minute'");
    assert.equal((await claim()).rows[0].ok, true);
    await db.exec("update sent_log set delivered_at=now(),lease_until=null");
    assert.equal((await claim()).rows[0].ok, false);
  }));
});

test.after(() => db.close());
