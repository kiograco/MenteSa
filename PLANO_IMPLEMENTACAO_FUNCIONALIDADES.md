# Plano de Implementação — Funcionalidades de Concorrência

Este plano cruza a lista de funcionalidades enviada (aparentemente a tabela de planos de um
concorrente, tipo Corpora.bio) com o que o MindCare **já tem hoje** (ver `README.md`), e organiza o
que falta em fases de implementação — o que construir primeiro, como construir, e o que cada item
exige de banco, Edge Functions e tela.

## Como ler este documento

Cada item tem um status:

- ✅ **Já existe** — nenhuma ação necessária, só validar se atende ao nível do concorrente.
- 🟡 **Parcial** — a base existe, falta uma parte específica.
- 🔴 **Novo** — não existe, precisa ser construído do zero.

E uma estimativa de esforço: **P** (pequeno, 1–3 dias), **M** (médio, 1–2 semanas), **G** (grande,
2+ semanas ou requer decisão de produto/compliance antes de começar).

## Decisão de produto pendente: planos e limites por assinatura

A tabela original tem colunas de dois planos (ex.: agenda "Até 50/mês" num plano e ilimitado
noutro; taxa de Pix 4,99% vs 1,99%; taxa de cartão 4,59% só num deles). Isso indica que o
concorrente cobra do **profissional** uma assinatura em camadas (Basic/Pro) que libera limites e
taxas diferentes — o MindCare hoje **não tem esse conceito**: cada profissional é uma conta
independente, sem plano, e a única cobrança é a taxa de 10% (`PLATFORM_FEE_RATE`) sobre o
pagamento do paciente.

