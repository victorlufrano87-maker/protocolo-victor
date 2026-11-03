import test from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, validateProfile, screening, buildPlan, eligibleExercises, validateSession, aiSummary, DAYS } from "../lib/training/domain.mjs";
export const healthy = {
  consent: true,
  name: "Amigo",
  age: 30,
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
test("the questionnaire validates every required field, adult age and consent", () => {
  assert.equal(QUESTIONS.length, 25);
  assert.equal(validateProfile(healthy).age, 30);
  for (const patch of [{
    consent: false
  }, {
    age: 17
  }, {
    age: 101
  }, {
    age: 18.5
  }, {
    days: []
  }, {
    minutes: 5
  }, {
    equipment: ["imaginary"]
  }, {
    aiConsent: undefined
  }]) assert.throws(() => validateProfile({
    ...healthy,
    ...patch
  }));
});
test("every flagged health answer blocks generation on the server-side domain too", () => {
  for (const field of ["symptoms", "condition", "pain", "restriction", "medication", "special"]) {
    const p = {
      ...healthy,
      [field]: "yes"
    };
    assert.equal(screening(p).ready, false);
    assert.throws(() => buildPlan(p), {
      status: 422
    });
  }
  assert.throws(() => buildPlan({
    ...healthy,
    pain: "unsure"
  }), {
    status: 422
  });
});
test("home with no equipment never receives a gym exercise and missing pulls are explicit", () => {
  const plan = buildPlan(healthy);
  assert.ok(plan.workouts.flatMap(w => w.exercises).every(x => x.requires.length === 0));
  assert.ok(plan.notes.some(n => n.includes("puxadas")));
});
test("all generated exercises and alternatives respect equipment and floor preferences", () => {
  const p = {
      ...healthy,
      equipment: ["dumbbells", "bench", "bands"],
      avoid: ["floor"]
    },
    eligible = new Set(eligibleExercises(p).map(x => x.id)),
    plan = buildPlan(p);
  for (const x of plan.workouts.flatMap(w => w.exercises)) {
    assert.ok(eligible.has(x.id));
    assert.ok(!x.floor);
    for (const id of x.alternatives) assert.ok(eligible.has(id));
  }
});
test("the total estimated session fits every offered time budget", () => {
  for (const minutes of [20, 30, 45, 60]) for (const goal of ["muscle", "strength", "health", "fatloss"]) for (const experience of ["new", "regular"]) {
    const plan = buildPlan({
      ...healthy,
      goal,
      minutes,
      experience,
      break: "none",
      equipment: ["machines", "cables", "dumbbells", "bench"]
    });
    for (const w of plan.workouts) assert.ok(w.minutes <= minutes, `${goal} ${minutes} ${experience}: ${w.minutes}`);
  }
});
test("full-body strength days are separated, including Sunday and Monday", () => {
  const plan = buildPlan({
      ...healthy,
      days: ["mon", "tue", "fri", "sat", "sun"]
    }),
    days = plan.workouts.filter(w => w.kind === "strength").map(w => DAYS.findIndex(([id]) => id === w.day));
  for (const a of days) for (const b of days) if (a !== b) {
    const diff = Math.abs(a - b);
    assert.ok(diff !== 1 && diff !== 6);
  }
  assert.ok(plan.workouts.some(w => w.kind === "recovery"));
});
test("poor recovery reduces volume; pain pauses subsequent generation", () => {
  const p = {
    ...healthy,
    experience: "regular",
    break: "none",
    equipment: ["machines", "cables"]
  };
  const normal = buildPlan(p),
    reduced = buildPlan(p, {
      recent: [{
        feedback: {
          pain: false,
          effort: 9,
          recovery: "poor"
        }
      }]
    });
  assert.ok(reduced.workouts[0].exercises.reduce((n, x) => n + x.sets, 0) < normal.workouts[0].exercises.reduce((n, x) => n + x.sets, 0));
  assert.throws(() => buildPlan(p, {
    recent: [{
      feedback: {
        pain: true
      }
    }]
  }), {
    status: 422
  });
});
test("AI can rank only eligible movements; sensitive fields stay out of its summary", () => {
  const p = validateProfile({
      ...healthy,
      name: "Private name",
      weight: 77
    }),
    plan = buildPlan(p, {
      aiRanking: ["machine-row", "press-machine"]
    });
  assert.ok(plan.workouts.flatMap(w => w.exercises).every(x => x.requires.length === 0));
  const summary = JSON.stringify(aiSummary(p, plan));
  for (const forbidden of ["Private name", "symptoms", "medication", "photo", "weight"]) assert.ok(!summary.includes(`\"${forbidden}\"`));
});
test("session validation rejects unknown exercises, duplicates and invalid effort", () => {
  const plan = buildPlan(healthy),
    w = plan.workouts[0],
    x = w.exercises[0],
    body = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      workoutId: w.id,
      sets: [{
        slotId: x.id,
        exerciseId: x.id,
        index: 0,
        reps: 10,
        kg: 0
      }],
      feedback: {
        pain: false,
        effort: 6,
        recovery: "good"
      }
    };
  assert.equal(validateSession(body, plan).sets.length, 1);
  for (const patch of [{
    sets: [{
      ...body.sets[0],
      exerciseId: "unknown"
    }]
  }, {
    sets: [body.sets[0], body.sets[0]]
  }, {
    feedback: {
      ...body.feedback,
      effort: 11
    }
  }, {
    sets: []
  }]) assert.throws(() => validateSession({
    ...body,
    ...patch
  }, plan));
});
