// Rascunho de termo de consentimento informado — assim como legal.ts, NÃO é aconselhamento
// jurídico e precisa ser revisado por um advogado (idealmente especializado em saúde/LGPD) antes
// de produção com usuários reais.
import type { LegalDocument } from "./legal";

export const CURRENT_CONSENT_VERSION = "2026-07-04";

export const informedConsent: LegalDocument = {
  title: "Termo de Consentimento Informado",
  updatedAt: "04/07/2026",
  sections: [
    {
      heading: "1. Natureza do atendimento",
      body: "Você está prestes a agendar uma consulta com um profissional de saúde mental (psicólogo ou psiquiatra) através do MindCare. O atendimento é de responsabilidade exclusiva do profissional escolhido; o MindCare atua apenas como intermediário tecnológico.",
    },
    {
      heading: "2. Confidencialidade",
      body: "O conteúdo da sua sessão e as notas clínicas registradas pelo profissional são confidenciais e visíveis apenas para ele, protegidas por controle de acesso técnico (RLS) no banco de dados. Exceções à confidencialidade seguem o código de ética do conselho profissional (por exemplo, risco iminente à vida).",
    },
    {
      heading: "3. Uso de ferramentas de inteligência artificial",
      body: "O profissional pode, de forma opcional e mediante consentimento próprio dele no momento do uso, utilizar uma IA (Google Gemini) para gerar um resumo/sugestão de nota clínica a partir do texto que ele mesmo digitar sobre a sessão. Nenhum áudio da sua consulta é gravado ou enviado a essa IA em nenhuma hipótese.",
    },
    {
      heading: "4. Videochamada",
      body: "Consultas online acontecem por uma sala de vídeo criptografada em trânsito, fornecida por um provedor terceirizado (LiveKit). Nenhuma consulta é gravada pela plataforma.",
    },
    {
      heading: "5. Cancelamento",
      body: "Você pode cancelar uma consulta agendada a qualquer momento antes do horário marcado, pelo seu painel. O cancelamento libera o horário, que pode ser oferecido a outros pacientes na fila de espera.",
    },
  ],
};
