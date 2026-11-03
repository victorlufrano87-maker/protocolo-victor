import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekMuscles, musclesOf } from '../lib/training/muscles.mjs';
test('weekly map counts actual substitutions once, excludes old and future sessions and uses Sao Paulo week', () => {
  const set = {slotId:'goblet', exerciseId:'squat', index:0, reps:10};
  const session = {id:'a',completed_at:'2026-11-03T01:00:00Z',sets:[set,set]};
  const result = weekMuscles({workouts:[{exercises:[{id:'goblet',sets:2}]}]}, [session,session,
    {...session,id:'old',completed_at:'2026-11-02T01:00:00Z'},
    {...session,id:'future',completed_at:'2026-11-05T01:00:00Z'}],new Date('2026-11-03T15:00:00Z'));
  assert.equal(result.done['quadríceps'],1);
  assert.equal(result.target['quadríceps'],2);
  assert.deepEqual(musclesOf('unknown'),[]);
  assert.deepEqual(musclesOf('lateral'),['ombros']);
});
