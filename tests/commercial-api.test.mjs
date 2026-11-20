import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readSheet } from "read-excel-file/node";

test("real HTTP handlers enforce sessions, admin roles, input validation and origin", async () => {
  const db = new PGlite();
  const previousUrl = process.env.DATABASE_URL;
  const previousApp = process.env.APP_URL;
  const previousCron = process.env.CRON_SECRET;
  try {
    await db.exec(await readFile(new URL("../drizzle/0000_preciso.sql", import.meta.url), "utf8"));
    await db.exec(
      await readFile(new URL("../drizzle/0001_commercial.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(new URL("../drizzle/0002_company_requests.sql", import.meta.url), "utf8"),
    );
    for (const migration of [
      "0003_company_operations",
      "0004_cfo",
      "0005_service_proposals",
      "0006_purchase_deliveries",
      "0007_customer_documents",
      "0008_customer_worksites",
      "0009_folhas_da_loja",
    ])
      await db.exec(
        await readFile(new URL(`../drizzle/${migration}.sql`, import.meta.url), "utf8"),
      );
    globalThis.__ouroTestDatabase = drizzle(db);
    process.env.DATABASE_URL = "postgres://isolated-test.invalid/test";
    process.env.APP_URL = "http://ouro.test";
    const bundled = await build({
      stdin: {
        contents:
          "export {handleNeonRequest} from './src/server/neon/api'; export {parseStatement} from './src/lib/cfo'; export {parseCsv} from './src/lib/commercial-import';",
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
            plugin.onResolve({ filter: /^\.\/db$/ }, () => ({
              path: "isolated-db",
              namespace: "ouro-test",
            }));
            plugin.onLoad({ filter: /.*/, namespace: "ouro-test" }, () => ({
              contents: "export function database(){ return globalThis.__ouroTestDatabase; }",
              loader: "js",
            }));
          },
        },
      ],
    });
    const { handleNeonRequest, parseStatement, parseCsv } = await import(
      `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
    );
    const request = (
      path,
      token,
      body,
      origin = "http://ouro.test",
      method = body ? "POST" : "GET",
    ) =>
      handleNeonRequest(
        new Request(`http://ouro.test/api/neon/${path}`, {
          method,
          headers: {
            ...(token ? { Cookie: `preciso_session=${token}` } : {}),
            ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    assert.equal((await request("commercial/state")).status, 401);
    const credentials = {
      email: "client@example.invalid",
      password: "Password-test-12345",
      full_name: "Cliente teste",
    };
    assert.equal((await request("auth/register", null, credentials)).status, 201);
    const login = await request("auth/login", null, {
      email: credentials.email,
      password: credentials.password,
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    const token = login.headers.get("set-cookie").match(/preciso_session=([a-f0-9]+)/)[1];
    assert.equal((await request("commercial/state", token)).status, 403);
    assert.equal((await request("commercial/quality", token, { good: 15, medium: 5 })).status, 403);
    assert.equal((await request("admin/company-requests", token)).status, 403);
    assert.equal(
      (await request("commercial/cash_open", token, { request_key: randomUUID(), opening: 0 }))
        .status,
      403,
    );
    await db.exec("UPDATE preciso.users SET role='admin' WHERE email='client@example.invalid'");
    assert.equal((await request("commercial/state", token)).status, 200);
    assert.equal(
      (await request("commercial/cash_open", token, { request_key: randomUUID(), opening: -1 }))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "commercial/cash_open",
          token,
          { request_key: randomUUID(), opening: 0 },
          "https://foreign.invalid",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("commercial/cash_open", token, { request_key: randomUUID(), opening: 0 }))
        .status,
      200,
    );
    assert.equal((await request("catalogue")).status, 200);
    const serviceRequest = {
      kind: "service",
      request_key: randomUUID(),
      name: "Solicitante teste",
      email: "service@example.invalid",
      phone: "",
      subject: "Forro de gesso",
      notes: "Solicitação da suíte",
    };
    assert.equal(
      (await request("company-requests", null, serviceRequest, "https://foreign.invalid")).status,
      403,
    );
    assert.equal((await request("company-requests", null, serviceRequest)).status, 201);
    assert.equal((await request("company-requests", null, serviceRequest)).status, 201);
    assert.equal(
      (
        await request("company-requests", null, {
          ...serviceRequest,
          request_key: randomUUID(),
          kind: "material",
          subject: "Gesso",
          unit_name: "Tonelada",
          quantity: 20,
        })
      ).status,
      201,
    );
    assert.equal((await request("admin/company-requests")).status, 401);
    const inbox = await (await request("admin/company-requests", token)).json();
    assert.equal(inbox.requests.length, 2);
    const service = inbox.requests.find((entry) => entry.kind === "service");
    assert.equal(
      (
        await request(
          "admin/company-requests",
          token,
          {
            id: service.id,
            status: "contacted",
          },
          undefined,
          "PATCH",
        )
      ).status,
      200,
    );
    const updated = await (await request("admin/company-requests", token)).json();
    assert.equal(updated.requests.find((entry) => entry.id === service.id).status, "contacted");
    const proposal = { unit: "m²", quantity: 8, unit_price: 35, work: "Instalar forro de gesso." };
    const saveProposal = (id) =>
      request("admin/company-requests?kind=service", token, { id, proposal }, undefined, "PATCH");
    assert.equal(
      (await saveProposal(inbox.requests.find((entry) => entry.kind === "material").id)).status,
      404,
    );
    assert.deepEqual((await (await saveProposal(service.id)).json()).proposal, proposal);
    assert.equal((await request("admin/business-settings", token)).status, 200);
    assert.equal((await request("admin/owner-expenses")).status, 401);
    const profile = {
      business_name: "Ouro Teste",
      legal_name: "Ouro Teste LTDA",
      cnpj: "12.345.678/0001-90",
      contact_email: "",
      contact_phone: "",
      service_area: "",
      estimate_disclaimer: "",
      address: "Rua Teste, 10",
      city: "Recife",
      state: "PE",
      latitude: "-8.054",
      longitude: "-34.881",
    };
    const profileSave = await request(
      "admin/business-settings",
      token,
      profile,
      undefined,
      "PATCH",
    );
    assert.equal(profileSave.status, 200);
    const publicLocation = await (await request("business/location")).json();
    assert.deepEqual(publicLocation, {
      address: "Rua Teste, 10, Recife – PE",
      latitude: "-8.054",
      longitude: "-34.881",
    });
    const categorySave = await request("admin/service-categories", token, { name: "Pintura" });
    assert.equal(categorySave.status, 201);
    assert.ok(
      (await (await request("admin/service-categories", token)).json()).includes("Pintura"),
    );
    const samplePhoto =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGy8AAAAASUVORK5CYII=";
    const expense = {
      request_id: randomUUID(),
      description: "Pix, gasolina",
      amount: 79.21,
      day: "2098-11-18",
      category: "Combustível",
      paid: false,
      photo: samplePhoto,
    };
    const expenseResponse = await request("admin/owner-expenses", token, expense);
    assert.equal(expenseResponse.status, 201);
    const savedExpense = await expenseResponse.json();
    assert.equal((await request("admin/owner-expenses", token, expense)).status, 200);
    assert.equal(
      (await request("admin/owner-expenses", token, { ...expense, request_id: randomUUID() }))
        .status,
      409,
    );
    const receipt = await request(`admin/owner-expenses/${savedExpense.id}/receipt`, token);
    assert.equal(receipt.headers.get("content-type"), "image/png");
    assert.equal((await request(`admin/owner-expenses/${savedExpense.id}/receipt`)).status, 401);
    const cfoOverview = await request("cfo/overview?start=2026-11-18&end=2026-11-18", token);
    assert.equal(cfoOverview.status, 200);
    assert.equal((await cfoOverview.json()).dre.receivedServices, 0);
    assert.equal((await (await request("cfo/history", token)).json()).runs.length, 0);
    await db.exec("UPDATE preciso.company_requests SET created_at='2026-11-18T15:00:00Z'");
    const overviewPath = "commercial/overview?start=2026-11-18&end=2026-11-18";
    assert.equal((await request(overviewPath)).status, 401);
    const overview = await (await request(overviewPath, token)).json();
    assert.equal(overview.materials, 1);
    assert.equal(overview.quotes, 1);
    assert.equal(overview.recent_materials[0].subject, "Gesso");
    assert.equal(overview.recent_quotes[0].subject, "Forro de gesso");
    assert.equal(overview.overdue_expenses, 0);
    const range = "commercial/report?start=2026-11-17&end=2026-11-18";
    const report = await (await request(range, token)).json();
    assert.deepEqual(
      report.daily,
      ["2026-11-17", "2026-11-18"].map((day) => ({
        day,
        good: 0,
        medium: 0,
        bad: 0,
        pending: 0,
      })),
    );
    const pdf = await request(range + "&format=pdf", token);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.match(
      Buffer.from(await pdf.arrayBuffer()).toString("latin1"),
      /^%PDF-1\.4[\s\S]+%%EOF\s*$/,
    );
    const excel = await request(range + "&format=xlsx", token);
    assert.equal(excel.status, 200);
    assert.match(excel.headers.get("content-type"), /spreadsheetml/);
    const cells = await readSheet(Buffer.from(await excel.arrayBuffer()), 1);
    assert.equal(cells[0][0], "Ouro Branco — Relatório comercial");
    const qualityRange = range.replace("commercial/report", "commercial/quality");
    const emptyChart = await (await request(qualityRange, token)).json();
    assert.equal(emptyChart.thresholds.good, 15);
    assert.equal(emptyChart.thresholds.medium, 5);
    assert.match(emptyChart.thresholds.colors.good, /^#[a-f0-9]{6}$/);
    assert.equal(emptyChart.sales, 0);
    assert.deepEqual(emptyChart.points[0], {
      day: "2026-11-17",
      good: null,
      medium: null,
      bad: null,
    });
    const actor = (
      await db.query("SELECT id FROM preciso.users WHERE email=$1", [credentials.email])
    ).rows[0].id;
    const unit = (await db.query("SELECT id,product_id FROM preciso.commercial_units LIMIT 1"))
      .rows[0];
    for (const [freight, status] of [
      [60, "confirmed"],
      [90, "confirmed"],
      [105, "confirmed"],
      [null, "confirmed"],
      [0, "cancelled"],
    ]) {
      const sale = (
        await db.query(
          "INSERT INTO preciso.commercial_sales(actor_id,freight,fees,taxes,other_costs,status,created_at) VALUES ($1,$2,0,0,0,$3,'2026-11-18T15:00:00Z') RETURNING id",
          [actor, freight, status],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO preciso.commercial_sale_items(sale_id,product_id,unit_id,product_name,unit_name,factor,quantity,price,list_price,revenue) VALUES ($1,$2,$3,'Produto teste','Unidade',1,1,100,100,100)",
        [sale.id, unit.product_id, unit.id],
      );
    }
    const chart = await (await request(qualityRange, token)).json();
    assert.equal(chart.sales, 3);
    assert.equal(chart.pending, 1);
    assert.deepEqual(chart.points[1], { day: "2026-11-18", good: 40, medium: 10, bad: -5 });
    assert.equal(
      (await request("commercial/quality", token, { good: 10, medium: 15 })).status,
      400,
    );
    assert.equal(
      (await request("commercial/quality", token, { good: 35, medium: 12 })).status,
      200,
    );
    const reclassified = await (await request(qualityRange, token)).json();
    assert.deepEqual(reclassified.points[1], { day: "2026-11-18", good: 40, medium: null, bad: 5 });
    const staffEmail = "secretaria@example.invalid";
    const staffPassword = "Senha-teste-12345";
    assert.equal(
      (
        await request("auth/register", null, {
          email: staffEmail,
          password: staffPassword,
          full_name: "Secretaria teste",
        })
      ).status,
      201,
    );
    const staffLogin = await request("auth/login", null, {
      email: staffEmail,
      password: staffPassword,
    });
    const staffToken = staffLogin.headers.get("set-cookie").match(/preciso_session=([a-f0-9]+)/)[1];
    assert.equal((await request("cfo/history", staffToken)).status, 403);
    assert.equal((await request("admin/services", staffToken)).status, 403);
    assert.equal(
      (
        await request("admin/permissions", token, {
          email: staffEmail,
          permissions: ["service_requests", "service_agenda"],
        })
      ).status,
      200,
    );
    assert.equal((await request("commercial/state", staffToken)).status, 403);
    assert.equal((await request("cfo/history", staffToken)).status, 403);
    const staffInbox = await (await request("admin/company-requests", staffToken)).json();
    assert.ok(staffInbox.requests.every((item) => item.kind === "service"));
    const material = inbox.requests.find((item) => item.kind === "material");
    assert.equal(
      (
        await request(
          "admin/company-requests",
          staffToken,
          { id: material.id, status: "closed" },
          undefined,
          "PATCH",
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request("commercial/product", token, {
          request_key: randomUUID(),
          name: "Gesso de teste portal",
          description: "",
          category: "",
          base_unit: "kg",
          valuation_method: "fifo",
          minimum_stock: 0,
          minimum_margin: 0,
          maximum_discount: 100,
          enforce_discount: false,
          active: true,
          published: true,
          public_price: true,
          image_url: null,
          units: [{ name: "Saco", factor: 40, price: 25 }],
        })
      ).status,
      200,
    );
    const materials = await (await request("portal/catalogue", staffToken)).json();
    const sack = materials.find((item) => item.name === "Gesso de teste portal").units[0];
    const bulk = {
      email: "cnpj@example.invalid",
      password: staffPassword,
      full_name: "Cliente CNPJ",
      document_type: "cnpj",
      document: "12.345.678/0001-95",
    };
    assert.equal(
      (await request("auth/register", null, { ...bulk, document: "12.345.678/0001-94" })).status,
      400,
    );
    assert.equal(
      (await request("auth/register", null, { ...bulk, company_name: "Gestão inválida" })).status,
      400,
    );
    assert.equal((await request("auth/register", null, bulk)).status, 201);
    const buyerLogin = { email: bulk.email, password: bulk.password };
    assert.equal(
      (await request("auth/login", null, { ...buyerLogin, access: "management" })).status,
      403,
    );
    const buyer = await request("auth/login", null, { ...buyerLogin, access: "client" });
    assert.equal(buyer.status, 200);
    const buyerToken = buyer.headers.get("set-cookie").match(/preciso_session=([a-f0-9]+)/)[1];
    const company = { name: "Construtora de teste", trade_name: "Construção" };
    const site = {
      name: "Forro da sala",
      property_type: "apartment",
      unit: "302, bloco B",
      address: "Rua de teste, 20, Recife PE",
      area_m2: 76.25,
      notes: "Forro de gesso",
    };
    const patch = (path, session, payload) =>
      request(path, session, payload, "http://ouro.test", "PATCH");
    assert.equal((await request("portal/worksites", buyerToken, site)).status, 409);
    assert.equal((await patch("portal/business", staffToken, company)).status, 403);
    assert.equal((await patch("portal/business", buyerToken, company)).status, 200);
    assert.equal(
      (await request("portal/worksites", buyerToken, { ...site, unit: "" })).status,
      400,
    );
    const savedSite = await request("portal/worksites", buyerToken, site);
    assert.equal(savedSite.status, 201);
    const { id: worksiteId } = await savedSite.json();
    const otherBuyer = {
      ...bulk,
      email: "other-cnpj@example.invalid",
      document: "11.222.333/0001-81",
    };
    assert.equal((await request("auth/register", null, otherBuyer)).status, 201);
    const otherLogin = await request("auth/login", null, {
      email: otherBuyer.email,
      password: otherBuyer.password,
      access: "client",
    });
    assert.equal(otherLogin.status, 200);
    const otherToken = otherLogin.headers.get("set-cookie").match(/preciso_session=([a-f0-9]+)/)[1];
    assert.equal((await patch("portal/business", otherToken, company)).status, 200);
    assert.equal((await patch(`portal/worksites/${worksiteId}`, otherToken, site)).status, 404);
    assert.equal(
      (await patch(`portal/worksites/${worksiteId}`, buyerToken, { ...site, area_m2: 80 })).status,
      200,
    );
    const buyerBusiness = await (await request("portal/business", buyerToken)).json();
    assert.equal(buyerBusiness.document, "12345678000195");
    assert.deepEqual(buyerBusiness.company, company);
    assert.equal(Number(buyerBusiness.worksites[0].area_m2), 80);
    assert.deepEqual((await (await request("portal/business", otherToken)).json()).worksites, []);

    assert.equal(
      (
        await request("auth/login", null, {
          email: staffEmail,
          password: staffPassword,
          access: "client",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await request("auth/login", null, {
          email: staffEmail,
          password: staffPassword,
          access: "management",
        })
      ).status,
      200,
    );
    for (const [minimum_quantity, price] of [
      [20, 23],
      [25, 21],
      [40, 19],
    ]) {
      assert.equal(
        (
          await request("commercial/price_rule", token, {
            request_key: randomUUID(),
            unit_id: sack.id,
            profile: "CNPJ",
            minimum_quantity,
            price,
          })
        ).status,
        200,
      );
    }
    const getPrice = async (buyer, quantity) =>
      (await request("portal/price", buyer, { unit_id: sack.id, quantity })).json();
    const q20 = await getPrice(buyerToken, 20);
    assert.equal(Number(q20.price), 23);
    assert.deepEqual(q20.next_tier, { quantity: 25, price: 21 });
    assert.equal(Number((await getPrice(buyerToken, 25)).price), 21);
    assert.equal((await getPrice(staffToken, 25)).next_tier, null);
    assert.equal(Number((await getPrice(staffToken, 25)).price), 25);
    assert.equal(
      (
        await request("portal/orders", buyerToken, {
          request_key: randomUUID(),
          unit_id: sack.id,
          quantity: 25,
        })
      ).status,
      201,
    );
    assert.equal(
      Number((await (await request("portal/orders", buyerToken)).json())[0].quoted_unit_price),
      21,
    );

    const productId = materials.find((item) => item.name === "Gesso de teste portal").id;
    const second = await db.query(`WITH new_product AS (
      INSERT INTO preciso.commercial_products(name,base_unit,valuation_method)
      VALUES ('Placa de teste','un','fifo') RETURNING id
    ) INSERT INTO preciso.commercial_units(product_id,name,factor)
      SELECT id,'Placa',1 FROM new_product RETURNING id,product_id`);
    const other = second.rows[0];
    const items = [
      { product_id: productId, unit_id: sack.id, quantity: 20, goods_total: 100 },
      {
        product_id: other.product_id,
        unit_id: other.id,
        quantity: 2,
        goods_total: 200,
      },
    ];
    const delivery = {
      request_key: randomUUID(),
      items,
      freight: 10.01,
      other_costs: 2.02,
      purchased_at: "2090-11-19",
      due_on: null,
      reference: "Compra agrupada teste",
      reason: "Entrega de teste",
    };
    const invalidDelivery = {
      ...delivery,
      request_key: randomUUID(),
      items: [items[0], { ...items[1], unit_id: randomUUID() }],
    };
    assert.equal(
      (await request("commercial/purchase_delivery", token, invalidDelivery)).status,
      409,
    );
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) FROM preciso.commercial_purchases WHERE reference='Compra agrupada teste'",
          )
        ).rows[0].count,
      ),
      0,
    );
    const shipment = await request("commercial/purchase_delivery", token, delivery);
    assert.equal(shipment.status, 200);
    const deliveryId = (await shipment.json()).id;
    assert.equal(
      (await (await request("commercial/purchase_delivery", token, delivery)).json()).id,
      deliveryId,
    );
    const history = (await (await request("commercial/state", token)).json()).purchases.filter(
      (row) => row.delivery_id === deliveryId,
    );
    assert.equal(history.length, 2);
    assert.equal(
      history.reduce((sum, row) => sum + Math.round(Number(row.freight) * 100), 0),
      1001,
    );
    assert.equal(
      history.reduce((sum, row) => sum + Math.round(Number(row.total) * 100), 0),
      31203,
    );
    assert.equal(
      Number(
        (
          await (
            await request("portal/price", staffToken, { unit_id: sack.id, quantity: 3 })
          ).json()
        ).price,
      ),
      25,
    );
    const order = { request_key: randomUUID(), unit_id: sack.id, quantity: 3, notes: "Teste" };
    const placed = await request("portal/orders", staffToken, order);
    assert.equal(placed.status, 201);
    assert.deepEqual(
      await (await request("portal/orders", staffToken, order)).json(),
      await placed.json(),
    );
    assert.equal((await (await request("portal/orders", staffToken)).json()).length, 1);
    assert.equal((await (await request("portal/orders", token)).json()).length, 0);
    assert.equal(
      (
        await request("portal/service-request", staffToken, {
          kind: "service",
          subject: "Gesso para ambiente",
          notes: "2 m por 4 m",
          phone: "",
          request_key: randomUUID(),
        })
      ).status,
      201,
    );
    const createdService = await (
      await request("services", token, {
        key: "forro-teste",
        name: "Forro teste",
        price_per_m2: 30,
        billing_unit: "m2",
        is_active: true,
        category: "Pintura",
        image_upload: samplePhoto,
      })
    ).json();
    assert.ok(createdService.id);
    assert.match(createdService.imageUrl, /^\/api\/neon\/services\/[a-f0-9-]+\/image\?v=/);
    const image = await request(createdService.imageUrl.slice("/api/neon/".length));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const quotePayload = {
      title: "Orçamento da sala",
      project_type: "residencial",
      request_key: randomUUID(),
      items: [{ service_id: createdService.id, environment: "Sala", quantity: 8 }],
    };
    const placedQuote = await request("quotes", staffToken, quotePayload);
    assert.equal(placedQuote.status, 201);
    const quote = await placedQuote.json();
    assert.equal(Number(quote.total), 240);
    assert.equal((await (await request("quotes", staffToken, quotePayload)).json()).id, quote.id);
    const quoteDetails = await (await request(`quotes/${quote.id}`, staffToken)).json();
    const proposalResponse = await request(
      `quotes/${quote.id}`,
      token,
      {
        items: [
          {
            id: quoteDetails.items[0].id,
            quantity: 10,
            unit_price: 42,
            work: "Instalar e dar acabamento.",
          },
        ],
      },
      undefined,
      "PATCH",
    );
    assert.equal(proposalResponse.status, 200);
    assert.equal(Number((await proposalResponse.json()).total), 420);
    const updatedQuote = await (await request(`quotes/${quote.id}`, staffToken)).json();
    assert.equal(updatedQuote.items[0].professional_work, "Instalar e dar acabamento.");
    assert.equal(updatedQuote.preliminary, false);
    assert.equal(
      (await request(`quotes/${quote.id}`, staffToken, { status: "approved" }, undefined, "PATCH"))
        .status,
      200,
    );
    assert.equal((await request("projects", staffToken, { quote_id: quote.id })).status, 403);
    assert.equal((await request("projects", token, { quote_id: quote.id })).status, 201);
    const visit = await request("appointments", staffToken, {
      kind: "visit",
      scheduled_at: "2099-01-05T09:00:00-03:00",
      address: "Endereço de teste",
      notes: "",
    });
    assert.equal(visit.status, 201);
    assert.equal(
      (
        await request(
          `appointments/${(await visit.json()).id}`,
          staffToken,
          { status: "confirmed" },
          undefined,
          "PATCH",
        )
      ).status,
      200,
    );

    // October has one R$ 100 sale and payment. Bank extras must only enter the report once reviewed.
    const fiscalSale = (
      await db.query(
        "INSERT INTO preciso.commercial_sales(actor_id,freight,fees,taxes,other_costs,created_at) VALUES ($1,15,0,0,0,'2026-10-15T15:00:00Z') RETURNING id",
        [actor],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO preciso.commercial_sale_items(sale_id,product_id,unit_id,product_name,unit_name,factor,quantity,price,list_price,revenue) VALUES ($1,$2,$3,'Teste','kg',1,1,100,100,100)",
      [fiscalSale.id, unit.product_id, unit.id],
    );
    const cash = (await db.query("SELECT id FROM preciso.commercial_cash_sessions LIMIT 1"))
      .rows[0];
    await db.query(
      "INSERT INTO preciso.commercial_payments(sale_id,cash_id,method,amount,reference,actor_id,created_at) VALUES ($1,$2,'pix',100,'Teste',$3,'2026-10-15T17:00:00Z')",
      [fiscalSale.id, cash.id, actor],
    );
    const statement =
      "Data;Descrição;Valor;ID\n15/10/2026;Venda Pix;100,00;mov-1\n15/10/2026;Recebimento externo;30,00;mov-2\n15/10/2026;Despesa externa;-20,00;mov-3\n15/10/2026;Taxa;-5,00;mov-4";
    const parsed = parseStatement(parseCsv(statement), {
      date: 0,
      description: 1,
      value: 2,
      reference: 3,
    });
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(
      parsed.entries.map((item) => item.cents),
      [10000, 3000, -2000, -500],
    );
    const cfoPayload = {
      file: "extrato.csv",
      account: "Banco teste",
      authorized: true,
      entries: parsed.entries,
    };
    const importResult = await request("cfo/import", token, cfoPayload);
    assert.equal(importResult.status, 201);
    const imported = await importResult.json();
    assert.equal(imported.inserted, 4);
    const exportRows = await (await request(`cfo/imports/${imported.id}`, token)).json();
    assert.equal(exportRows.rows.length, 4);
    assert.equal(exportRows.next, null);
    assert.equal((await (await request("cfo/import", token, cfoPayload)).json()).duplicates, 4);
    const rangeCfo = { start: "2026-10-01", end: "2026-10-31", request_key: randomUUID() };
    const runResponse = await request("cfo/run", token, rangeCfo);
    assert.equal(runResponse.status, 200);
    const first = await runResponse.json();
    assert.equal(first.report.bank.matched, 1);
    assert.equal(first.report.bank.review, 3);
    assert.equal(first.report.cash.net, 100);
    assert.equal(first.report.dre.result, 85);
    for (const movement of first.report.bank.queue) {
      const classification =
        movement.amount_cents > 0
          ? "external_revenue"
          : movement.amount_cents === -500
            ? "external_fee"
            : "external_expense";
      assert.equal(
        (
          await request(
            "cfo/review",
            token,
            { id: movement.id, classification, reason: "Validação isolada" },
            undefined,
            "PATCH",
          )
        ).status,
        200,
      );
    }
    assert.equal((await (await request("cfo/run", token, rangeCfo)).json()).id, first.id);
    const recalculated = await (
      await request("cfo/run", token, { ...rangeCfo, request_key: randomUUID() })
    ).json();
    assert.equal(recalculated.report.bank.review, 0);
    assert.equal(recalculated.report.dre.revenue, 130);
    assert.equal(recalculated.report.dre.result, 90);
    assert.deepEqual(recalculated.report.cash, { received: 130, paid: 25, net: 105 });
    assert.equal((await request(`cfo/history/${recalculated.id}`, token)).status, 200);
    process.env.CRON_SECRET = "segredo-de-teste-do-cfo-123456";
    const cron = (secret, now) =>
      handleNeonRequest(
        new Request("http://ouro.test/api/neon/cron/cfo", {
          headers: { Authorization: "Bearer " + secret },
        }),
        new Date(now),
      );
    assert.equal((await cron("incorreto", "2026-11-05T12:00:00Z")).status, 401);
    // Todo dia fecha o dia; no dia 5 também analisa o mês anterior.
    const scheduled = await (await cron(process.env.CRON_SECRET, "2026-11-05T12:00:00Z")).json();
    assert.deepEqual(scheduled.closings, ["dia"]);
    assert.deepEqual(scheduled.runs, ["succeeded", "succeeded"]);
    const monthly = await db.query(
      "SELECT report FROM preciso.cfo_runs WHERE request_key='cron:2026-10-01'",
    );
    assert.deepEqual(monthly.rows[0].report.cash, recalculated.report.cash);
    const repeated = await (await cron(process.env.CRON_SECRET, "2026-11-05T12:10:00Z")).json();
    assert.deepEqual(repeated.runs, ["succeeded", "succeeded"]);
    // Sábado 07/11 às 23h de Brasília: fecha o dia e a semana de segunda a sábado.
    const saturday = await (await cron(process.env.CRON_SECRET, "2026-11-08T02:00:00Z")).json();
    assert.deepEqual(saturday.closings, ["dia", "semana"]);
    await cron(process.env.CRON_SECRET, "2026-11-08T02:20:00Z");
    const closingRows = await db.query(
      "SELECT period,start_on::text,end_on::text,source FROM preciso.commercial_closings ORDER BY start_on,period",
    );
    assert.deepEqual(closingRows.rows, [
      { period: "semana", start_on: "2026-11-02", end_on: "2026-11-07", source: "automatico" },
      { period: "dia", start_on: "2026-11-05", end_on: "2026-11-05", source: "automatico" },
      { period: "dia", start_on: "2026-11-07", end_on: "2026-11-07", source: "automatico" },
    ]);
    const retryRange = { ...rangeCfo, request_key: randomUUID() };
    await db.exec("ALTER TABLE preciso.cfo_entries RENAME TO cfo_entries_unavailable");
    const failed = await request("cfo/run", token, retryRange);
    assert.equal(failed.status, 500);
    const failedRun = await failed.json();
    await db.exec("ALTER TABLE preciso.cfo_entries_unavailable RENAME TO cfo_entries");
    const retried = await (await request("cfo/run", token, retryRange)).json();
    assert.equal(retried.id, failedRun.id);
    assert.equal(retried.status, "succeeded");
    const payment = {
      request_key: randomUUID(),
      delivery_id: deliveryId,
      method: "pix",
      amount: 312.03,
      confirmed: true,
    };
    const settlement = await request("commercial/purchase_delivery_payment", token, payment);
    assert.equal(settlement.status, 200);
    const settlementId = (await settlement.json()).id;
    assert.equal(
      (await (await request("commercial/purchase_delivery_payment", token, payment)).json()).id,
      settlementId,
    );
    const settlementTotal = await db.query(
      "SELECT count(*) AS parts,sum(amount) AS paid FROM preciso.commercial_purchase_payments WHERE delivery_payment_id=$1",
      [settlementId],
    );
    assert.equal(Number(settlementTotal.rows[0].parts), 2);
    assert.equal(Number(settlementTotal.rows[0].paid), 312.03);
    assert.equal(
      (
        await request("commercial/purchase_delivery_payment", token, {
          ...payment,
          request_key: randomUUID(),
        })
      ).status,
      409,
    );
    await db.exec("UPDATE preciso.users SET disabled=true WHERE email='client@example.invalid'");
    assert.equal((await request("commercial/state", token)).status, 401);
    delete process.env.DATABASE_URL;
    assert.equal((await request("commercial/state", token)).status, 503);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
    if (previousCron === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCron;
    delete globalThis.__ouroTestDatabase;
    await db.close();
  }
});
