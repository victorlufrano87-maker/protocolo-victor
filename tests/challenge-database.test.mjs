import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',g='22222222-2222-4222-8222-222222222222',h='33333333-3333-4333-8333-333333333333',activity='44444444-4444-4444-8444-444444444444';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);insert into auth.users values('${a}');create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);grant usage on schema public to anon,authenticated,service_role;`);
const sql=await readFile(new URL('../supabase/migrations/20261104_challenges.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
const state=id=>({id,name:'Tropa',createdBy:a,inviteCode:id,starts:'2026-11-04',ends:'2026-11-10',rules:{version:1},members:[{id:a}],audit:[{id:'1',kind:'created'}]});
for(const id of [g,h])await db.query('insert into gym_challenges(id,created_by,invite_code,member_ids,state) values($1,$2,$3,$4,$5::jsonb)',[id,a,id,[a],JSON.stringify(state(id))]);
const commit=(id,version,s,live=null)=>db.query('select gym_challenge_commit($1,$2,$3::jsonb,$4,$5,$6) as ok',[id,version,JSON.stringify(s),a,live,activity]);
test('challenge state, coordinates and votes cannot be read directly or written by authenticated clients',async()=>{
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);try{await assert.rejects(()=>db.query('select state from gym_challenges'));await assert.rejects(()=>commit(g,1,state(g)));}finally{await db.exec('reset role');}}
});
test('CAS prevents lost ballots, immutable rules and append-only audit cannot be edited',async()=>{
  const next={...state(g),audit:[...state(g).audit,{id:'2',kind:'test'}]};assert.equal((await commit(g,1,next)).rows[0].ok,true);assert.equal((await commit(g,1,state(g))).rows[0].ok,false);
  await assert.rejects(()=>commit(g,2,{...next,rules:{version:2}}),/immutable/);
  await assert.rejects(()=>commit(g,2,{...next,audit:[]}),/Audit/);
});
test('global unique open activity rolls back the other challenge update atomically',async()=>{
  const current=(await db.query('select state from gym_challenges where id=$1',[g])).rows[0].state;
  assert.equal((await commit(g,2,current,'start')).rows[0].ok,true);
  await assert.rejects(()=>commit(h,1,state(h),'start'),/duplicate key/);
  assert.equal((await db.query('select version from gym_challenges where id=$1',[h])).rows[0].version,1);
  await commit(g,3,current,'end');assert.equal((await commit(h,1,state(h),'start')).rows[0].ok,true);
});
