export type DocumentType = "cpf" | "cnpj";

export const normalizeDocument = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[.\-/\s]/g, "");

export function validDocument(type: DocumentType, value: string) {
  const document = normalizeDocument(value);
  const cpf = type === "cpf";
  const format = cpf ? /^\d{11}$/ : /^[A-Z0-9]{12}\d{2}$/;
  if (!format.test(document) || /^(.)\1+$/.test(document)) return false;
  const size = cpf ? 9 : 12;
  return [size, size + 1].every((length) => {
    const sum = [...document.slice(0, length)].reduce((total, char, index) => {
      const position = length - index;
      const weight = cpf ? position + 1 : ((position - 1) % 8) + 2;
      return total + (char.charCodeAt(0) - 48) * weight;
    }, 0);
    const remainder = sum % 11;
    return Number(document[length]) === (remainder < 2 ? 0 : 11 - remainder);
  });
}
