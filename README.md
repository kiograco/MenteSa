
  # MenteSa — SaaS Platform for Psychologists

  This is a code bundle for SaaS Platform for Psychologists. The original project is available at https://www.figma.com/design/j313aEvWol9JTdOGxQxQw6/SaaS-Platform-for-Psychologists.

  ## Running the code

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
  - [x] Painel admin: aprovar/rejeitar profissionais, listar usuários e pagamentos
  - [x] Build limpo (`npm run build`), typecheck limpo (`npm run typecheck`) e testes unitários básicos (`npm run test`)

  Fora do escopo do MVP (ficou como mock/placeholder de propósito): IA de transcrição de sessão
  (`AIAssistantScreen`), vídeo em tempo real (WebRTC), receituário digital e relatórios em PDF.
