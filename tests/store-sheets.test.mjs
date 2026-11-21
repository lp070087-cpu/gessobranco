import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const migrations = [
  "0000_preciso",
  "0001_commercial",
  "0002_company_requests",
  "0003_company_operations",
  "0004_cfo",
  "0005_service_proposals",
  "0006_purchase_deliveries",
  "0007_customer_documents",
  "0008_customer_worksites",
  "0009_folhas_da_loja",
];

test("folha do dia, retiradas, fechamentos e conferência de entrega", async () => {
  const db = new PGlite();
  const previousUrl = process.env.DATABASE_URL;
  const previousApp = process.env.APP_URL;
  try {
    for (const name of migrations)
      await db.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
    globalThis.__ouroTestDatabase = drizzle(db);
    process.env.DATABASE_URL = "postgres://isolated-test.invalid/test";
    process.env.APP_URL = "http://ouro.test";
    const bundled = await build({
      stdin: {
        contents: "export {handleNeonRequest} from './src/server/neon/api';",
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      plugins: [
        {
          name: "isolated-database",
          setup(plugin) {
            plugin.onResolve({ filter: /^\.\/db$/ }, () => ({ path: "db", namespace: "t" }));
            plugin.onLoad({ filter: /.*/, namespace: "t" }, () => ({
              contents: "export function database(){ return globalThis.__ouroTestDatabase; }",
              loader: "js",
            }));
          },
        },
      ],
    });
    const { handleNeonRequest } = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
    );
    const call = (path, token, body) =>
      handleNeonRequest(
        new Request(`http://ouro.test/api/neon/${path}`, {
          method: body ? "POST" : "GET",
          headers: {
            Cookie: `preciso_session=${token}`,
            ...(body ? { "Content-Type": "application/json", Origin: "http://ouro.test" } : {}),
          },
          ...(body ? { body: JSON.stringify({ request_key: randomUUID(), ...body }) } : {}),
        }),
      );
    const ok = async (path, token, body) => {
      const response = await call(path, token, body);
      const data = await response.json();
      assert.equal(response.status, 200, `${path}: ${JSON.stringify(data)}`);
      return data;
    };
    const okRaw = async (path, token, body) => {
      const response = await handleNeonRequest(
        new Request(`http://ouro.test/api/neon/${path}`, {
          method: "POST",
          headers: {
            Cookie: `preciso_session=${token}`,
            "Content-Type": "application/json",
            Origin: "http://ouro.test",
          },
          body: JSON.stringify(body),
        }),
      );
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const okRawStatus = async (path, token, body) =>
      (
        await handleNeonRequest(
          new Request(`http://ouro.test/api/neon/${path}`, {
            method: "POST",
            headers: {
              Cookie: `preciso_session=${token}`,
              "Content-Type": "application/json",
              Origin: "http://ouro.test",
            },
            body: JSON.stringify(body),
          }),
        )
      ).status;
    async function account(email, name) {
      const credentials = { email, password: "Senha-de-teste-12345", full_name: name };
      const registered = await handleNeonRequest(
        new Request("http://ouro.test/api/neon/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://ouro.test" },
          body: JSON.stringify(credentials),
        }),
      );
      assert.equal(registered.status, 201);
      const login = await handleNeonRequest(
        new Request("http://ouro.test/api/neon/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://ouro.test" },
          body: JSON.stringify({ email, password: credentials.password }),
        }),
      );
      return login.headers.get("set-cookie").match(/preciso_session=([a-f0-9]+)/)[1];
    }
    const owner = await account("dono@example.invalid", "Dono da loja");
    const secretary = await account("secretaria@example.invalid", "Secretária");
    await db.exec("UPDATE preciso.users SET role='admin' WHERE email='dono@example.invalid'");

    assert.equal(
      (await call("store/sheet?start=2026-11-01&end=2026-11-01", secretary)).status,
      403,
    );
    await okRaw("admin/permissions", owner, {
      email: "secretaria@example.invalid",
      permissions: ["store_closing"],
    });

    await ok("commercial/product", owner, {
      name: "Placa de gesso",
      description: "",
      category: "Gesso",
      base_unit: "un",
      valuation_method: "fifo",
      minimum_stock: 0,
      minimum_margin: 0,
      maximum_discount: 100,
      enforce_discount: false,
      active: true,
      published: false,
      public_price: false,
      image_url: null,
      units: [{ name: "Placa", factor: 1, price: 5 }],
    });
    let state = await ok("commercial/state", owner);
    const placa = state.products.find((product) => product.name === "Placa de gesso");
    const unit = placa.units[0];

    // Pedido ao fornecedor: chega, confere e só o que veio bom entra no estoque.
    const order = await ok("store/order", owner, {
      supplier_id: null,
      reference: "Pedido 01",
      ordered_on: "2026-11-01",
      expected_on: null,
      due_on: null,
      freight: 0,
      other_costs: 0,
      notes: "",
      items: [{ product_id: placa.id, unit_id: unit.id, quantity: 100, goods_total: 480 }],
    });
    assert.equal((await call("store/order", secretary, { order_id: order.id })).status, 403);
    await ok("store/order_arrived", owner, { order_id: order.id });
    const counted = await ok("store/order_check", owner, {
      order_id: order.id,
      notes: "Duas placas quebradas",
      items: [{ ok: 95, broken: 2, damaged: 1, note: "quinas lascadas" }],
    });
    assert.ok(counted.delivery_id);
    state = await ok("commercial/state", owner);
    const stocked = state.products.find((product) => product.id === placa.id);
    assert.equal(Number(stocked.balance), 95);
    assert.equal(Number(stocked.stock_cost), 456);
    const [checkedOrder] = await ok("store/orders", owner);
    assert.equal(checkedOrder.status, "conferido");
    assert.equal(checkedOrder.check_result.items[0].missing, 2);
    assert.equal(
      (await call("store/order_check", owner, { order_id: order.id, notes: "", items: [] })).status,
      400,
    );

    // Caixa e folha do dia feitos pela secretária.
    await ok("store/cash_open", secretary, { opening: 6 });
    await ok("commercial/sale", owner, {
      customer_id: null,
      items: [{ unit_id: unit.id, quantity: 20, price: null, reason: "" }],
      payments: [
        { method: "dinheiro", amount: 60, reference: "", confirmed: true },
        { method: "pix", amount: 40, reference: "", confirmed: true },
      ],
      freight: 0,
      fees: 0,
      taxes: 0,
      other_costs: 0,
    });
    await ok("store/withdrawal", secretary, {
      category: "retirada",
      person: "Ítalo",
      description: "Retirada do dono",
      amount: 50,
    });
    await ok("store/expense", secretary, {
      description: "Água",
      amount: 7,
      expense_type: "fixo",
      person: "",
      due_on: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" }).format(new Date()),
      paid_on: null,
      method: null,
    });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Recife" }).format(
      new Date(),
    );
    let sheet = await ok(`store/sheet?start=${today}&end=${today}`, secretary);
    const [day] = sheet.days;
    assert.equal(Number(day.totals.sales), 100);
    assert.equal(Number(day.totals.dinheiro), 60);
    assert.equal(Number(day.totals.pix), 40);
    assert.equal(day.cash[0].withdrawals[0].person, "Ítalo");
    assert.equal(Number(day.cash[0].expected), 16);
    assert.equal(sheet.week.products[0].product, "Placa de gesso");
    assert.equal(Number(sheet.week.products[0].quantity), 20);

    const closed = await ok("store/cash_close", secretary, { counted: 16, notes: "" });
    assert.equal(Number(closed.difference), 0);
    // A retirada não é gasto da loja no relatório comercial.
    const report = await ok(`commercial/report?start=${today}&end=${today}`, owner);
    assert.equal(Number(report.operating_expenses), 7);

    const closing = await ok("store/closing", secretary, {
      period: "dia",
      start_on: today,
      end_on: today,
      notes: "Conferido pela secretária",
    });
    const [saved] = await ok("store/closings", owner);
    assert.equal(saved.id, closing.id);
    assert.equal(saved.source, "manual");
    assert.equal(saved.snapshot.summary.sales, 100);
    assert.equal(saved.actor, "Secretária");

    // Débitos da empresa: aluguel sem valor fica em aberto para o dono preencher.
    assert.equal(
      (
        await call("store/debt", secretary, {
          kind: "aluguel",
          person: "Sr. Dema",
          description: "Aluguel",
          amount: null,
          due_on: null,
          paid_on: null,
          example: true,
          notes: "",
        })
      ).status,
      403,
    );
    await ok("store/debt", owner, {
      kind: "aluguel",
      person: "Sr. Dema",
      description: "Aluguel",
      amount: null,
      due_on: "2026-11-26",
      paid_on: null,
      example: true,
      notes: "Valor a confirmar",
    });
    sheet = await ok(`store/sheet?start=${today}&end=${today}`, owner);
    assert.equal(sheet.debts[0].amount, null);
    assert.equal(sheet.debts[0].example, true);

    // Fiado: cliente autorizado compra a prazo, aparece nos fiados e depois paga.
    await ok("store/cash_open", owner, { opening: 0 });
    const client = await ok("commercial/customer", owner, {
      name: "Bigode",
      contact: "",
      profile: "recorrente",
      allow_credit: true,
    });
    const credit = await ok("commercial/sale", owner, {
      customer_id: client.id,
      items: [{ unit_id: unit.id, quantity: 4, price: null, reason: "" }],
      payments: [],
      freight: 0,
      fees: 0,
      taxes: 0,
      other_costs: 0,
    });
    sheet = await ok(`store/sheet?start=${today}&end=${today}`, owner);
    assert.deepEqual(
      sheet.fiados.map((item) => [item.name, Number(item.amount)]),
      [["Bigode", 20]],
    );
    await ok("commercial/payment", owner, {
      sale_id: credit.id,
      method: "pix",
      amount: 20,
      reference: "",
      confirmed: true,
    });
    sheet = await ok(`store/sheet?start=${today}&end=${today}`, owner);
    assert.equal(sheet.fiados.length, 0);

    // Trocar a própria senha.
    assert.equal(
      await okRawStatus("auth/password", secretary, {
        current: "errada",
        next: "Nova-senha-12345",
      }),
      400,
    );
    await okRaw("auth/password", secretary, {
      current: "Senha-de-teste-12345",
      next: "Nova-senha-12345",
    });

    // Pedido de visita com resumo do simulador e fotos.
    const jpeg =
      "data:image/jpeg;base64," +
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]).toString(
        "base64",
      );
    const amanha = new Date(Date.now() + 86400000).toISOString();
    const visitResponse = await handleNeonRequest(
      new Request("http://ouro.test/api/neon/appointments", {
        method: "POST",
        headers: {
          Cookie: `preciso_session=${owner}`,
          "Content-Type": "application/json",
          Origin: "http://ouro.test",
        },
        body: JSON.stringify({
          kind: "visit",
          scheduled_at: amanha,
          address: "Rua de exemplo, 10",
          notes: "Tipo: Um cômodo\nQual cômodo: Quarto",
          photos: [jpeg, jpeg],
        }),
      }),
    );
    assert.equal(visitResponse.status, 201, await visitResponse.clone().text());
    const visit = await visitResponse.json();
    assert.equal(visit.photos, 2);
    const photo = await handleNeonRequest(
      new Request(`http://ouro.test/api/neon/appointments/${visit.id}/photos/1`, {
        headers: { Cookie: `preciso_session=${owner}` },
      }),
    );
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get("content-type"), "image/jpeg");
    const strange = await handleNeonRequest(
      new Request(`http://ouro.test/api/neon/appointments/${visit.id}/photos/1`, {
        headers: { Cookie: `preciso_session=${secretary}` },
      }),
    );
    assert.equal(strange.status, 404);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
    delete globalThis.__ouroTestDatabase;
    await db.close();
  }
});
