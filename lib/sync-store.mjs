// Each change and its optimistic view are persisted in a single local write.
export const EMPTY_DAY = { checks: {}, swaps: {}, water_ml: 0, free_meal: false, workout_at: null };
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const copy = (v) => JSON.parse(JSON.stringify(v));

export function mergePatch(base, patch) {
  if (!object(patch)) return copy(patch);
  const out = object(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (["__proto__", "constructor", "prototype"].includes(k)) continue;
    if (v == null) delete out[k];
    else out[k] = object(v) ? mergePatch(out[k], v) : copy(v);
  }
  return out;
}

// Ignore unchanged fields copied by a caller from an older React render.
export function diff(base = {}, next = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const a = base[k], b = next[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    out[k] = b == null ? null : object(a) && object(b) ? diff(a, b) : b;
  }
  return out;
}

export function createSyncStore({ uid, storage, send, onChange = () => {}, uuid = () => crypto.randomUUID() }) {
  const key = `pv_sync_v2_${uid}`;
  const read = (k, fallback) => { const s = storage.getItem(k); return s ? JSON.parse(s) : fallback; };
  let state = { week: {}, settings: { times: {}, supplies: {}, update_date: null }, weights: [], queue: [], revision: 0 };
  const cached = read(key, null);
  if (cached) state = cached;
  else {
    state.week = read(`pv_week_${uid}`, {});
    state.settings = read(`pv_set_${uid}`, state.settings);
    // Preserve changes made by the previous version while offline.
    for (const day of read(`pv_out_${uid}`, [])) if (state.week[day]) {
      const { checks, swaps, water_ml, free_meal, workout_at } = state.week[day];
      state.queue.push({ id: uuid(), kind: "day", day, patch: { checks, swaps, water_ml, free_meal, workout_at } });
    }
    if (read(`pv_setdirty_${uid}`, false)) {
      const { times, supplies, update_date } = state.settings;
      state.queue.push({ id: uuid(), kind: "settings", patch: { times, supplies, update_date } });
    }
    storage.setItem(key, JSON.stringify(state));
  }
  let flight;
  const commit = (next) => { storage.setItem(key, JSON.stringify(next)); state = next; onChange(state); };
  const enqueue = (op, update) => {
    const next = update(copy(state));
    next.queue.push({ ...op, id: uuid() }); next.revision++;
    commit(next); // If storage is full, fail visibly before claiming success.
    return { queued: true };
  };
  return {
    snapshot: () => state,
    saveDay(day, partial, baseline = state.week[day] || EMPTY_DAY) {
      const nextView = { ...baseline, ...partial };
      for (const k of ["checks", "swaps"]) if (partial[k]) nextView[k] = { ...(baseline[k] || {}), ...partial[k] };
      const patch = diff(baseline, nextView);
      // Water additions/removals are deltas so two phones can sync safely.
      if (Object.hasOwn(patch, "water_ml")) { patch.water_delta = nextView.water_ml - (baseline.water_ml || 0); delete patch.water_ml; }
      if (!Object.keys(patch).length) return { queued: false };
      return enqueue({ kind: "day", day, patch }, (s) => {
        const current = s.week[day] || EMPTY_DAY, { water_delta, ...fields } = patch;
        s.week[day] = { ...EMPTY_DAY, ...mergePatch(current, fields) };
        if (water_delta !== undefined) s.week[day].water_ml = Math.max(0, (current.water_ml || 0) + water_delta);
        return s;
      });
    },
    saveSettings(partial, baseline = state.settings) {
      const patch = diff(baseline, { ...baseline, ...partial });
      if (!Object.keys(patch).length) return { queued: false };
      return enqueue({ kind: "settings", patch }, (s) => { s.settings = mergePatch(s.settings, patch); return s; });
    },
    saveWeight(day, kg) {
      if (!Number.isFinite(kg) || kg < 20 || kg > 500) throw new Error("Informe um peso entre 20 e 500 kg.");
      return enqueue({ kind: "weight", day, patch: { kg } }, (s) => {
        s.weights = [...s.weights.filter((w) => w.day !== day), { user_id: uid, day, kg }].sort((a, b) => a.day.localeCompare(b.day));
        return s;
      });
    },
    hydrate(remote, revision) {
      if (state.revision !== revision || state.queue.length) return false;
      commit({ ...state, ...remote }); return true;
    },
    flush() {
      if (flight) return flight;
      flight = (async () => {
        while (state.queue.length) {
          const op = state.queue[0];
          const result = await send(op);
          if (result?.error) throw result.error;
          // Remove only the operation acknowledged, including when a new change
          // arrived during the request. Retrying a lost response is idempotent.
          commit({ ...state, queue: state.queue.filter((q) => q.id !== op.id) });
        }
      })().finally(() => { flight = null; });
      return flight;
    },
  };
}
