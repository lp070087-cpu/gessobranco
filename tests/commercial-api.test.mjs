import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

test("real HTTP handlers enforce sessions, admin roles, input validation and origin", async () => {
  const db = new PGlite();
  const previousUrl = process.env.DATABASE_URL;
  const previousApp = process.env.APP_URL;
  try {
    await db.exec(await readFile(new URL("../drizzle/0000_preciso.sql", import.meta.url), "utf8"));
    await db.exec(
      await readFile(new URL("../drizzle/0001_commercial.sql", import.meta.url), "utf8"),
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
    const request = (path, token, body, origin = "http://ouro.test") =>
      handleNeonRequest(
        new Request(`http://ouro.test/api/neon/${path}`, {
          method: body ? "POST" : "GET",
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
