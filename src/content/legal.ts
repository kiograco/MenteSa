// Rascunho inicial dos termos legais do MVP. NÃO é aconselhamento jurídico — precisa ser
// revisado por um advogado (idealmente especializado em saúde/LGPD) antes de ir para produção
// com usuários reais, principalmente pelo tratamento de dados sensíveis de saúde (LGPD art. 11).

export type LegalSection = { heading: string; body: string };
export type LegalDocument = { title: string; updatedAt: string; sections: LegalSection[] };

export const termsOfService: LegalDocument = {
  title: "Termos de Uso",
  updatedAt: "03/07/2026",
  sections: [
    {
      heading: "1. Sobre a plataforma",
      body: "O MindCare conecta pacientes a psicólogos e psiquiatras verificados para consultas online ou presenciais. Ao criar uma conta, você concorda com estes Termos de Uso e com a nossa Política de Privacidade.",
    },
    {
      heading: "2. Cadastro e verificação profissional",
      body: "Profissionais devem informar CRP/CRM válido e enviar documentação para verificação antes de aparecer no diretório público. A plataforma não garante a exatidão de informações fornecidas pelo profissional além da verificação do registro no conselho.",
    },
    {
      heading: "3. Agendamento e pagamento",
      body: "O agendamento é confirmado mediante pagamento processado por um provedor de pagamento terceirizado. O valor da sessão é definido pelo profissional; a plataforma retém uma taxa de intermediação sobre cada transação, informada antes da confirmação do pagamento.",
    },
    {
      heading: "4. Cancelamento e reembolso",
      body: "Consultas podem ser canceladas conforme a política de cancelamento vigente no momento do agendamento. Reembolsos, quando aplicáveis, são processados pelo mesmo meio de pagamento utilizado.",
    },
    {
      heading: "5. Natureza do serviço",
      body: "O MindCare é uma plataforma de intermediação tecnológica — não presta serviços de saúde diretamente e não substitui atendimento de emergência. Em caso de risco à vida, procure o serviço de emergência local (SAMU 192) imediatamente.",
    },
    {
      heading: "6. Responsabilidades do profissional",
      body: "O profissional é o único responsável pelo conteúdo clínico do atendimento, pelo sigilo profissional e pelo cumprimento do código de ética do seu conselho de classe.",
    },
    {
      heading: "7. Alterações",
      body: "Podemos atualizar estes termos periodicamente. Mudanças materiais serão comunicadas por e-mail ou aviso na plataforma antes de entrarem em vigor.",
    },
  ],
};

export const privacyPolicy: LegalDocument = {
  title: "Política de Privacidade",
  updatedAt: "03/07/2026",
  sections: [
    {
      heading: "1. Dados que coletamos",
      body: "Coletamos dados de cadastro (nome, e-mail, telefone), dados de agendamento e pagamento, e — apenas para profissionais no exercício do atendimento — notas clínicas da sessão. Notas clínicas são dados sensíveis de saúde nos termos do Art. 11 da LGPD.",
    },
    {
      heading: "2. Quem acessa cada dado",
      body: "Notas clínicas (prontuário) são visíveis apenas para o profissional responsável pela sessão, nunca para outros usuários, e a plataforma restringe esse acesso por controle de acesso a nível de linha no banco de dados. Dados de pagamento são visíveis apenas para os participantes da consulta e para a administração da plataforma, para fins de conciliação financeira.",
    },
    {
      heading: "3. Base legal e finalidade",
      body: "Tratamos dados de saúde com base no consentimento explícito do titular (Art. 11, I, LGPD) e no legítimo interesse na operação da plataforma. Dados de cadastro e pagamento são tratados para execução do contrato de prestação de serviço (Art. 7º, V, LGPD).",
    },
    {
      heading: "4. Retenção",
      body: "Dados de agendamento e pagamento são retidos pelo prazo legal exigido para fins fiscais e contábeis. Notas clínicas são retidas conforme a obrigação de guarda de prontuário do conselho profissional aplicável, e não são excluídas a pedido do paciente isoladamente, pois pertencem ao prontuário do profissional.",
    },
    {
      heading: "5. Seus direitos",
      body: "Você pode solicitar acesso, correção ou portabilidade dos seus dados de cadastro a qualquer momento. Solicitações envolvendo dados clínicos são encaminhadas ao profissional responsável, conforme a regulamentação do conselho de classe.",
    },
    {
      heading: "6. Compartilhamento com terceiros",
      body: "Compartilhamos dados estritamente necessários com provedores de pagamento (processamento de transações) e videochamada (conexão da sessão), sob contrato de confidencialidade. Não vendemos dados pessoais a terceiros.",
    },
    {
      heading: "7. Contato",
      body: "Para exercer seus direitos de titular ou tirar dúvidas sobre este documento, entre em contato com nosso encarregado de dados (DPO) pelo e-mail informado no rodapé da plataforma.",
    },
  ],
};
