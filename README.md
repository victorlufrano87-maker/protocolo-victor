# Protocolo Victor v1

App pessoal de dieta, água e suplementos, com notificações no iPhone. Custo: R$ 0 (Vercel Hobby + Supabase Free).

## Passo a passo (uns 15 min)

### 1. Supabase
1. Crie um projeto novo (região São Paulo).
2. **SQL Editor** → cole `supabase/schema.sql` → **Run**.
3. **Authentication → Providers → Email**: desligue *Confirm email* (mais simples para uso pessoal).
4. **Project Settings → API**: copie `Project URL`, `anon key` e `service_role key`.

### 2. GitHub
1. Crie um repositório **privado** `protocolo-victor`.
2. Suba esta pasta (sem `node_modules`).

### 3. Vercel
1. **Add New → Project** → importe o repositório.
2. Em **Environment Variables**, cadastre:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (do Supabase)
   - as 4 do arquivo `chaves-vercel.txt`
3. **Deploy**. Anote a URL (ex.: `protocolo-victor.vercel.app`).

### 4. Agendar as notificações (Supabase)
1. **Database → Extensions**: habilite `pg_cron` e `pg_net`.
2. Abra `supabase/cron.sql`, troque `SEU-APP` e `SEU_CRON_SECRET`, rode no SQL Editor.

### 5. iPhone
1. Abra a URL no **Safari** → Compartilhar → **Adicionar à Tela de Início**.
2. Abra pelo ícone, crie a conta e toque em **Ativar** notificações.
3. Em **Plano**: ajuste horários, data da atualização e início dos potes de cápsulas.

## Como testar
- Abra `https://SEU-APP.vercel.app/api/cron` com o header `Authorization: Bearer CRON_SECRET` → deve responder `{"ok":true}`.
- Supabase → **Database → Cron Jobs** mostra as execuções a cada 5 min.

## Notificações
| Quando | Aviso |
|---|---|
| Horário da refeição | O que comer + suplementos do momento |
| 45 min depois, se não marcou | Refeição pendente |
| 10h, 12h, 14h, 16h, 18h, 20h | Água, se estiver abaixo do ritmo |
| 21h30 | Quanto falta para 2,6 L |
| 20 min após "Terminei o treino" | Pós-treino pendente |
| Véspera e dia da atualização (7h30) | Peso em jejum, fotos, feedback |
| 5 dias antes de acabar a cápsula | Reabastecer |

## Estrutura
- `lib/plan.js` — dieta, suplementos, substituições (edite aqui quando o personal atualizar o plano)
- `app/page.js` — telas (Hoje, Progresso, Trocas, Plano)
- `app/api/cron/route.js` — regras das notificações
- `supabase/` — banco e agendamento
