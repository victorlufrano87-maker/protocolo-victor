-- Permite excluir contas (LGPD) sem apagar os desafios do grupo. Rode depois de 20261104_challenges.sql. Seguro para rodar de novo.
begin;
alter table public.gym_challenges alter column created_by drop not null;
alter table public.gym_challenges drop constraint if exists gym_challenges_created_by_fkey;
alter table public.gym_challenges add constraint gym_challenges_created_by_fkey foreign key (created_by) references auth.users(id) on delete set null;
alter table public.gym_challenge_live drop constraint if exists gym_challenge_live_user_id_fkey;
alter table public.gym_challenge_live add constraint gym_challenge_live_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
commit;
