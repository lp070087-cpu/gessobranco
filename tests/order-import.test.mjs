import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("pedido importado acha produtos, quantidades e data de chegada", async () => {
  const bundled = await build({
    entryPoints: ["src/lib/order-import.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    alias: { "@": "./src" },
  });
  const { readOrder } = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
  );
  const options = [
    { unit_id: "u1", product_id: "p1", label: "Placa de gesso 65x65 · Placa" },
    { unit_id: "u2", product_id: "p2", label: "Bloco divisório de gesso · Bloco" },
    { unit_id: "u3", product_id: "p3", label: "Gesso revestimento 40kg · Saco" },
  ];
  const order = readOrder(
    [
      ["Pedido 123", "", ""],
      ["Previsão de entrega: 23/11/2026", "", ""],
      ["Produto", "Qtd", "Valor unit.", "Total"],
      ["PLACA GESSO 65X65", "100", "4,80", "480,00"],
      ["Bloco divisorio gesso", "50", "10,50", ""],
      ["Gesso revestimento 40 kg", "40", "22,00", "880,00"],
      ["Parafuso", "10", "1,00", "10,00"],
      ["Total", "", "", "1.895,00"],
    ],
    options,
    "pedido-fornecedor.xlsx",
  );
  assert.equal(order.expected_on, "2026-11-23");
  assert.equal(order.reference, "pedido-fornecedor");
  assert.deepEqual(
    order.lines.map((line) => [line.unit_id, line.quantity, line.total]),
    [
      ["u1", 100, 480],
      ["u2", 50, 525],
      ["u3", 40, 880],
      [null, 10, 10],
    ],
  );
});
