import { CATALOG } from './domain.mjs';

export const MUSCLES = {
  shoulder: ["ombros", "tríceps"], biceps: ["bíceps"], triceps: ["tríceps"],
  squat: ['quadríceps', 'glúteos'], push: ['peitoral', 'tríceps', 'ombros'],
  pull: ['dorsal', 'meio das costas', 'bíceps'], hinge: ['posterior de coxa', 'glúteos'], core: ['abdômen'],
};
export function musclesOf(id) {
  if (id === 'lateral') return ['ombros'];
  if (id === 'calf') return ['panturrilha'];
  if (id === 'curl-machine') return ['posterior de coxa'];
  if (id === 'bridge') return ['glúteos'];
  return MUSCLES[CATALOG.find(x => x.id === id)?.pattern] || [];
}
export function weekMuscles(plan, sessions, now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const start = new Date(`${day}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const monday = start.toISOString().slice(0, 10), done = {}, target = {}, seen = new Set();
  for (const w of plan?.workouts || []) for (const ex of w.exercises || []) for (const m of musclesOf(ex.id)) target[m] = (target[m] || 0) + ex.sets;
  for (const s of sessions) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const stamp = s.completed_at || s.completedAt || s.created_at;
    if (!stamp || !Number.isFinite(Date.parse(stamp))) continue;
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stamp));
    if (d < monday || d > day) continue;
    const sets = new Set();
    for (const set of s.sets || []) {
      const key = `${set.slotId}:${set.index}`;
      if (sets.has(key) || !(set.reps > 0)) continue;
      sets.add(key);
      for (const m of musclesOf(set.exerciseId)) done[m] = (done[m] || 0) + 1;
    }
  }
  return { done, target };
}
