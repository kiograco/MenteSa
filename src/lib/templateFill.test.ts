import { describe, expect, it } from "vitest";
import { buildAutoFillData, fillTemplate } from "./templateFill";

describe("fillTemplate", () => {
  it("substitutes known placeholders", () => {
    const result = fillTemplate("Olá {{paciente_nome}}, hoje é {{data_atual}}.", {
      paciente_nome: "Maria",
      data_atual: "07/07/2026",
    });
    expect(result).toBe("Olá Maria, hoje é 07/07/2026.");
  });

  it("leaves unmapped placeholders untouched instead of blanking them out", () => {
    const result = fillTemplate("Motivo: {{motivo}}", { paciente_nome: "Maria" });
    expect(result).toBe("Motivo: {{motivo}}");
  });

  it("replaces every occurrence of a repeated placeholder", () => {
    const result = fillTemplate("{{paciente_nome}} e {{paciente_nome}} de novo", { paciente_nome: "Ana" });
    expect(result).toBe("Ana e Ana de novo");
  });

  it("returns the body unchanged when there are no placeholders", () => {
    expect(fillTemplate("Texto simples.", {})).toBe("Texto simples.");
  });
});

describe("buildAutoFillData", () => {
  it("always includes patient/professional/date fields", () => {
    const data = buildAutoFillData({
      patientName: "Maria Silva",
      professionalName: "Dr. João",
      professionalLicense: "CRP 06/12345",
    });
    expect(data.paciente_nome).toBe("Maria Silva");
    expect(data.profissional_nome).toBe("Dr. João");
    expect(data.profissional_registro).toBe("CRP 06/12345");
    expect(data.data_atual).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(data.cidade).toBe("");
  });

  it("omits optional fields that weren't provided", () => {
    const data = buildAutoFillData({
      patientName: "Maria Silva",
      professionalName: "Dr. João",
      professionalLicense: "CRP 06/12345",
    });
    expect(data.paciente_cpf).toBeUndefined();
    expect(data.responsavel_legal_nome).toBeUndefined();
    expect(data.hora_sessao).toBeUndefined();
  });

  it("includes optional fields when provided", () => {
    const data = buildAutoFillData({
      patientName: "Maria Silva",
      patientCpf: "123.456.789-00",
      patientBirthDate: "2015-03-10",
      legalGuardianName: "Ana Silva",
      professionalName: "Dr. João",
      professionalLicense: "CRP 06/12345",
      professionalCity: "São Paulo",
      scheduledAt: "2026-07-07T14:30:00.000Z",
      durationMinutes: 50,
    });
    expect(data.paciente_cpf).toBe("123.456.789-00");
    expect(data.responsavel_legal_nome).toBe("Ana Silva");
    expect(data.cidade).toBe("São Paulo");
    expect(data.duracao_sessao).toBe("50 minutos");
    expect(data.paciente_data_nascimento).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
