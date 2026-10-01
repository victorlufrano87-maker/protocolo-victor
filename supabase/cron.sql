-- PASSO FINAL (depois do deploy na Vercel)
-- Troque SEU-APP e SEU_CRON_SECRET e rode no SQL Editor.
-- Habilite antes: Database > Extensions > pg_cron e pg_net

select cron.schedule(
  'protocolo-push',
  '*/5 * * * *',
  $$ select net.http_get(
       url := 'https://SEU-APP.vercel.app/api/cron',
       headers := jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET')
     ) $$
);
