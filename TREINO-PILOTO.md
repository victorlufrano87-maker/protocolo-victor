# Piloto de treino personalizado por convite

Uma área nova em **/treino**, dentro do mesmo projeto. O aplicativo pessoal do Victor continua separado. Convidados entram em uma conta própria, sem receber a dieta, os suplementos ou os registros do Victor.

## O que a pessoa faz

1. Abre um convite pessoal e define sua senha.
2. Concorda com o uso das respostas e responde a 25 perguntas, uma por tela: idade adulta, objetivo, prioridades, experiência, interrupção do treino, atividade atual, sinais e limitações de saúde, local, equipamentos disponíveis, dias, duração, movimento diário, sono, estresse, preferências e apoio profissional. Peso é opcional.
3. Confere e salva as respostas. Sinais que pedem avaliação interrompem a proposta automática; não há um botão de “liberação médica” baseado em autodeclaração.
4. Pode enviar uma foto privada com consentimento específico ou pular. A foto não é enviada ao provedor de IA e não é usada para estimar gordura, diagnosticar postura ou escolher exercícios.
5. Recebe uma proposta inicial, com exercícios compatíveis com o equipamento informado, estimativa de duração incluindo aquecimento, séries, faixa de repetições, descanso, orientação de esforço e alternativas da mesma categoria.
6. Registra repetições e cargas e avalia esforço, recuperação e dor. Uma sessão parcial pode ser registrada. Rascunho e fila de sessões ficam no aparelho; ao reconectar, os registros são enviados com o mesmo ID, evitando duplicação.
7. Depois de três sessões sincronizadas da mesma proposta, o servidor tenta reavaliá-la automaticamente. Há um intervalo mínimo de um minuto entre gerações. O aluno também pode pedir reavaliação. Cargas não aumentam automaticamente. Uma falha da reavaliação não invalida uma sessão já salva.

## Ativação em ordem

1. Preserve a cópia dos registros já feita. Este trabalho expande o PR nº 1; ele continua sem ser mesclado na main.
2. A migração **20261103_reliability.sql** já foi executada pelo proprietário. Execute também **supabase/migrations/20261103_training_pilot.sql** no SQL Editor do mesmo projeto. Ela adiciona tabelas e um bucket privado, sem apagar os dados pessoais existentes. É reaplicável.
3. Confira as variáveis **APP_OWNER_ID**, **SUPABASE_SERVICE_ROLE_KEY**, **NEXT_PUBLIC_SUPABASE_URL**, **NEXT_PUBLIC_SUPABASE_ANON_KEY** e **ANTHROPIC_API_KEY** em Production e na prévia da branch. Não é necessária outra chave de IA. **TRAINING_AI_DAILY_LIMIT** é opcional, com padrão de 10 chamadas por conta/dia e até 6/minuto. Ela usa o contador central de IA já existente; a cota não é uma garantia monetária de custo.
4. No Supabase, **Authentication → URL Configuration**, confira a Site URL de produção e acrescente a URL exata **https://protocolo-victor.vercel.app/treino** aos redirecionamentos permitidos. Para testar links de convite na prévia, acrescente também a URL exata da prévia seguida de /treino. Não libere qualquer domínio com um curinga irrestrito.
5. Mantenha o cadastro público desligado. A geração de convites usa a administração do Supabase no servidor. **Gerar link não envia e-mail nem mensagem**. O responsável copia o link e decide com quem compartilhar; ele autoriza o acesso àquela conta e deve ser tratado como confidencial.
6. Republique primeiro a prévia e entre como proprietário em **/treino**. Teste o questionário e o registro de uma sessão antes de mesclar o PR. O link “Treino personalizado e convites” também aparece no aplicativo pessoal.
7. Depois de publicar a versão revisada, abra **/treino → Convites**, informe o e-mail de um amigo adulto e clique em **Gerar link de convite**. Copie o link e compartilhe de forma privada. Para um e-mail já cadastrado, é gerado um link de acesso à mesma conta. Confirme que a URL leva à versão certa antes de convidar alguém.

