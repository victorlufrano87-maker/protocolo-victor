import { test, expect } from "@playwright/test";
import { QUESTIONS, validateProfile, screening, buildPlan } from "../../lib/training/domain.mjs";
const uid = "22222222-2222-4222-8222-222222222222";
const healthy = {
  consent: true,
  name: "Rafael",
  age: 29,
  goal: "muscle",
  priorities: [],
  experience: "new",
  break: "long",
  currentRoutine: "",
  symptoms: "no",
  condition: "no",
  pain: "no",
  restriction: "no",
  medication: "no",
  special: "no",
  place: "home",
  equipment: [],
  days: ["mon", "wed", "fri"],
  minutes: 30,
  activity: "moderate",
  sleep: "normal",
  stress: "low",
  avoid: [],
  preferences: "",
  support: "yes",
  weight: "",
  aiConsent: false
};
async function setup(page, {
  profile = null,
  plan = null,
  isOwner = false
} = {}) {
  const exp = Math.floor(Date.now() / 1000) + 86400,
    token = [Buffer.from('{"alg":"HS256"}').toString("base64url"), Buffer.from(JSON.stringify({
      sub: uid,
      exp
    })).toString("base64url"), "test"].join(".");
  await page.addInitScript(({
    uid,
    token,
    exp
  }) => localStorage.setItem("sb-example-auth-token", JSON.stringify({
    access_token: token,
    refresh_token: "test",
    expires_at: exp,
    user: {
      id: uid,
      email: "friend@example.com",
      user_metadata: {
        training_pilot: true,
        training_password_set: true
      }
    }
  })), {
    uid,
    token,
    exp
  });
  const state = {
      profile,
      plan,
      isOwner,
      sessions: [],
      photos: [],
      offline: false
    },
    errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/training**", async route => {
    if (state.offline) return route.abort("internetdisconnected");
    const req = route.request(),
      path = new URL(req.url()).pathname,
      body = req.method() === "POST" ? req.postDataJSON() : null;
    let result = state;
    if (path.endsWith("/profile")) {
      const answers = validateProfile(body);
      state.profile = {
        user_id: uid,
        answers,
        updated_at: new Date().toISOString()
      };
      result = {
        profile: state.profile,
        screening: screening(answers)
      };
    }
    if (path.endsWith("/plan")) {
      state.plan = {
        id: "33333333-3333-4333-8333-333333333333",
        profile_version: state.profile.updated_at,
        created_at: new Date().toISOString(),
        plan: buildPlan(state.profile.answers)
      };
      result = {
        plan: state.plan
      };
    }
    if (path.endsWith("/sessions")) {
      const row = {
        ...body,
        created_at: new Date().toISOString()
      };
      state.sessions = [row, ...state.sessions.filter(s => s.id !== row.id)];
      result = {
        session: row
      };
    }
    if (path.endsWith("/invites")) result = {
      members: []
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(result)
    });
  });
  await page.goto("/treino");
  await expect(page.getByText("Conectado", {
    exact: true
  })).toBeVisible();
  return {
    state,
    errors
  };
}
async function fillWizard(page, answers) {
  await page.getByRole("button", {
    name: "Montar meu primeiro treino →",
    exact: true
  }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {
    name: "Começar as perguntas →",
    exact: true
  }).click();
  for (const q of QUESTIONS) {
    await expect(page.getByRole("heading", {
      name: q.title,
      exact: true
    })).toBeVisible();
    const value = answers[q.id];
    if (q.type === "text" || q.type === "number") {
      if (value !== "" && value != null) await page.locator(".tr-field input,.tr-field textarea").fill(String(value));
    }
    if (q.type === "choice") await page.getByRole("button", {
      name: q.options.find(([id]) => id === value)[1],
      exact: true
    }).click();
    if (q.type === "multi") for (const id of value) await page.getByRole("button", {
      name: q.options.find(([key]) => key === id)[1],
      exact: true
    }).click();
    await page.locator(".tr-wizard-actions .tr-primary").click();
  }
  await page.getByRole("button", {
    name: "Salvar minhas respostas",
    exact: true
  }).click();
}
test("adult friend completes all questions, skips photo and gets a compatible home plan", async ({
  page
}) => {
  const {
    state,
    errors
  } = await setup(page);
  await page.screenshot({
    path: "test-results/training-welcome.png",
    fullPage: true
  });
  await fillWizard(page, healthy);
  await expect(page.getByRole("heading", {
    name: /Foto de evolução/
  })).toBeVisible();
  await page.getByRole("button", {
    name: "Continuar e montar meu treino",
    exact: true
  }).click();
  await expect(page.getByRole("heading", {
    name: /Seu próximo passo/
  })).toBeVisible();
  expect(state.plan.plan.workouts.flatMap(w => w.exercises).every(x => !x.requires.length)).toBe(true);
  await expect(page.getByRole("button", {
    name: "Clientes",
    exact: true
  })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "test-results/training-plan.png",
    fullPage: true
  });
});
test("library search, illustrated explanation, weekly map and per-set targets work for a friend", async ({ page }) => {
  const profile = { user_id: uid, answers: healthy, updated_at: new Date().toISOString() };
  const plan = { id: '33333333-3333-4333-8333-333333333333', profile_version: profile.updated_at, created_at: profile.updated_at, plan: buildPlan(healthy) };
  const { errors } = await setup(page, { profile, plan });
  await expect(page.getByRole('heading', { name: 'Músculos da semana' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercícios', exact: true }).click();
  await page.getByRole('searchbox').fill('supino');
  await expect(page.locator('.tr-library-grid button').first()).toContainText(/Supino/);
  await page.locator('.tr-library-grid button').first().click();
  await expect(page.getByRole('heading', { name: 'Como fazer' })).toBeVisible();
  await expect(page.locator('.tr-library .exanim img').first()).toBeVisible();
  await expect(page.locator('.tr-library .bodymap')).toBeVisible();
  await page.getByRole('button', { name: 'Treino', exact: true }).click();
  await page.getByRole('button', { name: 'Começar este treino', exact: true }).first().click();
  await expect(page.locator('.tr-prescription')).toContainText('8–12 repetições');
  await expect(page.locator('.tr-set-target').first()).toContainText('Meta: 8–12 reps');
  await expect(page.getByRole('textbox', { name: 'Repetições da série 1', exact: true })).toHaveValue('');
  await page.getByText('Ver execução e músculos trabalhados', { exact: true }).click();
  await expect(page.locator('.tr-guide .bodymap')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/training-new-exercise.png', fullPage: true });
});

test("health concern pauses automatic generation after the questionnaire", async ({
  page
}) => {
  const {
    state,
    errors
  } = await setup(page);
  await fillWizard(page, {
    ...healthy,
    pain: "yes"
  });
  await expect(page.getByRole("heading", {
    name: "Vamos cuidar da base.",
    exact: true
  })).toBeVisible();
  expect(state.plan).toBe(null);
  expect(errors).toEqual([]);
});
test("exercise session is kept offline, survives reload and synchronizes once", async ({
  page
}) => {
  const profile = {
      user_id: uid,
      answers: healthy,
      updated_at: new Date().toISOString()
    },
    plan = {
      id: "33333333-3333-4333-8333-333333333333",
      profile_version: profile.updated_at,
      created_at: profile.updated_at,
      plan: buildPlan(healthy)
    };
  const {
    state,
    errors
  } = await setup(page, {
    profile,
    plan
  });
  await page.getByRole("button", {
    name: "Começar este treino",
    exact: true
  }).first().click();
  await page.getByRole("textbox", {
    name: "Repetições da série 1",
    exact: true
  }).fill("10");
  await page.getByRole("button", {
    name: "Registrar série 1",
    exact: true
  }).click();
  await page.getByRole("button", {
    name: "Encerrar e registrar sessão parcial",
    exact: true
  }).click();
  state.offline = true;
  await page.getByRole("button", {
    name: "Guardar minha sessão",
    exact: true
  }).click();
  await expect(page.getByText("1 sessão(ões) aguardando envio", {
    exact: true
  })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 sessão(ões) aguardando envio", {
    exact: true
  })).toBeVisible();
  state.offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("Conectado", {
    exact: true
  })).toBeVisible();
  await expect.poll(() => state.sessions.length).toBe(1);
  expect(state.sessions[0].sets[0].reps).toBe(10);
  expect(errors).toEqual([]);
});
