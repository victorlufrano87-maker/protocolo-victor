# Cadastro pelo link fixo

Link para compartilhar: **https://protocolo-victor.vercel.app/treino?cadastro=1**.

A pessoa informa seu próprio e-mail, escolhe e repete uma senha de pelo menos 12 caracteres e confirma ser adulta. Após a autenticação, o servidor cria sua entrada na área de treino automaticamente. Não é necessário gerar ou aprovar convites individuais. Cada conta continua vendo apenas seus próprios registros.

## Configuração única do Supabase

Em **Authentication → Sign In / Providers**, ligue **Allow new users to sign up** e salve. Essa opção substitui a orientação anterior de manter o cadastro fechado quando o piloto funcionava só por convite. Não há outra migração SQL nesta atualização.

- Com **Confirm email desligado**, o Supabase permite iniciar a sessão imediatamente depois do cadastro. O código usa o estado de confirmação devolvido pelo próprio Supabase; não confirma e-mails através de uma rota administrativa pública.
- Com **Confirm email ligado**, a pessoa precisa confirmar o e-mail para entrar. A interface explica esse estado, sem prometer entrada imediata. Para envio confiável a clientes, configure e teste o SMTP do Supabase. A entrega real de e-mail depende desse serviço e não foi testada com contas de clientes nesta atualização.
- A recuperação usa o botão **Esqueci minha senha**. É enviado um link para escolher a senha; nenhuma senha pronta é enviada por e-mail. Contas criadas por convites anteriores podem usar essa opção. O envio também depende do serviço de e-mail do Supabase.
- Mantenha **https://protocolo-victor.vercel.app/treino** nos redirecionamentos permitidos. A recuperação usa /treino?redefinir=1; se houver restrição por correspondência exata, inclua essa URL também. O aplicativo pessoal trata o evento de recuperação recebido na raiz e encaminha à tela de senha na área de treino.

## Acesso e administração

A aba do proprietário agora se chama **Clientes** e permite copiar o link fixo, acompanhar as contas e pausar acessos. Convites individuais continuam como alternativa recolhida. Uma conta pausada não é reativada pelo cadastro direto nem por uma corrida entre requisições. Os novos cadastros não recebem permissão de administrador; APP_OWNER_ID continua determinando essa permissão no servidor.

Esta versão libera o treino após cadastro; não integra cobrança, assinatura, pagamento ou aprovação financeira. A IA mantém a cota existente por conta. Abrir cadastros aumenta o número de contas que podem consumir essa cota, portanto monitore consumo e configure proteção contra abuso no Supabase conforme o piloto crescer.

As regras de triagem, consentimento das respostas e da foto, separação de dados e limites de treino descritos em TREINO-PILOTO.md continuam em vigor.

Referências: [cadastro com senha](https://supabase.com/docs/reference/javascript/auth-signup), [recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail).
