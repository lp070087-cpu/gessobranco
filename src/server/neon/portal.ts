import { sql } from "drizzle-orm";
import { z } from "zod";
import type { database } from "./db";
import type { CompanyActor } from "@/lib/company-permissions";
import { createCompanyRequest } from "./company-requests";

type Db = ReturnType<typeof database>;
const order = z
  .object({
    request_key: z.string().uuid(),
    unit_id: z.string().uuid(),
    quantity: z
      .number()
      .positive()
      .finite()
      .max(1_000_000)
      .refine((value) => Math.abs(value * 1e6 - Math.round(value * 1e6)) < 0.001),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
const quantity = order.pick({ unit_id: true, quantity: true });
const prices = (userId: string, unitId: string, amount: number) => sql`
  SELECT p.id AS product_id,p.name,u.name AS unit_name,u.factor,
    CASE WHEN p.public_price OR c.id IS NOT NULL THEN preciso.commercial_price(u.id,c.id,${amount}::numeric) END AS price
  FROM preciso.commercial_units u JOIN preciso.commercial_products p ON p.id=u.product_id
  LEFT JOIN preciso.commercial_customers c ON c.account_user_id=${userId}::uuid
  WHERE u.id=${unitId}::uuid AND p.active AND p.published AND NOT p.example`;

export async function portal(
  db: Db,
  user: CompanyActor,
  path: string,
  request: Request,
  read: () => Promise<unknown>,
) {
  const noCache = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (path === "portal/catalogue" && request.method === "GET") {
    const result =
      await db.execute(sql`SELECT p.id,p.name,p.description,p.image_url,p.base_unit,(s.balance>0) AS available,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'factor',u.factor) ORDER BY u.name),'[]')
       FROM preciso.commercial_units u WHERE u.product_id=p.id) AS units
      FROM preciso.commercial_products p JOIN preciso.commercial_stock s ON s.id=p.id
      WHERE p.active AND p.published AND NOT p.example ORDER BY p.name`);
    return noCache(result.rows);
  }
  if (path === "portal/price" && request.method === "POST") {
    const data = quantity.parse(await read());
    const result = await db.execute(prices(user.id, data.unit_id, data.quantity));
    return result.rows[0]
      ? noCache({ price: result.rows[0].price })
      : noCache({ error: "Produto indisponível." }, 404);
  }
  if (path === "portal/orders" && request.method === "POST") {
    const item = order.parse(await read());
    const result =
      await db.execute(sql`WITH price AS (${prices(user.id, item.unit_id, item.quantity)}), created AS (
      INSERT INTO preciso.company_requests(request_key,kind,name,email,subject,product_id,unit_name,quantity,notes,user_id,quoted_unit_price)
      SELECT ${item.request_key}::uuid,'material',${user.full_name},${user.email},name,product_id,unit_name,
        ${item.quantity}::numeric,${item.notes},${user.id}::uuid,price FROM price
      ON CONFLICT(request_key) DO NOTHING RETURNING id,status
      ) SELECT id,status FROM created UNION ALL SELECT id,status FROM preciso.company_requests
      WHERE request_key=${item.request_key}::uuid AND user_id=${user.id}::uuid AND kind='material'
      AND NOT EXISTS(SELECT 1 FROM created)`);
    return result.rows[0]
      ? noCache(result.rows[0], 201)
      : noCache({ error: "Produto indisponível ou solicitação inválida." }, 409);
  }
  if (path === "portal/orders" && request.method === "GET") {
    const result =
      await db.execute(sql`SELECT id,kind,subject,unit_name,quantity,quoted_unit_price,notes,status,created_at
      ,proposal FROM preciso.company_requests WHERE user_id=${user.id}::uuid ORDER BY created_at DESC,id LIMIT 200`);
    return noCache(result.rows);
  }
  if (path === "portal/service-request" && request.method === "POST") {
    const data = z
      .object({
        kind: z.literal("service"),
        request_key: z.string().uuid(),
        subject: z.string().min(2).max(180),
        notes: z.string().max(2000),
        phone: z.string().max(40),
      })
      .strict()
      .parse(await read());
    return noCache(
      await createCompanyRequest(db, { ...data, email: user.email, name: user.full_name }, user),
      201,
    );
  }
  if (path === "portal/quotes" && request.method === "GET") {
    return noCache(
      (
        await db.execute(sql`SELECT id,title,status,total,preliminary,created_at AS "createdAt" FROM preciso.quotes
      WHERE user_id=${user.id}::uuid ORDER BY created_at DESC,id LIMIT 200`)
      ).rows,
    );
  }
  if (path === "portal/projects" && request.method === "GET") {
    return noCache(
      (
        await db.execute(
          sql`SELECT id,title,status,progress FROM preciso.projects WHERE user_id=${user.id}::uuid ORDER BY created_at DESC,id LIMIT 200`,
        )
      ).rows,
    );
  }
  if (path === "portal/appointments" && request.method === "GET") {
    return noCache(
      (
        await db.execute(sql`SELECT id,status,scheduled_at,address FROM preciso.appointments
      WHERE user_id=${user.id}::uuid ORDER BY scheduled_at DESC,id LIMIT 200`)
      ).rows,
    );
  }
  return noCache({ error: "Operação indisponível." }, 405);
}
