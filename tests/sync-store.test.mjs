import test from "node:test";
import assert from "node:assert/strict";
import { createSyncStore, EMPTY_DAY } from "../lib/sync-store.mjs";

const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) || null, setItem: (k, v) => data.set(k, v) }; };
const deferred = () => { let resolve; return { promise: new Promise((r) => { resolve = r; }), resolve: () => resolve() }; };
const day = "2026-11-03";
const make = (options = {}) => createSyncStore({ uid: "u", storage: memory(), send: async () => ({}), ...options });

test("new changes survive a response to an older write and flush calls share one flight", async () => {
  const gate = deferred(), sent = [];
  const store = make({ send: async (op) => { sent.push(op); if (sent.length === 1) await gate.promise; return {}; } });
  store.saveDay(day, { checks: { a: true } });
  const first = store.flush(); assert.equal(first, store.flush());
  store.saveDay(day, { checks: { b: true } });
  gate.resolve(); await first;
  assert.equal(sent.length, 2); assert.deepEqual(store.snapshot().week[day].checks, { a: true, b: true });
  assert.equal(store.snapshot().queue.length, 0);
});

test("offline edits and weights survive closing and reopening, with the same operation ID", async () => {
  const storage = memory(), first = make({ storage, send: async () => ({ error: new Error("offline") }) });
  first.saveWeight(day, 72.4); first.saveDay(day, { water_ml: 250 });
  const id = first.snapshot().queue[0].id;
  await assert.rejects(first.flush());
  const reopened = make({ storage });
  assert.equal(reopened.snapshot().weights[0].kg, 72.4);
  assert.equal(reopened.snapshot().queue[0].id, id);
  assert.equal(reopened.snapshot().week[day].water_ml, 250);
  await reopened.flush(); assert.equal(reopened.snapshot().queue.length, 0);
});

test("stale settings spreads cannot undo a newer unrelated setting", () => {
  const store = make(), baseline = store.snapshot().settings;
  store.saveSettings({ supplies: { ...baseline.supplies, _loads: { supino: "20" } } }, baseline);
  store.saveSettings({ supplies: { ...baseline.supplies, _shop: ["arroz"] } }, baseline);
  assert.deepEqual(store.snapshot().settings.supplies, { _loads: { supino: "20" }, _shop: ["arroz"] });
});

test("refresh cannot replace a local edit even after that edit finishes syncing", async () => {
  const store = make(), revision = store.snapshot().revision;
  store.saveDay(day, { checks: { a: true } }); await store.flush();
  assert.equal(store.hydrate({ week: {} }, revision), false);
  assert.equal(store.snapshot().week[day].checks.a, true);
});

test("unchecking, deleting a swap and water deltas survive serialization", () => {
  const store = make(); store.saveDay(day, { checks: { a: true }, swaps: { a: "ovo" }, water_ml: 250 });
  store.saveDay(day, { checks: { a: false }, swaps: { a: undefined }, water_ml: 0 });
  const state = JSON.parse(JSON.stringify(store.snapshot()));
  assert.equal(state.week[day].checks.a, false); assert.deepEqual(state.week[day].swaps, {});
  assert.equal(state.queue[1].patch.swaps.a, null); assert.equal(state.queue[1].patch.water_delta, -250);
});

test("storage failure leaves the optimistic state untouched", () => {
  let fail = false; const storage = memory(), set = storage.setItem;
  storage.setItem = (...args) => { if (fail) throw new Error("quota"); set(...args); };
  const store = make({ storage }); fail = true;
  assert.throws(() => store.saveDay(day, { checks: { a: true } }));
  assert.deepEqual(store.snapshot().week, {}); assert.deepEqual(store.snapshot().queue, []);
});

test("legacy pending data is migrated without discarding it", () => {
  const storage = memory(); storage.setItem("pv_week_u", JSON.stringify({ [day]: { ...EMPTY_DAY, water_ml: 500 } }));
  storage.setItem("pv_out_u", JSON.stringify([day]));
  const store = make({ storage }); assert.equal(store.snapshot().queue[0].patch.water_ml, 500);
});
