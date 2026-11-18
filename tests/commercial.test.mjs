import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { sqlStatements } from "../scripts/sql-statements.mjs";
import ts from "typescript";

async function productionReadQuery(marker) {
  const source = await readFile(
    new URL("../src/server/neon/commercial.ts", import.meta.url),
    "utf8",
  );
  const file = ts.createSourceFile("commercial.ts", source, ts.ScriptTarget.ES2022, true);
  let query;
  function visit(node) {
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText(file) === "sql") {
      const raw = node.template.getText(file);
      if (raw.includes(marker)) {
        query = raw.slice(1, -1).replaceAll("${start}", "$1").replaceAll("${end}", "$2");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(query, `Production query ${marker} exists`);
  return query;
}

test("commercial commands against isolated PostgreSQL, including reopening persisted data", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ouro-comercial-"));
  let db = new PGlite(directory);
  const actor = randomUUID();
  const command = async (kind, data, key = randomUUID()) => {
    const result = await db.query("SELECT preciso.commercial_command($1,$2,$3::jsonb) AS result", [
      actor,
      kind,
      JSON.stringify({ request_key: key, ...data }),
    ]);
    return result.rows[0].result;
  };
  try {
    await db.exec(await readFile(new URL("../drizzle/0000_preciso.sql", import.meta.url), "utf8"));
    const migration = await readFile(
      new URL("../drizzle/0001_commercial.sql", import.meta.url),
      "utf8",
    );
    await db.exec("BEGIN");
    for (const statement of sqlStatements(migration)) await db.exec(statement);
    await db.exec("COMMIT");
    await db.exec(migration); // replay must preserve records and schema
    await db.query(
      "INSERT INTO preciso.users(id,email,full_name,password_hash,role) VALUES($1,'test@example.invalid','Teste','test-only','admin')",
      [actor],
    );
    const product = await command("product", {
      name: "Gesso — TESTE",
      description: "Hipótese de 40 kg apenas para teste",
      category: "Gesso",
      base_unit: "kg",
      minimum_stock: 20,
      minimum_margin: 10,
      maximum_discount: 10,
      enforce_discount: false,
      active: true,
      published: false,
      public_price: false,
      image_url: null,
      units: [
        { name: "saco", factor: 40, price: 25 },
        { name: "meio saco", factor: 20, price: 15 },
        { name: "kg", factor: 1, price: 2 },
      ],
    });
    const units = (
      await db.query("SELECT * FROM preciso.commercial_units WHERE product_id=$1", [product.id])
    ).rows;
    const sack = units.find((u) => u.name === "saco").id,
      half = units.find((u) => u.name === "meio saco").id,
      kg = units.find((u) => u.name === "kg").id;
    const balance = async () =>
      Number(
        (await db.query("SELECT balance FROM preciso.commercial_stock WHERE id=$1", [product.id]))
          .rows[0].balance,
      );
    await command("cash_open", { opening: 100 });
    await t.test("different purchase costs and one physical balance", async () => {
      await command("purchase", {
        product_id: product.id,
        unit_id: sack,
        quantity: 10,
        goods_total: 175,
        freight: 0,
        other_costs: 0,
        reference: "LOT-A",
        reason: "Compra teste",
        supplier_id: null,
        due_on: "2026-12-01",
        purchased_at: "2026-11-18",
      });
      await command("purchase", {
        product_id: product.id,
        unit_id: sack,
        quantity: 2,
        goods_total: 38,
        freight: 0,
        other_costs: 0,
        reference: "LOT-B",
        reason: "Compra teste",
        supplier_id: null,
        due_on: "2026-12-01",
        purchased_at: "2026-11-18",
      });
      assert.equal(await balance(), 480);
    });
    await t.test(
      "atomic import rejects repeated product names and creates only inactive drafts",
      async () => {
        const input = {
          rows: [
            {
              name: "Perfil teste",
              category: "Perfis",
              base_unit: "m",
              unit_name: "barra",
              factor: 3,
              price: 20,
            },
          ],
        };
        await command("import_products", input);
        await assert.rejects(command("import_products", input), /DUPLICATE_PRODUCT/);
        const row = (
          await db.query(
            "SELECT active,published FROM preciso.commercial_products WHERE name='Perfil teste'",
          )
        ).rows[0];
        assert.equal(row.active, false);
        assert.equal(row.published, false);
      },
    );
    const customer = await command("customer", {
      name: "Cliente teste",
      contact: "",
      profile: "revendedor",
      allow_credit: true,
    });
    await command("price_rule", {
      unit_id: sack,
      customer_id: customer.id,
      profile: null,
      minimum_quantity: 1,
      price: 22.5,
      valid_from: null,
      valid_until: null,
    });
    await command("price_rule", {
      unit_id: kg,
      customer_id: null,
      profile: null,
      minimum_quantity: 10,
      price: 1.5,
      valid_from: null,
      valid_until: null,
    });
    const saleInput = {
      customer_id: customer.id,
      freight: 0,
      fees: 0,
      taxes: 0,
      other_costs: 0,
      items: [
        { unit_id: sack, quantity: 1, price: null, reason: "" },
        { unit_id: half, quantity: 1, price: null, reason: "" },
        { unit_id: kg, quantity: 5, price: null, reason: "" },
      ],
      payments: [],
    };
    const key = randomUUID();
    let sale;
    await t.test(
      "sack, half sack and kg with customer pricing and FIFO historical cost",
      async () => {
        sale = await command("sale", saleInput, key);
        assert.equal(await balance(), 415);
        const result = (
          await db.query("SELECT * FROM preciso.commercial_results WHERE id=$1", [sale.id])
        ).rows[0];
        assert.equal(Number(result.revenue), 47.5);
        assert.equal(Number(result.goods_cost), 28.4375);
        assert.equal(Number(result.receivable), 47.5);
        assert.equal(Number(result.contribution), 19.0625);
        assert.equal(result.partial, false);
      },
    );
    await t.test(
      "duplicate request cannot debit twice and changed payload is rejected",
      async () => {
        assert.deepEqual(await command("sale", saleInput, key), sale);
        assert.equal(await balance(), 415);
        await assert.rejects(
          command("sale", { ...saleInput, fees: 1 }, key),
          /IDEMPOTENCY_CONFLICT/,
        );
      },
    );
    await t.test("volume price uses quantity of selected sale unit", async () => {
      const price = (await db.query("SELECT preciso.commercial_price($1,NULL,10) AS price", [kg]))
        .rows[0].price;
      assert.equal(Number(price), 1.5);
    });
    await t.test("insufficient stock rolls back all items and journal records", async () => {
      await assert.rejects(
        command("sale", { ...saleInput, items: [{ unit_id: sack, quantity: 999, price: null }] }),
        /INSUFFICIENT_STOCK/,
      );
      assert.equal(await balance(), 415);
      assert.equal(
        Number((await db.query("SELECT count(*) n FROM preciso.commercial_sales")).rows[0].n),
        1,
      );
    });
    await t.test(
      "partial payments and cancellation preserve payments until explicit refund",
      async () => {
        await command("payment", {
          sale_id: sale.id,
          method: "pix",
          amount: 20,
          reference: "Confirmação teste",
        });
        await command("cancel", { sale_id: sale.id, reason: "Cancelamento teste" });
        assert.equal(await balance(), 480);
        let row = (
          await db.query("SELECT * FROM preciso.commercial_results WHERE id=$1", [sale.id])
        ).rows[0];
        assert.equal(Number(row.received), 20);
        assert.equal(Number(row.receivable), -20);
        await assert.rejects(
          command("cancel", { sale_id: sale.id, reason: "Repetição" }),
          /SALE_NOT_ACTIVE/,
        );
        await command("refund", {
          sale_id: sale.id,
          method: "pix",
          amount: 20,
          reference: "Estorno confirmado teste",
        });
        row = (await db.query("SELECT * FROM preciso.commercial_results WHERE id=$1", [sale.id]))
          .rows[0];
        assert.equal(Number(row.received), 0);
        await assert.rejects(
          command("refund", { sale_id: sale.id, method: "pix", amount: 1, reference: "Duplicado" }),
          /REFUND_LIMIT/,
        );
      },
    );
    await t.test(
      "return restores exact lots and actual allocated cost, not current purchase cost",
      async () => {
        const s = await command("sale", {
          ...saleInput,
          items: [{ unit_id: sack, quantity: 11, price: null }],
          payments: [],
        });
        const row = (await db.query("SELECT * FROM preciso.commercial_results WHERE id=$1", [s.id]))
          .rows[0];
        assert.equal(Number(row.goods_cost), 194);
        const item = (
          await db.query("SELECT * FROM preciso.commercial_sale_items WHERE sale_id=$1", [s.id])
        ).rows[0];
        await command("return", {
          sale_id: s.id,
          items: [{ item_id: item.id, quantity: 1 }],
          reason: "Devolução teste",
        });
        assert.equal(await balance(), 80);
        const allocations = (
          await db.query(
            "SELECT sum((quantity-returned)*unit_cost) cost FROM preciso.commercial_allocations WHERE item_id=$1",
            [item.id],
          )
        ).rows[0];
        const after = (
          await db.query("SELECT * FROM preciso.commercial_results WHERE id=$1", [s.id])
        ).rows[0];
        assert.equal(Number(after.goods_cost), Number(allocations.cost));
        await command("cancel", { sale_id: s.id, reason: "Limpeza do teste" });
      },
    );
    await t.test("competing sales never create negative balance", async () => {
      const input = {
        ...saleInput,
        items: [{ unit_id: sack, quantity: 10, price: null }],
        payments: [],
      };
      const outcomes = await Promise.allSettled([command("sale", input), command("sale", input)]);
      assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await balance(), 80);
    });
    await t.test(
      "unknown stock cost produces partial result and discounts generate warnings",
      async () => {
        await command("adjustment", {
          product_id: product.id,
          unit_id: kg,
          quantity: 5,
          mode: "in",
          base_unit_cost: null,
          reason: "Inventário sem custo",
          reference: "",
        });
        const s = await command("sale", {
          ...saleInput,
          freight: null,
          items: [{ unit_id: kg, quantity: 85, price: 0.1, reason: "Negociação autorizada" }],
        });
        const row = (await db.query("SELECT * FROM preciso.commercial_results WHERE id=$1", [s.id]))
          .rows[0];
        assert.equal(row.partial, true);
        assert.equal(row.goods_cost, null);
        const item = (
          await db.query("SELECT warnings FROM preciso.commercial_sale_items WHERE sale_id=$1", [
            s.id,
          ])
        ).rows[0];
        assert.ok(item.warnings.length >= 2);
      },
    );
    await t.test("non-admin database command denied", async () => {
      const client = randomUUID();
      await db.query(
        "INSERT INTO preciso.users(id,email,full_name,password_hash) VALUES($1,'client@example.invalid','Cliente','test-only')",
        [client],
      );
      await assert.rejects(
        db.query("SELECT preciso.commercial_command($1,$2,$3::jsonb)", [
          client,
          "cash_open",
          JSON.stringify({ request_key: randomUUID(), opening: 0 }),
        ]),
        /FORBIDDEN/,
      );
    });
    await t.test(
      "cash closing reconciles confirmed cash receipts, expenses and supplier payments",
      async () => {
        const expense = await command("expense", {
          description: "Despesa teste",
          amount: 5,
          due_on: "2026-11-18",
          paid_on: null,
          method: null,
        });
        await command("expense_payment", {
          expense_id: expense.id,
          paid_on: "2026-11-18",
          method: "dinheiro",
        });
        await assert.rejects(
          command("expense_payment", {
            expense_id: expense.id,
            paid_on: "2026-11-18",
            method: "dinheiro",
          }),
          /EXPENSE_ALREADY_PAID/,
        );
        const purchase = (
          await db.query(
            "SELECT * FROM preciso.commercial_purchases ORDER BY purchased_at,id LIMIT 1",
          )
        ).rows[0];
        await command("purchase_payment", {
          purchase_id: purchase.id,
          amount: 10,
          method: "dinheiro",
        });
        const result = await command("cash_close", { counted: 85, notes: "Conferido no teste" });
        assert.equal(Number(result.expected), 85);
        assert.equal(Number(result.difference), 0);
        await assert.rejects(
          command("payment", { sale_id: sale.id, method: "pix", amount: 1, reference: "" }),
          /CASH_CLOSED/,
        );
      },
    );
    await t.test(
      "production state and financial queries execute and keep public price rules private",
      async () => {
        const state = (await db.query(await productionReadQuery("'cash_history'"))).rows[0].data;
        assert.ok(state.products.length >= 2);
        assert.ok(Array.isArray(state.lots));
        const report = (
          await db.query(await productionReadQuery("'by_customer'"), ["2026-01-01", "2026-12-31"])
        ).rows[0].data;
        assert.ok(Array.isArray(report.by_product));
        assert.ok(Array.isArray(report.by_customer));
        assert.equal(report.pending_purchase_costs, 0);
        const catalogue = (
          await db.query(await productionReadQuery("WHERE p.active AND p.published"))
        ).rows;
        assert.equal(catalogue.length, 0);
      },
    );
    await t.test("data persists after database closes and restarts", async () => {
      await db.close();
      db = new PGlite(directory);
      assert.equal(await balance(), 0);
      assert.ok(
        Number((await db.query("SELECT count(*) n FROM preciso.commercial_sales")).rows[0].n) >= 4,
      );
    });
  } finally {
    await db.close();
    assert.ok(directory.startsWith(join(tmpdir(), "ouro-comercial-")));
    await rm(directory, { recursive: true, force: true });
  }
});
