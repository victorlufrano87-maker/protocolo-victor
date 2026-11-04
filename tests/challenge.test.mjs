import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actChallenge,createChallenge,closeCases,projectChallenge,dashboard,csvDashboard,localDay,metricsFromSession,forgetMember,GESTURES,SPORTS} from '../lib/challenge/domain.mjs';
let serial=0;const uuid=()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++serial).padStart(12,'0')}`;
const users=Array.from({length:6},(_,i)=>`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
const T=Date.parse('2026-11-07T12:00:00Z');
const ctx=(now=T,extra={})=>({now,id:uuid(),code:'4827',gesture:GESTURES[0],...extra});
const apply=(s,user,body,now=T,extra={})=>actChallenge(s,user,{...body,operationId:body.operationId||uuid()},ctx(now,extra));
function group(now=T){let s=createChallenge({name:'Tropa de teste',starts:localDay(now),ends:localDay(now+7*86400000),alias:'Pessoa 1'},users[0],{id:uuid(),inviteCode:'a'.repeat(36),now});for(let i=1;i<6;i++){s=apply(s,users[i],{action:'join',alias:`Pessoa ${i+1}`,consent:true},now);s=apply(s,users[0],{action:'approve',userId:users[i]},now);}return s;}
function started(s=group(),patch={},now=T){s=apply(s,users[0],{action:'start',type:'strength',photoConsent:true,location:{lat:-23.456789,lon:-46.123456,accuracy:8},...patch},now);return s;}
function issued(s=started(),now=T+1800000){return apply(s,users[0],{action:'issue',activityId:s.activities[0].id,location:{lat:-23.456789,lon:-46.123456,accuracy:10}},now);}
function submitted(s=issued(),patch={},now=T+1801000){return apply(s,users[0],{action:'submit',activityId:s.activities[0].id,captureCode:'4827',caption:'Treino feito 4827',proof:{path:'private/photo.jpg',hash:'a'.repeat(64)},...patch},now);}
test('membership, consent, one open activity and one daily check-in are enforced',()=>{
  assert.throws(()=>started(group(),{photoConsent:false}));
  let s=started();assert.throws(()=>apply(s,users[0],{action:'start',type:'strength',photoConsent:true}));
  assert.throws(()=>apply(s,'outsider',{action:'start',type:'strength',photoConsent:true}));
  s=submitted(issued(s));assert.equal(s.entries[0].status,'pending');
  assert.throws(()=>apply(s,users[0],{action:'start',type:'strength',photoConsent:true}));
  assert.throws(()=>apply(s,users[0],{action:'review',entryId:s.entries[0].id,reason:'Conferido por mim mesmo'}));
  const reviewed=apply(s,users[1],{action:'review',entryId:s.entries[0].id,reason:'Código e gesto conferidos na foto.'});assert.equal(dashboard(reviewed).rows[0].checkIns,1);
});
test('surprise is server-issued at the end, expires, and replayed operations cannot duplicate entries',()=>{
  const s=issued();assert.equal(s.activities[0].nonce.code,'4827');
  assert.throws(()=>submitted(s,{captureCode:'0000'}));assert.throws(()=>submitted(s,{caption:'Sem o código'}));
  assert.throws(()=>submitted(s,{},T+1800000+241000));
  const operationId=uuid(),first=submitted(s,{operationId});
  const again=actChallenge(first,users[0],{action:'submit',operationId},ctx(T+99999999));assert.equal(again.entries.length,1);
  const renewed=apply(s,users[0],{action:'issue',activityId:s.activities[0].id},T+1800000+241000,{code:'9912'});
  assert.equal(renewed.activities[0].endedAt,s.activities[0].endedAt);assert.equal(renewed.activities[0].nonce.attempt,2);
  assert.throws(()=>submitted(renewed,{captureCode:'4827'},T+1800000+242000));
});
test('GPS is never exposed in projections; only the actor receives their active surprise',()=>{
  const s=issued(),other=projectChallenge(s,users[1],T+1801000),own=projectChallenge(s,users[0],T+1801000);
  assert.equal(other.active,null);assert.equal(own.active.nonce.code,'4827');
  assert.ok(!JSON.stringify(own).includes('-23.456789'));assert.ok(!JSON.stringify(other).includes('locationStart'));
});
test('run-only requires weekend, 5km, elapsed time <=50, evidence and a canonical Strava link',()=>{
  const fri=Date.parse('2026-11-06T12:00:00Z');assert.throws(()=>started(group(fri),{type:'run',runSource:'strava'},fri));
  const s=issued(started(group(),{type:'run',runSource:'strava'}));
  const good={evidence:{path:'private/strava.jpg',hash:'b'.repeat(64)},km:5,elapsedMinutes:29,stravaUrl:'https://www.strava.com/activities/12345'};
  assert.equal(submitted(s,good).entries[0].run.km,5);
  for(const patch of [{km:4.99},{elapsedMinutes:50.01},{elapsedMinutes:45},{evidence:null},{stravaUrl:'https://evil.example/activities/123'},{stravaUrl:'https://www.strava.com/activities/123?token=secret#map',km:Infinity}])assert.throws(()=>submitted(s,{...good,...patch}));
  assert.equal(submitted(s,{...good,stravaUrl:'https://www.strava.com/activities/12345?foo=bar'}).entries[0].run.stravaUrl,'https://www.strava.com/activities/12345');
});
test('one court case, fixed electorate, defense period and vote secrecy are enforced',()=>{
  let s=submitted();const entry=s.entries[0];s=apply(s,users[1],{action:'contest',entryId:entry.id,reason:'O código não aparece visível nesta foto.'},T+1802000);const c=s.cases[0];
  assert.throws(()=>apply(s,users[2],{action:'contest',entryId:entry.id,reason:'Outra contestação do mesmo registro.'},T+1803000));
  assert.throws(()=>apply(s,users[2],{action:'vote',caseId:c.id,choice:'annul',reason:'Não há código na imagem.'},T+1803000));
  s=apply(s,users[0],{action:'defend',caseId:c.id,reason:'O código aparece na minha mão direita.'},T+1803000);
  const voting=Date.parse(c.defenseEnds)+1;
  for(const user of [users[0],users[1]])assert.throws(()=>apply(s,user,{action:'vote',caseId:c.id,choice:'keep',reason:'Conferi esta comprovação.'},voting));
  s=apply(s,users[2],{action:'vote',caseId:c.id,choice:'annul',reason:'VOTO SECRETO INDIVIDUAL'},voting);
  const view=projectChallenge(s,users[3],voting+1);assert.equal(view.cases[0].votes.length,0);assert.ok(!JSON.stringify(view).includes('VOTO SECRETO INDIVIDUAL'));assert.ok(!view.audit.some(e=>e.kind==='vote_cast'));assert.ok(!('eligible' in JSON.parse(JSON.stringify(view.cases[0]))));
  assert.equal(projectChallenge(s,users[2],voting+1).cases[0].votes.length,1);
  assert.throws(()=>apply(s,users[2],{action:'vote',caseId:c.id,choice:'keep',reason:'Quero alterar meu voto.'},voting+2));
});
test('two thirds of at least three votes annul; no quorum restores the prior pending state',()=>{
  let s=submitted();s=apply(s,users[1],{action:'contest',entryId:s.entries[0].id,reason:'Sem o gesto solicitado na foto.'},T+1802000);const c=s.cases[0],voteAt=Date.parse(c.defenseEnds)+1;
  const cast=(state,user,choice)=>apply(state,user,{action:'vote',caseId:c.id,choice,reason:'Justificativa completa para o voto.'},voteAt);
  const two=cast(cast(s,users[2],'annul'),users[3],'annul');assert.equal(closeCases(two,Date.parse(c.voteEnds)).entries[0].status,'pending');
  const three=cast(two,users[4],'keep'),closed=closeCases(three,Date.parse(c.voteEnds));assert.equal(closed.entries[0].status,'annulled');assert.equal(projectChallenge(closed,users[5],Date.parse(c.voteEnds)).cases[0].votes.length,3);
  assert.equal(closeCases(closed,Date.parse(c.voteEnds)+10000),closed);assert.throws(()=>cast(closed,users[5],'keep'));
});
test('ranking counts only accepted days, ties share a position and CSV neutralizes formulas',()=>{
  let s=submitted();s.members[0].alias='=SUM(1,2)';s.entries[0].status='accepted';s.entries.push({...s.entries[0],id:uuid(),userId:users[1],metrics:{sets:2,volumeKg:100,maxKg:20,loads:[]}});
  const rows=dashboard(s).rows;assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);assert.equal(rows[2].checkIns,0);
  assert.ok(csvDashboard(s).includes("\"'=SUM(1,2)\""));
  assert.equal(metricsFromSession({sets:[{exerciseId:'press',kg:20,reps:10},{exerciseId:'press',kg:20,reps:8}]}).volumeKg,360);
});

