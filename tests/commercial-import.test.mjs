import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { sqlStatements } from "../scripts/sql-statements.mjs";

const source = await readFile(new URL("../src/lib/commercial-import.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseCsv, spreadsheetNumber, previewProductImport } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

test("CSV preserves delimiters, quoted newlines, escaped quotes and PT-BR prices", () => {
  const rows = parseCsv('Nome;Preço;Descrição\r\n"Gesso; teste";"1.200,50";"Linha 1\nLinha ""2"""');
  assert.equal(rows[1][0], "Gesso; teste");
  assert.equal(rows[1][2], 'Linha 1\nLinha "2"');
  assert.equal(spreadsheetNumber(rows[1][1]), 1200.5);
  assert.equal(spreadsheetNumber("22.50"), 22.5);
  assert.ok(Number.isNaN(spreadsheetNumber("=1+1")));
  assert.throws(() => parseCsv('"sem fim'), /aspas/);
});

test("import preview detects duplicates and refuses unconfigured conversions", () => {
  const mapping = { name: 0, category: 1, base_unit: 2, unit_name: 3, factor: 4, price: 5 };
  const result = previewProductImport(
    [
      ["Gesso existente", "", "kg", "saco", "40", "25"],
      ["Novo", "", "kg", "saco", "", "25"],
      ["Placa", "", "un", "placa", "1", "12,50"],
      ["placa", "", "un", "placa", "1", "12,50"],
    ],
    mapping,
    ["Gesso existente"],
  );
  assert.equal(result.products.length, 1);
  assert.equal(result.issues.length, 3);
  assert.equal(result.products[0].price, 12.5);
});

test("SQL migration splitter preserves functions, quoted semicolons and nested comments", () => {
  const source =
    "SELECT ';'; /* a /* nested ; */ b */ SELECT 2; CREATE FUNCTION f() RETURNS text LANGUAGE sql AS $body$ SELECT 'a;b'; $body$; -- done";
  const statements = sqlStatements(source);
  assert.equal(statements.length, 4);
  assert.match(statements[2], /SELECT 'a;b';/);
  assert.throws(() => sqlStatements("SELECT 'bad"), /SQL incompleto/);
});
