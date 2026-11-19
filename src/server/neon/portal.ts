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
const businessDetails = z
  .object({
    name: z.string().trim().min(2).max(160),
    trade_name: z.string().trim().max(160).default(""),
  })
  .strict();

const worksiteDetails = z
  .object({
    name: z.string().trim().min(2).max(160),
    property_type: z.enum(["apartment", "house", "commercial", "other"]),
    address: z.string().trim().min(5).max(300),
    unit: z.string().trim().max(80).default(""),
    area_m2: z
      .number()
      .min(0.01)
      .max(1_000_000)
      .refine((area) => Math.abs(area * 100 - Math.round(area * 100)) < 0.000001),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict()
  .refine((site) => site.property_type !== "apartment" || site.unit !== "", {
    message: "Informe o número ou a identificação do apartamento.",
    path: ["unit"],
  });

const prices = (userId: string, unitId: string, amount: number) => sql`
  WITH context AS (
    SELECT p.id AS product_id,p.name,u.name AS unit_name,u.factor,u.price AS base_price,p.public_price,
      c.id AS customer_id,c.profile,coalesce(cp.document_type='cnpj',false) AS is_cnpj
    FROM preciso.commercial_units u JOIN preciso.commercial_products p ON p.id=u.product_id
    LEFT JOIN preciso.commercial_customers c ON c.account_user_id=${userId}::uuid
    LEFT JOIN preciso.client_profiles cp ON cp.user_id=${userId}::uuid
    WHERE u.id=${unitId}::uuid AND p.active AND p.published AND NOT p.example
  ), eligible AS (
    SELECT r.* FROM preciso.commercial_price_rules r CROSS JOIN context c
    WHERE r.unit_id=${unitId}::uuid AND r.active
      AND (r.valid_from IS NULL OR r.valid_from<=current_date)
      AND (r.valid_until IS NULL OR r.valid_until>=current_date)
      AND (r.customer_id=c.customer_id OR (r.customer_id IS NULL AND (
        r.profile IS NULL OR (upper(r.profile)='CNPJ' AND c.is_cnpj)
        OR (upper(r.profile)<>'CNPJ' AND r.profile=c.profile)
      )))
  ), current_quote AS (
    SELECT c.*, CASE
      WHEN c.public_price OR c.customer_id IS NOT NULL THEN coalesce(r.price,c.base_price)
      WHEN c.is_cnpj AND upper(r.profile)='CNPJ' THEN r.price
    END AS price
    FROM context c LEFT JOIN LATERAL (
      SELECT e.price,e.profile FROM eligible e WHERE e.minimum_quantity<=${amount}::numeric
      ORDER BY (e.customer_id IS NOT NULL) DESC,(e.profile IS NOT NULL) DESC,e.minimum_quantity DESC,e.id
      LIMIT 1
    ) r ON true
  )
  SELECT q.product_id,q.name,q.unit_name,q.factor,q.price,
    next_tier.minimum_quantity AS next_quantity,next_tier.price AS next_price
  FROM current_quote q LEFT JOIN LATERAL (
    SELECT e.minimum_quantity,winner.price
    FROM eligible e CROSS JOIN LATERAL (
      SELECT r.price,r.profile FROM eligible r WHERE r.minimum_quantity<=e.minimum_quantity
      ORDER BY (r.customer_id IS NOT NULL) DESC,(r.profile IS NOT NULL) DESC,r.minimum_quantity DESC,r.id
      LIMIT 1
    ) winner
    WHERE q.is_cnpj AND e.minimum_quantity>${amount}::numeric AND e.minimum_quantity<=1000000
      AND upper(winner.profile)='CNPJ' AND (q.price IS NULL OR winner.price<q.price)
    ORDER BY e.minimum_quantity LIMIT 1
  ) next_tier ON true`;

export async function portal(
  db: Db,
  user: CompanyActor,
  path: string,
  request: Request,
  read: () => Promise<unknown>,
) {
  const noCache = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (path === "portal/business" || path.startsWith("portal/worksites")) {
    if (user.role !== "client" || user.permissions.length)
      return noCache({ error: "Esta área é exclusiva para clientes CNPJ." }, 403);
    const profile = await db.execute(sql`
      SELECT cp.document, b.name, b.trade_name
      FROM preciso.client_profiles cp
      LEFT JOIN preciso.customer_businesses b ON b.user_id=cp.user_id
      WHERE cp.user_id=${user.id}::uuid AND cp.document_type='cnpj'`);
    const customer = profile.rows[0];
    if (path === "portal/business" && request.method === "GET") {
      if (!customer) return noCache({ eligible: false });
      const worksites = await db.execute(sql`
        SELECT id,name,property_type,address,unit,area_m2,notes
        FROM preciso.customer_worksites WHERE user_id=${user.id}::uuid
        ORDER BY created_at DESC,id`);
      return noCache({
        eligible: true,
        document: customer.document,
        company:
          customer.name == null ? null : { name: customer.name, trade_name: customer.trade_name },
        worksites: worksites.rows,
      });
    }
    if (!customer) return noCache({ error: "Esta área é exclusiva para clientes CNPJ." }, 403);

    if (path === "portal/business" && request.method === "PATCH") {
      const company = businessDetails.parse(await read());
      await db.execute(sql`
        INSERT INTO preciso.customer_businesses(user_id,name,trade_name)
        VALUES (${user.id}::uuid,${company.name},${company.trade_name})
        ON CONFLICT(user_id) DO UPDATE SET name=EXCLUDED.name,trade_name=EXCLUDED.trade_name`);
      return noCache(company);
    }

    const edit = /^portal\/worksites\/([^/]+)$/.exec(path);
    if (
      (path === "portal/worksites" && request.method === "POST") ||
      (edit && request.method === "PATCH")
    ) {
      if (customer.name == null)
        return noCache({ error: "Cadastre sua empresa antes de salvar uma obra." }, 409);
      const site = worksiteDetails.parse(await read());
      const result = edit
        ? await db.execute(sql`
          UPDATE preciso.customer_worksites SET name=${site.name},property_type=${site.property_type},
            address=${site.address},unit=${site.unit},area_m2=${site.area_m2},notes=${site.notes}
          WHERE id=${z.string().uuid().parse(edit[1])}::uuid AND user_id=${user.id}::uuid
          RETURNING id,name,property_type,address,unit,area_m2,notes`)
        : await db.execute(sql`
          INSERT INTO preciso.customer_worksites(user_id,name,property_type,address,unit,area_m2,notes)
          VALUES (${user.id}::uuid,${site.name},${site.property_type},${site.address},
            ${site.unit},${site.area_m2},${site.notes})
          RETURNING id,name,property_type,address,unit,area_m2,notes`);
      return result.rows[0]
        ? noCache(result.rows[0], edit ? 200 : 201)
        : noCache({ error: "Obra não encontrada." }, 404);
    }
  }
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
    const row = result.rows[0];
    return row
      ? noCache({
          price: row.price,
          next_tier:
            row.next_quantity == null
              ? null
              : {
                  quantity: Number(row.next_quantity),
                  price: Number(row.next_price),
                },
        })
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
