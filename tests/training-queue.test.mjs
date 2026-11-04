import test from "node:test";
import assert from "node:assert/strict";
import { isPermanentFailure, clearUserStorage } from "../lib/training/queue.mjs";
test("only content rejections leave the offline queue; auth, limits, server and network errors are retried", () => {
  for (const s of [400, 404, 409, 413, 422]) assert.equal(isPermanentFailure(s), true, s);
  for (const s of [undefined, 0, 401, 403, 408, 425, 429, 500, 503]) assert.equal(isPermanentFailure(s), false, s);
});
test("sign-out cleanup removes only the current user's keys", () => {
  const data = new Map([["training_queue_u1", "[]"], ["training_cache_u1", "{}"], ["training:u1:x", "1"], ["training_queue_u2", "[]"], ["sb-auth", "t"]]);
  const storage = { get length() { return data.size; }, key: i => [...data.keys()][i], removeItem: k => data.delete(k) };
  assert.equal(clearUserStorage(storage, "u1"), 3);
  assert.deepEqual([...data.keys()], ["training_queue_u2", "sb-auth"]);
});
