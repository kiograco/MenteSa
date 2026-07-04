export type Instrument = "phq9" | "gad7";

export const ANSWER_OPTIONS = [
  { value: 0, label: "Nunca" },
  { value: 1, label: "Vários dias" },
  { value: 2, label: "Mais da metade dos dias" },
  { value: 3, label: "Quase todos os dias" },
];

// PHQ-9 (Patient Health Questionnaire-9) — public domain, developed by Pfizer for free clinical use.
export const PHQ9_QUESTIONS = [
  "Pouco interesse ou prazer em fazer as coisas",
  "Se sentir para baixo, deprimido(a) ou sem perspectiva",
  "Dificuldade para pegar no sono ou permanecer dormindo, ou dormir demais",
  "Sentir-se cansado(a) ou com pouca energia",
  "Falta de apetite ou comendo demais",
  "Sentir-se mal consigo mesmo(a) — ou achar que é um fracasso ou que decepcionou sua família ou você mesmo(a)",
  "Dificuldade de concentração, como ler o jornal ou ver televisão",
  "Lentidão para se movimentar ou falar, a ponto de outras pessoas notarem, ou o oposto — estar tão agitado(a) que você fica andando de um lado para o outro mais do que o normal",
  "Pensamentos de que seria melhor estar morto(a) ou de se machucar de alguma forma",
];

// GAD-7 (Generalized Anxiety Disorder-7) — public domain, developed by Pfizer for free clinical use.
export const GAD7_QUESTIONS = [
  "Sentir-se nervoso(a), ansioso(a) ou muito tenso(a)",
  "Não ser capaz de impedir ou controlar as preocupações",
  "Preocupar-se muito com diversas coisas",
  "Dificuldade para relaxar",
  "Ficar tão agitado(a) que se torna difícil permanecer parado(a)",
  "Ficar facilmente aborrecido(a) ou irritado(a)",
  "Sentir medo como se algo horrível fosse acontecer",
];

export type AssessmentScore = { totalScore: number; severity: string };

/** Standard PHQ-9 severity cutoffs (Kroenke et al., 2001). */
export function scorePhq9(answers: number[]): AssessmentScore {
  const totalScore = answers.reduce((sum, a) => sum + a, 0);
  let severity: string;
  if (totalScore <= 4) severity = "Mínima";
  else if (totalScore <= 9) severity = "Leve";
  else if (totalScore <= 14) severity = "Moderada";
  else if (totalScore <= 19) severity = "Moderadamente severa";
  else severity = "Severa";
  return { totalScore, severity };
}

/** Standard GAD-7 severity cutoffs (Spitzer et al., 2006). */
export function scoreGad7(answers: number[]): AssessmentScore {
  const totalScore = answers.reduce((sum, a) => sum + a, 0);
  let severity: string;
  if (totalScore <= 4) severity = "Mínima";
  else if (totalScore <= 9) severity = "Leve";
  else if (totalScore <= 14) severity = "Moderada";
  else severity = "Severa";
  return { totalScore, severity };
}

export function scoreInstrument(instrument: Instrument, answers: number[]): AssessmentScore {
  return instrument === "phq9" ? scorePhq9(answers) : scoreGad7(answers);
}

export function instrumentLabel(instrument: Instrument): string {
  return instrument === "phq9" ? "PHQ-9 (Depressão)" : "GAD-7 (Ansiedade)";
}
