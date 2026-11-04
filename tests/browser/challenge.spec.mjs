import {test,expect} from '@playwright/test';
import {createChallenge,actChallenge,projectChallenge,localDay} from '../../lib/challenge/domain.mjs';
const uid='22222222-2222-4222-8222-222222222222',peer='33333333-3333-4333-8333-333333333333';
async function fixture(page,{unavailable=false}={}){
 const now=Date.now(),exp=Math.floor(now/1000)+86400,token=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:uid,exp})).toString('base64url'),'test'].join('.');
 await page.addInitScript(({uid,exp,token})=>localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:exp,user:{id:uid,email:'test@example.com',user_metadata:{training_pilot:true,training_password_set:true}}})),{uid,exp,token});
 await page.context().grantPermissions(['camera','geolocation']);await page.context().setGeolocation({latitude:-23.5,longitude:-46.6,accuracy:10});
 let s=createChallenge({name:'Tropa de teste',starts:localDay(now),ends:localDay(now+86400000),alias:'Batata'},uid,{id:crypto.randomUUID(),inviteCode:'a'.repeat(36),now});
 s=actChallenge(s,peer,{action:'join',alias:'Amigo',consent:true,operationId:crypto.randomUUID()},{now,id:crypto.randomUUID()});
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/training**',r=>r.fulfill({json:{profile:null,plan:null,isOwner:false,sessions:[],photos:[]}}));
 await page.route('**/api/challenges**',async r=>{
  if(unavailable)return r.fulfill({status:503,json:{error:'O desafio precisa ser ativado no banco ou está temporariamente indisponível.'}});
  const body=r.request().method()==='POST'?r.request().postDataJSON():null;
  if(body){requests.push(body);s=actChallenge(s,uid,{...body,proof:body.photo?{path:'private/test.jpg',hash:'a'.repeat(64)}:undefined},{now:Date.now(),id:crypto.randomUUID(),code:'4827',gesture:'✌️'});}
  const challenge=projectChallenge(s,uid,Date.now());
  return r.fulfill({json:body||new URL(r.request().url()).searchParams.has('id')?{challenge}:{groups:[{id:s.id,name:s.name,starts:s.starts,ends:s.ends,members:2}]}});
 });
 await page.goto('/treino');await expect(page.getByText('Conectado',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Desafio',exact:true}).click();
 return{errors,requests,accept:()=>{s=actChallenge(s,peer,{action:'review',entryId:s.entries[0].id,reason:'Código e gesto conferidos na foto.',operationId:crypto.randomUUID()},{now:Date.now(),id:crypto.randomUUID()});}};
}
test('mobile challenge uses a live camera, pending peer review and private ranking export',async({page})=>{
 const f=await fixture(page);await page.getByRole('button',{name:/Tropa de teste/}).click();
 await expect(page.getByText('4827',{exact:true})).toHaveCount(0);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Iniciar atividade e capturar localização'}).click();
 await expect(page.getByText('ATIVIDADE ABERTA')).toBeVisible();await expect(page.getByText('4827',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Terminei · revelar surpresa'}).click();await expect(page.getByText('4827',{exact:true})).toBeVisible();
 await expect(page.locator('input[type=file]')).toHaveCount(0);
 await page.getByRole('button',{name:/Abrir câmera · Foto principal/}).click();await expect.poll(()=>page.locator('video').evaluate(v=>v.videoWidth)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Tirar foto agora'}).click();await page.getByLabel('Legenda com o código').fill('Treino concluído 4827');
 await page.getByRole('button',{name:'Publicar para conferência do grupo'}).click();await expect(page.getByText('Aguardando conferência',{exact:true})).toBeVisible();
 expect(f.requests.find(x=>x.action==='submit').photo).toMatch(/^data:image\/jpeg;base64,/);await expect(page.getByRole('button',{name:'Conferi · aceitar check-in'})).toHaveCount(0);
 f.accept();await page.getByRole('button',{name:'Atualizar',exact:true}).click();await page.getByRole('button',{name:'Ranking',exact:true}).click();await expect(page.getByText('1 check-ins',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Preparar resenha para compartilhar'}).click();await expect(page.getByAltText('Prévia do card de ranking')).toBeVisible();
 expect(await page.locator('textarea[readonly]').inputValue()).not.toContain('-23.5');expect(f.errors).toEqual([]);
 await page.screenshot({path:'../../outputs/desafio-mobile-teste.png',fullPage:true});
});
test('missing challenge database has a clear message and training navigation still works',async({page})=>{
 const f=await fixture(page,{unavailable:true});await expect(page.locator('.challenge [role=alert]')).toContainText('precisa ser ativado');await page.getByRole('button',{name:'Treino',exact:true}).click();await expect(page.getByRole('button',{name:'Montar meu primeiro treino →'})).toBeVisible();expect(f.errors).toEqual([]);
});
