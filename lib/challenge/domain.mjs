const HANDS=['mão direita','mão esquerda'],SIGNS=['✌️ paz','👍 joinha','👌 ok','🤙 hang loose','☝️ um dedo','🤘 rock','✊ punho fechado','🖐️ mão aberta'],SPOTS=['ao lado do rosto','acima da cabeça','na frente do peito'];
export const GESTURES = HANDS.flatMap(h=>SIGNS.flatMap(g=>SPOTS.map(p=>`${g} · ${h} · ${p}`)));
export const RULES = {version:2,codeInPhoto:true,timezone:'America/Sao_Paulo',dailyLimit:1,proofMinutes:4,defenseHours:24,voteHours:48,quorum:3,annulFraction:2/3,runKm:5,runMinutes:50};
export const SPORTS = ['Futebol','Vôlei','Basquete','Natação','Luta','Tênis'];
export class ChallengeError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const requireThat=(ok,message,status=400)=>{if(!ok)throw new ChallengeError(message,status);};
const text=(v,max=500)=>String(v||'').trim().slice(0,max);
export const localDay = time => new Intl.DateTimeFormat('en-CA',{timeZone:RULES.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
const iso = time => new Date(time).toISOString();
const uidOf = s => s.user_id||s.uid;
const event=(s,actor,kind,now,detail={})=>s.audit.push({id:`${s.audit.length+1}`,actor,kind,at:iso(now),...detail});
export function locationPoint(v){if(!v)return null;requireThat(Number.isFinite(v.lat)&&Math.abs(v.lat)<=90&&Number.isFinite(v.lon)&&Math.abs(v.lon)<=180&&Number.isFinite(v.accuracy)&&v.accuracy>=0&&v.accuracy<=100000,'Localização inválida.');return{lat:v.lat,lon:v.lon,accuracy:v.accuracy};}
export function createChallenge({name,starts,ends,alias},actor,{id,inviteCode,now}){
  requireThat(text(name,61).length>=3&&text(name,61).length<=60,'Use um nome de 3 a 60 caracteres.');
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
  requireThat(valid(starts)&&valid(ends)&&ends>=starts&&starts>=localDay(now)&&Date.parse(ends)-Date.parse(starts)<=89*86400000,'Confira as datas: início a partir de hoje, duração máxima de 90 dias.');
  requireThat(text(alias,31).length>=2&&text(alias,31).length<=30,'Informe um apelido de 2 a 30 caracteres.');
  const s={id,name:text(name,60),starts,ends,createdBy:actor,inviteCode,rules:{...RULES},members:[{id:actor,alias:text(alias,30),joinedAt:iso(now)}],activities:[],entries:[],cases:[],audit:[],processed:[]};event(s,actor,'created',now);return s;
}
export const adminOf=s=>s.adminId||s.createdBy;
export function requireMember(s,actor){requireThat(s.members.some(m=>m.id===actor),'Você não participa deste desafio.',403);}
export function closeCases(state,now){
  let s=state,changed=false;
  for(const c of state.cases){if(c.closedAt||now<Date.parse(c.voteEnds))continue;if(!changed){s=structuredClone(state);changed=true;}const closed=s.cases.find(x=>x.id===c.id),valid=closed.votes.filter(v=>v.choice!=='abstain'),annul=valid.filter(v=>v.choice==='annul').length;closed.outcome=valid.length>=state.rules.quorum&&annul*3>=valid.length*2?'annul':'keep';closed.closedAt=closed.voteEnds;closed.quorumMet=valid.length>=state.rules.quorum;const e=s.entries.find(e=>e.id===closed.entryId);e.status=closed.outcome==='annul'?'annulled':closed.priorStatus;event(s,'system','case_closed',Date.parse(closed.voteEnds),{caseId:closed.id,outcome:closed.outcome,validVotes:valid.length,annulVotes:annul});}
  return s;
}
export function actChallenge(state,actor,input,ctx){
  const {now,id,code,gesture}=ctx;let s=structuredClone(closeCases(state,now));
  if(input.operationId&&s.processed.includes(input.operationId))return s;
  if(input.action==='join'){
    requireThat(input.consent===true,'Aceite as regras e o compartilhamento das comprovações com o grupo.');
    requireThat(now<=Date.parse(s.ends+'T23:59:59-03:00'),'O desafio já terminou.');
    const requests=s.requests||(s.requests=[]);
    if(!s.members.some(m=>m.id===actor)&&!requests.some(r=>r.id===actor)){requireThat(!(s.removed||[]).includes(actor),'Sua participação neste desafio foi encerrada pelo organizador.',403);requireThat(requests.length<50,'Há muitos pedidos aguardando o organizador.');const alias=text(input.alias,31);requireThat(alias.length>=2&&alias.length<=30,'Informe um apelido de 2 a 30 caracteres.');requireThat(![...s.members,...requests].some(m=>m.alias.toLocaleLowerCase('pt-BR')===alias.toLocaleLowerCase('pt-BR')),'Esse apelido já está em uso no grupo.');requests.push({id:actor,alias,requestedAt:iso(now)});event(s,actor,'join_requested',now);}
  }else{
    requireMember(s,actor);
    if(input.action==='start'){
      const day=localDay(now);requireThat(day>=s.starts&&day<=s.ends,'O desafio não está no período de participação.');
      requireThat(!s.activities.some(a=>a.userId===actor&&!a.submittedAt&&!a.abandonedAt),'Você já tem uma atividade aberta neste desafio.');
      requireThat(!s.entries.some(e=>e.userId===actor&&e.day===day),'Só é permitido um check-in por dia, inclusive se ele for anulado.');
      requireThat(['strength','sport','run'].includes(input.type),'Escolha a atividade.');
      if(input.type==='run'){const d=new Date(day+'T12:00:00Z').getUTCDay();requireThat(d===0||d===6,'Corrida como única atividade só vale aos sábados e domingos.');requireThat(['treadmill','strava'].includes(input.runSource),'Escolha esteira ou rua com Strava.');}
      if(input.type==='sport')requireThat(SPORTS.includes(input.sport),'Escolha o esporte.');
      requireThat(input.photoConsent===true,'Aceite publicar as fotos e os dados deste check-in no grupo.');
      s.activities.push({id,userId:actor,day,type:input.type,sport:input.type==='sport'?input.sport:null,runSource:input.type==='run'?input.runSource:null,startedAt:iso(now),locationStart:locationPoint(input.location),nonce:null});event(s,actor,'started',now,{activityId:id,type:input.type});
    }else if(['issue','abandon','submit'].includes(input.action)){
      const a=s.activities.find(a=>a.id===input.activityId&&a.userId===actor);requireThat(a&&!a.abandonedAt&&!a.submittedAt,'Atividade aberta não encontrada.',404);
      if(input.action==='abandon'){a.abandonedAt=iso(now);event(s,actor,'abandoned',now,{activityId:a.id});}
      if(input.action==='issue'){
        requireThat(now-Date.parse(a.startedAt)<=8*3600000,'O início tem mais de 8 horas. Encerre sem pontuar e comece outra atividade.');
        requireThat(localDay(now)===a.day,'A surpresa precisa ser solicitada no mesmo dia do início, no horário de Brasília.');
        if(!a.nonce||now>Date.parse(a.nonce.expiresAt)){requireThat(!a.nonce||a.nonce.attempt<3,'Limite de três códigos atingido. Encerre esta atividade sem pontuar.');requireThat(/^\d{4}$/.test(code)&&GESTURES.includes(gesture),'Surpresa inválida.');a.endedAt=a.endedAt||iso(now);a.locationEnd=a.locationEnd||locationPoint(input.location);a.nonce={code,gesture,issuedAt:iso(now),expiresAt:iso(now+s.rules.proofMinutes*60000),attempt:(a.nonce?.attempt||0)+1};event(s,actor,'proof_issued',now,{activityId:a.id,attempt:a.nonce.attempt});}
      }
      if(input.action==='submit'){
        requireThat(a.nonce&&now<=Date.parse(a.nonce.expiresAt),'O código expirou. Solicite uma nova surpresa e tire outra foto.');
        requireThat(input.captureCode===a.nonce.code,'O código da captura não corresponde à surpresa atual.');
        const caption=text(input.caption,500);requireThat(new RegExp(`\\b${a.nonce.code}\\b`).test(caption),'Inclua o código de quatro dígitos na legenda.');
        requireThat(input.proof?.path&&/^[a-f0-9]{64}$/.test(input.proof?.hash||''),'Tire a foto de comprovação pela câmera.');
        requireThat(!s.entries.some(e=>e.proof.hash===input.proof.hash),'Essa mesma imagem já foi usada neste desafio.');
        requireThat(!s.entries.some(e=>e.userId===actor&&e.day===a.day),'Já existe um check-in seu neste dia.');
        let run=null;
        if(a.type==='run'){requireThat(input.evidence?.path,'Anexe a foto do painel ou o print do Strava.');const km=Number(input.km),minutes=Number(input.elapsedMinutes);requireThat(Number.isFinite(km)&&km>=s.rules.runKm&&km<=100&&Number.isFinite(minutes)&&minutes>0&&minutes<=s.rules.runMinutes,'A corrida precisa ter pelo menos 5 km em até 50 minutos de tempo decorrido.');requireThat(minutes*60000<=Date.parse(a.endedAt)-Date.parse(a.startedAt)+60000,'O tempo informado é maior que o período registrado no app. Confira os dados.');let stravaUrl=null;if(a.runSource==='strava'){try{const u=new URL(input.stravaUrl);requireThat(u.protocol==='https:'&&['strava.com','www.strava.com'].includes(u.hostname)&&/^\/activities\/\d+\/?$/.test(u.pathname)&&!u.username&&!u.password,'Use o link completo da atividade: https://www.strava.com/activities/123.');stravaUrl=u.origin+u.pathname;}catch{throw new ChallengeError('Informe o link público da atividade do Strava (sem dados de acesso).');}requireThat(!s.entries.some(e=>e.run?.stravaUrl===stravaUrl),'Essa atividade do Strava já foi usada neste desafio.');}run={km,elapsedMinutes:minutes,source:a.runSource,stravaUrl};}
        const metrics=ctx.metrics||{sets:0,volumeKg:0,maxKg:0,loads:[]};
        const flags=[];if(!a.locationStart||!a.locationEnd)flags.push('Localização não capturada nos dois momentos');if([a.locationStart,a.locationEnd].some(g=>g&&g.accuracy>100))flags.push('Precisão de localização baixa');if(!metrics.sets&&a.type==='strength')flags.push('Sem séries vinculadas do aplicativo');if(a.nonce.attempt>1)flags.push('Código renovado após expiração');
        const entry={id,userId:actor,activityId:a.id,day:a.day,type:a.type,sport:a.sport,caption,code:a.nonce.code,gesture:a.nonce.gesture,proof:input.proof,evidence:input.evidence||null,run,metrics,durationSeconds:Math.max(0,Math.round((Date.parse(a.endedAt)-Date.parse(a.startedAt))/1000)),status:'pending',createdAt:iso(now),flags};
        s.entries.push(entry);a.submittedAt=iso(now);event(s,actor,'submitted',now,{entryId:id});
      }
    }else if(['approve','reject','remove'].includes(input.action)){
      requireThat(actor===adminOf(s),'Só o organizador do desafio pode gerenciar participantes.',403);
      if(input.action==='remove'){const m=s.members.find(m=>m.id===input.userId);requireThat(m&&m.id!==actor,'Participante não encontrado.',404);s.members=s.members.filter(x=>x.id!==m.id);s.removed=[...(s.removed||[]),m.id];for(const a of s.activities)if(a.userId===m.id&&!a.submittedAt&&!a.abandonedAt)a.abandonedAt=iso(now);event(s,actor,'member_removed',now,{userId:m.id,reason:text(input.reason,300)});}
      else{const requests=s.requests||[],r=requests.find(x=>x.id===input.userId);requireThat(r,'Pedido não encontrado.',404);s.requests=requests.filter(x=>x.id!==r.id);if(input.action==='approve'){requireThat(s.members.length<50,'O piloto aceita até 50 participantes por grupo.');s.members.push({id:r.id,alias:r.alias,joinedAt:iso(now)});event(s,actor,'joined',now,{userId:r.id});}else event(s,actor,'join_rejected',now,{userId:r.id});}
    }else if(input.action==='review'){
      const e=s.entries.find(e=>e.id===input.entryId);requireThat(e&&e.status==='pending','Esta comprovação não está aguardando conferência.');requireThat(e.userId!==actor,'Outra pessoa do grupo precisa conferir sua comprovação.');const reason=text(input.reason,300);requireThat(reason.length>=10,'Registre o motivo da conferência (mínimo de 10 caracteres).');e.status='accepted';e.reviewedAt=iso(now);e.reviewedBy=actor;event(s,actor,'reviewed',now,{entryId:e.id,reason});
    }else if(input.action==='contest'){
      const e=s.entries.find(e=>e.id===input.entryId);requireThat(e&&['pending','accepted'].includes(e.status),'Check-in indisponível para contestação.');requireThat(e.userId!==actor,'Você não pode contestar o próprio check-in.');requireThat(!s.cases.some(c=>c.entryId===e.id),'Este check-in já tem um caso no Tribunal. Acrescente evidências no mesmo caso.');requireThat(now-Date.parse(e.reviewedAt||e.createdAt)<=86400000,'O prazo para contestar é de 24 horas após a publicação ou, se já conferido, após a conferência.');const reason=text(input.reason,500);requireThat(reason.length>=15,'Explique a contestação com pelo menos 15 caracteres.');s.cases.push({id,entryId:e.id,authorId:e.userId,openedBy:actor,reason,openedAt:iso(now),defenseEnds:iso(now+s.rules.defenseHours*3600000),voteEnds:iso(now+(s.rules.defenseHours+s.rules.voteHours)*3600000),priorStatus:e.status,eligible:s.members.filter(m=>![actor,e.userId].includes(m.id)).map(m=>m.id),votes:[],defense:null,comments:[]});e.status='contested';event(s,actor,'contested',now,{caseId:id,entryId:e.id,reason});
    }else if(['defend','comment','vote'].includes(input.action)){
      const c=s.cases.find(c=>c.id===input.caseId);requireThat(c&&!c.closedAt,'Caso não encontrado ou já encerrado.');const reason=text(input.reason,500);requireThat(reason.length>=(input.action==='vote'?10:15),'Escreva uma justificativa mais completa.');
      if(input.action==='defend'){requireThat(c.authorId===actor&&now<Date.parse(c.defenseEnds),'Só o autor pode apresentar defesa, dentro das primeiras 24 horas.',403);requireThat(!c.defense,'A defesa já foi apresentada. Use as evidências adicionais.');c.defense={text:reason,at:iso(now)};event(s,actor,'defense',now,{caseId:c.id});}
      if(input.action==='comment'){requireThat(c.comments.length<100,'Limite de evidências do caso atingido.');c.comments.push({actor,text:reason,at:iso(now)});event(s,actor,'case_evidence',now,{caseId:c.id});}
      if(input.action==='vote'){requireThat(now>=Date.parse(c.defenseEnds)&&now<Date.parse(c.voteEnds),'A votação abre após as 24 horas de defesa e dura 48 horas.');requireThat(c.eligible.includes(actor),'Autor, contestante e novos participantes não votam neste caso.',403);requireThat(!c.votes.some(v=>v.userId===actor),'Você já votou. O voto não pode ser alterado.');requireThat(['keep','annul','abstain'].includes(input.choice),'Escolha manter, anular ou abster-se.');c.votes.push({userId:actor,choice:input.choice,reason,at:iso(now)});event(s,actor,'vote_cast',now,{caseId:c.id});}
    }else throw new ChallengeError('Ação desconhecida.');
  }
  if(input.operationId)s.processed=[...s.processed,input.operationId].slice(-1000);
  return s;
}
export function metricsFromSession(session){
  const sets=Array.isArray(session?.sets)?session.sets:[];const loads=sets.filter(x=>Number.isFinite(x.kg)&&x.kg>=0&&Number.isFinite(x.reps)&&x.reps>0).map(x=>({exerciseId:x.exerciseId,kg:x.kg,reps:x.reps}));
  return{sets:loads.length,volumeKg:Math.round(loads.reduce((s,x)=>s+x.kg*x.reps,0)),maxKg:Math.max(0,...loads.map(x=>x.kg)),loads};
}
export function dashboard(state,from=state.starts,to=state.ends){
  const selected=state.entries.filter(e=>e.day>=from&&e.day<=to),accepted=selected.filter(e=>e.status==='accepted');
  const rows=state.members.map(m=>{const entries=accepted.filter(e=>e.userId===m.id);return{id:m.id,alias:m.alias,checkIns:entries.length,seconds:entries.reduce((n,e)=>n+e.durationSeconds,0),volumeKg:entries.reduce((n,e)=>n+e.metrics.volumeKg,0),maxKg:Math.max(0,...entries.map(e=>e.metrics.maxKg))};}).sort((a,b)=>b.checkIns-a.checkIns||a.alias.localeCompare(b.alias));
  const exerciseLoads={};for(const e of accepted)for(const load of e.metrics.loads){const byUser=exerciseLoads[load.exerciseId]||(exerciseLoads[load.exerciseId]={});byUser[e.userId]=Math.max(byUser[e.userId]||0,load.kg);}
  let rank=0,last=null;rows.forEach((r,i)=>{if(r.checkIns!==last)rank=i+1;r.rank=rank;last=r.checkIns;});return{from,to,rows,exerciseLoads,accepted:accepted.length,pending:selected.filter(e=>e.status==='pending').length,openCases:state.cases.filter(c=>!c.closedAt&&selected.some(e=>e.id===c.entryId)).length};
}
export function projectChallenge(raw,actor,now){
  const s=closeCases(raw,now);requireMember(s,actor);
  const active=s.activities.find(a=>a.userId===actor&&!a.submittedAt&&!a.abandonedAt);
  const cases=s.cases.map(c=>({...c,votes:c.closedAt?c.votes:c.votes.filter(v=>v.userId===actor),eligible:undefined,canVote:c.eligible.includes(actor)&&!c.votes.some(v=>v.userId===actor)&&now>=Date.parse(c.defenseEnds)&&now<Date.parse(c.voteEnds)}));
  const today=localDay(now),mon=new Date(today+'T12:00:00Z');mon.setUTCDate(mon.getUTCDate()-(mon.getUTCDay()+6)%7);
  const dashboards={all:dashboard(s),week:dashboard(s,mon.toISOString().slice(0,10),today),month:dashboard(s,today.slice(0,8)+'01',today)};
  const isAdmin=actor===adminOf(s);
  return{id:s.id,name:s.name,isAdmin,adminId:adminOf(s),requests:isAdmin?(s.requests||[]):[],starts:s.starts,ends:s.ends,rules:s.rules,createdBy:s.createdBy,inviteCode:s.inviteCode,members:s.members,entries:s.entries.slice(-100).reverse(),cases,audit:s.audit.filter(e=>e.kind!=='vote_cast'||s.cases.find(c=>c.id===e.caseId)?.closedAt).slice(-100).reverse(),active:active?{id:active.id,type:active.type,sport:active.sport,runSource:active.runSource,day:active.day,startedAt:active.startedAt,endedAt:active.endedAt,nonce:active.nonce}:null,dashboard:dashboards.all,dashboards,serverNow:iso(now)};
}
export function csvDashboard(s){const safe=v=>{const t=String(v??'');return '"'+(/^[=+\-@\t\r]/.test(t)?"'":'')+t.replaceAll('"','""')+'"';};return [['Posição','Apelido','Check-ins aceitos','Minutos registrados','Volume declarado (kg × reps)'],...dashboard(s).rows.map(r=>[r.rank,r.alias,r.checkIns,Math.floor(r.seconds/60),r.volumeKg])].map(row=>row.map(safe).join(',')).join('\r\n');}

// Remove dados pessoais de um participante que excluiu a conta. Histórico de pontos continua com apelido anônimo.
export function forgetMember(state,uid,now){
  const s=structuredClone(state),files=[];let n=1;while([...s.members].some(m=>m.alias===`Ex-participante ${n}`))n++;
  for(const m of s.members)if(m.id===uid)m.alias=`Ex-participante ${n}`;
  s.requests=(s.requests||[]).filter(r=>r.id!==uid);
  for(const a of s.activities)if(a.userId===uid){a.locationStart=null;a.locationEnd=null;if(!a.submittedAt&&!a.abandonedAt)a.abandonedAt=iso(now);}
  for(const e of s.entries)if(e.userId===uid){if(e.proof?.path)files.push(e.proof.path);if(e.evidence?.path)files.push(e.evidence.path);e.proof={path:null,hash:e.proof?.hash||null,removed:true};e.evidence=null;e.caption='';if(e.run)e.run.stravaUrl=null;e.metrics={...e.metrics,loads:[]};}
  for(const c of s.cases){if(c.defense&&c.authorId===uid)c.defense.text='[removido a pedido do titular]';for(const x of c.comments)if(x.actor===uid)x.text='[removido a pedido do titular]';}
  if(adminOf(s)===uid){const next=s.members.find(m=>m.id!==uid&&!m.alias.startsWith('Ex-participante'));s.adminId=next?.id||null;}
  event(s,'system','member_forgotten',now);
  return{state:s,files};
}
