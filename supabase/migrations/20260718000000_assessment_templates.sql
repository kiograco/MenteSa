-- "Motor de instrumentos clínicos personalizados": generalizes the PHQ-9/GAD-7 pair (previously
-- hardcoded in src/lib/assessments.ts) into a table so a professional can create their own
-- questionnaires (questions, answer scale, severity bands), while PHQ-9/GAD-7 keep existing as
-- built-in rows (professional_id null) available to everyone. A null professional_id is also what
-- keeps built-ins un-editable: the write policy below only ever matches auth.uid() = professional_id,
-- and auth.uid() is never null in a real session, so no extra "is_builtin" flag is needed.
create table public.assessment_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professional_profiles (id) on delete cascade,
  name text not null,
  questions text[] not null,
  answer_options jsonb not null,
  severity_bands jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.assessment_templates enable row level security;

-- Visible to: everyone (built-ins), the owning professional (their own custom templates), and any
-- patient who has an appointment with that professional (same indirect relationship pattern as
-- patient_profiles_select_professional) — a patient needs to see a template to answer it.
create policy "assessment_templates_select" on public.assessment_templates for select
  using (
    professional_id is null
    or professional_id = auth.uid()
    or exists (
      select 1 from public.appointments a
      where a.patient_id = auth.uid() and a.professional_id = assessment_templates.professional_id
    )
    or public.is_admin()
  );

create policy "assessment_templates_write_own" on public.assessment_templates for all
  using (auth.uid() = professional_id)
  with check (auth.uid() = professional_id);

-- Seed the two existing instruments as built-ins with fixed ids, so assessment_responses rows
-- (migrated in the next migration) can reference them directly instead of a lossy text match.
insert into public.assessment_templates (id, professional_id, name, questions, answer_options, severity_bands) values
(
  '00000000-0000-0000-0000-000000000001',
  null,
  'PHQ-9 (Depressão)',
  array[
    'Pouco interesse ou prazer em fazer as coisas',
    'Se sentir para baixo, deprimido(a) ou sem perspectiva',
    'Dificuldade para pegar no sono ou permanecer dormindo, ou dormir demais',
    'Sentir-se cansado(a) ou com pouca energia',
    'Falta de apetite ou comendo demais',
    'Sentir-se mal consigo mesmo(a) — ou achar que é um fracasso ou que decepcionou sua família ou você mesmo(a)',
    'Dificuldade de concentração, como ler o jornal ou ver televisão',
    'Lentidão para se movimentar ou falar, a ponto de outras pessoas notarem, ou o oposto — estar tão agitado(a) que você fica andando de um lado para o outro mais do que o normal',
    'Pensamentos de que seria melhor estar morto(a) ou de se machucar de alguma forma'
  ],
  '[{"value":0,"label":"Nunca"},{"value":1,"label":"Vários dias"},{"value":2,"label":"Mais da metade dos dias"},{"value":3,"label":"Quase todos os dias"}]'::jsonb,
  '[{"max":4,"label":"Mínima"},{"max":9,"label":"Leve"},{"max":14,"label":"Moderada"},{"max":19,"label":"Moderadamente severa"},{"max":null,"label":"Severa"}]'::jsonb
),
(
  '00000000-0000-0000-0000-000000000002',
  null,
  'GAD-7 (Ansiedade)',
  array[
    'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)',
    'Não ser capaz de impedir ou controlar as preocupações',
    'Preocupar-se muito com diversas coisas',
    'Dificuldade para relaxar',
    'Ficar tão agitado(a) que se torna difícil permanecer parado(a)',
    'Ficar facilmente aborrecido(a) ou irritado(a)',
    'Sentir medo como se algo horrível fosse acontecer'
  ],
  '[{"value":0,"label":"Nunca"},{"value":1,"label":"Vários dias"},{"value":2,"label":"Mais da metade dos dias"},{"value":3,"label":"Quase todos os dias"}]'::jsonb,
  '[{"max":4,"label":"Mínima"},{"max":9,"label":"Leve"},{"max":14,"label":"Moderada"},{"max":null,"label":"Severa"}]'::jsonb
);
