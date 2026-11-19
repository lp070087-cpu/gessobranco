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
