import { test, expect } from "@playwright/test";
const uid = "44444444-4444-4444-8444-444444444444";
const session = () => {
 const exp = Math.floor(Date.now()/1000)+86400;
 const token = [Buffer.from('{"alg":"HS256"}').toString("base64url"),Buffer.from(JSON.stringify({sub:uid,exp})).toString("base64url"),"test"].join(".");
 return {access_token:token,refresh_token:"local-test",token_type:"bearer",expires_at:exp,expires_in:86400,user:{id:uid,email:"new@example.com",email_confirmed_at:new Date().toISOString(),user_metadata:{training_pilot:true,training_password_set:true}}};
};
test("one fixed link creates an account and opens the questionnaire without an invitation", async ({page}) => {
 let signup, loaded = false;
 await page.route("https://example.supabase.co/**",async route => {
  const req=route.request(),path=new URL(req.url()).pathname;
  const headers={"access-control-allow-origin":"*","access-control-allow-headers":"*"};
  if(req.method()==="OPTIONS") return route.fulfill({status:204,headers});
  if(path.endsWith("/signup")){signup=req.postDataJSON();return route.fulfill({contentType:"application/json",headers,body:JSON.stringify(session())});}
  return route.fulfill({contentType:"application/json",headers,body:JSON.stringify({user:session().user})});
 });
 await page.route("**/api/training",route=>{loaded=true;return route.fulfill({contentType:"application/json",body:JSON.stringify({isOwner:false,profile:null,plan:null,sessions:[],photos:[]})});});
 await page.goto("/treino?cadastro=1");
 await expect(page.getByRole("heading",{name:"Crie seu espaço",exact:true})).toBeVisible();
 await page.getByRole("textbox",{name:"E-mail",exact:true}).fill("new@example.com");
 await page.getByLabel("Crie sua senha (mínimo de 12 caracteres)",{exact:true}).fill("Localtest-12345");
 await page.getByLabel("Repita sua senha",{exact:true}).fill("Localtest-12345");
 await page.getByRole("checkbox").check();
 await page.getByRole("button",{name:"Criar minha conta",exact:true}).click();
 await expect(page.getByRole("button",{name:"Montar meu primeiro treino →",exact:true})).toBeVisible();
 expect(loaded).toBe(true);expect(signup.data.training_pilot).toBe(true);expect(signup.data.training_password_set).toBe(true);
 expect(signup.password).toBe("Localtest-12345");
});
test("password recovery requests a reset link and explains that no password is emailed", async ({page}) => {
 let recovery;
 await page.route("https://example.supabase.co/**",async route=>{
  if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"}});
  recovery={url:route.request().url(),body:route.request().postDataJSON()};return route.fulfill({contentType:"application/json",headers:{"access-control-allow-origin":"*"},body:"{}"});
 });
 await page.goto("/treino");await page.getByRole("button",{name:"Esqueci minha senha",exact:true}).click();
 await page.getByRole("textbox",{name:"E-mail",exact:true}).fill("new@example.com");
 await page.getByRole("button",{name:"Enviar link para trocar a senha",exact:true}).click();
 await expect(page.getByText(/Não enviamos uma senha pronta/)).toBeVisible();
 expect(recovery.url).toContain("/recover");expect(recovery.body.email).toBe("new@example.com");
});
test("an authenticated recovery session can set a new password and leave recovery mode",async({page})=>{
 const s=session();
 await page.addInitScript(s=>localStorage.setItem("sb-example-auth-token",JSON.stringify(s)),s);
 let update;
 await page.route("https://example.supabase.co/**",route=>{
  const headers={"access-control-allow-origin":"*","access-control-allow-headers":"*","access-control-allow-methods":"GET,POST,PUT,OPTIONS"};
  if(route.request().method()==="OPTIONS")return route.fulfill({status:204,headers});
  update=route.request().postDataJSON();return route.fulfill({contentType:"application/json",headers,body:JSON.stringify(s.user)});
 });
 await page.route("**/api/training",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({isOwner:false,profile:null,plan:null,sessions:[],photos:[]})}));
 await page.goto("/treino?redefinir=1");await expect(page.getByRole("heading",{name:"Defina sua senha.",exact:true})).toBeVisible();
 await page.getByLabel("Nova senha",{exact:true}).fill("Changed-123456");await page.getByLabel("Repita sua nova senha",{exact:true}).fill("Changed-123456");
 await page.getByRole("button",{name:"Salvar minha senha",exact:true}).click();
 await expect(page.getByRole("button",{name:"Montar meu primeiro treino →",exact:true})).toBeVisible();expect(update.password).toBe("Changed-123456");
});