test('joining only requests access; the organizer approves, rejects or removes, and requesters cannot act',()=>{
  let s=createChallenge({name:'Tropa de teste',starts:localDay(T),ends:localDay(T+7*86400000),alias:'Org'},users[0],{id:uuid(),inviteCode:'a'.repeat(36),now:T});
  s=apply(s,users[1],{action:'join',alias:'Fake',consent:true});
  assert.equal(s.members.length,1);assert.equal(s.requests.length,1);
  assert.throws(()=>apply(s,users[1],{action:'start',type:'strength',photoConsent:true}),{status:403});
  assert.throws(()=>projectChallenge(s,users[1],T),{status:403});
  assert.equal(projectChallenge(s,users[0],T).requests[0].alias,'Fake');
  assert.throws(()=>apply(s,users[2],{action:'approve',userId:users[1]}),{status:403});
  const rejected=apply(s,users[0],{action:'reject',userId:users[1]});assert.equal(rejected.members.length,1);assert.equal(rejected.requests.length,0);
  s=apply(s,users[0],{action:'approve',userId:users[1]});assert.equal(s.members.length,2);
  assert.equal(projectChallenge(s,users[1],T).requests.length,0);
  assert.throws(()=>apply(s,users[1],{action:'remove',userId:users[0]}),{status:403});
  s=apply(s,users[0],{action:'remove',userId:users[1]});assert.equal(s.members.length,1);
  assert.throws(()=>apply(s,users[1],{action:'join',alias:'Fake de novo',consent:true}),{status:403});
});
test('surprise has many gesture combinations and free-form sport is no longer accepted',()=>{
  assert.ok(GESTURES.length>=40);assert.equal(new Set(GESTURES).size,GESTURES.length);
  assert.ok(!SPORTS.includes('Outro esporte'));
  assert.throws(()=>started(group(),{type:'sport',sport:'Outro esporte'}));
  assert.equal(started(group(),{type:'sport',sport:'Futebol'}).activities[0].sport,'Futebol');
});
test('forgetting a member removes photos, captions, locations and transfers the organizer role',()=>{
  let s=submitted();s=apply(s,users[1],{action:'contest',entryId:s.entries[0].id,reason:'O código não aparece visível nesta foto.'},T+1802000);
  s=apply(s,users[0],{action:'defend',caseId:s.cases[0].id,reason:'Meu endereço aparece ao fundo, ignorem.'},T+1803000);
  const {state,files}=forgetMember(s,users[0],T+1804000);
  assert.deepEqual(files,['private/photo.jpg']);
  const text=JSON.stringify({members:state.members,entries:state.entries,activities:state.activities,cases:state.cases});
  for(const secret of ['Pessoa 1','private/photo.jpg','Treino feito 4827','-23.456789','Meu endereço'])assert.ok(!text.includes(secret),secret);
  assert.equal(state.adminId,users[1]);assert.equal(projectChallenge(state,users[1],T+1804000).isAdmin,true);
  assert.ok(state.members.some(m=>m.alias==='Ex-participante 1'));
  assert.equal(state.audit.slice(0,s.audit.length).length,s.audit.length);
});
