import {randomUUID,randomBytes,randomInt,createHash} from 'node:crypto';
import {trainingAccess} from '@/lib/training/server';
import {readJson} from '@/lib/ai-guard.mjs';
import {createChallenge,actChallenge,closeCases,projectChallenge,requireMember,ChallengeError,GESTURES,metricsFromSession} from '@/lib/challenge/domain.mjs';
export const maxDuration=30;
const BUCKET='challenge-proofs';
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const dbCheck=r=>{if(r.error)throw Object.assign(new Error('O desafio precisa ser ativado no banco ou está temporariamente indisponível.'),{status:503});return r.data;};
const fail=e=>json({error:e instanceof ChallengeError?e.message:e.status===401?'Entre novamente para continuar.':e.status===403?'Acesso não permitido.':e.status===503?e.message:'Não consegui concluir agora. Tente novamente.'},e.status||500);
async function group(db,id){if(!/^[a-f0-9-]{36}$/i.test(id||''))throw new ChallengeError('Desafio inválido.');const r=dbCheck(await db.from('gym_challenges').select('*').eq('id',id).maybeSingle());if(!r)throw new ChallengeError('Desafio não encontrado.',404);return r;}
async function signed(db,state,uid){
  if(!state.members.some(m=>m.id===uid))return null;
  const view=projectChallenge(state,uid,Date.now()),paths=[...new Set(view.entries.flatMap(e=>[e.proof?.path,e.evidence?.path]).filter(Boolean))];
  if(paths.length){const r=dbCheck(await db.storage.from(BUCKET).createSignedUrls(paths,180));const urls=Object.fromEntries(paths.map((p,i)=>[p,r?.[i]?.signedUrl||null]));view.entries=view.entries.map(e=>({...e,proof:{...e.proof,url:urls[e.proof.path]},evidence:e.evidence?{...e.evidence,url:urls[e.evidence.path]}:null}));}
  return view;
}
async function respond(db,state,uid){const challenge=await signed(db,state,uid);if(challenge)return json({challenge});if((state.requests||[]).some(r=>r.id===uid))return json({joinRequested:true,name:state.name});throw new ChallengeError('Você não participa deste desafio.',403);}
export async function GET(req){try{
  const {uid,db}=await trainingAccess(req),id=new URL(req.url).searchParams.get('id');
  if(!id){const rows=dbCheck(await db.from('gym_challenges').select('id,state').contains('member_ids',[uid]).order('created_at',{ascending:false}).limit(30));return json({groups:rows.map(r=>({id:r.id,name:r.state.name,starts:r.state.starts,ends:r.state.ends,members:r.state.members.length}))});}
  let row=await group(db,id);requireMember(row.state,uid);
  const settled=closeCases(row.state,Date.now());
  if(settled!==row.state){const result=await db.rpc('gym_challenge_commit',{p_id:id,p_version:row.version,p_state:settled,p_actor:uid});if(result.error)throw new ChallengeError('Não foi possível fechar os casos agora.',503);row=await group(db,id);}
  return json({challenge:await signed(db,row.state,uid)});
}catch(e){return fail(e);}}
function imageData(v,required=false){
  if(!v&&!required)return null;
  if(typeof v!=='string'||v.length>2800000||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(v))throw new ChallengeError('Envie uma imagem JPEG ou PNG de até 2 MB.');
  const [,mime,data]=v.match(/^data:(image\/(?:jpeg|png));base64,(.+)$/),buffer=Buffer.from(data,'base64');
  const valid=mime==='image/jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(!valid||buffer.length<100||buffer.length>2097152)throw new ChallengeError('Imagem inválida ou muito grande.');
  return{buffer,mime,hash:createHash('sha256').update(buffer).digest('hex')};
}
export async function POST(req){let db,uploads=[],committed=false;try{
  const access=await trainingAccess(req);db=access.db;const uid=access.uid;
  const body=await readJson(req,5800000),action=body.action;
  if(!/^[a-f0-9-]{36}$/i.test(body.operationId||''))throw new ChallengeError('Identificador da operação ausente. Reabra o desafio.');
  if(action==='create'){
    if(body.consent!==true)throw new ChallengeError('Aceite as regras e a publicação das comprovações no grupo.');
    const existing=dbCheck(await db.from('gym_challenges').select('id').eq('created_by',uid).limit(10));if(existing.length>=10)throw new ChallengeError('Limite de dez desafios criados nesta conta.');
    const prior=dbCheck(await db.from('gym_challenges').select('*').eq('id',body.operationId).maybeSingle());if(prior){if(prior.created_by!==uid)throw new ChallengeError('Identificador de criação indisponível.',409);return json({challenge:await signed(db,prior.state,uid)});}
    const s=createChallenge(body,uid,{id:body.operationId,inviteCode:randomBytes(18).toString('hex'),now:Date.now()});
    dbCheck(await db.from('gym_challenges').insert({id:s.id,created_by:uid,invite_code:s.inviteCode,member_ids:[uid],state:s}));return json({challenge:await signed(db,s,uid)});
  }
  let id=body.id;
  if(action==='join'){
    const token=String(body.inviteCode||'').trim();if(!/^[a-f0-9]{36}$/.test(token))throw new ChallengeError('Cole o código de convite de 36 caracteres.');
    const r=dbCheck(await db.from('gym_challenges').select('id').eq('invite_code',token).maybeSingle());if(!r)throw new ChallengeError('Convite não encontrado.',404);id=r.id;
  }
  const proof=action==='submit'?imageData(body.photo,true):null,evidence=action==='submit'?imageData(body.evidenceImage):null;
  if(proof&&proof.mime!=='image/jpeg')throw new ChallengeError('A foto principal precisa ser capturada pela câmera do aplicativo.');
  for(let attempt=0;attempt<3;attempt++){
    const row=await group(db,id);if(action!=='join')requireMember(row.state,uid);
    if(row.state.processed.includes(body.operationId))return respond(db,row.state,uid);
    let metrics=null;
    if(body.trainingSessionId){if(!/^[a-f0-9-]{36}$/i.test(body.trainingSessionId))throw new ChallengeError('Registro de treino inválido.');const s=dbCheck(await db.from('training_sessions').select('id,sets,completed_at,workout_id').eq('id',body.trainingSessionId).eq('user_id',uid).maybeSingle());const activity=row.state.activities.find(a=>a.id===body.activityId&&a.userId===uid);if(!s||!activity||!s.workout_id.startsWith('strength-')||Date.parse(s.completed_at)<Date.parse(activity.startedAt)||Date.parse(s.completed_at)>Date.parse(activity.endedAt||Date.now()))throw new ChallengeError('Vincule um treino seu realizado durante esta atividade.');metrics=metricsFromSession(s);}
    const uploadPrefix=`${id}/${uid}/${body.operationId}`;
    const input={...body,proof:proof?{path:`${uploadPrefix}/main.jpg`,hash:proof.hash}:null,evidence:evidence?{path:`${uploadPrefix}/evidence.${evidence.mime==='image/png'?'png':'jpg'}`,hash:evidence.hash}:null};
    const context={now:Date.now(),id:randomUUID(),code:String(randomInt(1000,10000)),gesture:GESTURES[randomInt(GESTURES.length)],metrics};
    const next=actChallenge(row.state,uid,input,context);
    if(proof&&!uploads.length){
      for(const [image,path] of [[proof,input.proof.path],[evidence,input.evidence?.path]]){if(!image)continue;const result=await db.storage.from(BUCKET).upload(path,image.buffer,{contentType:image.mime,upsert:false});if(result.error)throw new ChallengeError('Não consegui guardar a imagem. Tente concluir novamente antes de o código expirar.',503);uploads.push(path);}
    }
    const activity=action==='start'?next.activities.find(a=>a.id===context.id):row.state.activities.find(a=>a.id===body.activityId);
    const written=await db.rpc('gym_challenge_commit',{p_id:id,p_version:row.version,p_state:next,p_actor:uid,p_live:action==='start'?'start':['abandon','submit'].includes(action)?'end':null,p_activity:activity?.id||null});
    if(written.error){if(written.error.code==='23505')throw new ChallengeError('Você já tem uma atividade aberta em outro desafio. Conclua ou encerre antes de iniciar outra.');throw new ChallengeError('Não consegui salvar a alteração no desafio.',503);}
    if(written.data){committed=true;return respond(db,next,uid);}
  }
  throw new ChallengeError('O grupo foi atualizado ao mesmo tempo. Tente novamente.',409);
}catch(e){if(uploads.length&&!committed)try{await db.storage.from(BUCKET).remove(uploads);}catch{}return fail(e);}}
