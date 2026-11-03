import test from "node:test";
import assert from "node:assert/strict";
import { requireTrainingAccess } from "../lib/training/access.mjs";
const env = {
  APP_OWNER_ID: "owner",
  NEXT_PUBLIC_SUPABASE_URL: "url",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service"
};
const req = () => new Request("https://test.local", {
  headers: {
    authorization: "Bearer test"
  }
});
function client(uid, status, error) {
  return (_url, key) => key === "anon" ? {
    auth: {
      getUser: async () => ({
        data: {
          user: uid ? {
            id: uid
          } : null
        }
      })
    }
  } : {
    from: () => ({
      select: () => ({
        eq: (column, id) => {
          assert.equal(column, "user_id");
          assert.equal(id, uid);
          return {
            maybeSingle: async () => ({
              data: status ? {
                status
              } : null,
              error
            })
          };
        }
      })
    })
  };
}
test("only owner can create invitations; invited active accounts can use training", async () => {
  assert.equal((await requireTrainingAccess(req(), {
    env,
    createClient: client("owner"),
    ownerOnly: true
  })).isOwner, true);
  assert.equal((await requireTrainingAccess(req(), {
    env,
    createClient: client("friend", "active")
  })).isOwner, false);
  await assert.rejects(requireTrainingAccess(req(), {
    env,
    createClient: client("friend", "active"),
    ownerOnly: true
  }), {
    status: 403
  });
});
test("missing, paused and unverifiable memberships fail closed", async () => {
  for (const state of [null, "paused"]) await assert.rejects(requireTrainingAccess(req(), {
    env,
    createClient: client("friend", state)
  }), {
    status: 403
  });
  await assert.rejects(requireTrainingAccess(req(), {
    env,
    createClient: client("friend", null, "database failed")
  }), {
    status: 503
  });
  await assert.rejects(requireTrainingAccess(req(), {
    env,
    createClient: client(null)
  }), {
    status: 401
  });
});

test("a confirmed self-registered account joins automatically without invitation", async () => {
  let status = null, inserts = 0;
  const user = { id: "new", email: "new@example.com", email_confirmed_at: "2026-11-03T00:00:00Z", user_metadata: { training_pilot: true } };
  const createClient = (_url, key) => key === "anon" ? { auth: { getUser: async () => ({ data: { user } }) } } : {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: status ? { status } : null }) }) }),
      upsert: async (row, options) => { assert.equal(row.user_id, "new"); assert.equal(row.invited_by, "owner"); assert.equal(options.ignoreDuplicates, true); inserts++; status = "active"; return {}; }
    })
  };
  assert.equal((await requireTrainingAccess(req(), { env, createClient })).uid, "new");
  await requireTrainingAccess(req(), { env, createClient });
  assert.equal(inserts, 1);
  status = "paused";
  await assert.rejects(requireTrainingAccess(req(), { env, createClient }), { status: 403 });
  assert.equal(inserts, 1);
});

test("self-registration cannot grant access with an unconfirmed email or override a concurrent pause", async () => {
  let confirmed = false, inserted = false;
  const createClient = (_url, key) => key === "anon" ? { auth: { getUser: async () => ({ data: { user: { id: "new", email: "new@example.com", email_confirmed_at: confirmed ? "2026-11-03" : null, user_metadata: { training_pilot: true } } } }) } } : {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: inserted ? { status: "paused" } : null }) }) }), upsert: async () => { inserted = true; return {}; } })
  };
  await assert.rejects(requireTrainingAccess(req(), { env, createClient }), { code: "email_confirmation" });
  assert.equal(inserted, false);
  confirmed = true;
  await assert.rejects(requireTrainingAccess(req(), { env, createClient }), { code: "invitation" });
});
