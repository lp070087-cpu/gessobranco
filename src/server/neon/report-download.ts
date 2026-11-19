import { crc32 } from "node:zlib";
import { moneyBR, type Report } from "@/lib/commercial-client";

type Cell = string | number | null;
type Row = Cell[];

function reportRows(report: Report, start: string, end: string): Row[] {
  return [
    ["Ouro Branco — Relatório comercial", start, end],
    ["Indicador", "Valor (R$)"],
    ["Vendas após devoluções", report.revenue],
    ["Recebimentos", report.received],
    ["Benefício das vendas após custos atribuídos", report.contribution],
    ["Custo dos produtos vendidos", report.goods_cost],
    ["Despesas operacionais", report.operating_expenses],
    ["Saídas de caixa", report.cash_out],
    ["Saldo a receber (todas as vendas)", report.receivable],
    ["Contas a pagar (saldo total)", report.payable],
    ["Estornos pendentes (saldo total)", report.refund_due],
    ["Vendas com custos pendentes", String(report.partial_sales)],
    [],
    ["Data", "Bom", "Médio", "Ruim", "Custos pendentes"],
    ...report.daily.map((day) => [
      day.day,
      ...[day.good, day.medium, day.bad, day.pending].map(String),
    ]),
    [],
    ["Produto", "Receita (R$)", "Custo (R$)"],
    ...report.by_product.map((row) => [row.product_name, row.revenue, row.goods_cost]),
    [],
    ["Cliente", "Receita (R$)", "Contribuição (R$)", "Vendas parciais"],
    ...report.by_customer.map((row) => [
      row.name,
      row.revenue,
      row.contribution,
      String(row.partial_sales),
    ]),
  ];
}

const xml = (value: string) =>
  value
    // eslint-disable-next-line no-control-regex -- These characters are invalid in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

// XLSX packages are ZIP archives. Stored entries avoid a compression dependency.
function zip(entries: Record<string, string>) {
  const sections: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const [path, value] of Object.entries(entries)) {
    const name = Buffer.from(path);
    const data = Buffer.from(value);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    sections.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(directory.length / 2, 8);
  end.writeUInt16LE(directory.length / 2, 10);
  end.writeUInt32LE(
    directory.reduce((sum, entry) => sum + entry.length, 0),
    12,
  );
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...sections, ...directory, end]);
}

function spreadsheet(rows: Row[]) {
  const office = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const sheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rels = "http://schemas.openxmlformats.org/package/2006/relationships";
  const body = rows
    .map(
      (row, index) =>
        `<row r="${index + 1}">${row
          .map((value, column) => {
            const ref = `${String.fromCharCode(65 + column)}${index + 1}`;
            if (value !== null && Number.isFinite(Number(value)) && typeof value === "number")
              return `<c r="${ref}"><v>${value}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t>${xml(String(value ?? "Custo pendente"))}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  return zip({
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${sheet}" xmlns:r="${office}"><sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${sheet}"><cols><col min="1" max="1" width="45" customWidth="1"/><col min="2" max="5" width="22" customWidth="1"/></cols><sheetData>${body}</sheetData></worksheet>`,
  });
}

function pdf(rows: Row[]) {
  const lines = rows.flatMap((row) => {
    const line = row
      .map((cell) => (typeof cell === "number" || cell === null ? moneyBR(cell) : cell))
      .join("  |  ");
    return line.match(/.{1,91}(?:\s|$)|.{1,91}/g) ?? [""];
  });
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += 49) {
    const current = lines.slice(index, index + 49);
    const stream = `BT /F1 10 Tf 14 TL 40 790 Td ${current
      .map((line) => {
        const literal = line
          .replace(/[–—]/g, "-")
          .replace(/[^\x20-\x7e\xa0-\xff]/g, " ")
          .replace(/[\\()]/g, "\\$&");
        return `(${literal}) Tj T*`;
      })
      .join("\n")} ET`;
    const page = objects.length + 1;
    pages.push(`${page} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects[1] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.join(" ")}] >>`;
  let output = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(output, "latin1");
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const start = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

export function reportDownload(report: Report, start: string, end: string, format: "pdf" | "xlsx") {
  const rows = reportRows(report, start, end);
  return new Response(new Uint8Array(format === "pdf" ? pdf(rows) : spreadsheet(rows)), {
    headers: {
      "Content-Type":
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="ouro-branco-${start}-${end}.${format}"`,
      "Cache-Control": "no-store",
    },
  });
}
