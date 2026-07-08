
  # MenteSa — SaaS Platform for Psychologists

  ## Sumário

  - [Visão geral](#visão-geral)
  - [Stack técnica](#stack-técnica)
  - [Arquitetura do projeto](#arquitetura-do-projeto)
  - [Rodando o código](#running-the-code)
  - [Supabase MVP setup](#supabase-mvp-setup)
  - [Testes](#rodando-os-testes-e2e)
  - [Status do projeto](#status-do-projeto)
  - [Documentação por funcionalidade](#documentação-por-funcionalidade-indo-para-produção) (deep dive de cada integração/feature pós-MVP)
  - [Chaves de acesso necessárias](#chaves-de-acesso-necessárias)
  - [Monitoramento de erros](#monitoramento-de-erros)

  ## Visão geral

  Plataforma que conecta psicólogos/psiquiatras a pacientes, cobrindo o fluxo clínico e de negócio
  de ponta a ponta:

  - **Diretório de profissionais verificados** — busca e filtros por especialidade, abordagem,
    modalidade (online/presencial), cidade, convênio, preço e público-alvo.
  - **Agendamento real** — disponibilidade semanal/pontual, agenda do profissional (semana/dia/mês),
    consulta de retorno e sincronização opcional com o Google Agenda.
  - **Telehealth com vídeo real** (LiveKit) — câmera, mic, compartilhar tela e chat via canal de
    dados, com fallback automático pra sala mock quando o LiveKit não está configurado.
  - **Prontuário eletrônico (EHR)** — ficha de cadastro completa do paciente, notas de sessão em
    formato SOAP com assinatura digital, histórico cronológico, escalas clínicas (PHQ-9, GAD-7).
  - **IA Assistente** (Google Gemini) — resumo de sessão (pontos-chave, itens de ação, nota clínica)
    a partir do texto digitado/ditado, com consentimento explícito antes de gerar.
  - **Biblioteca de Modelos** — declarações, relatórios, pareceres, laudos e encaminhamentos com
    placeholders automáticos e assinatura digital antes da exportação em PDF.
  - **Mensagens em tempo real** entre paciente e profissional (Supabase Realtime, sem polling).
  - **Pagamentos reais** (Mercado Pago) — Checkout Pro no agendamento, Pix avulso e link de
    pagamento no Financeiro, recibo em PDF, camada de abstração pronta para nota fiscal.
  - **Dashboard financeiro** — receita real (bruta/líquida), comparecimento, cancelamento, no-show
    e retenção de pacientes.
  - **Fila de espera inteligente** — paciente entra na fila de um horário ocupado e é avisado por
    e-mail quando ele libera; trava no banco garante que só quem agendar primeiro fica com a vaga.
  - **Lembretes por WhatsApp** — via Meta WhatsApp Cloud API, disparados por `pg_cron` a cada 15 min.
  - **Termos de Uso, Privacidade e Consentimento Informado** — aceite obrigatório no cadastro e
    assinatura eletrônica por relação paciente↔profissional antes do pagamento.
  - **Painel administrativo** — aprovação/rejeição de profissionais, gestão de usuários (suspender/
    excluir), sem acesso ao conteúdo clínico das notas.
  - **Conformidade com o Código de Ética do Psicólogo (CFP)** — declaração de registro no e-Psi,
    privacidade real das notas clínicas (nem admin lê), estatísticas da landing page calculadas a
    partir de dados reais (não inventadas).
  - **Monitoramento de erros** com Sentry, opcional via variável de ambiente.

  ## Stack técnica

  | Camada | Tecnologia |
  |---|---|
  | Front end | React 18, TypeScript, Vite 6 |
  | Estilo | Tailwind CSS |
  | Gráficos / ícones | Recharts, lucide-react |
  | Back end | Supabase (Postgres, Auth, Storage, Realtime, Edge Functions em Deno) |
  | Vídeo | LiveKit |
  | IA | Google Gemini (via Edge Function) |
  | Pagamentos | Mercado Pago — Checkout Pro e API de Pagamentos (Pix), com fallback mock |
  | E-mail transacional | Resend |
  | WhatsApp | Meta WhatsApp Cloud API |
  | Geração de PDF | jsPDF |
  | Monitoramento de erros | Sentry (`@sentry/react`), opcional |
  | Testes unitários | Vitest |
  | Testes E2E | Playwright |
  | CI/CD | GitHub Actions |
  | Gerenciador de pacotes | npm |

  ## Arquitetura do projeto

  ```
  ├── src/
  │   ├── app/App.tsx          # Shell da aplicação, roteamento e todas as telas (landing,
  │   │                        # diretório, agenda, pacientes, prontuário, IA assistente, vídeo,
  │   │                        # checkout, biblioteca, configurações profissionais, admin etc.)
  │   ├── lib/                 # Lógica de domínio: agendamento, pagamentos, mensagens,
  │   │                        # documentos, escalas clínicas, métricas, vídeo, IA, consentimento,
  │   │                        # csv, pdf etc. (com *.test.ts ao lado onde há cobertura)
  │   ├── content/              # Conteúdo estático: Termos de Uso/Privacidade (legal.ts) e
  │   │                        # Consentimento Informado (consent.ts)
  │   ├── styles/               # CSS global, tema, fontes, Tailwind
  │   └── main.tsx              # Entry point, Sentry ErrorBoundary
  ├── supabase/
  │   ├── migrations/           # Schema completo em SQL (profiles, agenda, pagamentos, EHR,
  │   │                        # prontuário SOAP, storage, RLS, extensões pg_cron/pg_net etc.)
  │   ├── functions/            # Edge Functions (Deno): livekit-room-access, create-mp-preference,
  │   │                        # mercadopago-webhook, create-pix-charge, request-nota-fiscal,
  │   │                        # ai-summarize-session, sign-consent, sign-session-note,
  │   │                        # sign-generated-document, send-booking-confirmation,
  │   │                        # notify-waitlist-match, notify-admin-document, admin-manage-user,
  │   │                        # send-appointment-reminder, e o módulo _shared/ (e-mail, WhatsApp,
  │   │                        # token do LiveKit)
  │   ├── seed.sql               # Usuários demo e dados fictícios para desenvolvimento local
  │   └── config.toml           # Config do Supabase CLI (SMTP via Resend, redirects etc.)
  ├── e2e/                       # Testes Playwright (auth, booking, messaging) + global-setup.ts
  ├── guidelines/                # Guidelines do Figma Make AI
  ├── .github/workflows/         # ci.yml (typecheck + test + build) e deploy-supabase.yml
  │                              # (migrations + deploy de Edge Functions)
  ├── .env.example                # Variáveis de ambiente do front end
  ├── .nvmrc                      # Versão do Node (22)
  ├── vite.config.ts
  ├── playwright.config.ts
  └── tsconfig.json
  ```

  ## Running the code

  Requires Node 22+ (see `.nvmrc`; `@supabase/supabase-js` targets Node 22). Run `nvm use` if you use nvm.

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  Other scripts:

  - `npm run build` — production build (Vite)
  - `npm run typecheck` — TypeScript, no emit
  - `npm run test` — unit tests (Vitest) for the pure logic in `src/lib`
  - `npm run test:e2e` — Playwright E2E tests for login, booking + payment, and messaging (`e2e/`)

  ### Rodando os testes E2E

  Precisa de Docker rodando (usado pelo `supabase start` para um stack local isolado — nunca contra
  produção). Passos:

  1. `npx supabase start` (primeira vez) ou `npx supabase db reset` (depois, pra voltar ao estado
     seedado) — aplica todas as migrations e o `supabase/seed.sql` num Postgres local.
  2. `npm run test:e2e` — o `globalSetup` já roda `supabase db reset` sozinho antes da suíte, então
     cada execução começa do mesmo estado (os testes de agendamento sempre escolhem o mesmo horário
     determinístico e dependem disso pra não colidir com a trava de duplo agendamento).

  O `playwright.config.ts` sobe o Vite com `--mode test`, que carrega `.env.test` (gitignored, já
  aponta pra `http://127.0.0.1:54321` com a anon key padrão do Supabase local — não é segredo, é a
  mesma chave pública documentada pelo próprio CLI) em vez do `.env` real.

  ## Supabase MVP setup

  Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

  Apply the migrations in `supabase/migrations/` in order, then run `supabase/seed.sql` to create fake demo users and verified professionals.

  Demo users:

  - `paciente.demo@mindcare.test` / `MindCare123!`
  - `fernanda.demo@mindcare.test` / `MindCare123!`
  - `admin.demo@mindcare.test` / `MindCare123!`

  ## Status do projeto

  O MVP original está completo, e o projeto já avançou além dele para integrações reais de
  produção (pagamento, vídeo, IA, WhatsApp etc.) — ambos os checklists abaixo estão 100%
  concluídos. Onde um item de produção substitui/evolui um item do MVP (por exemplo, o checkout
  mock do MVP virou pagamento real com Mercado Pago), isso está indicado entre parênteses.

  ### MVP (escopo original)

  - [x] Schema, RLS e seed do Supabase (`supabase/migrations`, `supabase/seed.sql`)
  - [x] Login, cadastro, logout e proteção de rotas por papel (patient/professional/admin)
  - [x] Diretório de profissionais verificados (busca, filtros)
  - [x] Perfil profissional com agenda/disponibilidade reais
  - [x] Agendamento real com validação simples de conflito de horário
  - [x] Checkout mock (Pix/cartão) registrando pagamento com taxa da plataforma *(evoluído para pagamento real — ver [Pagamento real (Mercado Pago)](#pagamento-real-mercado-pago))*
  - [x] Dashboard do paciente (consultas, histórico, total investido)
  - [x] Dashboard profissional (agenda, pacientes, receita mensal) *(receita/métricas evoluídas — ver [Progresso](#progresso))*
  - [x] Prontuário: notas clínicas por sessão (`session_notes`, RLS só para o profissional) *(evoluído para formato SOAP com assinatura — ver [Prontuário em formato SOAP](#prontuário-em-formato-soap--assinatura-digital))*
  - [x] Sala de vídeo mock vinculada à consulta (`video_rooms`) *(evoluído para vídeo real — ver [Vídeo real (LiveKit)](#vídeo-real-livekit))*
  - [x] Painel admin: aprovar/rejeitar profissionais, listar/suspender/excluir usuários e pagamentos
  - [x] Autoatendimento do profissional: editar bio/especialidades/preço/cidade/modalidades/convênios
        e gerenciar a própria disponibilidade semanal (tela "Configurações" do dashboard profissional)
  - [x] Agenda do profissional com consultas reais (semana/dia/mês), criação de consulta de retorno
        e sincronização opcional com o Google Agenda
  - [x] Build limpo (`npm run build`), typecheck limpo (`npm run typecheck`) e testes unitários básicos (`npm run test`)
  - [x] IA Assistente: resumo de sessão (pontos-chave, itens de ação, nota clínica) a partir do texto
        digitado/ditado pelo profissional, via Google Gemini (`AIAssistantScreen`)

  Fora do escopo do MVP (ficou como mock/placeholder de propósito): receituário digital.

  ### Progresso (indo para produção)

  Checklist do que era necessário para o app sair do MVP e virar algo usável com dinheiro/dados
  reais. Todo o código já está pronto — o que falta, na maioria dos itens, é criar as contas nos
  provedores e preencher as chaves (nenhuma chave real está no repositório; ver
  [Chaves de acesso necessárias](#chaves-de-acesso-necessárias)).

  - [x] Node 22 alinhado (`.nvmrc`/`engines`) e CI no GitHub Actions (`.github/workflows/ci.yml`)
  - [x] Código morto removido (shadcn/Figma scaffold não usado) e vendor chunks separados
  - [x] Monitoramento de erros (Sentry, opcional via `VITE_SENTRY_DSN`)
  - [x] Termos de Uso / Política de Privacidade + consentimento obrigatório no cadastro
  - [x] Fluxo de "esqueci minha senha"
  - [x] Upload de documento para verificação profissional
  - [x] Vídeo real (LiveKit)
  - [x] Resumo de sessão com IA (Google Gemini)
  - [x] Cancelamento de consulta + trava no banco contra duplo agendamento
  - [x] Escalas psicológicas (PHQ-9, GAD-7) preenchidas pelo paciente, com evolução no prontuário
  - [x] Portal do paciente (documentos/tarefas) + biblioteca de materiais do profissional
  - [x] Telemetria do profissional: receita real (bruta/líquida), comparecimento, cancelamento e
        retenção de pacientes no Dashboard Financeiro (antes 100% mock)
  - [x] Fila de espera inteligente: paciente entra na fila de um horário ocupado, todos são
        avisados por e-mail quando ele libera (cancelamento), primeiro a agendar garante a vaga
  - [x] Assinatura eletrônica do Termo de Consentimento Informado (por paciente/profissional),
        com IP/user-agent capturados no servidor e hash do texto exibido
  - [x] Pagamento real (Mercado Pago)
  - [x] E-mail transacional de confirmação
  - [x] Projeto Supabase real (staging/prod) + deploy de migrations via CI
  - [x] Checagem de responsividade mobile
  - [x] Revisão de segurança final

  ## Documentação por funcionalidade (indo para produção)

  Deep dive de cada integração/feature construída além do MVP — como funciona, limitações
  conhecidas, e o passo a passo para ativar cada uma em um projeto Supabase real.

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

  ### Vídeo real (LiveKit)

  `supabase/functions/livekit-room-access` gera um token de acesso assinado (JWT HS256, feito à
  mão em `_shared/livekitToken.ts` — evita depender do `livekit-server-sdk`, pensado pra Node,
  dentro do runtime Deno das Edge Functions) de curta duração (4h) por consulta; `LIVEKIT_API_SECRET`
  nunca chega ao navegador. Diferente do provedor anterior, o LiveKit não precisa de uma chamada
  separada pra "criar a sala" — o próprio token com a grant `roomCreate` deixa o servidor do
  LiveKit criar a sala na hora que o primeiro participante entra.

  No cliente, `VideoScreen` chama essa função ao entrar na sala; se der certo, `LiveKitCallFrame`
  conecta com `livekit-client` (carregado sob demanda só nessa tela) e renderiza uma UI própria
  (câmera local/remota, mic, câmera, compartilhar tela e chat de verdade via canal de dados do
  LiveKit) em vez de um iframe de terceiro — mantém a identidade visual do app. **Se a função não
  estiver implantada ou os secrets não estiverem configurados, a tela cai de volta pro mock
  anterior** (imagem estática + sala fake) — nada quebra, só não tem vídeo real.

  Para ativar:
  1. Crie uma conta em https://livekit.io/cloud (tem tier gratuito) e pegue a **API Key**, o
     **API Secret** e a **URL do projeto** (formato `wss://seu-projeto.livekit.cloud`).
  2. `supabase functions deploy livekit-room-access`
  3. `supabase secrets set LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_URL=wss://seu-projeto.livekit.cloud`

  **Pré-requisito pra testar de ponta a ponta:** a função só emite token se a consulta já tiver um
  registro em `payments` com `status = 'paid'` (mesma trava que existia com o provedor anterior,
  ver "Revisão de segurança final") — sem isso, cai no mock mesmo com o LiveKit configurado. No MVP
  sem Mercado Pago configurado, o checkout mock (`mockPaymentProvider`) já grava esse registro, então
  basta completar um agendamento normalmente pra testar o vídeo real.

  ### Fila de espera inteligente

  Ao clicar num horário já ocupado no perfil do profissional, o paciente pode "Entrar na fila de
  espera" (`waitlist_entries`). Quando alguém cancela uma consulta (botão real de cancelamento no
  painel do paciente e no modal da Agenda do profissional), a Edge Function
  `notify-waitlist-match` avisa **todo mundo que esperava aquele horário exato, de uma vez** por
  e-mail — não é um sistema de "segure a vaga por X minutos" (isso exigiria um job agendado, que
  este projeto não tem); quem completar o agendamento primeiro garante a vaga de verdade, porque
  `appointments` tem um índice único parcial (`professional_id, scheduled_at` onde `status =
  'scheduled'`) que impede duplo agendamento no banco — quem chegar depois só vê a mensagem normal
  de "horário já reservado".

  Para ativar: `supabase functions deploy notify-waitlist-match` (reaproveita
  `RESEND_API_KEY`/`EMAIL_FROM` já configurados).

  ### Assinatura eletrônica do Termo de Consentimento Informado

  Distinto dos Termos de Uso gerais (aceitos uma vez, no cadastro): este é um termo específico
  por relação paciente↔profissional, assinado no checkout antes do pagamento (`src/content/consent.ts`,
  `CURRENT_CONSENT_VERSION`). Diferente do aceite de Termos de Uso (só um timestamp), aqui a
  assinatura é uma "assinatura eletrônica simples" de verdade — a lei brasileira (MP 2.200-2/2001,
  Art. 10, §2º) aceita esse tipo pra acordos entre partes que consentem em usar meio eletrônico,
  sem precisar de ICP-Brasil:

  - Nome digitado + checkbox de concordância.
  - Hash SHA-256 (`crypto.subtle.digest`, no navegador) do texto exato exibido — prova o que foi
    mostrado, mesmo que o conteúdo mude depois.
  - IP e User-Agent capturados **no servidor** (`supabase/functions/sign-consent`) — só uma Edge
    Function consegue ler o IP real do cabeçalho `x-forwarded-for`; o navegador não tem como se
    autodeclarar o próprio IP de forma confiável. Por isso não existe policy de insert direto pro
    paciente em `consent_signatures` — só a função (com a service role) grava.
  - Paciente que já assinou aquela versão do termo com aquele profissional não precisa assinar de
    novo (pula direto pro pagamento).

  Para ativar: `supabase functions deploy sign-consent` (não precisa de nenhuma chave nova).

  ### Resumo de IA da sessão (Google Gemini)

  `supabase/functions/ai-summarize-session` recebe o texto que o profissional digitou (ou ditou
  via Web Speech API do navegador — 100% local, nenhum áudio é gravado ou enviado) sobre uma
  sessão e pede pro Gemini (Google) gerar pontos-chave, itens de ação e uma nota clínica polida —
  usando `responseSchema` da própria API do Gemini pra forçar o formato JSON exato, em vez de só
  confiar em instrução de prompt. **Nunca é gravado ou enviado áudio** — só o texto que o
  profissional já escreveu, a mesma informação que ele já poderia digitar direto na aba "Notas
  Seguras" do prontuário. É preciso marcar um consentimento explícito antes de gerar o resumo, e o
  resultado só é salvo no prontuário (`session_notes.ai_summary` + `ai_summary_generated_at`) se o
  profissional clicar em "Salvar no prontuário" — nunca automaticamente.

  Escolhido especificamente pelo tier gratuito (suficiente pro volume de uso esperado no MVP) —
  antes de ativar em produção com dados reais de pacientes, vale conferir a política de retenção/
  uso de dados do Google para a API do Gemini (se o conteúdo enviado é usado pra treinar modelo),
  dado que notas de sessão são dado de saúde sensível.

  Se `GEMINI_API_KEY` não estiver configurado (ou a função não estiver implantada), a tela de IA
  cai de volta pro fluxo manual — o profissional continua escrevendo/editando notas normalmente,
  só não tem o botão "Gerar resumo com IA" funcional.

  Para ativar:
  1. Crie uma API key gratuita em https://aistudio.google.com/apikey.
  2. `supabase functions deploy ai-summarize-session`
  3. `supabase secrets set GEMINI_API_KEY=...` (opcional: `GEMINI_MODEL=gemini-...` pra trocar o
     modelo — o padrão é `gemini-2.5-flash`)

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

  ### Foto de perfil

  Bucket **público** do Supabase Storage `avatars` (migration `20260703000008`), organizado por
  `{user_id}/{timestamp}-{arquivo}` — público porque a foto já aparece no diretório/perfil público,
  mesma exposição do nome. RLS garante que só o próprio usuário sobe/troca a própria foto; leitura é
  liberada pra qualquer um (`storage.objects` do bucket `avatars`). Em
  "Configurações → Meu perfil profissional", o profissional troca a foto a qualquer momento; ela
  atualiza `profiles.avatar_url` e passa a aparecer no diretório, no perfil público e nas telas do
  paciente. Sem foto enviada, todo lugar que antes mostrava uma foto de banco de imagens fixa agora
  mostra as iniciais do nome (mesmo componente usado no resto do app) — nada de foto genérica que
  não é da pessoa de verdade. Não precisa de nenhuma chave nova.

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

  ### Conformidade com o Código de Ética do Psicólogo (CFP)

  - **Declaração de registro no e-Psi** (Resolução CFP nº 11/2018): atendimento psicológico
    mediado por tecnologia exige que o psicólogo (CRP) registre essa modalidade no sistema e-Psi
    do CFP antes de atender remotamente — uma obrigação pessoal do profissional, que a plataforma
    não tem como verificar automaticamente (não existe API pública pra isso, mesma situação do
    CRP/CRM). No cadastro profissional, se o registro for CRP, um checkbox obrigatório declara
    isso (`professional_profiles.epsi_declared_at`), gravado pelo mesmo trigger que já cria o
    perfil profissional no cadastro. Não se aplica a CRM (psiquiatria segue as regras de
    telemedicina do CFM, não o e-Psi do CFP).
  - **Admin não lê mais o conteúdo de notas clínicas.** A RLS de `session_notes` tinha um bypass
    pra `is_admin()` que contradizia o que a própria Política de Privacidade já prometia ("visíveis
    apenas para o profissional responsável... nunca para outros usuários"). Removido — agora só o
    profissional dono da nota tem acesso à tabela. Pra alguma visibilidade administrativa básica
    (quantas notas existem, se usaram IA) sem tocar no texto clínico, existe
    `admin_session_notes_overview()`, uma função `security definer` que só devolve metadados
    (datas, booleanos `has_notes`/`has_ai_summary`) — o texto da nota nunca sai do banco pra
    responder essa pergunta.
  - **Estatísticas da landing page deixaram de ser inventadas.** "+2.400 profissionais
    verificados", "4.9 avaliação média" e "98% satisfação" eram números fixos no código, sem
    relação com dado real nenhum — problemático pra um serviço de saúde por ser publicidade
    enganosa, além de esbarrar nas restrições éticas de publicidade profissional. Agora: contagem
    real de `professional_profiles` verificados, média real de `reviews.rating`, e % real de
    avaliações ≥ 4 estrelas — todos crescem sozinhos conforme profissionais se cadastram e
    pacientes avaliam. "24h suporte" continua estático por ser um compromisso de atendimento, não
    uma estatística medida.

  ### Mensagens entre paciente e profissional

  Antes, o menu lateral do profissional tinha dois itens ("Pacientes" e "Prontuários") que levavam
  exatamente para a mesma tela (`onNavigate("ehr")`), sem diferença nenhuma de comportamento. Agora:

  - **"Pacientes"** (`/profissional/pacientes`, `PatientsScreen`) é uma tela nova de chat — lista de
    pacientes à esquerda (com pré-visualização da última mensagem e contador de não lidas), thread +
    campo de envio à direita, e um atalho "Ver prontuário" que abre o `EHRScreen` já com aquele
    paciente selecionado.
  - **"Prontuários"** continua abrindo direto o `EHRScreen` (histórico clínico, notas, escalas,
    materiais) — sem mais se confundir com a lista de pacientes/mensagens.
  - O lado do paciente ganhou a aba "Mensagens" no painel dele (`PatientDashboard`), que antes existia
    só visualmente no menu, sem `onClick` nenhum.
  - Mensagens usam a tabela `messages` (`professional_id`, `patient_id`, `sender_id`, `content`,
    `read_at`), com RLS que só permite trocar mensagem entre quem já teve consulta marcada um com o
    outro (mesma checagem de relacionamento via `appointments` já usada por
    `profiles_select_own_patients`/`assessment_responses_select_professional`). Entrega em tempo real
    via Supabase Realtime (`alter publication supabase_realtime add table messages`), sem polling.

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

  ### Cadastro de paciente (ficha completa)

  A ficha cadastral (`patient_profiles`, migration `20260707000000` — dados pessoais, endereço,
  responsável legal opcional, convênio opcional, contato de emergência, histórico) é preenchida
  **só pelo próprio paciente**, em "Configurações → Ficha cadastral" (`PatientSettingsPanel`). O
  profissional só visualiza os mesmos dados, em modo leitura, na aba **"Cadastro"** do `EHRScreen`
  (`/profissional/prontuarios`, primeira aba ao selecionar um paciente) — a migration
  `20260714000000` removeu as policies que antes deixavam o profissional escrever nessa tabela,
  justamente pra não ter duas fontes de verdade pro mesmo dado. Upload de documentos anexos continua
  liberado dos dois lados (bucket privado `patient-documents`, migration `20260707000001`, mesmo
  padrão do bucket `professional-documents`). Não precisa de nenhuma chave nova.

  ### Cadastro de paciente pelo profissional (paciente ainda não inscrito)

  Botão **"Cadastrar paciente"** em `/profissional/pacientes` (`PatientsScreen`): cria a conta do
  paciente e já agenda a primeira consulta, na mesma chamada — Edge Function
  `create-patient-account` (mesmo esqueleto de `admin-manage-user`, mas exige `role = 'professional'`
  em vez de `'admin'`). Duas coisas acontecem numa transação lógica só, sempre com a service role:

  1. `auth.admin.createUser(...)` com uma **senha padrão fixa** (mesma pra toda conta criada assim —
     decisão consciente do time, mais simples de comunicar que uma senha aleatória por paciente, mas
     quem souber a convenção tem acesso a qualquer conta ainda não trocada). O modal mostra a senha
     pro profissional copiar e repassar, com aviso pra o paciente trocá-la em "Configurações → Alterar
     senha" assim que acessar.
  2. Insere a primeira `appointments` direto (bypassando
     `appointments_insert_professional_existing_patient`, `20260703000005` — essa policy exige uma
     consulta anterior entre os dois, o que nunca existe pra um paciente recém-criado). Sem essa
     consulta, o paciente ficaria invisível em toda a UI do profissional, já que a lista de
     pacientes/prontuário/mensagens deriva "meu paciente" só de existir consulta em comum — não há
     uma tabela de relacionamento separada. Se o insert da consulta falhar (ex.: conflito de horário),
     a função desfaz a criação da conta com `auth.admin.deleteUser` pra não deixar login órfão.

  Não precisa de nenhuma chave nova — só `supabase functions deploy create-patient-account`.

  ### Prontuário em formato SOAP + assinatura digital

  A aba "Notas Seguras" deixou de ser um textarea único e passou a ter os quatro campos do modelo
  SOAP (Subjetivo/Objetivo/Avaliação/Plano) — migration `20260707000002` adiciona essas colunas em
  `session_notes`, mantendo a coluna antiga `notes` intacta pra não perder registros anteriores. A
  aba "Histórico" já existente (`App.tsx`, lista as consultas ordenadas por data) passou a ser o
  próprio registro cronológico automático: mostra o resumo SOAP e o status de assinatura de cada
  sessão, sem precisar de nenhuma tabela nova.

  "Assinar digitalmente" pede o nome completo do profissional, calcula um hash SHA-256 do texto SOAP
  (mesma função `hashDocumentText` já usada pelo consentimento informado) e chama a Edge Function
  `sign-session-note` (cópia do padrão de `sign-consent`: só ela grava `signed_at`/`typed_name`/
  `signature_hash`, nunca o cliente direto). Depois de assinada, um trigger no banco
  (`session_notes_prevent_edit_after_sign`) bloqueia qualquer alteração nos campos SOAP e na própria
  assinatura — não é só a UI que desabilita os campos, é impossível editar mesmo chamando a API
  direto. Pra ativar: `supabase functions deploy sign-session-note` (nenhuma chave nova).

  ### Público-alvo no perfil do profissional

  Checkbox fixo (Crianças/Adolescentes/Adultos/Idosos) em "Configurações → Meu perfil profissional",
  gravado em `professional_profiles.target_audience` (migration `20260707000003`, um `text[]` como
  `specialties`/`approaches`, mas com vocabulário fechado em vez de texto livre). O diretório público
  ganhou um filtro "Público-alvo" ao lado dos filtros de convênio/especialidade já existentes. Não
  precisa de nenhuma chave nova.

  ### Controle de faltas (no-show)

  `appointment_status` ganhou o valor `no_show` (migration `20260707000004` — precisa de
  `ALTER TYPE ... ADD VALUE`, que só é aplicado depois que a migration termina de rodar). No painel
  de detalhe de uma consulta na Agenda, ao lado de "Cancelar consulta", tem "Marcar falta" — o
  paciente simplesmente não compareceu, diferente de um cancelamento avisado com antecedência. Os
  badges de status (Agenda, Dashboard, Histórico do prontuário, Dashboard Financeiro) já reconhecem
  o novo status. `src/lib/metrics.ts` ganhou `calculateNoShowRate`, e `calculateAttendanceRate`/
  `calculateCancellationRate` agora tratam falta como "passado" (conta pra base de cálculo) mas não
  como comparecimento. Não precisa de nenhuma chave nova.

  ### Lembretes automáticos de consulta por WhatsApp

  Edge Function `send-appointment-reminder`, disparada a cada 15 minutos por um job `pg_cron`
  (migration `20260707000005`) que chama a função via `pg_net` — Supabase não tem agendador nativo,
  então o padrão é usar essas duas extensions do Postgres. A função busca consultas `scheduled` que
  começam entre 23h e 25h à frente, ainda sem lembrete enviado
  (`appointments.whatsapp_reminder_sent_at`), verifica se o paciente não desativou os lembretes
  (`patient_profiles.whatsapp_reminders_enabled`, com opt-out em "Configurações → Meus dados") e
  envia a mensagem via **Meta WhatsApp Cloud API** oficial (`supabase/functions/_shared/whatsapp.ts`)
  — sem intermediário tipo Twilio/Z-API, foi a opção escolhida pelo time.

  **A Meta exige que toda mensagem enviada fora de uma janela de 24h aberta pelo próprio usuário use
  um template pré-aprovado no Meta Business Manager** — não dá pra mandar texto livre, e a aprovação
  do template pode levar de horas a dias. Sem isso configurado, a função simplesmente não envia nada
  (mesmo "best-effort" das outras integrações).

  Para ativar:
  1. Configure um número de WhatsApp Business no [Meta Business Manager](https://business.facebook.com)
     e crie/aprove um template de mensagem com 3 variáveis (nome do paciente, nome do profissional,
     data/hora da consulta).
  2. `supabase functions deploy send-appointment-reminder`
  3. `supabase secrets set CRON_SECRET=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_ACCESS_TOKEN=... WHATSAPP_TEMPLATE_NAME=...`
  4. Habilite `pg_cron`/`pg_net` no projeto (a migration `20260707000005` já faz isso) e rode, uma
     vez, no SQL Editor do Supabase (com os mesmos valores usados no passo 3):
     ```sql
     select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-appointment-reminder', 'reminder_function_url');
     select vault.create_secret('<mesmo valor do CRON_SECRET>', 'reminder_cron_secret');
     ```
     Até esses dois segredos existirem no Vault, o job roda a cada 15 min mas não faz nada.

  ### Financeiro: recibos, nota fiscal, Pix avulso e link de pagamento

  Antes, `FinancialDashboard` era só relatório (gráfico de receita, taxas) — pagar uma consulta só
  acontecia no momento do agendamento (`CheckoutScreen`). Agora a aba "Financeiro" tem uma seção
  **"Sessões"** listando toda consulta do profissional com o status de pagamento derivado do
  pagamento mais recente ligado a ela (`src/lib/payments.ts`, `listAppointmentsWithPaymentStatus` —
  não existe uma coluna "pago/pendente" em `appointments`, isso é sempre calculado a partir de
  `payments`, já que uma consulta pode ter mais de uma linha de pagamento):

  - **Cobrar via Pix**: `supabase/functions/create-pix-charge` chama a API de Pagamentos direta do
    Mercado Pago (não a Checkout Pro usada no agendamento — só a API direta devolve o QR
    code/copia-e-cola pro app mostrar). Reutiliza uma cobrança pendente ainda não expirada em vez
    de gerar uma nova a cada clique. O status final (pago/estornado) continua resolvido só pelo
    `mercadopago-webhook` já existente — nada mudou lá.
  - **Gerar link de pagamento**: reaproveita a mesma `create-mp-preference`/`createMercadoPagoCheckout`
    já usada no checkout, sem nenhuma mudança nela — só passou a ser chamável fora do fluxo de
    agendamento.
  - **Emitir recibo**: gera um PDF client-side (`jspdf`, `src/lib/pdf.ts`/`src/lib/receipt.ts`) com
    os dados da sessão paga e salva no bucket `generated-documents` (mesmo padrão de
    `patientDocuments.ts`), com download imediato.
  - **Nota fiscal**: `supabase/functions/request-nota-fiscal` é só uma **camada de abstração** —
    nenhum provedor (eNotas/Focus NFe/etc.) está configurado ainda, então a função sempre responde
    "indisponível" com uma mensagem clara e grava isso em `nota_fiscal_requests`. Plugar um provedor
    real no futuro só muda essa função; o schema e a UI já estão prontos.

  Para ativar Pix: nenhuma chave nova, reaproveita `MERCADOPAGO_ACCESS_TOKEN` (já configurado pro
  checkout) — só `supabase functions deploy create-pix-charge`.

  ### Biblioteca de Modelos (declarações, relatórios, pareceres, laudos, encaminhamentos)

  Nova tela `/profissional/biblioteca` (`LibraryScreen`): 6 tipos de documento com um texto padrão
  já semeado pela migration `20260710000003` (`document_templates`, linha com `professional_id`
  nulo). O profissional pode editar e salvar sua própria versão de cada tipo — isso nunca sobrescreve
  o padrão do sistema, só cria uma linha própria (`professional_id`, `type`) que passa a valer pra
  ele. Os textos usam placeholders `{{assim}}` (lista completa em `TEMPLATE_PLACEHOLDERS`,
  `src/lib/documentTemplates.ts`); os automáticos (nome/CPF do paciente, registro do profissional,
  data etc.) são preenchidos sozinhos ao gerar; os manuais (motivo, análise, conclusão...) ficam
  visíveis como texto literal pro profissional preencher antes de exportar.

  A geração acontece a partir da aba **"Cadastro"** do prontuário (`EHRScreen`, já mostra o paciente
  selecionado): botão "Gerar documento" → escolhe o tipo → revisa/edita o texto já preenchido →
  digita o nome completo → "Assinar e exportar PDF". A assinatura usa exatamente o mesmo modelo de
  confiança de `sign-session-note`/`sign-consent`: só a Edge Function `sign-generated-document`
  (service role) grava `signed_at`/`typed_name`/`signature_hash`, nunca o cliente direto. O PDF vai
  pro mesmo bucket `generated-documents` usado pelo recibo, e a lista de documentos gerados de cada
  paciente aparece logo abaixo dos anexos, na própria aba "Cadastro".

  Não precisa de nenhuma chave nova — só `supabase functions deploy sign-generated-document`.

  **Imprimir e enviar ao paciente**: cada documento gerado (e o recibo também, mesmo bucket) tem
  botões "Imprimir" e "Enviar ao paciente" na lista da aba "Cadastro". Imprimir baixa o PDF como
  blob e imprime a partir de uma URL `blob:` same-origin (`printGeneratedDocument`,
  `src/lib/generatedDocuments.ts`) — uma signed URL do Storage é de outra origem, e o navegador
  restringe demais da API de `Window` entre origens pra confiar em `window.print()` diretamente
  nela. Enviar grava `generated_documents.sent_to_patient_at` (migration `20260715000000`) e manda
  uma mensagem de chat avisando o paciente (best-effort, reaproveita `sendMessage` já existente) — só
  a partir daí o documento aparece na aba "Documentos" do próprio paciente. Antes de ser enviado, um
  documento gerado só é visível pro profissional que o criou (RLS
  `generated_documents_select_patient` exige `sent_to_patient_at is not null`), então um laudo ainda
  em revisão ou um parecer preparado pra terceiros não vaza pro paciente só por existir.

  ### Fase 1 do roadmap de concorrência (`PLANO_IMPLEMENTACAO_FUNCIONALIDADES.md`)

  Dez itens "quick win" implementados numa leva só:

  - **Reagendamento explícito**: botão "Reagendar" no modal de detalhe da Agenda edita
    `scheduled_at` da mesma consulta (preserva notas/histórico) em vez de cancelar + criar outra —
    mesma checagem de conflito de horário já usada em "Nova consulta". `appointments.previous_scheduled_at`
    (migration `20260716000000`) guarda o horário anterior só pra auditoria/suporte.
  - **Financeiro por paciente**: `listAppointmentsWithPaymentStatus` (`src/lib/payments.ts`) ganhou
    um segundo parâmetro `patientId` opcional; a aba "Cadastro" do prontuário mostra o extrato de
    consultas/pagamentos daquele paciente específico.
  - **Logo do profissional**: bucket público `logos` (migration `20260716000001`, mesmo padrão do
    bucket `avatars`) + `professional_profiles.logo_url`, estampado no canto superior direito de
    todo PDF gerado (recibo, declarações, laudos etc. — `src/lib/pdf.ts`, `loadImageAsDataUrl`).
  - **Tags de pacientes**: tabela `patient_tags` (migration `20260716000004`, só do profissional —
    paciente não vê), com filtro por tag tanto no prontuário quanto na lista de pacientes.
  - **Exportação CSV de pacientes**: botão em `/profissional/pacientes`, reaproveita `downloadCsv`
    (`src/lib/csv.ts`, mesmo padrão já usado pelo painel admin).
  - **Repasse de taxa da plataforma ao paciente**: toggle em "Configurações → Faturamento e
    recibos" (`professional_profiles.pass_fee_to_patient`, migration `20260716000003`). Quando
    ligado, `create-mp-preference`/`create-pix-charge` cobram `preço × 1,10` do paciente, mas
    `mercadopago-webhook` sempre calcula `platform_fee` a partir do preço **base** da consulta (não
    do valor cobrado) — o que o profissional recebe líquido nunca muda, só quem paga a comissão.
  - **Lembrete de aniversário**: novo par Edge Function/cron (`send-birthday-greeting`,
    `supabase/functions/_shared/whatsapp.ts#sendBirthdayGreetingWhatsApp`, migration
    `20260716000006`) — dispara diariamente às 9h, mesma arquitetura de
    `send-appointment-reminder`, mas com seu próprio template WhatsApp e sua própria marca de "já
    enviado este ano" (`patient_profiles.last_birthday_greeted_year`, migration `20260716000005`).
  - **Melhorar texto com IA**: nova Edge Function `ai-improve-text` (mesmo padrão de
    `ai-summarize-session`, reaproveita `GEMINI_API_KEY`/`GEMINI_MODEL`) — botão "Melhorar com IA"
    nos 4 campos SOAP e no conteúdo do modal "Gerar documento". Sem vínculo com uma consulta
    específica (é um reescrever stateless), só exige que quem chama seja um profissional logado e
    não suspenso.
  - **Marketing**: nova aba "Marketing" dentro da Biblioteca de Modelos — galeria de temas de post
    com link direto pras coleções reais de templates do Canva sobre saúde mental/psicologia
    (`canva.com/templates/s/mental-health`, `/psychology` etc. — sem Canva Connect API, é atalho
    pro catálogo público deles).
  - **Recibo pronto pro Receita Saúde**: `professional_profiles.cpf` (migration `20260716000002`),
    numeração sequencial (`countReceiptsForProfessional`) e descrição de serviço mais específica no
    corpo do recibo (`src/lib/receipt.ts`). Importante: **o MindCare não emite pelo Receita Saúde
    em nome do profissional** (esse app da Receita Federal exige login gov.br individual) — o
    recibo em PDF só chega com todos os campos prontos pra copiar rapidinho pro app oficial;
    `missingReceitaSaudeFields` avisa quando falta CPF de alguém.

  Para ativar os itens com Edge Function nova: `supabase functions deploy ai-improve-text` e
  `supabase functions deploy send-birthday-greeting --no-verify-jwt` (mesmo motivo do
  `send-appointment-reminder` — o cron chama sem sessão de usuário). O lembrete de aniversário
  precisa do mesmo par de segredos no Vault que o lembrete de consulta já usa (ver seção acima),
  só que com nomes próprios: `birthday_function_url`/`birthday_cron_secret`.

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

  ## Chaves de acesso necessárias

  | Variável | Onde configurar | Para quê |
  |---|---|---|
  | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | `.env` (frontend) | Projeto Supabase real |
  | `VITE_SENTRY_DSN` | `.env` (frontend) | Monitoramento de erros (opcional — sem ela, o app roda normalmente e só não reporta erros) |
  | `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` | Secrets da função Edge (`supabase secrets set`) | Sala de vídeo real (LiveKit). Sem eles, cai no mock. |
  | `GEMINI_API_KEY` / `GEMINI_MODEL` (opcional) | Secret da função Edge (`supabase secrets set`) | Resumo de IA da sessão (Google Gemini, gratuito). Sem ela, o botão "Gerar resumo com IA" fica indisponível e o profissional segue escrevendo notas manualmente. |
  | `MERCADOPAGO_ACCESS_TOKEN` | Secret das funções Edge | Pagamento real. Sem ela, cai no checkout mock. |
  | `APP_BASE_URL` | Secret da função `create-mp-preference` | URL do app pra onde o Mercado Pago redireciona de volta |
  | `RESEND_API_KEY` / `EMAIL_FROM` | Secret das funções Edge | E-mail de confirmação de agendamento. Sem ela, simplesmente não envia. |
  | *(nenhuma chave nova)* | `notify-admin-document` / `admin-manage-user` reaproveitam `RESEND_API_KEY`/`EMAIL_FROM` e a service role key (injetada automaticamente pelo runtime das Edge Functions) | Notificação de documento novo e suspensão/exclusão de contas |
  | `WHATSAPP_PHONE_NUMBER_ID` / `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_TEMPLATE_NAME` | Secrets da função `send-appointment-reminder` | Lembrete de consulta por WhatsApp (Meta Cloud API). Sem elas, o job de cron roda mas não envia nada. |
  | `CRON_SECRET` | Secret da função `send-appointment-reminder` + segredo `reminder_cron_secret` no Vault | Autentica a chamada do `pg_cron` (o endpoint não usa sessão de usuário) |
  | *(nenhuma chave nova)* | `create-pix-charge` reaproveita `MERCADOPAGO_ACCESS_TOKEN` | Cobrança avulsa via Pix no Financeiro |
  | `NOTA_FISCAL_PROVIDER` / `NOTA_FISCAL_API_KEY` (ainda sem provedor real) | Secrets da função `request-nota-fiscal` | Emissão de nota fiscal. Sem elas (hoje sempre), a função responde "indisponível" — é o estado esperado até um provedor (eNotas/Focus NFe/etc.) ser escolhido e integrado. |
  | *(nenhuma chave nova)* | `ai-improve-text` reaproveita `GEMINI_API_KEY`/`GEMINI_MODEL` | Botão "Melhorar com IA" nos campos SOAP e no gerador de documentos |
  | `WHATSAPP_BIRTHDAY_TEMPLATE_NAME` | Secret da função `send-birthday-greeting` (reaproveita `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_ACCESS_TOKEN`) | Template aprovado no Meta Business Manager pro parabéns de aniversário — precisa ser diferente do template de lembrete de consulta |
  | `CRON_SECRET` (já existente) + segredos `birthday_function_url`/`birthday_cron_secret` no Vault | Mesmo secret da função, mais Vault | Autentica o cron diário de aniversário, mesmo esquema do lembrete de consulta |

  ## Monitoramento de erros

  `src/lib/monitoring.ts` inicializa o Sentry só se `VITE_SENTRY_DSN` estiver definida. Um
  `Sentry.ErrorBoundary` em `main.tsx` captura qualquer crash de render da UI, e os fluxos mais
  críticos (pagamento no checkout, carregamento do diretório) chamam `reportError` explicitamente
  nos `catch`, para o erro chegar no Sentry mesmo quando a tela já mostra uma mensagem amigável pro
  usuário. Crie um projeto React em https://sentry.io e cole o DSN em `.env` para ativar.
