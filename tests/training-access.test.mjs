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
