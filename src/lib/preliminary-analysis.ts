export type PreliminaryInput = {
  area?: number;
  conditions?: string[];
};

/** Existing conditions-based estimate. Does not inspect photos or call an AI provider. */
export function preliminaryAnalysis(input: PreliminaryInput) {
  const issues = input.conditions ?? [];
  let multiplier = 1;
  if (issues.some((condition) => /infiltra|umid/i.test(condition))) multiplier += 0.15;
  if (issues.some((condition) => /rachadu|trinc/i.test(condition))) multiplier += 0.1;
  if (issues.some((condition) => /tort|desalin/i.test(condition))) multiplier += 0.12;
  if (issues.some((condition) => /derrub|construir|levantar/i.test(condition))) multiplier += 0.25;
  multiplier = Math.min(1.6, Number(multiplier.toFixed(2)));
  const difficulty: "baixa" | "media" | "alta" =
    multiplier >= 1.3 ? "alta" : multiplier >= 1.12 ? "media" : "baixa";
  return {
    difficulty,
    multiplier,
    estimated_hours: Math.max(2, Math.round((input.area ?? 10) * 0.4 * multiplier)),
    detected_issues: [...issues],
    suggested_materials: [] as string[],
    source: "conditions" as const,
    requires_review: true as const,
    summary:
      "Estimativa preliminar baseada nas medidas e condições informadas. As fotos não foram analisadas automaticamente. A equipe precisa revisar o escopo, os materiais e os valores.",
  };
}
