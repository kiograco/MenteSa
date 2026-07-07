-- Biblioteca de Modelos: editable document templates. A row with professional_id null is one of
-- the 6 system defaults seeded below (available to every professional as a starting point); a
-- professional who edits and saves gets their own row for that type instead, so personalizing never
-- mutates the shared default. fillTemplate() (src/lib/documentTemplates.ts) does the
-- {{placeholder}} substitution client-side — this table only stores the template text.
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'declaracao_comparecimento', 'declaracao_acompanhamento', 'relatorio', 'parecer', 'laudo', 'encaminhamento'
  )),
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial unique indexes instead of a single constraint: professional_id is null for system
-- defaults (one per type, no owner) but non-null for personal copies (one per professional per type).
create unique index document_templates_system_default_unique on public.document_templates (type) where professional_id is null;
create unique index document_templates_professional_unique on public.document_templates (professional_id, type) where professional_id is not null;

alter table public.document_templates enable row level security;

-- System defaults (professional_id is null) are readable by any authenticated professional as a
-- starting point; a personal copy is only readable/writable by its owner.
create policy "document_templates_select" on public.document_templates for select
  using (professional_id is null or auth.uid() = professional_id or public.is_admin());

create policy "document_templates_insert_own" on public.document_templates for insert
  with check (auth.uid() = professional_id);

create policy "document_templates_update_own" on public.document_templates for update
  using (auth.uid() = professional_id);

insert into public.document_templates (professional_id, type, title, body) values
(null, 'declaracao_comparecimento', 'Declaração de Comparecimento', $$Declaro, para os devidos fins, que {{paciente_nome}}, portador(a) do CPF {{paciente_cpf}}, esteve em atendimento psicológico nesta data, no período das {{hora_sessao}}, com duração de {{duracao_sessao}}.

Por ser verdade, firmo a presente declaração.

{{cidade}}, {{data_atual}}.

_______________________________________
{{profissional_nome}}
{{profissional_registro}}$$),

(null, 'declaracao_acompanhamento', 'Declaração de Acompanhamento', $$Declaro, para os devidos fins, que {{responsavel_legal_nome}} esteve presente acompanhando {{paciente_nome}} em atendimento psicológico nesta data, no período das {{hora_sessao}}, com duração de {{duracao_sessao}}.

Por ser verdade, firmo a presente declaração.

{{cidade}}, {{data_atual}}.

_______________________________________
{{profissional_nome}}
{{profissional_registro}}$$),

(null, 'relatorio', 'Relatório Psicológico', $$RELATÓRIO PSICOLÓGICO

Identificação
Nome: {{paciente_nome}}
Data de nascimento: {{paciente_data_nascimento}}

Motivo do encaminhamento/consulta
{{motivo}}

Procedimentos
Foram realizadas sessões de atendimento psicológico individual, com utilização de entrevista clínica e observação comportamental.

Análise
{{analise}}

Conclusão
{{conclusao}}

{{cidade}}, {{data_atual}}.

_______________________________________
{{profissional_nome}}
{{profissional_registro}}$$),

(null, 'parecer', 'Parecer Psicológico', $$PARECER PSICOLÓGICO

Solicitante: {{solicitante}}
Paciente: {{paciente_nome}}

Considerando os atendimentos realizados e as informações levantadas, apresento o seguinte parecer:

{{parecer_texto}}

{{cidade}}, {{data_atual}}.

_______________________________________
{{profissional_nome}}
{{profissional_registro}}$$),

(null, 'laudo', 'Laudo Psicológico', $$LAUDO PSICOLÓGICO

Identificação
Nome: {{paciente_nome}}
Data de nascimento: {{paciente_data_nascimento}}
CPF: {{paciente_cpf}}

Demanda
{{demanda}}

Procedimentos e instrumentos utilizados
{{procedimentos}}

Análise dos resultados
{{analise}}

Conclusão
{{conclusao}}

{{cidade}}, {{data_atual}}.

_______________________________________
{{profissional_nome}}
{{profissional_registro}}$$),

(null, 'encaminhamento', 'Encaminhamento', $$Encaminho {{paciente_nome}} para avaliação/acompanhamento com {{especialidade_destino}}, tendo em vista {{motivo}}.

Permaneço à disposição para esclarecimentos adicionais que se façam necessários.

{{cidade}}, {{data_atual}}.

_______________________________________
{{profissional_nome}}
{{profissional_registro}}$$);
