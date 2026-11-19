import { sql } from "drizzle-orm";
import { z } from "zod";
import type { database } from "./db";

type Database = ReturnType<typeof database>;
const inputSchema = z
  .object({
    request_key: z.string().uuid(),
    kind: z.enum(["service", "material"]),
    name: z.string().trim().min(2).max(160),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    phone: z.string().trim().max(40),
    subject: z.string().trim().min(2).max(180),
    product_id: z.string().uuid().optional(),
    unit_name: z.string().trim().min(1).max(100).optional(),
    quantity: z.number().finite().min(0.000001).max(1_000_000).optional(),
    notes: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.kind === "material" && (!input.unit_name || !input.quantity))
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Informe a unidade e a quantidade.",
      });
    if (input.kind === "service" && (input.product_id || input.unit_name || input.quantity))
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Confira o tipo de solicitação.",
      });
  });

export async function createCompanyRequest(db: Database, value: unknown) {
  const input = inputSchema.parse(value);
  const product = input.product_id
    ? (
        await db.execute(sql`SELECT p.name FROM preciso.commercial_products p
        JOIN preciso.commercial_units u ON u.product_id=p.id AND u.name=${input.unit_name}
        WHERE p.id=${input.product_id}::uuid AND p.active AND p.published AND NOT p.example`)
      ).rows[0]
    : null;
  if (input.product_id && !product)
    throw new z.ZodError([
      { code: "custom", path: ["product_id"], message: "Produto ou unidade indisponível." },
    ]);
  await db.execute(sql`INSERT INTO preciso.company_requests
    (request_key,kind,name,email,phone,subject,product_id,unit_name,quantity,notes)
    VALUES (${input.request_key}::uuid,${input.kind},${input.name},${input.email},${input.phone},
      ${product ? String(product.name) : input.subject},${input.product_id ?? null}::uuid,
      ${input.unit_name ?? null},${input.quantity ?? null},${input.notes})
    ON CONFLICT(request_key) DO NOTHING`);
  return { ok: true };
}

export async function companyRequests(db: Database) {
  const inbound = await db.execute(sql`SELECT id,kind,name,email,phone,subject,unit_name,quantity,
    notes,status,created_at FROM preciso.company_requests ORDER BY created_at DESC LIMIT 200`);
  const quotes = await db.execute(sql`SELECT q.id,q.title,q.status,q.total,q.notes,q.created_at,
    u.full_name AS name,u.email FROM preciso.quotes q LEFT JOIN preciso.users u ON u.id=q.user_id
    ORDER BY q.created_at DESC LIMIT 200`);
  return { requests: inbound.rows, quotes: quotes.rows };
}
