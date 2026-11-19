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
  try {
    await db.exec(await readFile(new URL("../drizzle/0000_preciso.sql", import.meta.url), "utf8"));
    await db.exec(
      await readFile(new URL("../drizzle/0001_commercial.sql", import.meta.url), "utf8"),
    );
    await db.exec(
      await readFile(new URL("../drizzle/0002_company_requests.sql", import.meta.url), "utf8"),
    );
    globalThis.__ouroTestDatabase = drizzle(db);
    process.env.DATABASE_URL = "postgres://isolated-test.invalid/test";
    process.env.APP_URL = "http://ouro.test";
    const bundled = await build({
      entryPoints: ["src/server/neon/api.ts"],
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
    const { handleNeonRequest } = await import(
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
    assert.deepEqual(emptyChart.thresholds, { good: 15, medium: 5 });
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
    await db.exec("UPDATE preciso.users SET disabled=true WHERE email='client@example.invalid'");
    assert.equal((await request("commercial/state", token)).status, 401);
    delete process.env.DATABASE_URL;
    assert.equal((await request("commercial/state", token)).status, 503);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousApp;
    delete globalThis.__ouroTestDatabase;
    await db.close();
  }
});
