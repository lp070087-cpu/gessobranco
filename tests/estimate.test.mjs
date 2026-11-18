import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";
const source = await fs.readFile(new URL("../src/lib/estimate.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { estimateProject, measuredArea } = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);
test("combines rooms and billing units without treating linear units as square metres", () => {
  const result = estimateProject([
    { environment: "Sala", unit: "m²", quantity: 20, unitPrice: 45 },
    { environment: "Quarto", unit: "m²", quantity: 10, unitPrice: 50 },
    { environment: "Rodapé", unit: "metro linear", quantity: 12, unitPrice: 15 },
    { environment: "Reparo", unit: "unidade", quantity: 2, unitPrice: 30 },
    { environment: "Equipe", unit: "diária", quantity: 1, unitPrice: 100 },
  ]);
  assert.deepEqual(result, { valid: true, needsVisit: false, total: 1740, area: 30 });
});
test("whole buildings and large areas never receive an automatic definitive price", () => {
  for (const [quantity, scope] of [
    [500, "ambiente"],
    [6000, "predio"],
    [30, "fachada"],
    [20, "casa"],
  ])
    assert.equal(
      estimateProject([{ environment: "Obra", unit: "m²", quantity, unitPrice: 50 }], scope).total,
      null,
    );
});
test("custom quotes and project units require a visit", () => {
  for (const unit of ["sob orçamento", "projeto", "unknown", "quote", "project"])
    assert.equal(
      estimateProject([{ environment: "Obra", unit, quantity: 1, unitPrice: 100 }]).needsVisit,
      true,
    );
});
test("normalizes storage unit codes and avoids double counting rooms with multiple services", () => {
  assert.deepEqual(
    estimateProject([
      { environment: "Sala", unit: "m2", quantity: 300, unitPrice: 10 },
      { environment: "Sala", unit: "m2", quantity: 300, unitPrice: 20 },
      { environment: "Rodapé", unit: "linear", quantity: 5, unitPrice: 10 },
    ]),
    { valid: true, needsVisit: false, total: 9050, area: 300 },
  );
});
test("rejects zero, negative and nonfinite quantities, invalid prices and absent environments", () => {
  for (const quantity of [0, -1, NaN, Infinity, 10_000_001])
    assert.equal(
      estimateProject([{ environment: "Sala", unit: "m²", quantity, unitPrice: 45 }]).valid,
      false,
    );
  assert.equal(estimateProject([]).valid, false);
  assert.equal(
    estimateProject([{ environment: " ", unit: "m²", quantity: 1, unitPrice: 50 }]).valid,
    false,
  );
  assert.equal(
    estimateProject([{ environment: "Sala", unit: "m²", quantity: 1, unitPrice: -1 }]).valid,
    false,
  );
  assert.equal(measuredArea(-2, -3), 0);
  assert.equal(measuredArea(Infinity, 3), 0);
  assert.equal(measuredArea(3, 2), 6);
});
test("rounds currency and treats a missing price as a technical quote", () => {
  assert.equal(
    estimateProject([{ environment: "Sala", unit: "m²", quantity: 3, unitPrice: 0.335 }]).total,
    1.01,
  );
  assert.equal(
    estimateProject([{ environment: "Sala", unit: "m²", quantity: 2, unitPrice: 0 }]).total,
    null,
  );
});
