import { spreadsheetNumber } from "./commercial-import";

/** Lê a tabela de um pedido (Excel, CSV ou PDF já convertido em linhas) e acha os produtos. */
export type OrderOption = { unit_id: string; product_id: string; label: string };
export type ImportedLine = {
  text: string;
  quantity: number;
  total: number | null;
  unit_id: string | null;
};
export type ImportedOrder = {
  lines: ImportedLine[];
  expected_on: string | null;
  reference: string;
};

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const tokens = (value: string) =>
  plain(value)
    .split(" ")
    .filter((t) => t.length > 1 || /\d/.test(t));
const number = (value: string) => {
  const parsed = spreadsheetNumber(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
};

export function matchProduct(text: string, options: OrderOption[]) {
  const words = new Set(tokens(text));
  let best: { option: OrderOption; score: number } | null = null;
  for (const option of options) {
    const name = tokens(option.label.split(" · ")[0]);
    if (!name.length) continue;
    const shared = name.filter(
      (word) => words.has(word) || words.has(word.replace(/s$/, "")),
    ).length;
    const score = shared / name.length;
    if (score > (best?.score ?? 0)) best = { option, score };
  }
  return best && best.score >= 0.5 ? best.option : null;
}

function dateIn(text: string) {
  const found = text.match(/(\d{2})[/.-](\d{2})[/.-](\d{2,4})/);
  if (!found) return null;
  const year = found[3].length === 2 ? "20" + found[3] : found[3];
  return `${year}-${found[2]}-${found[1]}`;
}

export function readOrder(rows: string[][], options: OrderOption[], fileName = ""): ImportedOrder {
  const clean = rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  const header = clean.findIndex((row) =>
    row.some((cell) => /produto|descri|mercadoria|^item/i.test(cell)),
  );
  const head = header >= 0 ? clean[header].map(plain) : [];
  const column = (pattern: RegExp) => head.findIndex((cell) => pattern.test(cell));
  const nameCol = column(/produto|descri|mercadoria|item/);
  const qtyCol = column(/^q|qtd|quant/);
  const totalCol = column(/total/);
  const priceCol = column(/unit|preco|valor un/);
  let expected: string | null = null;
  for (const row of clean) {
    const text = row.join(" ");
    if (/entrega|previs|chegada/i.test(text)) expected ??= dateIn(text);
  }
  const lines: ImportedLine[] = [];
  for (const row of clean.slice(header + 1)) {
    let text = nameCol >= 0 ? row[nameCol] : "";
    let quantity = qtyCol >= 0 ? number(row[qtyCol]) : null;
    let total = totalCol >= 0 ? number(row[totalCol]) : null;
    if (nameCol < 0 || qtyCol < 0) {
      // Sem cabeçalho: o texto mais longo é o produto, o 1º número a quantidade, o último o total.
      const numbers = row.map(number).filter((value): value is number => value !== null);
      text =
        row.filter((cell) => number(cell) === null).sort((a, b) => b.length - a.length)[0] ?? "";
      quantity = numbers[0] ?? null;
      total = numbers.length > 1 ? numbers[numbers.length - 1] : null;
    }
    if (total === null && priceCol >= 0 && quantity !== null) {
      const price = number(row[priceCol]);
      if (price !== null) total = Math.round(price * quantity * 100) / 100;
    }
    if (!text || !/[a-z]/i.test(text) || !quantity || quantity <= 0) continue;
    if (/^total|subtotal|frete|desconto/i.test(plain(text))) continue;
    lines.push({ text, quantity, total, unit_id: matchProduct(text, options)?.unit_id ?? null });
  }
  return {
    lines: lines.slice(0, 30),
    expected_on: expected,
    reference: fileName.replace(/\.[^.]+$/, ""),
  };
}
