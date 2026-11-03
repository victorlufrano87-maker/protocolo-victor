# Ativar as correções de segurança e salvamento

Esta versão é uma proposta para revisão. A migração não foi aplicada ao Supabase de produção e nenhuma publicação foi solicitada pelo agente.

## Ordem de ativação

1. Faça um backup do banco e, com a versão antiga ainda conectada, espere as alterações pendentes de cada aparelho sincronizarem.
2. No Supabase, abra **SQL Editor** e execute **supabase/migrations/20261103_reliability.sql**. Para um projeto novo, execute antes **supabase/schema.sql**. A migração pode ser executada novamente; não apaga diários, pesos ou fotos existentes.
3. Em **Authentication → Users**, copie o **User UID** da sua conta. Na Vercel, cadastre esse valor como **APP_OWNER_ID** (variável exclusiva do servidor, sem prefixo NEXT_PUBLIC).
4. Confirme que **SUPABASE_SERVICE_ROLE_KEY**, **ANTHROPIC_API_KEY** e **CRON_SECRET** estão configurados somente no servidor. **AI_DAILY_LIMIT** é opcional: o padrão é 40 chamadas/dia, com no máximo 6/minuto. A cota é compartilhada entre foto, balança e coach; tentativas que chegam ao provedor também consomem a cota.
5. No Supabase, desative novos cadastros de usuários. Remover o botão de cadastro é apenas uma mudança na tela; não desativa o endpoint de cadastro do Supabase.
6. Revise e aprove o PR. A integração do GitHub com a Vercel pode criar uma prévia da branch automaticamente. Confirme que as variáveis de ambiente da prévia também foram configuradas antes de testá-la. Publicar/mesclar na main é uma etapa posterior de decisão do proprietário.
7. Teste a prévia em um aparelho, depois publique a versão aprovada. Na Vercel, use **Node.js 22.x ou superior**, compatível com Next.js 16.4.5 e as ferramentas de teste.

Não compartilhe chaves ou senhas na conversa ou no GitHub. O UID identifica a conta permitida, mas não é uma senha.

## Conferência rápida

- Acesse Hoje e marque uma refeição. Ao reconectar, espere aparecer **Dados sincronizados**.
- Abra Progresso, registre um peso sem conexão com a nuvem e recarregue. O valor deve continuar no celular. Reconecte e confirme o registro no Supabase.
- Confira os atalhos de água, suplementos, Watch e balança. Eles também passam pela fila de alterações.
- Refaça uma foto. Se houver erro no registro da nova, a foto anterior deve continuar registrada. Uma tentativa de foto que falha fica disponível apenas enquanto a tela continua aberta; fotos não têm fila offline persistente.
- Inicie um descanso no treino, bloqueie a tela e volte depois. O tempo restante deve acompanhar o relógio. O iOS pode impedir o som enquanto o app está suspenso; não há promessa de alarme em segundo plano.
- Com uma sessão de outra conta, /api/food e /api/coach devem responder 403. Sem APP_OWNER_ID, a IA fica indisponível (503), sem liberar acesso geral.
- Sem CRON_SECRET configurado, /api/cron deve recusar inclusive `Authorization: Bearer undefined`.

## Limites e comportamento

- A fila persistida inclui diários, configurações e pesos. Fotos e IA precisam de conexão. Áreas carregadas sob demanda precisam ser abertas com conexão ao menos uma vez para ficarem no cache do aparelho.
- Falta de espaço no armazenamento do navegador aparece como erro; o app não deve anunciar que guardou uma alteração que não conseguiu persistir.
- Operações têm identificadores únicos. Reenviar uma operação após perder a resposta não soma água duas vezes. Alterações em campos diferentes são mescladas no banco. Conflitos no mesmo campo usam a última operação recebida; listas são substituídas como um valor único.
- Use uma aba do app por conta em cada navegador. O controle de conflito no servidor atende aparelhos distintos; esta versão não coordena duas abas gravando simultaneamente no mesmo armazenamento local.
- A migração preserva eventuais pesos duplicados que já existiam. Novos registros do app atualizam a última medição do dia sem apagar o histórico antigo.
- Substituições de fotos confirmam o novo registro antes da limpeza dos arquivos antigos. Uma resposta interrompida ou falha na limpeza pode deixar arquivos sem referência no bucket; isso é preferível a apagar uma foto que pode ter sido salva.
- Notificações usam confirmação por aparelho e uma reserva temporária. Falhas temporárias podem ser tentadas novamente dentro da janela do lembrete. O serviço de push não oferece entrega exatamente uma vez: uma resposta perdida depois de aceitar o envio pode provocar repetição.
- Feche a versão antiga após a publicação e atualize o app. A versão antiga ainda grava registros completos; não use as duas versões em paralelo para editar o mesmo dia.

## Verificação local

Instale as dependências com `npm ci`, rode `npm test` e `npm run build`.

Para os testes de navegador, faça o build com NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co e NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-placeholder, depois rode `npm run test:browser`. Os testes usam respostas simuladas, sem acessar dados de produção nem consumir IA. Chrome/Edge instalado no Windows é detectado automaticamente; em outro ambiente, instale o Chromium do Playwright ou configure PLAYWRIGHT_CHROME_EXECUTABLE.

Os testes de banco usam PostgreSQL embarcado (PGlite) com papéis e políticas de teste. Isso valida a migração e as permissões no ambiente isolado; não verifica políticas, grants ou configurações adicionais presentes no projeto real.

Referências de implementação: [funções e permissões no Supabase](https://supabase.com/docs/guides/database/functions), [migração de APIs assíncronas do Next.js](https://nextjs.org/docs/app/guides/upgrading/version-15).
