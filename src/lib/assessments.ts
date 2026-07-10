export type AnswerOption = { value: number; label: string };

/** Ordered ascending by `max`; the last band should have `max: null` as the catch-all for any
 *  score above every other band's cutoff. */
export type SeverityBand = { max: number | null; label: string };

export type AssessmentScore = { totalScore: number; severity: string };

/** Generic scorer: sums the answers and looks up the first band whose `max` the total doesn't
 *  exceed (a null `max` always matches). Replaces the old scorePhq9/scoreGad7/scoreInstrument
 *  trio now that PHQ-9/GAD-7 are just two rows in assessment_templates instead of hardcoded
 *  cases — same sum-then-cutoff-lookup behavior, just driven by data instead of a ternary. */
export function scoreFromTemplate(answers: number[], severityBands: SeverityBand[]): AssessmentScore {
  const totalScore = answers.reduce((sum, a) => sum + a, 0);
  const band = severityBands.find(b => b.max === null || totalScore <= b.max);
  return { totalScore, severity: band?.label ?? "" };
}