## Uso e privacidade

- O proprietário gerencia e-mail e status dos convidados, sem painel para ler fotos, respostas de saúde ou treinos alheios. As políticas de banco permitem leitura somente das próprias linhas; somente as rotas autenticadas no servidor gravam perfis e propostas.
- O administrador técnico do projeto Supabase tem acesso privilegiado ao banco e aos arquivos. “Privado” aqui significa separado entre usuários dentro do aplicativo, não oculto do administrador do serviço.
- As fotos têm limite de 5 MB por arquivo no bucket, são reduzidas antes de enviar e usam URLs assinadas de 15 minutos. Podem ser excluídas em Evolução. Fotos exigem conexão.
- A explicação da IA é opcional, autorizada separadamente. Ela recebe apenas dados estruturados de treino, sem nome, idade, foto, peso, texto livre ou respostas de saúde. Só pode ranquear exercícios do catálogo; a aplicação filtra novamente os exercícios elegíveis e mantém seus limites de volume e tempo. Se falhar ou atingir a cota, aparece o plano base com identificação explícita.
- Os textos livres ficam como anotações; não são interpretados pela IA como restrições médicas. Restrições devem ser respondidas nas perguntas específicas, que interrompem a geração automática.
- O plano é uma proposta conservadora para adultos sem sinais informados que exijam avaliação, não um treino “perfeito”, prescrição de reabilitação ou avaliação clínica. Sintomas, dor, gestação, condição de saúde ou dúvida relevante pausam a rotina automática. O fluxo desta versão não gerencia uma liberação clínica posterior; esses casos precisam de orientação individual fora da geração automática.
- O foco inicial é corpo todo até três vezes por semana, com dias separados. Dias adicionais viram recuperação ativa. Sem equipamento de puxada, o app informa a lacuna; ele não afirma que um exercício sem resistência substitui uma puxada.
- Contas pausadas perdem acesso às rotas de treino. Dados previamente baixados ainda podem existir no aparelho; pausar acesso não apaga remotamente o armazenamento do navegador.
- Respostas e sessões são guardadas no navegador para retomar e trabalhar sem conexão. Use uma aba por conta. Evite aparelhos compartilhados. O questionário salvo é particular de cada conta e a prévia usa o mesmo banco real se configurada com as mesmas chaves.
- Uma sessão antiga enviada depois de mudar o perfil é preservada como registro histórico e marcada no servidor; isso não libera um novo treino com perfil desatualizado.
- O cache de /treino permite reabrir a área offline após carregá-la com conexão. Novas propostas, fotos, convites e primeiro acesso dependem de rede. O iOS pode restringir alarmes quando o app fica suspenso; o descanso acompanha o horário ao voltar.

## Validação

`npm test` inclui regras do questionário, limites de equipamento e duração, separação entre dias, resposta à recuperação, pausa por dor, validação de sessões, autenticação por convite e testes de RLS em PostgreSQL embarcado (PGlite). `npm run test:browser` verifica o fluxo completo e sessões offline em navegador com tela de celular, sem dados reais ou consumo de IA. Não houve teste no iPhone físico nem envio de convites de produção.

## Referências de desenho das regras

- [ACSM, recomendações de treino resistido de 2026](https://acsm.org/resistance-training-guidelines-update-2026/): individualização, consistência e alternativas de equipamento.
- [CSEP, triagem antes de atividade física](https://csep.ca/2021/01/20/pre-screening-for-physical-activity/): necessidade de encaminhar dúvidas e sinais relevantes para avaliação. O formulário do app é simplificado e não se apresenta como o questionário oficial validado da CSEP.
- [Supabase: redirecionamentos de autenticação](https://supabase.com/docs/guides/auth/redirect-urls) e [limites de armazenamento](https://supabase.com/docs/guides/storage/uploads/file-limits).
