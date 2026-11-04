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

const experienced = { ...healthy, experience: 'regular', break: 'none', place: 'gym', equipment: ['machines', 'cables', 'dumbbells', 'bench'], days: ['mon', 'tue', 'thu', 'fri'], minutes: 60 };
test('experience and schedule choose an actual split with different upper/lower content', () => {
  const plan = buildPlan(experienced);
  assert.equal(plan.division, 'upper_lower');
  assert.equal(plan.generatorVersion, 3);
  assert.equal(plan.workouts.filter(w => w.focus === 'upper').length, 2);
  assert.equal(plan.workouts.filter(w => w.focus === 'lower').length, 2);
  for (const w of plan.workouts) {
    assert.match(w.name, /Superiores|Inferiores/);
    assert.ok(w.exercises.length >= 3);
    if (w.focus === 'upper') assert.ok(w.exercises.every(x => !['squat','hinge','core'].includes(x.pattern)));
    if (w.focus === 'lower') assert.ok(w.exercises.every(x => !['push','pull','shoulder','biceps','triceps'].includes(x.pattern)));
  }
  assert.equal(buildPlan({ ...experienced, experience: 'new' }).division, 'full_body');
  assert.equal(buildPlan({ ...experienced, break: 'long' }).division, 'full_body');
  assert.equal(buildPlan({ ...experienced, minutes: 20 }).division, 'full_body');
  assert.equal(buildPlan({ ...experienced, equipment: [] }).division, 'full_body');
});
test('different goals and priorities change prescriptions, not just their titles', () => {
  const muscle = buildPlan(experienced), strength = buildPlan({ ...experienced, goal: 'strength' });
  assert.equal(muscle.workouts[0].exercises[0].reps, '8–12');
  assert.equal(strength.workouts[0].exercises[0].reps, '6–8');
  assert.ok(strength.workouts[0].exercises[0].rest > muscle.workouts[0].exercises[0].rest);
  const upper = buildPlan({ ...experienced, priorities: ['upper'] });
  assert.ok(upper.workouts[0].exercises[0].sets > muscle.workouts[0].exercises[0].sets);
  assert.equal(buildPlan({ ...experienced, priorities: ['lower'] }).workouts[0].focus, 'lower');
  const threeDays = { ...experienced, days: ['mon','wed','fri'] };
  const balanced = buildPlan(threeDays), focused = buildPlan({ ...threeDays, priorities: ['upper'] });
  assert.notDeepEqual(balanced.workouts[0].exercises.map(x => x.id), focused.workouts[0].exercises.map(x => x.id));
  assert.equal(buildPlan({ ...threeDays, priorities: ['core'] }).workouts[0].exercises[0].pattern, 'core');
  assert.ok(new Set(balanced.workouts.map(w => w.exercises.map(x => x.id).join(','))).size > 1);
});
test('all weekly schedules preserve region recovery and time budgets, including Sunday/Monday', () => {
  for (let mask = 1; mask < 128; mask++) {
    const days = DAYS.filter((_, i) => mask & (1 << i)).map(([d]) => d);
    if (days.length > 5) continue;
    for (const minutes of [20,30,45,60]) {
      const plan = buildPlan({ ...experienced, days, minutes });
      for (const w of plan.workouts) {
        assert.ok(w.minutes <= minutes);
        if (w.kind !== 'strength') continue;
        for (const other of plan.workouts) {
          if (other === w || other.kind !== 'strength' || other.focus !== w.focus) continue;
          const gap = Math.abs(DAYS.findIndex(([d]) => d === w.day) - DAYS.findIndex(([d]) => d === other.day));
          assert.ok(![1,6].includes(gap));
        }
      }
    }
  }
});
test('expanded exercises and alternatives respect overhead/floor preferences even with AI ranking', () => {
  const p = { ...experienced, avoid: ['overhead','floor','barbell'] };
  const eligible = new Map(eligibleExercises(p).map(x => [x.id,x]));
  assert.ok(!eligible.has('lat-pulldown'));
  assert.ok(!eligible.has('db-shoulder'));
  for (const x of buildPlan(p, {aiRanking:['lat-pulldown','db-shoulder','deadbug']}).workouts.flatMap(w => w.exercises)) {
    assert.ok(eligible.has(x.id));
    for (const id of x.alternatives) assert.ok(eligible.has(id));
  }
});

test('recovery modifies volume without overriding a compatible split', () => {
  const normal = buildPlan(experienced);
  for (const patch of [{sleep:'low'}, {stress:'high'}, {activity:'high'}]) {
    const adjusted = buildPlan({...experienced, ...patch});
    assert.equal(adjusted.division, 'upper_lower');
    assert.deepEqual(adjusted.workouts.map(w => w.focus), normal.workouts.map(w => w.focus));
    assert.ok(adjusted.workouts[0].exercises[0].sets < normal.workouts[0].exercises[0].sets);
  }
  const poor = buildPlan(experienced, {recent:[{feedback:{pain:false,effort:9,recovery:'poor'}}]});
  assert.equal(poor.division, 'upper_lower');
  assert.equal(poor.workouts[0].exercises[0].sets, 2);
});
test('saved returning/no-break profile gets a conservative split with an explicit inconsistency note', () => {
  const profile = {...experienced, experience:'returning', break:'none', sleep:'low', priorities:['upper'], days:['mon','tue','wed','thu','fri']};
  const plan = buildPlan(profile);
  assert.equal(plan.division, 'upper_lower');
  assert.equal(plan.workouts.filter(w => w.focus === 'upper').length, 2);
  assert.equal(plan.workouts.filter(w => w.focus === 'lower').length, 2);
  assert.ok(plan.workouts.filter(w => w.kind === 'strength').every(w => w.exercises.every(x => x.sets === 2)));
  assert.ok(plan.notes.some(n => n.includes('ausência de pausa')));
  assert.equal(buildPlan({...profile,break:'short'}).division, 'upper_lower');
  assert.equal(buildPlan({...profile,break:'medium'}).division, 'full_body');
  assert.equal(buildPlan({...profile,break:'long'}).division, 'full_body');
  assert.equal(buildPlan({...profile,experience:'new'}).division, 'full_body');
});
