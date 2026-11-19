export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const first = (text.split("\n").find((line) => line.trim()) ?? "").replace(/"(?:[^"]|"")*"/g, "");
  const delimiters = [";", ",", "\t"];
  const delimiter = delimiters.reduce((best, next) =>
    first.split(next).length > first.split(best).length ? next : best,
  );
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && quoted) {
      if (text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = false;
    } else if (char === '"' && !cell.trim()) {
      quoted = true;
      cell = "";
    } else if (!quoted && (char === delimiter || char === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (char === "\n") {
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
      }
    } else cell += char;
  }
  if (quoted)
    throw new Error(
      `O CSV tem um campo com aspas abertas perto do registro ${rows.length + 1}. Salve novamente como CSV UTF-8 ou envie em XLSX.`,
    );
  row.push(cell.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export async function readCsv(file: File) {
  const bytes = await file.arrayBuffer();
  try {
    return parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (failure) {
    if (!(failure instanceof TypeError)) throw failure;
    return parseCsv(new TextDecoder("windows-1252").decode(bytes));
  }
}

export function spreadsheetNumber(value: string) {
  const cleaned = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (
    !/^(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d{1,6})?$/.test(cleaned) &&
    !/^\d+(?:\.\d{1,6})?$/.test(cleaned)
  )
    return NaN;
  return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
}

export type ImportedProduct = {
  name: string;
  category: string;
  base_unit: string;
  unit_name: string;
  factor: number;
  price: number | null;
};
export const importColumns = [
  "name",
  "category",
  "base_unit",
  "unit_name",
  "factor",
  "price",
] as const;
export function previewProductImport(
  rows: string[][],
  mapping: Record<string, number>,
  existing: string[],
  sameUnit = false,
) {
  const names = new Set(existing.map((value) => value.trim().toLocaleLowerCase("pt-BR")));
  const products: ImportedProduct[] = [];
  const issues: string[] = [];
  rows.forEach((row, index) => {
    if (!row.some((cell) => cell.trim())) return;
    const get = (key: string) => (row[mapping[key]] ?? "").trim();
    const name = get("name");
    const unit = get("base_unit") || (sameUnit ? get("unit_name") : "");
    const saleUnit = sameUnit ? unit : get("unit_name");
    const factor = sameUnit ? 1 : spreadsheetNumber(get("factor"));
    const price = get("price") ? spreadsheetNumber(get("price")) : null;
    if (
      !name ||
      !unit ||
      !saleUnit ||
      !Number.isFinite(factor) ||
      factor <= 0 ||
      (price !== null &&
        (!Number.isFinite(price) ||
          price < 0 ||
          Math.abs(price * 100 - Math.round(price * 100)) > 0.001))
    ) {
      issues.push(
        `Linha ${index + 2}: confira nome, unidades, conversão e preço com até duas casas decimais.`,
      );
      return;
    }
    const normalized = name.toLocaleLowerCase("pt-BR");
    if (names.has(normalized)) {
      issues.push(`Linha ${index + 2}: produto duplicado — ${name}.`);
      return;
    }
    names.add(normalized);
    products.push({
      name,
      category: get("category"),
      base_unit: unit,
      unit_name: saleUnit,
      factor,
      price,
    });
  });
  if (products.length > 200) issues.push("Importe até 200 produtos por arquivo.");
  return { products, issues };
}