Antes de começar as fases abaixo, vale decidir: **o MindCare vai cobrar assinatura do
profissional (SaaS B2B) além/em vez da taxa por consulta?** Se sim, é um trabalho de fundação
(tabela `subscription_plans`, `professional_subscriptions`, gate de limites nas telas) que
antecede várias features abaixo (ex.: "até 50 agendamentos/mês", "cadastro de pacientes
ilimitado"). Se não, cada feature abaixo pode ser construída sem limite algum, liberada pra todo
mundo — é bem mais simples e é a hipótese assumida no restante deste plano (dá pra adicionar gate
de plano depois, sem redesenhar as features).

---

## 1. Usuários e Acessos

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Profissionais (multi-profissional por conta/clínica) | 🔴 Novo | G | Hoje 1 conta = 1 profissional. Suportar "clínica" exige uma entidade nova (`clinics`) com N `professional_profiles` vinculados, RLS revisada e mudança na navegação (seletor de profissional ativo). É o item mais estrutural da lista — avaliar se é prioridade de negócio antes de investir. |
| Acessos Administrativos (Secretária) | 🔴 Novo | M | Novo papel `staff`/`secretary` em `user_role`, vinculado a um profissional (`staff_professional_links`), com RLS que dá acesso de leitura/escrita à agenda e pacientes daquele profissional mas não ao financeiro/prontuário clínico (a não ser que se decida liberar). Depende conceitualmente do item anterior se houver múltiplos profissionais por conta. |

## 2. Notificações

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Notificações por WhatsApp | ✅ Já existe | — | `send-appointment-reminder` (Meta WhatsApp Cloud API) já envia lembrete de consulta 24h antes via `pg_cron`. |

## 3. Pacientes

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Gestão de pacientes ilimitados | ✅ Já existe | — | Sem limite hoje. Só entra em jogo se um plano pago vier a limitar (ver seção de decisão acima). |
| Link de Cadastro para Pacientes | 🔴 Novo | M | Link público tokenizado (`/cadastro-convite/{token}`) que o profissional gera e manda pro paciente preencher a ficha (nome, contato) **antes** de ter conta — ao submeter, cria o `auth.users`/`profiles` com senha temporária ou fluxo de "definir senha" por e-mail. Precisa de uma Edge Function pra criar o usuário com a service role (o cliente não pode criar conta de outra pessoa). |
| Link de Atualização de Cadastro | 🟡 Parcial | P | O paciente já edita a própria ficha completa dentro do app (`patient_profiles`, aba "Cadastro"). Só falta um link direto compartilhável (`/meus-dados?token=`) pra quem prefere preencher fora do app logado — reaproveita a tela existente, só muda a entrada. |
| Organização Personalizada (tags/categorias) | 🔴 Novo | P | Tabela `patient_tags` (`professional_id`, `patient_id`, `label`, `color`) + filtro por tag na lista de pacientes/mensagens. Sem RLS complexa, é só mais uma tabela satélite. |
| Exportação e Importação Facilitadas | 🟡 Parcial | P–M | Exportação CSV já existe no padrão usado pelo admin (`src/lib/csv.ts`) — extender pra lista de pacientes do profissional é rápido (P). Importação é novo: upload de CSV, mapeamento de colunas, criação em lote de `patient_profiles` (M) — precisa de validação linha a linha e relatório de erros. |

## 4. Agenda

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Agenda inteligente integrada | ✅ Já existe | — | `scheduling.ts`, disponibilidade recorrente/pontual, geração de slots, agenda semana/dia/mês. Limite "até 50/mês" só se aplica se houver plano pago. |
| Gestão de Status por Sessão | ✅ Já existe | — | `appointment_status`: scheduled/completed/cancelled/no_show. |
| Confirmação de Presença | 🔴 Novo | M | Campo `appointments.confirmed_at`. Um link de confirmação (via WhatsApp/e-mail, reaproveitando o template de lembrete) que o paciente clica antes da sessão; se não confirmar dentro de uma janela configurável, o profissional vê um alerta na Agenda. Reaproveita a infra de `send-appointment-reminder`. |
| Lembrete de Sessão | ✅ Já existe | — | Mesmo `send-appointment-reminder`. |
| Reagendamento e Cancelamento | 🟡 Parcial | P | Cancelamento já existe. "Reagendar" hoje se faz cancelando e criando outra consulta — falta uma ação explícita "Reagendar" que edita `scheduled_at` da mesma linha (preserva histórico/notas já vinculadas) em vez de criar uma consulta nova. Ação simples de UI + update, respeitando a mesma trava de duplo agendamento já existente. |
| Bloqueio de Horários e Compromisso pessoal | 🔴 Novo | M | Nova tabela `professional_time_blocks` (`start`, `end`, `reason`, opcional recorrência), consultada junto com `professional_availability` na geração de slots pra não oferecer aquele horário no diretório público. UI: calendário do profissional ganha ação "Bloquear horário". |
| Bloqueio com Cancelamento Automático (férias, eventos) | 🔴 Novo | M | Extensão do item anterior: ao criar um bloqueio que **sobrepõe** consultas já marcadas, disparar fluxo de aviso (reaproveita `notify-waitlist-match`/e-mail) perguntando se deseja cancelar/realocar as consultas afetadas — não cancela sozinho sem confirmação, pra não surpreender paciente. |
| Criação de Sessões Recorrentes | 🔴 Novo | M | Ao agendar, opção "repetir semanalmente por N sessões" — cria N linhas em `appointments` de uma vez (não uma linha "template" com geração dinâmica, pra manter a trava de conflito simples e cada sessão editável/cancelável independentemente). Precisa de tela de revisão antes de confirmar (mostrar as N datas geradas). |
| Site de Agendamentos (página própria do profissional) | 🟡 Parcial | P–M | O perfil público (`/perfil/{id}`) já permite agendar diretamente — falta só a camada de "branding" (ver item de Personalização, seção 7) e, opcionalmente, um domínio/slug amigável (`mindcare.com/p/nome-profissional` em vez do UUID). Não é uma feature nova de agendamento, é polimento do que já existe. |
| Vídeo via Jitsi Meet / Google Meet | ✅ Não recomendado priorizar | — | O MindCare já tem vídeo real via LiveKit (câmera, mic, compartilhar tela, chat via canal de dados) — superior ao que essas alternativas mais simples oferecem. Não há necessidade de adicionar Jitsi/Google Meet como segunda opção, a não ser que surja um motivo de custo (LiveKit free tier tem limite de minutos). |
| Gestão financeira integrada com personalização de valor | 🟡 Parcial | P | O preço vem de `professional_profiles.session_price`, aplicado igual em toda consulta. Falta permitir **sobrescrever o valor por consulta específica** (campo opcional em `appointments` ou no momento do agendamento manual/"Nova consulta") — útil pra desconto pontual, pacote fechado, etc. |

## 5. Financeiro

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Cadastro de Receita Automático | ✅ Já existe | — | Toda cobrança confirmada gera linha em `payments`; Dashboard Financeiro já soma por mês (`revenue.ts`). |
| Gestão de Despesas | 🔴 Novo | M | Tabela `expenses` (`professional_id`, `category`, `amount`, `date`, `notes`, anexo opcional no mesmo padrão de `generated-documents`). Tela nova em Financeiro: lançamento manual + lista + gráfico de receita líquida (receita − despesas), que já teria bom aproveitamento do gráfico existente em `revenue.ts`. |
| Gestão Financeira por Paciente | 🟡 Parcial | P | O paciente já vê "total investido" no próprio dashboard. Falta a visão espelhada pro profissional: um extrato por paciente (todos os pagamentos daquele paciente) — é basicamente um filtro novo sobre `listAppointmentsWithPaymentStatus` já existente, exposto na aba "Cadastro" do prontuário ou no chat de "Pacientes". |
| Emissão de Receita Saúde (recibo dedutível) | ✅ Já existe | — | `generateReceiptPdf` (`src/lib/receipt.ts`/`pdf.ts`) já gera o recibo em PDF com os dados da sessão paga. Vale só validar se os campos batem com o que a Receita Federal exige pro programa Receita Saúde (CPF do paciente e do profissional, CRP/CRM, valor, data, descrição do serviço) — ajuste de template, não de arquitetura. |
| Cobrança via Pix (link de pagamento) | ✅ Já existe | — | `create-pix-charge` (API de Pagamentos do Mercado Pago). |
| Cobrança via Cartão de Crédito (link de pagamento) | ✅ Já existe | — | Checkout Pro (`create-mp-preference`) aceita cartão. |
| Configuração de Cobrança Automática Personalizada | 🔴 Novo | M | Preferências por profissional (`billing_preferences`: cobrar N dias antes/depois, método padrão Pix/cartão) + um job `pg_cron` (mesmo padrão de `send-appointment-reminder`) que dispara `create-pix-charge`/`create-mp-preference` automaticamente nas consultas elegíveis. |
| Opção de Repasse de Taxas para Paciente | 🔴 Novo | P–M | Hoje `PLATFORM_FEE_RATE` é sempre descontado do profissional. Adicionar um toggle "repassar taxa ao paciente" em Configurações, que soma a taxa (Mercado Pago + plataforma) ao valor cobrado do paciente em vez de descontar do profissional — muda o cálculo em `payment-provider.ts`/Edge Functions de cobrança, precisa deixar bem claro na tela de checkout quanto está sendo repassado (transparência ao consumidor). |
| Cobrança Automática Antecipada ou Pós-Sessão | 🔴 Novo | M | Mesmo mecanismo do item "Configuração de Cobrança Automática" acima — é a execução prática dessa configuração (job agendado que cobra X tempo antes ou depois do horário da consulta). Tratados juntos na implementação. |

## 6. Atendimento e Sessões

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Prontuário Eletrônico rico (imagens, tabelas) | 🟡 Parcial | M | Os 4 campos SOAP são texto puro hoje. Trocar o textarea por um editor rich-text (ex.: Tiptap/ProseMirror) que salva HTML/JSON estruturado em vez de string simples — cuidado: dado de saúde sensível, então imagens embutidas devem ir pro bucket privado já existente (`patient-documents`) e não como base64 inline no banco. Precisa migrar a coluna e ajustar o trigger `session_notes_prevent_edit_after_sign` pro novo formato. |
| Anotações de Sessão rica mídia | 🟡 Parcial | — | Mesmo item acima — são os mesmos campos SOAP. |
| Anexos | ✅ Já existe | — | Buckets `patient-documents`/`professional-documents` já cobrem isso. |
| Cadastro de Locais e Serviços | 🔴 Novo | M | Tabelas `professional_locations` (endereço, apelido, "principal") e `professional_services` (nome do serviço, duração, preço — hoje só existe um preço/duração fixos por profissional). O agendamento passa a escolher local + serviço, não só modalidade online/presencial. |
| Instrumentos Clínicos (modelos e personalizados) | 🟡 Parcial | G | Hoje só PHQ-9 e GAD-7, com perguntas/pontuação **hardcoded** em `assessments.ts`. Generalizar exige um motor de escalas: tabela `assessment_templates` (perguntas, opções de resposta, fórmula de pontuação) + tabela `assessment_responses` genérica (já existe uma versão específica) + tela de "criar instrumento personalizado". É o item de maior esforço desta seção porque muda de "2 escalas fixas" pra "motor configurável". |
| Documentos (modelos e personalizados) | ✅ Já existe | — | `LibraryScreen`/`document_templates` já cobre declarações, relatórios, pareceres, laudos e encaminhamentos com edição por profissional. |
| Escalas com Cálculos Automáticos | ✅ Já existe (para PHQ-9/GAD-7) | — | `scoreInstrument` já calcula. Escalas customizadas dependem do motor genérico acima. |
| Diário de Bordo e Evoluções | 🔴 Novo | M | Painel de evolução por paciente: linha do tempo combinando resumo SOAP de cada sessão + gráfico de pontuação das escalas ao longo do tempo (reaproveita `recharts`, já usado no Financeiro). É principalmente uma tela nova de agregação — os dados (session_notes, assessment_responses) já existem. |

## 7. Inteligência Artificial

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Reescrever / Melhorar Escrita com IA | 🔴 Novo | P | Nova Edge Function `ai-improve-text` (mesmo padrão de `ai-summarize-session`, Gemini com `responseSchema`). Botão "Melhorar com IA" nos campos SOAP e nos documentos da Biblioteca. Baixo risco — mesma política de "nunca grava áudio", é só texto que o profissional já escreveu. |
| Planejar Sessão com IA | 🔴 Novo | M | Nova Edge Function que recebe o histórico recente (últimas notas SOAP + escalas) de um paciente e sugere pontos de pauta pra próxima sessão. Precisa de cuidado extra: é o uso de IA que mais lê dado clínico histórico de uma vez (não só uma nota isolada) — vale consentimento específico, igual ao resumo de sessão. |
| Gerar Texto a partir de Manuscrito com IA (OCR) | 🔴 Novo | M | Upload de foto de anotação manuscrita → Gemini multimodal (o mesmo modelo já usado, com input de imagem em vez de só texto) → texto transcrito editável antes de salvar. Reaproveita a infra de upload de anexos já existente. |
| Transcrição de Sessão | 🔴 Novo — ⚠️ decisão de produto antes de construir | G | **Conflita com a política de privacidade atual, documentada no README: "nunca é gravado ou enviado áudio".** Implementar isso é uma mudança de postura, não só uma feature: exige (1) consentimento específico e separado do consentimento informado atual, explicando gravação/retenção/exclusão de áudio; (2) decisão sobre onde processar (Gemini áudio, Whisper API, etc.) e a política de retenção de dados desse provedor pra dado de saúde sensível; (3) armazenamento criptografado do áudio com janela de retenção curta e exclusão automática; (4) DPIA (avaliação de impacto LGPD) antes de ir ao ar. Recomendo tratar como projeto à parte, não como item de sprint normal. |

## 8. Outras Funcionalidades

| Funcionalidade | Status | Esforço | Abordagem técnica |
|---|---|---|---|
| Personalização com Foto e Logo | 🔴 Novo | P | Campo `professional_profiles.logo_url` (bucket público, mesmo padrão de `avatars`) + aplicar o logo no PDF de recibo/documentos gerados e no perfil público. |
| Marketing — Modelos de Post no Canva | 🔴 Novo | P | Não exige integração profunda: uma galeria de templates prontos (imagens/textos sobre saúde mental, indicação, etc.) com um botão "Editar no Canva" que abre o link de um template público do Canva (`canva.com/design/.../view?utm_...`) — sem necessidade da Canva Connect API pra uma primeira versão. |
| Educacional — Aulas Práticas e Tutoriais | 🔴 Novo | P–M | Tela nova "Academia"/"Ajuda" com vídeos (hospedados externamente, ex. YouTube não listado, ou bucket próprio) organizados por tema — é majoritariamente conteúdo, não engenharia complexa. |
| Lembrete de Aniversários | 🔴 Novo | P | Reaproveita o padrão de `send-appointment-reminder`: novo job `pg_cron` diário que busca pacientes com aniversário no dia (`patient_profiles.birth_date`, já coletado no Cadastro) e notifica o profissional (painel/e-mail) ou, se desejado, envia mensagem de parabéns ao paciente via WhatsApp/e-mail. |

---

## Roadmap sugerido (ordem de execução)

### Fase 1 — Quick wins (baixo esforço, sem mudança estrutural)
Reagendamento explícito · Gestão Financeira por Paciente · Personalização com Foto/Logo ·
Organização Personalizada (tags) · Exportação de pacientes (CSV) · Repasse de taxas ao paciente ·
Lembrete de Aniversários · Reescrever/Melhorar Escrita com IA · Marketing (templates Canva) ·
Validar formato do recibo pra Receita Saúde.

### Fase 2 — Agenda e Financeiro avançados
Confirmação de Presença · Bloqueio de Horários · Bloqueio com Cancelamento Automático · Sessões
Recorrentes · Preço customizado por consulta · Gestão de Despesas · Cobrança Automática
(configuração + job) · Link de Atualização de Cadastro · Importação de pacientes (CSV) · Link de
Cadastro para Pacientes (convite).

### Fase 3 — Prontuário e IA
Motor de Instrumentos Clínicos personalizados · Diário de Bordo e Evoluções · Prontuário rico
(imagens/tabelas) · Cadastro de Locais e Serviços · Planejar Sessão com IA · Gerar Texto a partir
de Manuscrito (OCR) · Educacional (Aulas/Tutoriais).

### Fase 4 — Estrutural (requer decisão de produto)
Sistema de Planos/Assinatura por profissional (se o negócio decidir cobrar por camadas) ·
Multi-profissional por clínica + Acessos Administrativos (Secretária) · Site de Agendamentos
com branding completo.

### Fora do roadmap por ora
Transcrição de Sessão (tratar como projeto de compliance/produto à parte, não como sprint normal) ·
Vídeo via Jitsi/Google Meet (LiveKit já atende, sem ganho claro em duplicar).

---

## Resumo executivo

| Categoria | Já existe | Parcial | Novo |
|---|---|---|---|
| Usuários e Acessos | 0 | 0 | 2 |
| Notificações | 1 | 0 | 0 |
| Pacientes | 1 | 2 | 1 |
| Agenda | 3 | 3 | 5 |
| Financeiro | 4 | 2 | 3 |
| Atendimento e Sessões | 3 | 3 | 2 |
| Inteligência Artificial | 0 | 0 | 4 |
| Outras Funcionalidades | 0 | 0 | 4 |
| **Total** | **12** | **10** | **21** |

Das 43 linhas da lista original, 12 já estão prontas hoje, 10 têm a base construída e faltam
complementos pontuais, e 21 são construções novas — a maior concentração de trabalho novo está em
Inteligência Artificial, Outras Funcionalidades e Agenda.
