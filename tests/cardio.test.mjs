import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardioPhases,cardioPosition,DEFAULT_CARDIO,validateCardioRecord,CARDIO_MODES} from '../lib/training/cardio.mjs';
import {validateSession} from '../lib/training/domain.mjs';
test('interval phases include warmup, alternating cycles and cooldown; elapsed time catches up',()=>{
  const phases=cardioPhases({...DEFAULT_CARDIO,mode:'run_walk',runMinutes:10,walkMinutes:2,rounds:2});
  assert.deepEqual(phases.map(p=>p.name),['Aquecimento','Corrida','Caminhada','Corrida','Caminhada','Volta à calma']);
  assert.equal(cardioPosition(phases,180000).phase.name,'Corrida');
  assert.equal(cardioPosition(phases,780000).phase.name,'Caminhada');
  assert.equal(cardioPosition(phases,900000).phase.name,'Corrida');
  assert.equal(cardioPosition(phases,99999999).done,true);
});
test('all cardio modes have bounded durations and invalid values are rejected',()=>{
  for(const mode of CARDIO_MODES){const p=cardioPhases({...DEFAULT_CARDIO,mode:mode.id});assert.ok(p.length>=3);}
  for(const patch of [{mode:'unknown'},{minutes:0},{warmup:0},{minutes:Infinity},{mode:'run_walk',runMinutes:20,walkMinutes:10,rounds:12}])assert.throws(()=>cardioPhases({...DEFAULT_CARDIO,...patch}));
});
test('cardio records are sanitized, partial sessions stay explicit and sessions share validation',()=>{
  const c=validateCardioRecord({config:DEFAULT_CARDIO,elapsedSeconds:61,arbitrary:'drop'},'cardio-walk');
  assert.equal(c.partial,true);assert.equal(c.plannedSeconds,1560);assert.ok(!('arbitrary'in c));
  assert.throws(()=>validateCardioRecord({config:DEFAULT_CARDIO,elapsedSeconds:1561},'cardio-walk'));
  assert.throws(()=>validateCardioRecord({config:DEFAULT_CARDIO,elapsedSeconds:1},'cardio-cycle'));
  const record={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',workoutId:'cardio-walk',sets:[],feedback:{effort:5,recovery:'good',pain:false,cardio:{config:DEFAULT_CARDIO,elapsedSeconds:60}}};
  assert.equal(validateSession(record,{workouts:[]}).feedback.cardio.elapsedSeconds,60);
  assert.throws(()=>validateSession({...record,sets:[{exerciseId:'fake'}]},{workouts:[]}));
});
