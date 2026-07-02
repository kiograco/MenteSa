
  # SaaS Platform for Psychologists

  This is a code bundle for SaaS Platform for Psychologists. The original project is available at https://www.figma.com/design/j313aEvWol9JTdOGxQxQw6/SaaS-Platform-for-Psychologists.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Supabase MVP setup

  Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

  Apply `supabase/migrations/20260702000000_init_schema.sql`, then run `supabase/seed.sql` to create fake demo users and verified professionals.

  Demo users:

  - `paciente.demo@mindcare.test` / `MindCare123!`
  - `fernanda.demo@mindcare.test` / `MindCare123!`
  - `admin.demo@mindcare.test` / `MindCare123!`
  # MenteSa
