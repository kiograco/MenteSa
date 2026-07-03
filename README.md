
  # MenteSa — SaaS Platform for Psychologists

  This is a code bundle for SaaS Platform for Psychologists. The original project is available at https://www.figma.com/design/j313aEvWol9JTdOGxQxQw6/SaaS-Platform-for-Psychologists.

  ## Running the code

  Requires Node 22+ (see `.nvmrc`; `@supabase/supabase-js` targets Node 22). Run `nvm use` if you use nvm.

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  Other scripts:

  - `npm run build` — production build (Vite)
  - `npm run typecheck` — TypeScript, no emit
  - `npm run test` — unit tests (Vitest) for the pure logic in `src/lib`

  ## Supabase MVP setup

  Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

  Apply the migrations in `supabase/migrations/` in order, then run `supabase/seed.sql` to create fake demo users and verified professionals.

  Demo users:

  - `paciente.demo@mindcare.test` / `MindCare123!`
  - `fernanda.demo@mindcare.test` / `MindCare123!`
  - `admin.demo@mindcare.test` / `MindCare123!`

  ## MVP checklist

  - [x] Schema, RLS e seed do Supabase (`supabase/migrations`, `supabase/seed.sql`)
  - [x] Login, cadastro, logout e proteção de rotas por papel (patient/professional/admin)
  - [x] Diretório de profissionais verificados (busca, filtros)
  - [x] Perfil profissional com agenda/disponibilidade reais
  - [x] Agendamento real com validação simples de conflito de horário
  - [x] Checkout mock (Pix/cartão) registrando pagamento com taxa da plataforma
  - [x] Dashboard do paciente (consultas, histórico, total investido)
  - [x] Dashboard profissional (agenda, pacientes, receita mensal)
  - [x] Prontuário: notas clínicas por sessão (`session_notes`, RLS só para o profissional)
  - [x] Sala de vídeo mock vinculada à consulta (`video_rooms`)
  - [x] Painel admin: aprovar/rejeitar profissionais, listar/suspender/excluir usuários e pagamentos
  - [x] Autoatendimento do profissional: editar bio/especialidades/preço/cidade/modalidades/convênios
        e gerenciar a própria disponibilidade semanal (tela "Configurações" do dashboard profissional)
  - [x] Agenda do profissional com consultas reais (semana/dia/mês), criação de consulta de retorno
        e sincronização opcional com o Google Agenda
  - [x] Build limpo (`npm run build`), typecheck limpo (`npm run typecheck`) e testes unitários básicos (`npm run test`)

  Fora do escopo do MVP (ficou como mock/placeholder de propósito): IA de transcrição de sessão
  (`AIAssistantScreen`) e receituário digital.

  ## Indo para produção

  Checklist do que falta para o app sair do MVP e virar algo usável com dinheiro/dados reais.
  Todo o código já está pronto — o que falta, na maioria dos itens, é você criar as contas nos
  provedores e preencher as chaves (nenhuma chave real está no repositório).

  ### Progresso

  - [x] Node 22 alinhado (`.nvmrc`/`engines`) e CI no GitHub Actions (`.github/workflows/ci.yml`)
  - [x] Código morto removido (shadcn/Figma scaffold não usado) e vendor chunks separados
  - [x] Monitoramento de erros (Sentry, opciconal via `VITE_SENTRY_DSN`)
  - [x] Termos de Uso / Política de Privacidade + consentimento obrigatório no cadastro
  - [x] Fluxo de "esqueci minha senha"
  - [x] Upload de documento para verificação profissional
  - [x] Vídeo real (Daily.co)
  - [x] Pagamento real (Mercado Pago)
  - [x] E-mail transacional de confirmação
  - [x] Projeto Supabase real (staging/prod) + deploy de migrations via CI
  - [x] Checagem de responsividade mobile
  - [x] Revisão de segurança final

  ### Termos de Uso e Privacidade

  `src/content/legal.ts` tem o rascunho de Termos de Uso e Política de Privacidade, exibido em
  modal (`LegalModal`) no rodapé da landing page e no cadastro. O cadastro (e-mail ou Google) fica
  bloqueado até o usuário marcar a caixa de aceite; a data de aceite é gravada em
  `profiles.terms_accepted_at` (migration `20260703000000_terms_acceptance.sql`).

  ⚠️ **O texto é um rascunho, não é parecer jurídico.** Antes de abrir para usuários reais, peça
  para um advogado (idealmente com experiência em saúde/LGPD) revisar `src/content/legal.ts` —
  principalmente as seções sobre dados sensíveis de saúde (prontuário) e retenção de dados.

  ### Esqueci minha senha

  Usa `supabase.auth.resetPasswordForEmail` + `supabase.auth.updateUser`, ambos nativos do
  Supabase Auth — não precisa de nenhuma chave nova. O único pré-requisito é que o **envio de
  e-mail esteja habilitado no projeto Supabase** (Authentication → Emails no dashboard). Sem SMTP
  próprio configurado (veja abaixo), o Supabase usa um serviço de e-mail compartilhado com limite
  bem baixo — cadastro/recuperação de senha passam a falhar com "email rate limit exceeded" depois
  de poucos envios.

  ### SMTP próprio (Resend)

  `supabase/config.toml` já tem `[auth.email.smtp]` configurado pra usar o Resend (mesma
  `RESEND_API_KEY` das Edge Functions, via `env()` — nunca hardcoded no arquivo). Isso tira os
  e-mails do Auth (confirmação de cadastro, recuperação de senha) do limite baixo do serviço
  padrão do Supabase.

  Para ativar:
  1. Crie uma conta em https://resend.com e gere uma API key (Sending access basta).
  2. `export RESEND_API_KEY=re_sua_chave` no seu terminal.
  3. `npx supabase config push` — aplica `site_url`, `additional_redirect_urls` e o SMTP de uma vez.
  4. Se você verificar um domínio próprio no Resend, atualize `admin_email` em
     `supabase/config.toml` (está usando o domínio de teste `onboarding@resend.dev` por padrão).

  ### Vídeo real (Daily.co)

  `supabase/functions/daily-room-access` cria (ou reaproveita) uma sala privada no Daily.co por
  consulta e emite um token de acesso de curta duração (4h) para quem está chamando — o
  `DAILY_API_KEY` nunca chega ao navegador. No cliente, `VideoScreen` chama essa função ao entrar
  na sala; se der certo, embute o iframe do Daily (`@daily-co/daily-js`, carregado sob demanda só
  nessa tela) com a UI completa deles (câmera, mic, chat, compartilhar tela). **Se a função não
  estiver implantada ou a chave não estiver configurada, a tela cai de volta pro mock anterior**
  (imagem estática + sala fake) — nada quebra, só não tem vídeo real.

  Para ativar:
  1. Crie uma conta em https://daily.co e pegue a API key.
  2. `supabase functions deploy daily-room-access`
  3. `supabase secrets set DAILY_API_KEY=...`

  ### Pagamento real (Mercado Pago)

  Fluxo: `create-mp-preference` cria uma preferência do **Checkout Pro** (o checkout hospedado
  pelo próprio Mercado Pago) para a consulta e devolve o link; o cliente redireciona o navegador
  para lá — nenhum dado de cartão passa pelo nosso app. `mercadopago-webhook` é chamado pelo
  Mercado Pago quando o status do pagamento muda; ele busca o pagamento direto na API deles (nunca
  confia só na notificação recebida) e grava em `payments` com `provider_payment_id` (upsert
  idempotente — o Mercado Pago reenvia notificações). **O redirecionamento de volta (`back_urls`)
  é só cosmético** (mostra o banner "pagamento aprovado/pendente/falhou" no topo da tela) — quem
  decide de verdade se a consulta foi paga é sempre o webhook.

  Como este app não tem router (navegação é só estado em memória), o retorno do Mercado Pago cai
  em `/` com `?mp=success|pending|failure` na URL; `App()` lê esse parâmetro, limpa a URL e manda
  o usuário pro dashboard dele.

  Se `MERCADOPAGO_ACCESS_TOKEN` não estiver configurado (ou a função não estiver implantada), o
  checkout cai automaticamente no fluxo mock anterior — nada quebra.

  Para ativar:
  1. Crie uma conta em https://www.mercadopago.com.br/developers e pegue o Access Token (produção
     ou teste).
  2. `supabase functions deploy create-mp-preference`
  3. `supabase functions deploy mercadopago-webhook --no-verify-jwt` (sem isso, o Supabase exige
     um JWT que o Mercado Pago nunca vai enviar, e o webhook sempre falharia com 401)
  4. `supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... APP_BASE_URL=https://seu-app.exemplo`

  ### E-mail transacional de confirmação

  `supabase/functions/_shared/email.ts` monta e envia o e-mail de confirmação via
  [Resend](https://resend.com) (busca o e-mail do paciente com `auth.admin.getUserById`, já que
  `profiles` não guarda e-mail). É chamado em dois lugares: `send-booking-confirmation` (invocado
  pelo cliente logo após o pagamento mock) e `mercadopago-webhook` (direto no servidor, assim que
  um pagamento é confirmado como pago de verdade — só uma vez por pagamento, mesmo se o Mercado
  Pago reenviar a notificação). Sem `RESEND_API_KEY`, a função simplesmente não envia nada — não
  quebra o agendamento nem o pagamento.

  Para ativar:
  1. Crie uma conta em https://resend.com, verifique um domínio (ou use o domínio de teste deles
     pra começar).
  2. `supabase functions deploy send-booking-confirmation`
  3. Redeploy do `mercadopago-webhook` (ele agora importa o mesmo módulo de e-mail).
  4. `supabase secrets set RESEND_API_KEY=... EMAIL_FROM="MindCare <no-reply@seudominio.com>"`

  ### Upload de documentos de verificação

  Bucket privado do Supabase Storage `professional-documents` (migration `20260703000001`),
  organizado por `{professional_id}/{arquivo}`, com RLS tanto no bucket quanto na tabela auxiliar
  `professional_documents` (o profissional só vê os próprios arquivos; o admin vê todos). O
  profissional envia o documento pelo próprio dashboard enquanto a verificação estiver pendente ou
  rejeitada; o admin abre cada arquivo (URL assinada, expira em 60s) na aba "Validações pendentes"
  antes de aprovar ou rejeitar. Não precisa de nenhuma chave nova — só de o bucket existir no
  projeto Supabase real (a migration já cria).

  ### Verificação de registro profissional (CRP/CRM)

  Fluxo completo de ponta a ponta:

  1. **Envio**: no dashboard profissional, enquanto a verificação estiver "pendente" ou
     "rejeitada", aparece um banner explicando exatamente o que enviar — foto ou PDF legível da
     carteira do CRP/CRM (ou o comprovante de inscrição emitido no site do conselho).
  2. **Armazenamento**: o arquivo vai para o bucket privado `professional-documents` (ver seção
     "Upload de documentos de verificação" acima), path `{professional_id}/{timestamp}-{arquivo}`.
     Só o próprio profissional e quem tem `role = 'admin'` conseguem abrir esse arquivo (RLS no
     Storage + na tabela `professional_documents`).
  3. **Notificação**: assim que o upload termina, o cliente chama a Edge Function
     `notify-admin-document` (best-effort — se falhar, não afeta o upload), que busca todos os
     `profiles` com `role = 'admin'` e manda um e-mail via Resend avisando qual profissional
     enviou um documento novo. Sem `RESEND_API_KEY`, a função simplesmente não envia nada.
  4. **Confirmação de validade**: **não existe API pública de verificação do CFP/CFM** — só páginas
     de busca manual voltadas a humanos (confirmado antes de construir isso). Por isso, na aba
     "Validações pendentes" do painel admin, cada profissional pendente tem um link direto
     "Consultar {CRP/CRM} {número} no {CFP/CFM} (site oficial)" que abre a busca oficial já com o
     número em mãos. Quem aprova é sempre uma pessoa da equipe, comparando o documento enviado com
     o resultado da consulta oficial — não é automático, e não deveria ser (evita fraude por
     documento falsificado que "bateria" com uma checagem só de formato/regex).

  Para ativar a notificação por e-mail: `supabase functions deploy notify-admin-document` (já
  reaproveita o `RESEND_API_KEY`/`EMAIL_FROM` configurado para o e-mail de confirmação de consulta).

  ### Painel administrativo: controle de usuários e conta admin

  A aba "Usuários" do painel admin (`/admin`) já lista todos os pacientes/profissionais/admins com
  busca, filtro por tipo e exportação CSV. Além disso, cada linha (exceto outros admins) tem ações
  de **Suspender/Reativar** e **Excluir**:

  - **Suspender**: chama a Edge Function `admin-manage-user`, que usa
    `auth.admin.updateUserById(..., { ban_duration })` (só funciona com a service role key, por
    isso precisa de uma função — o painel não pode chamar isso direto do navegador). A pessoa não
    consegue mais fazer login; `profiles.suspended_at` (migration `20260703000007`) fica marcado
    para a UI mostrar o status, e profissionais suspensos somem do diretório público na hora
    (a busca de profissionais agora filtra `profiles.suspended_at is null`).
  - **Excluir**: chama `auth.admin.deleteUser`, que remove a conta do Supabase Auth; `profiles` (e
    tudo que referencia ela em cascata — `professional_profiles`, `appointments`, etc., via
    `on delete cascade`) é apagado junto. Ação irreversível, com confirmação antes de executar.
  - Por segurança, ninguém consegue suspender/excluir a própria conta nem a de outro admin pela UI
    (a função rejeita esses dois casos mesmo que o request seja forjado).

  **Limitação conhecida:** o ban bloqueia login/renovação de sessão, mas uma sessão já aberta no
  navegador da pessoa continua válida até o token expirar sozinho (não há revogação imediata de
  sessões ativas nesta versão).

  Para ativar: `supabase functions deploy admin-manage-user` (não precisa de nenhuma chave nova).

  **Criar a primeira conta admin:** não existe cadastro público como admin (por segurança). Depois
  que alguém já criou uma conta normal (paciente ou profissional) pelo app, promova-a rodando uma
  vez, com a service role/senha do banco:

  ```bash
  supabase db query --linked "update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'a-conta@exemplo.com') returning id, role;"
  ```

  Depois disso, o próprio painel admin passa a bastar para promover ninguém mais — a intenção é que
  isso só rode manualmente, uma vez, pra "plantar" o primeiro admin.

  ### Agenda do profissional (`/profissional/agenda`)

  Consultas reais, filtradas por `professional_id`, nas visões semana/dia/mês. Clicar numa consulta
  abre um painel com paciente/horário/status e atalhos pra "Ver prontuário" e "Entrar" (sala de
  vídeo, só quando online e ainda não realizada). Clicar num horário vazio já abre "Nova consulta"
  com aquele dia/hora preenchidos.

  **"Nova consulta"** cria uma consulta de retorno com um paciente que **já teve consulta com você**
  (a política de RLS `appointments_insert_professional_existing_patient`, migration
  `20260703000005`, exige isso — não dá pra criar consulta pra um paciente novo por aqui, porque não
  existe como buscar um estranho por nome/e-mail sem violar a privacidade dos outros usuários; o
  primeiro contato de um paciente novo continua sendo ele agendar pelo diretório público).

  **Correção de bug junto:** a política de RLS de `profiles` nunca deixava um profissional ver o
  nome/foto dos próprios pacientes — só via a própria linha, a de um profissional verificado, ou
  tudo se fosse admin. Isso fazia o Dashboard Profissional e o Prontuário mostrarem "Paciente"
  genérico em vez do nome real desde que essas telas foram construídas. Corrigido na migration
  `20260703000004` (`profiles_select_own_patients`), que libera a leitura quando o paciente tem
  uma consulta com o profissional que está pedindo.

  ### Google Agenda

  "Conectar Google Agenda" reautentica via `supabase.auth.signInWithOAuth` pedindo o escopo
  `calendar.events` **além** do escopo básico de login — é o mesmo provedor Google já usado pelo
  botão "Continuar com Google" na tela de login, só que com uma permissão a mais. Depois de
  conectado, "Sincronizar Google" cria (ou atualiza, se já sincronizada antes — o id do evento fica
  em `appointments.google_event_id`, migration `20260703000006`) um evento no Google Agenda pra
  cada consulta futura, direto do navegador pra API do Google, usando o token de acesso que o
  Supabase devolve na sessão (`session.provider_token`).

  **Limitação conhecida, documentada em vez de escondida:** o Supabase não persiste
  `provider_token` depois que o token de sessão renova sozinho (isso acontece por padrão depois de
  ~1h) — é uma limitação do próprio supabase-js, não deste código. Na prática, a conexão "dura" a
  sessão atual; se "Sincronizar Google" disser que a conexão expirou, é só clicar em "Conectar
  Google Agenda" de novo. Sincronizar é uma ação sob demanda (o profissional clica quando quer),
  não um sync automático contínuo em segundo plano — isso exigiria guardar o refresh token no
  servidor e um job agendado, fora do escopo deste MVP.

  Para ativar, seu provedor Google no Supabase (Authentication → Providers → Google) precisa:
  1. Ter a **Google Calendar API** habilitada no mesmo projeto do Google Cloud Console usado pra
     gerar o Client ID/Secret do login.
  2. Ter o escopo `https://www.googleapis.com/auth/calendar.events` liberado na tela de
     consentimento OAuth (OAuth consent screen → Scopes). Enquanto o app Google estiver em modo de
     teste, só usuários adicionados como "Test users" conseguem autorizar esse escopo.
  3. Nenhuma chave nova no `.env` ou nos secrets do Supabase — reaproveita o Client ID/Secret do
     Google que já autentica o login.

  ### Projeto Supabase real + deploy automático

  `supabase/config.toml` é o config do Supabase CLI (criado por este projeto, ainda sem estar
  linkado a nada real). `.github/workflows/deploy-supabase.yml` roda depois que o CI passa em
  `main` (ou manualmente via "Run workflow") e aplica as migrations (`supabase db push`) + faz
  deploy de todas as Edge Functions. O job usa o GitHub Environment `production` — configure uma
  regra de "required reviewers" nele (Settings → Environments → production) se quiser um aprovador
  manual antes de qualquer deploy tocar o banco real; sem essa regra, o deploy roda direto depois
  do CI verde.

  Setup (uma vez):
  1. Crie o projeto em https://supabase.com/dashboard (pode ser um projeto de staging e depois um
     de produção, cada um com seu próprio `project-ref`).
  2. Rode `supabase link --project-ref <ref>` localmente pelo menos uma vez (ou copie o
     `project-ref` do dashboard).
  3. No GitHub, crie o Environment `production` (Settings → Environments) e adicione os secrets:
     `SUPABASE_ACCESS_TOKEN` (Account → Access Tokens no dashboard do Supabase),
     `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` (a senha do Postgres do projeto).
  4. Configure os secrets das próprias Edge Functions com `supabase secrets set ...` (não são
     secrets do GitHub Actions — são os do Supabase, listados na tabela abaixo).

  Para ter staging e produção separados, duplique o job `deploy` do workflow apontando pra um
  Environment `staging` com seus próprios `SUPABASE_PROJECT_REF`/`SUPABASE_DB_PASSWORD`, disparado
  por push numa branch `staging` em vez de `main`.

  ### Chaves de acesso necessárias

  | Variável | Onde configurar | Para quê |
  |---|---|---|
  | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `.env` (frontend) | Projeto Supabase real |
  | `VITE_SENTRY_DSN` | `.env` (frontend) | Monitoramento de erros (opcional — sem ela, o app roda normalmente e só não reporta erros) |
  | `DAILY_API_KEY` | Secret da função Edge (`supabase secrets set`) | Sala de vídeo real (Daily.co). Sem ela, cai no mock. |
  | `MERCADOPAGO_ACCESS_TOKEN` | Secret das funções Edge | Pagamento real. Sem ela, cai no checkout mock. |
  | `APP_BASE_URL` | Secret da função `create-mp-preference` | URL do app pra onde o Mercado Pago redireciona de volta |
  | `RESEND_API_KEY` / `EMAIL_FROM` | Secret das funções Edge | E-mail de confirmação de agendamento. Sem ela, simplesmente não envia. |
  | *(nenhuma chave nova)* | `notify-admin-document` / `admin-manage-user` reaproveitam `RESEND_API_KEY`/`EMAIL_FROM` e a service role key (injetada automaticamente pelo runtime das Edge Functions) | Notificação de documento novo e suspensão/exclusão de contas |

  ### Monitoramento de erros

  `src/lib/monitoring.ts` inicializa o Sentry só se `VITE_SENTRY_DSN` estiver definida. Um
  `Sentry.ErrorBoundary` em `main.tsx` captura qualquer crash de render da UI, e os fluxos mais
  críticos (pagamento no checkout, carregamento do diretório) chamam `reportError` explicitamente
  nos `catch`, para o erro chegar no Sentry mesmo quando a tela já mostra uma mensagem amigável pro
  usuário. Crie um projeto React em https://sentry.io e cole o DSN em `.env` para ativar.
