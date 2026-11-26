import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { shopQuoteLineCents, type ShopQuote } from "@/lib/shop-quote";
import { database } from "./db";

const inputSchema = z
  .object({
    request_key: z.string().uuid(),
    customer_id: z.string().uuid(),
    notes: z.string().trim().max(1500),
    items: z
      .array(
        z
          .object({
            unit_id: z.string().uuid(),
            quantity: z.number().min(0.001).max(1_000_000).multipleOf(0.001),
            unit_price: z.number().min(0).max(1_000_000).multipleOf(0.01),
          })
          .strict(),
      )
      .min(1)
      .max(80),
  })
  .strict();

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Called after the commercial administrator check. Quotes use the command journal. */
export async function shopQuotesRequest(
  request: Request,
  actorId: string,
  readBody: () => Promise<unknown>,
) {
  const db = database();
  if (request.method === "GET") {
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null) {
      if (!z.string().uuid().safeParse(id).success)
        return json({ error: "Código de orçamento inválido." }, 400);
      const match = await db.execute(sql`SELECT result FROM preciso.commercial_operations
        WHERE kind='shop_quote' AND result->>'id'=${id}`);
      return match.rows[0]
        ? json(match.rows[0].result)
        : json({ error: "Orçamento não encontrado." }, 404);
    }
    const list = await db.execute(sql`SELECT result - 'items' - 'notes' - 'customer_id' AS quote
      FROM preciso.commercial_operations WHERE kind='shop_quote' AND result IS NOT NULL
      ORDER BY created_at DESC, request_key DESC`);
    return json(list.rows.map((row) => row.quote));
  }
  if (request.method !== "POST") return json({ error: "Operação indisponível." }, 405);
  const parsed = inputSchema.safeParse(await readBody());
  if (!parsed.success)
    return json({ error: "Confira o cliente, as quantidades e os valores informados." }, 400);

  const input = parsed.data;
  const payload = JSON.stringify(input);
  const previous = () =>
    db.execute(sql`SELECT result, kind='shop_quote' AND payload=${payload}::jsonb AS matches
    FROM preciso.commercial_operations WHERE actor_id=${actorId}::uuid AND request_key=${input.request_key}::uuid`);
  const existing = (row: Record<string, unknown> | undefined) =>
    row?.matches && row.result
      ? json(row.result)
      : json({ error: "Este envio já está vinculado a outro registro. Atualize a tela." }, 409);
  const saved = (await previous()).rows[0];
  if (saved) return existing(saved);

  const customer = await db.execute(sql`SELECT name FROM preciso.commercial_customers
    WHERE id=${input.customer_id}::uuid`);
  const customerName = customer.rows[0]?.name;
  if (typeof customerName !== "string") return json({ error: "Cliente não encontrado." }, 409);

  const unitIds = JSON.stringify([...new Set(input.items.map((item) => item.unit_id))]);
  const units = await db.execute<{ id: string; unit_name: string; product_name: string }>(
    sql`SELECT u.id,u.name AS unit_name,p.name AS product_name
      FROM preciso.commercial_units u JOIN preciso.commercial_products p ON p.id=u.product_id
      WHERE p.active AND u.id IN (SELECT jsonb_array_elements_text(${unitIds}::jsonb)::uuid)`,
  );
  const byId = new Map(units.rows.map((unit) => [unit.id, unit]));
  if (input.items.some((item) => !byId.has(item.unit_id)))
    return json({ error: "Uma unidade está indisponível. Atualize a lista de produtos." }, 409);

  const items = input.items.map((item) => {
    const { unit_name, product_name } = byId.get(item.unit_id)!;
    return {
      ...item,
      product_name,
      unit_name,
      total_cents: shopQuoteLineCents(item.quantity, item.unit_price),
    };
  });
  const quote: ShopQuote = {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    customer_id: input.customer_id,
    customer_name: customerName,
    notes: input.notes,
    items,
    total_cents: items.reduce((sum, item) => sum + item.total_cents, 0),
  };
  const inserted = await db.execute(sql`INSERT INTO preciso.commercial_operations
    (actor_id,request_key,kind,payload,result,created_at)
    VALUES (${actorId}::uuid,${input.request_key}::uuid,'shop_quote',${payload}::jsonb,
      ${JSON.stringify(quote)}::jsonb,${quote.created_at}::timestamptz)
    ON CONFLICT (actor_id,request_key) DO NOTHING RETURNING request_key`);
  if (inserted.rows.length) return json(quote, 201);
  return existing((await previous()).rows[0]);
}
