"use client";
import {DAYS} from '@/lib/training/domain.mjs';
import {spNow} from '@/lib/supabase';

export default function TrainingHome({profile,record,sessions,ready,onStart,onNavigate,onSetup,onGenerate,busy}){
  const today=spNow().day;
  const monday=new Date(`${today}T12:00:00Z`);monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const start=monday.toISOString().slice(0,10);
  const dayOf=s=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s.completed_at||s.completedAt||s.created_at));
  const week=sessions.filter(s=>{const d=dayOf(s);return d>=start&&d<=today;});
  const strength=week.filter(s=>(s.workout_id||s.workoutId||'').startsWith('strength-'));
  const cardioMinutes=Math.floor(week.reduce((n,s)=>n+(s.feedback?.cardio?.elapsedSeconds||0),0)/60);
  const workouts=record?.plan?.workouts?.filter(w=>w.kind==='strength')||[];
  const weekDone=new Set(strength.filter(s=>(s.plan_id||s.planId)===record?.id).map(s=>s.workout_id||s.workoutId));
  const idx=(new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7;
  const next=workouts.find(w=>DAYS.findIndex(([d])=>d===w.day)>=idx&&!weekDone.has(w.id))||workouts.find(w=>!weekDone.has(w.id))||workouts[0];
  const trainedToday=strength.some(s=>dayOf(s)===today);
  const goal=workouts.length;
  const name=profile?.name?.split(' ')[0];
  return <div className="gr-home"><div className="gr-home-greeting"><span className="tr-eyebrow">SEU PONTO DE PARTIDA</span><h1>{name?`Bora, ${name}.`:'Bem-vindo à Tropa do Batata.'}</h1><p>Seu treino, seu ritmo. Tudo o que importa em um lugar.</p></div>
    <section className="gr-today"><div className="gr-today-top"><span className="gr-live-dot"/> {trainedToday?'TREINO REGISTRADO HOJE':'PRÓXIMO PASSO'}<span className="gr-today-tag">TROPA DO BATATA</span></div>
    {!profile?<><h2>O primeiro passo<br/>é seu.</h2><p>Conte sua rotina para montar seu ponto de partida.</p><button className="tr-primary" onClick={onSetup}>Montar meu primeiro treino →</button></>:!ready?<><h2>Vamos ajustar<br/>seu ponto de partida.</h2><p>Revise as respostas e os sinais de dor antes de iniciar uma nova sessão.</p><button className="tr-primary" onClick={onSetup}>Revisar meu perfil →</button></>:!record?<><h2>Seu perfil<br/>está pronto.</h2><p>Agora vamos transformar suas respostas em uma proposta de treino.</p><button className="tr-primary" disabled={busy} onClick={onGenerate}>{busy?'Montando…':'Montar meu treino'}</button></>:next?<><h2>{trainedToday?'Você fez acontecer.':next.name}</h2><p>{trainedToday?'Seu registro já está na evolução. Confira a semana e respeite sua recuperação.':`${next.exercises.length} exercícios · ${next.exercises.reduce((n,x)=>n+x.sets,0)} séries · cerca de ${next.minutes} min`}</p><button className="tr-primary" onClick={()=>trainedToday?onNavigate('progress'):onStart(next)}>{trainedToday?'Ver meu registro →':'Começar meu treino →'}</button><button className="gr-quiet" onClick={()=>onNavigate('plan')}>Ver todos os treinos</button></>:<><h2>Sua rotina<br/>começa aqui.</h2><button className="tr-primary" onClick={()=>onNavigate('plan')}>Ver minha proposta →</button></>}
    </section>
    <button className="challenge-home-link" onClick={()=>onNavigate("challenge")}><span>🏆</span><div><b>Desafio da Tropa</b><small>Check-in, ranking e Tribunal do grupo</small></div><i>→</i></button>
    <section className="gr-week"><div className="tr-row"><h2>Sua semana</h2><button className="gr-week-link" onClick={()=>onNavigate("progress")}>Ver evolução →</button></div><div className="gr-week-days">{DAYS.map(([d,label],i)=>{const stamp=new Date(monday);stamp.setUTCDate(stamp.getUTCDate()+i);const day=stamp.toISOString().slice(0,10),done=week.some(s=>dayOf(s)===day);return <div key={d} className={`${day===today?'today ':''}${done?'done':''}`}><span>{label.slice(0,3)}</span><b>{done?'✓':stamp.getUTCDate()}</b></div>;})}</div><div className="gr-stat-grid"><div><strong>{strength.length}<small>/{goal||'—'}</small></strong><span>treinos de força</span></div><div><strong>{cardioMinutes}<small> min</small></strong><span>cardio registrado</span></div><div><strong>{new Set(week.map(dayOf)).size}</strong><span>dias com atividade</span></div></div></section>
    <div className="tr-row gr-section-heading"><h2>O que vamos fazer?</h2><span>ESCOLHA SEU FOCO</span></div><div className="gr-quick-grid"><button onClick={()=>onNavigate('plan')}><span className="gr-action-icon">↗</span><b>Treinar</b><small>Seu plano, séries e cargas</small><i>→</i></button><button onClick={()=>onNavigate('cardio')}><span className="gr-action-icon">↔</span><b>Fazer cardio</b><small>Corrida, caminhada e mais</small><i>→</i></button><button onClick={()=>onNavigate('exercises')}><span className="gr-action-icon">⌕</span><b>Explorar exercícios</b><small>Busque por músculo ou aparelho</small><i>→</i></button><button onClick={()=>onNavigate('progress')}><span className="gr-action-icon">▥</span><b>Ver evolução</b><small>Seus registros e suas fotos</small><i>→</i></button></div>
    <section className="gr-recent"><div className="tr-row"><h2>Última atividade</h2><button onClick={()=>onNavigate('progress')}>Ver tudo →</button></div>{sessions[0]?<div className="gr-recent-row"><span className="gr-action-icon">✓</span><div><b>{sessions[0].feedback?.cardio?'Cardio registrado':`${sessions[0].sets?.length||0} séries registradas`}</b><p>{new Date(sessions[0].completed_at||sessions[0].completedAt||sessions[0].created_at).toLocaleDateString('pt-BR')} · esforço {sessions[0].feedback?.effort||'—'}/10</p></div></div>:<p>Seus registros aparecerão aqui depois da primeira atividade.</p>}</section>
  </div>;
}
