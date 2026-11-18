export type BillingUnit =
  "m²" | "metro linear" | "unidade" | "diária" | "projeto" | "sob orçamento";
export type EstimateLine = {
  environment: string;
  unit: string;
  quantity: number;
  unitPrice: number;
};
export type EstimateResult = {
  valid: boolean;
  needsVisit: boolean;
  total: number | null;
  area: number;
  reason?: string;
};
export function normalizeBillingUnit(unit: string): string {
  const units: Record<string, string> = {
    m2: "m²",
    linear: "metro linear",
    unit: "unidade",
    day: "diária",
    project: "projeto",
    quote: "sob orçamento",
  };
  return units[unit] ?? unit;
}

/** A commercial estimate only; complete buildings and complex scopes require a technical proposal. */
export function estimateProject(lines: EstimateLine[], scope = "ambiente"): EstimateResult {
  if (
    !lines.length ||
    lines.some(
      (line) =>
        !line.environment.trim() ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > 10_000_000 ||
        !Number.isFinite(line.unitPrice) ||
        line.unitPrice < 0,
    )
  ) {
    return {
      valid: false,
      needsVisit: true,
      total: null,
      area: 0,
      reason: "Informe ambientes, quantidades e preços válidos.",
    };
  }
  const normalized = lines.map((line) => ({ ...line, unit: normalizeBillingUnit(line.unit) }));
  const environments = new Map<string, number>();
  for (const line of normalized.filter((item) => item.unit === "m²"))
    environments.set(
      line.environment,
      Math.max(environments.get(line.environment) ?? 0, line.quantity),
    );
  const area = [...environments.values()].reduce((sum, quantity) => sum + quantity, 0);
  const needsVisit =
    scope !== "ambiente" ||
    area >= 500 ||
    normalized.some(
      (line) =>
        line.unit === "sob orçamento" ||
        line.unit === "projeto" ||
        line.unitPrice === 0 ||
        !["m²", "metro linear", "unidade", "diária"].includes(line.unit),
    );
  const total = normalized.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER / 100)
    return {
      valid: false,
      needsVisit: true,
      total: null,
      area,
      reason: "O valor informado excede o limite de cálculo.",
    };
  return {
    valid: true,
    needsVisit,
    total: needsVisit ? null : Math.round((total + Number.EPSILON) * 100) / 100,
    area,
  };
}

export function measuredArea(height: number, width: number): number {
  if (!Number.isFinite(height) || !Number.isFinite(width) || height <= 0 || width <= 0) return 0;
  const result = height * width;
  return Number.isFinite(result) && result <= 10_000_000 ? result : 0;
}
