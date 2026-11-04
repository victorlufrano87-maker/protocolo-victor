export const CARDIO_MODES = [
  {id:'run_walk',name:'Corrida + caminhada',icon:'↔',interval:true,impact:true,description:'Alterne os tempos de corrida e caminhada.'},
  {id:'walk',name:'Caminhada',icon:'↗',description:'Uma atividade contínua, no seu ritmo.'},
  {id:'run',name:'Corrida contínua',icon:'→',impact:true,description:'Tempo contínuo com aquecimento e volta à calma.'},
  {id:'cycle',name:'Bicicleta',icon:'◎',description:'Na bicicleta ergométrica ou em local seguro.'},
  {id:'elliptical',name:'Elíptico',icon:'∞',description:'Atividade contínua no equipamento.'},
];
export const DEFAULT_CARDIO = {mode:'walk',minutes:20,runMinutes:2,walkMinutes:2,rounds:4,warmup:3,cooldown:3};
export function cardioPhases(raw) {
  const mode = CARDIO_MODES.find(m => m.id === raw?.mode);
  if (!mode) throw new Error('Escolha uma modalidade de cardio.');
  const int = (key,min,max) => { const n=Number(raw[key]); if(!Number.isInteger(n)||n<min||n>max) throw new Error('Confira os tempos e o número de ciclos.'); return n; };
  const warmup=int('warmup',1,10),cooldown=int('cooldown',1,10),phases=[];
  phases.push({name:'Aquecimento',seconds:warmup*60,cue:mode.id==='cycle'?'Pedale devagar.':mode.id==='elliptical'?'Comece com resistência confortável.':'Comece caminhando confortavelmente.'});
  if(mode.interval){const run=int('runMinutes',1,20),walk=int('walkMinutes',1,10),rounds=int('rounds',1,12);for(let i=0;i<rounds;i++)phases.push({name:'Corrida',seconds:run*60,cue:`Ciclo ${i+1} de ${rounds}. Corra em ritmo confortável.`,round:i+1},{name:'Caminhada',seconds:walk*60,cue:'Agora caminhe e recupere o fôlego.',round:i+1});}
  else phases.push({name:mode.name,seconds:int('minutes',1,90)*60,cue:'Mantenha um ritmo controlado, em que consiga conversar.'});
  phases.push({name:'Volta à calma',seconds:cooldown*60,cue:'Reduza o ritmo gradualmente.'});
  if(phases.reduce((s,p)=>s+p.seconds,0)>7200)throw new Error('O treino completo deve ter no máximo 120 minutos.');
  return phases;
}
export function cardioPosition(phases,elapsedMs){
  const total=phases.reduce((s,p)=>s+p.seconds*1000,0),elapsed=Math.max(0,Math.min(total,elapsedMs));let start=0;
  for(let i=0;i<phases.length;i++){const end=start+phases[i].seconds*1000;if(elapsed<end)return{index:i,phase:phases[i],remaining:Math.ceil((end-elapsed)/1000),elapsed,total,done:false};start=end;}
  return{index:phases.length,phase:null,remaining:0,elapsed,total,done:true};
}
export function validateCardioRecord(raw,workoutId){
  const phases=cardioPhases(raw?.config),total=phases.reduce((s,p)=>s+p.seconds,0);
  if(workoutId!==`cardio-${raw.config.mode}`||!Number.isInteger(raw.elapsedSeconds)||raw.elapsedSeconds<1||raw.elapsedSeconds>total)throw new Error('Duração de cardio inválida.');
  const config={mode:raw.config.mode,warmup:Number(raw.config.warmup),cooldown:Number(raw.config.cooldown)};
  for(const k of raw.config.mode==='run_walk'?['runMinutes','walkMinutes','rounds']:['minutes'])config[k]=Number(raw.config[k]);
  return{config,elapsedSeconds:raw.elapsedSeconds,plannedSeconds:total,partial:raw.elapsedSeconds<total};
}
