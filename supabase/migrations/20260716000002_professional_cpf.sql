-- CPF do profissional — não existe hoje (professional_profiles só tinha CRP/CRM). Necessário pro
-- recibo em PDF incluir todos os campos que o app oficial Receita Saúde exige (CPF do profissional
-- e do paciente, registro profissional, valor, data, descrição do serviço, numeração).
alter table public.professional_profiles add column cpf text;
