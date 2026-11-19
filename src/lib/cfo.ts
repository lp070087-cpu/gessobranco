export type StatementEntry = {
  day: string;
  description: string;
  cents: number;
  reference?: string;
};
export const reviewTypes = {
  external_revenue: "Receita externa",
  external_expense: "Despesa operacional externa",
  external_fee: "Taxa externa",
  external_cost: "Custo externo",
  transfer: "Transferência ou registro já contabilizado",
} as const;
export type ReviewType = keyof typeof reviewTypes;

export function priorMonth(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(date.find((part) => part.type === "year")?.value);
  const month = Number(date.find((part) => part.type === "month")?.value);
  return {
    start: new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10),
  };
}

export const normalizeStatementText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export function parseStatement(
  rows: string[][],
  mapping: {
    date: number;
    value: number;
    description: number;
    reference: number;
    credit?: number;
    debit?: number;
  },
) {
  const entries: StatementEntry[] = [];
  const errors: number[] = [];
  for (const [index, row] of rows.slice(1).entries()) {
    if (!row.some((value) => value.trim())) continue;
    const rawDate = row[mapping.date]?.trim().split(/[T ]/)[0] ?? "";
    const brazil = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
    const day = brazil ? `${brazil[3]}-${brazil[2]}-${brazil[1]}` : rawDate;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(day + "T00:00:00Z") : new Date(NaN);
    const credit = parseAmount(row[mapping.credit ?? -1]);
    const debit = parseAmount(row[mapping.debit ?? -1]);
    const cents =
      mapping.value >= 0
        ? parseAmount(row[mapping.value])
        : credit && debit
          ? NaN
          : Math.abs(credit) - Math.abs(debit);
    const description = (row[mapping.description]?.trim() ?? "").slice(0, 180);
    const reference = row[mapping.reference]?.trim().slice(0, 100) || undefined;
    if (
      !Number.isFinite(date.getTime()) ||
      !date.toISOString().startsWith(day) ||
      !Number.isSafeInteger(cents) ||
      !cents ||
      Math.abs(cents) > 100_000_000_000 ||
      !description
    ) {
      errors.push(index + 2);
      continue;
    }
    entries.push({ day, description, cents, reference });
  }
  return { entries, errors };
}

function parseAmount(value = "") {
  const raw = value.replace(/R\$|\s/gi, "").replace(/[−–]/g, "-");
  if (!raw) return 0;
  const negative = /^-|\)$|D$|-$/.test(raw.toUpperCase());
  const clean = raw.replace(/^[-+(]|[DC)-]$/gi, "");
  const number = /^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2}$/.test(clean)
    ? Number(clean.replaceAll(".", "").replace(",", "."))
    : /^\d+(?:\.\d{1,2})?$/.test(clean)
      ? Number(clean)
      : NaN;
  return Math.round(number * 100) * (negative ? -1 : 1);
}

export function suggestClassification(description: string, cents: number) {
  const text = normalizeStatementText(description);
  if (/transferencia|aporte|resgate|aplicacao|emprestimo/.test(text))
    return "Possível transferência ou operação financeira";
  if (/tarifa|taxa|juros|encargo/.test(text) && cents < 0) return "Possível taxa";
  if (/fornecedor|mercadoria|frete/.test(text) && cents < 0) return "Possível custo";
  if (/venda|recebimento/.test(text) && cents > 0) return "Possível receita";
  return cents > 0 ? "Crédito a revisar" : "Débito a revisar";
}
