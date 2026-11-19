import { strToU8, zipSync } from "fflate";

const spreadNs = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const officeNs = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const relsNs = "http://schemas.openxmlformats.org/package/2006/relationships";
const xml = (value: string) =>
  value
    // Spreadsheet XML rejects control characters other than tabs and line breaks.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type Sheet = { name: string; rows: readonly (readonly (string | number | null)[])[] };
export function makeSpreadsheet(sheets: Sheet[]) {
  const parts: Record<string, Uint8Array> = {};
  const put = (name: string, value: string) => {
    parts[name] = strToU8(value);
  };
  put(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
  );
  put(
    "_rels/.rels",
    `<Relationships xmlns="${relsNs}"><Relationship Id="rId1" Type="${officeNs}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  put(
    "xl/workbook.xml",
    `<workbook xmlns="${spreadNs}" xmlns:r="${officeNs}"><sheets>${sheets.map(({ name }, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
  );
  put(
    "xl/_rels/workbook.xml.rels",
    `<Relationships xmlns="${relsNs}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${officeNs}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
  );
  sheets.forEach(({ rows }, i) => {
    const table = rows
      .map(
        (row, r) =>
          `<row r="${r + 1}">${row
            .map((cell, c) => {
              const ref = String.fromCharCode(65 + c) + (r + 1);
              return typeof cell === "number" && Number.isFinite(cell)
                ? `<c r="${ref}"><v>${cell}</v></c>`
                : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(cell ?? ""))}</t></is></c>`;
            })
            .join("")}</row>`,
      )
      .join("");
    put(
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${spreadNs}"><sheetData>${table}</sheetData></worksheet>`,
    );
  });
  return zipSync(parts);
}

export function downloadSpreadsheet(name: string, ...sheets: Sheet[]) {
  const url = URL.createObjectURL(
    new Blob([new Uint8Array(makeSpreadsheet(sheets))], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name + ".xlsx";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
