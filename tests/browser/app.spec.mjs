import { test, expect } from "@playwright/test";
import { mergePatch } from "../../lib/sync-store.mjs";

const uid = "11111111-1111-4111-8111-111111111111";
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
async function setup(page) {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const token = [Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: uid, exp })).toString("base64url"), "test"].join(".");
  await page.addInitScript(({ uid, token, exp }) => {
    localStorage.setItem("sb-example-auth-token", JSON.stringify({ access_token: token, refresh_token: "local-test", token_type: "bearer", expires_at: exp, user: { id: uid, email: "test@example.com" } }));
  }, { uid, token, exp });
  const remote = { offline: false, settings: { user_id: uid, times: {}, supplies: { _planV: 999 } }, logs: { [day]: { user_id: uid, day, checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null } }, weights: [], seen: new Set() };
  await page.route("https://example.supabase.co/**", async (route) => {
    if (remote.offline) return route.abort("internetdisconnected");
    const req = route.request(), url = new URL(req.url());
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body = [];
    if (url.pathname.endsWith("/settings")) body = remote.settings;
    if (url.pathname.endsWith("/day_logs")) body = Object.values(remote.logs);
    if (url.pathname.endsWith("/weights")) body = remote.weights;
    if (url.pathname.endsWith("/rpc/apply_sync_operation")) {
      const op = req.postDataJSON();
      if (!remote.seen.has(op.p_id)) {
        remote.seen.add(op.p_id);
        if (op.p_kind === "day") {
          const current = remote.logs[op.p_day] || { checks: {}, swaps: {}, water_ml: 0 }, { water_delta, ...fields } = op.p_patch;
          remote.logs[op.p_day] = mergePatch(current, fields);
          if (water_delta !== undefined) remote.logs[op.p_day].water_ml = Math.max(0, current.water_ml + water_delta);
        }
        if (op.p_kind === "settings") remote.settings = mergePatch(remote.settings, op.p_patch);
        if (op.p_kind === "weight") remote.weights = [{ user_id: uid, day: op.p_day, kg: op.p_patch.kg }];
      }
      body = null;
    }
    return route.fulfill({ status: 200, headers, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/");
  await expect(page.getByText("Dados sincronizados", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate((uid) => JSON.parse(localStorage.getItem(`pv_sync_v2_${uid}`))?.settings?.supplies?._planV, uid)).toBe(999);
  return { remote, errors };
}

test("all six areas open without missing imports or runtime errors on a phone-sized screen", async ({ page }) => {
  const { errors } = await setup(page);
  for (const name of ["Treino", "Exercícios", "Saúde", "Progresso", "Plano", "Hoje"]) {
    await page.locator("nav").getByRole("button", { name, exact: true }).click();
    await expect(page.locator("nav").getByRole("button", { name, exact: true })).toHaveClass(/on/);
    await expect(page.getByText("Carregando…", { exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/hoje-mobile.png", fullPage: true });
});

test("offline water and weight survive reload and synchronize when connection returns", async ({ page }) => {
  const { remote, errors } = await setup(page);
  remote.offline = true;
  await page.getByRole("button", { name: /Água · toque \+250/ }).click();
  await expect(page.getByText(/Alterações no celular aguardando/)).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Progresso", exact: true }).click();
  await page.locator("#kg").fill("72,4");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  const stored = () => page.evaluate((uid) => JSON.parse(localStorage.getItem(`pv_sync_v2_${uid}`)), uid);
  await expect.poll(async () => (await stored()).weights[0]?.kg).toBe(72.4);
  await page.reload();
  await expect.poll(async () => (await stored()).week[day]?.water_ml).toBe(250);
  await expect.poll(async () => (await stored()).weights[0]?.kg).toBe(72.4);
  expect((await stored()).queue.length).toBeGreaterThan(0);
  remote.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Dados sincronizados", { exact: true })).toBeVisible();
  await expect.poll(async () => (await stored()).queue.length).toBe(0);
  expect(remote.logs[day].water_ml).toBe(250); expect(remote.weights[0].kg).toBe(72.4);
  expect(errors).toEqual([]);
});
