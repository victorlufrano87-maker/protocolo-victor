import test from "node:test";
import assert from "node:assert/strict";
import { requireOwner, consumeQuota, readJson, foodInput } from "../lib/ai-guard.mjs";
import { validCronAuthorization } from "../lib/push-delivery.mjs";
import { remainingSeconds } from "../lib/rest-timer.mjs";
const env = { APP_OWNER_ID: "owner", NEXT_PUBLIC_SUPABASE_URL: "url", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "secret" };
const req = () => new Request("https://app.test", { headers: { authorization: "Bearer token" } });
const client = (id) => () => ({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } });

test("AI denies other accounts, invalid sessions and missing owner configuration", async () => {
  await assert.rejects(requireOwner(req(), { env, createClient: client("other") }), { status: 403 });
  await assert.rejects(requireOwner(req(), { env, createClient: client(null) }), { status: 401 });
  await assert.rejects(requireOwner(req(), { env: { ...env, APP_OWNER_ID: "" }, createClient: client("owner") }), { status: 503 });
  assert.equal(await requireOwner(req(), { env, createClient: client("owner") }), "owner");
});

test("AI quota failure denies usage, including database failure", async () => {
  for (const result of [{ data: false }, { error: "offline" }])
    await assert.rejects(consumeQuota("owner", { env, createClient: () => ({ rpc: async () => result }) }));
});

test("JSON limit counts actual streamed bytes even without Content-Length", async () => {
  const r = new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: "x".repeat(100) }) });
  await assert.rejects(readJson(r, 20), { status: 413 });
});

test("malformed JSON and non-object bodies return controlled client errors", async () => {
  for (const body of ["{", "null", "[]"]) {
    const r = new Request("https://app.test", { method: "POST", headers: { "content-type": "application/json" }, body });
    await assert.rejects(readJson(r, 100), { status: 400 });
  }
});

test("food validates types, image count, base64 and note length", () => {
  for (const body of [{ images: "x" }, { images: [1] }, { images: ["!!!!"] }, { images: Array(4).fill("YWJj") }, { image: "YWJj", note: "a".repeat(201) }]) assert.throws(() => foodInput(body), { status: 400 });
  assert.deepEqual(foodInput({ image: "YWJj" }), ["YWJj"]);
});

test("cron fails closed when its secret is missing", () => {
  assert.equal(validCronAuthorization("Bearer undefined", undefined), false);
  assert.equal(validCronAuthorization("Bearer abc", "abc"), true);
  assert.equal(validCronAuthorization("Bearer abcd", "abc"), false);
});

test("rest countdown catches up after suspension", () => {
  const deadline = 100000;
  assert.equal(remainingSeconds(deadline, 40000), 60);
  assert.equal(remainingSeconds(deadline, 99500), 1);
  assert.equal(remainingSeconds(deadline, 130000), 0);
});
