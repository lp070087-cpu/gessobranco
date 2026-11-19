import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { reportDownload } from "./report-download";
import type { Report } from "@/lib/commercial-client";

const quantity = z
  .number()
  .finite()
  .positive()
  .max(10_000_000)
  .refine((v) => Math.abs(v * 1e6 - Math.round(v * 1e6)) < 0.001);
const money = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.001);
const amount = money.refine((v) => v > 0);
const id = z.string().uuid();
const optionalId = id.nullable().default(null);
const text = z.string().trim().max(5000).default("");
const name = z.string().trim().min(2).max(160);
const unitLabel = z.string().trim().min(1).max(40);
const date = z.string().date();
const method = z.enum(["dinheiro", "pix", "cartao"]);
const key = { request_key: id };
const product = z
  .object({
    ...key,
    id: id.optional(),
    name,
    description: text,
    category: text,
    base_unit: z.string().trim().min(1).max(40),
    valuation_method: z.literal("fifo"),
    minimum_stock: z.number().min(0).max(10_000_000),
    minimum_margin: z.number().min(0).max(100),
    maximum_discount: z.number().min(0).max(100),
    enforce_discount: z.boolean(),
    active: z.boolean(),
    published: z.boolean(),
    public_price: z.boolean(),
    image_url: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://"))
      .nullable()
      .default(null),
    units: z
      .array(z.object({ name: unitLabel, factor: quantity, price: money.nullable() }).strict())
      .min(1)
      .max(20),
  })
  .strict()
  .refine((v) => new Set(v.units.map((u) => u.name)).size === v.units.length, "Unidades repetidas");
const receipt = z.object({ method, amount, reference: text, confirmed: z.literal(true) }).strict();
const saleItem = z
  .object({ unit_id: id, quantity, price: money.nullable().default(null), reason: text })
  .strict();
const schemas = {
  import_products: z
    .object({
      ...key,
      rows: z
        .array(
          z
            .object({
              name,
              category: text,
              base_unit: unitLabel,
              unit_name: unitLabel,
              factor: quantity,
              price: money.nullable(),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict(),
  product,
  customer: z
    .object({
      ...key,
      id: id.optional(),
      name,
      contact: text,
      profile: name,
      allow_credit: z.boolean(),
    })
    .strict(),
  supplier: z.object({ ...key, name, contact: text }).strict(),
  price_rule: z
    .object({
      ...key,
      unit_id: id,
      customer_id: optionalId,
      profile: name.nullable().default(null),
      minimum_quantity: quantity,
      price: money,
      valid_from: date.nullable().default(null),
      valid_until: date.nullable().default(null),
    })
    .strict(),
  cash_open: z.object({ ...key, opening: money }).strict(),
  price_rule_status: z.object({ ...key, id, active: z.boolean() }).strict(),
  cash_close: z.object({ ...key, counted: money, notes: text }).strict(),
  purchase: z
    .object({
      ...key,
      product_id: id,
      unit_id: id,
      quantity,
      supplier_id: optionalId,
      reference: text,
      reason: name,
      goods_total: money.nullable(),
      freight: money.nullable(),
      other_costs: money.nullable(),
      purchased_at: date,
      due_on: date.nullable(),
    })
    .strict(),
  adjustment: z
    .object({
      ...key,
      product_id: id,
      unit_id: id,
      quantity: z.number().finite().min(0).max(10_000_000),
      mode: z.enum(["in", "out", "loss", "inventory"]),
      base_unit_cost: z.number().finite().min(0).max(1_000_000).nullable(),
      reference: text,
      reason: name,
    })
    .strict(),
  sale: z
    .object({
      ...key,
      customer_id: optionalId,
      items: z.array(saleItem).min(1).max(100),
      payments: z.array(receipt).max(20),
      freight: money.nullable(),
      fees: money.nullable(),
      taxes: money.nullable(),
      other_costs: money.nullable(),
    })
    .strict(),
  cancel: z.object({ ...key, sale_id: id, reason: name }).strict(),
  return: z
    .object({
      ...key,
      sale_id: id,
      reason: name,
      items: z
        .array(z.object({ item_id: id, quantity }).strict())
        .min(1)
        .max(100),
    })
    .strict(),
  payment: z
    .object({ ...key, sale_id: id, method, amount, reference: text, confirmed: z.literal(true) })
    .strict(),
  refund: z
    .object({ ...key, sale_id: id, method, amount, reference: name, confirmed: z.literal(true) })
    .strict(),
  delivery: z.object({ ...key, sale_id: id, delivery: z.enum(["pending", "delivered"]) }).strict(),
  sale_costs: z
    .object({
      ...key,
      sale_id: id,
      freight: money.nullable(),
      fees: money.nullable(),
      taxes: money.nullable(),
      other_costs: money.nullable(),
      reason: name,
    })
    .strict(),
  expense: z
    .object({
      ...key,
      description: name,
      amount,
      due_on: date,
      paid_on: date.nullable(),
      method: method.nullable(),
      confirmed: z.boolean(),
    })
    .strict()
    .refine((v) => !v.paid_on || (v.method && v.confirmed)),
  purchase_payment: z
    .object({ ...key, purchase_id: id, amount, method, confirmed: z.literal(true) })
    .strict(),
  purchase_costs: z
    .object({
      ...key,
      purchase_id: id,
      goods_total: money,
      freight: money,
      other_costs: money,
      reason: name,
    })
    .strict(),
  expense_payment: z
    .object({ ...key, expense_id: id, paid_on: date, method, confirmed: z.literal(true) })
    .strict(),
};

export function validateCommercialCommand(kind: string, input: unknown) {
  const schema = schemas[kind as keyof typeof schemas];
  if (!schema) throw new Error("UNKNOWN_COMMAND");
  return schema.parse(input);
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const errors: Record<string, string> = {
  RULE_NOT_FOUND: "Esta condição de preço não está mais disponível. Atualize a lista.",
  PRODUCT_NOT_FOUND: "Produto não encontrado. Atualize o cadastro antes de continuar.",
  PRODUCT_INACTIVE: "Este produto está inativo. Libere a venda no cadastro de produtos.",
  UNIT_NOT_FOUND: "A unidade escolhida não pertence a este produto. Confira a seleção.",
  CUSTOMER_NOT_FOUND: "Cliente não encontrado. Atualize a lista de clientes.",
  ITEM_NOT_FOUND: "O item não pertence à venda selecionada.",
  SALE_NOT_FOUND: "Venda não encontrada. Atualize o histórico.",
  PURCHASE_NOT_FOUND: "Compra não encontrada. Atualize o histórico.",
  COST_ALREADY_DEFINED: "O custo desta compra já foi definido. O histórico foi preservado.",
  EXPENSE_ALREADY_PAID: "Esta despesa já foi paga ou não está disponível.",
  INSUFFICIENT_STOCK: "Estoque insuficiente. Confira as quantidades antes de finalizar.",
  CASH_CLOSED: "Abra o caixa antes de registrar esta operação.",
  CREDIT_NOT_ALLOWED: "O saldo a prazo precisa de um cliente autorizado a comprar a prazo.",
  OVERPAYMENT: "O pagamento ultrapassa o saldo da operação.",
  REFUND_LIMIT: "O estorno ultrapassa o valor disponível para devolver ao cliente.",
  RETURN_QUANTITY: "A quantidade devolvida ultrapassa o saldo desta venda.",
  SALE_NOT_ACTIVE: "Esta venda já foi cancelada ou não está disponível.",
  UNIT_IN_USE:
    "Esta conversão já tem histórico. Cadastre outra unidade para preservar os registros anteriores.",
  DISCOUNT_LIMIT: "O desconto ultrapassa o limite de bloqueio definido para este produto.",
  NEGOTIATION_REASON_REQUIRED: "Informe o motivo do preço negociado.",
  PRICE_REQUIRED: "Cadastre o preço da unidade antes de vender.",
  IDEMPOTENCY_CONFLICT:
    "A operação já foi enviada com outros dados. Atualize a tela antes de tentar novamente.",
  NO_STOCK_CHANGE: "A contagem informada já corresponde ao estoque atual.",
  INVALID_PRECISION:
    "A conversão gerou uma fração menor que a precisão configurada. Confira a quantidade.",
  DUPLICATE_PRODUCT:
    "A planilha contém um produto já cadastrado. Confira as duplicidades e simule novamente.",
};

export async function publicCatalogue() {
  const db = database();
  const result =
    await db.execute(sql`SELECT p.id,p.name,p.description,p.category,p.base_unit,p.image_url,
    s.balance>0 AS available,
    (SELECT jsonb_agg(jsonb_build_object('name',u.name,'factor',u.factor,'price',CASE WHEN p.public_price THEN u.price ELSE NULL END) ORDER BY u.name)
      FROM preciso.commercial_units u WHERE u.product_id=p.id) AS units
    FROM preciso.commercial_products p JOIN preciso.commercial_stock s ON s.id=p.id
    WHERE p.active AND p.published AND NOT p.example ORDER BY p.name`);
  return json(result.rows);
}

export async function commercialRequest(
  request: Request,
  path: string,
  actor: { id: string; role: string },
  readBody: () => Promise<unknown>,
) {
  if (actor.role !== "admin") return json({ error: "Acesso restrito à administração." }, 403);
  const db = database();
  if (path === "commercial/state" && request.method === "GET") {
    const result = await db.execute(sql`SELECT jsonb_build_object(
      'products',(SELECT COALESCE(jsonb_agg(v ORDER BY v.name),'[]') FROM (SELECT p.*,s.balance,s.stock_cost,
        (SELECT COALESCE(jsonb_agg(u ORDER BY u.name),'[]') FROM preciso.commercial_units u WHERE u.product_id=p.id) AS units
        FROM preciso.commercial_products p JOIN preciso.commercial_stock s ON s.id=p.id) v),
      'customers',(SELECT COALESCE(jsonb_agg(c ORDER BY c.name),'[]') FROM preciso.commercial_customers c),
      'suppliers',(SELECT COALESCE(jsonb_agg(s ORDER BY s.name),'[]') FROM preciso.commercial_suppliers s),
      'rules',(SELECT COALESCE(jsonb_agg(r),'[]') FROM preciso.commercial_price_rules r),
      'lots',(SELECT COALESCE(jsonb_agg(l ORDER BY l.received_at,l.id),'[]') FROM preciso.commercial_lots l WHERE l.remaining>0),
      'cash',(SELECT to_jsonb(c) FROM preciso.commercial_cash_sessions c WHERE closed_at IS NULL),
      'cash_history',(SELECT COALESCE(jsonb_agg(c),'[]') FROM (SELECT * FROM preciso.commercial_cash_sessions ORDER BY opened_at DESC LIMIT 60) c),
      'sales',(SELECT COALESCE(jsonb_agg(s ORDER BY s.created_at DESC),'[]') FROM (SELECT r.*,
        (SELECT jsonb_agg(i) FROM preciso.commercial_sale_items i WHERE i.sale_id=r.id) AS items,
        (SELECT COALESCE(jsonb_agg(p),'[]') FROM preciso.commercial_payments p WHERE p.sale_id=r.id) AS payments
        FROM preciso.commercial_results r ORDER BY r.created_at DESC LIMIT 500) s),
      'movements',(SELECT COALESCE(jsonb_agg(m),'[]') FROM (SELECT * FROM preciso.commercial_movements ORDER BY created_at DESC LIMIT 500) m),
      'purchases',(SELECT COALESCE(jsonb_agg(v ORDER BY v.purchased_at DESC),'[]') FROM (
        SELECT p.*, o.payload->>'goods_total' goods_total,o.payload->>'freight' freight,o.payload->>'other_costs' other_costs
        FROM (SELECT * FROM preciso.commercial_purchases ORDER BY purchased_at DESC,id LIMIT 500) p
        LEFT JOIN LATERAL (SELECT payload FROM preciso.commercial_operations
          WHERE kind IN ('purchase','purchase_costs') AND result->>'id'=p.id::text
          ORDER BY (kind='purchase_costs') DESC LIMIT 1) o ON true
      ) v),
      'expenses',(SELECT COALESCE(jsonb_agg(e),'[]') FROM (SELECT * FROM preciso.commercial_expenses ORDER BY due_on DESC LIMIT 500) e),
      'purchase_payments',(SELECT COALESCE(jsonb_agg(v),'[]') FROM (SELECT * FROM preciso.commercial_purchase_payments ORDER BY created_at DESC LIMIT 500) v)
    ) AS data`);
    return json(result.rows[0]?.data);
  }
  if (path === "commercial/report" && request.method === "GET") {
    const url = new URL(request.url);
    const format = url.searchParams.get("format");
    const start = date.parse(url.searchParams.get("start"));
    const end = date.parse(url.searchParams.get("end"));
    if (end < start) return json({ error: "Confira o período do relatório." }, 400);
    const result = await db.execute(sql`SELECT jsonb_build_object(
      'daily',(SELECT COALESCE(jsonb_agg(v ORDER BY v.day),'[]') FROM (
        SELECT (created_at AT TIME ZONE 'America/Recife')::date AS day,
          count(*) FILTER (WHERE NOT partial AND contribution>0) AS good,
          count(*) FILTER (WHERE NOT partial AND contribution=0) AS medium,
          count(*) FILTER (WHERE NOT partial AND contribution<0) AS bad,
          count(*) FILTER (WHERE partial) AS pending
        FROM preciso.commercial_results
        WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date
          AND status <> 'cancelled'
        GROUP BY 1
      ) v),
      'revenue',(SELECT COALESCE(sum(revenue-returned_revenue),0) FROM preciso.commercial_results WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date),
      'goods_cost',(SELECT sum(goods_cost) FROM preciso.commercial_results WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date),
      'contribution',(SELECT sum(contribution) FROM preciso.commercial_results WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date),
      'partial_sales',(SELECT count(*) FROM preciso.commercial_results WHERE partial AND (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date),
      'received',(SELECT COALESCE(sum(amount),0) FROM preciso.commercial_payments WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date),
      'receivable',(SELECT COALESCE(sum(greatest(receivable,0)),0) FROM preciso.commercial_results),
      'refund_due',(SELECT COALESCE(sum(greatest(-receivable,0)),0) FROM preciso.commercial_results),
      'payable',(SELECT COALESCE(sum(total-paid),0) FROM preciso.commercial_purchases)+(SELECT COALESCE(sum(amount),0) FROM preciso.commercial_expenses WHERE paid_on IS NULL),
      'pending_purchase_costs',(SELECT count(*) FROM preciso.commercial_purchases WHERE total IS NULL),
      'by_customer',(SELECT COALESCE(jsonb_agg(v),'[]') FROM (SELECT COALESCE(c.name,'Consumidor não identificado') name,
        sum(r.revenue-r.returned_revenue) revenue,sum(r.contribution) contribution,count(*) FILTER(WHERE r.partial) partial_sales
        FROM preciso.commercial_results r LEFT JOIN preciso.commercial_customers c ON c.id=r.customer_id
        WHERE (r.created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date GROUP BY c.id,c.name) v),
      'operating_expenses',(SELECT COALESCE(sum(amount),0) FROM preciso.commercial_expenses WHERE due_on BETWEEN ${start}::date AND ${end}::date),
      'cash_out',(SELECT COALESCE(sum(amount),0) FROM preciso.commercial_expenses WHERE paid_on BETWEEN ${start}::date AND ${end}::date)+
        (SELECT COALESCE(sum(amount),0) FROM preciso.commercial_purchase_payments WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date),
      'by_product',(SELECT COALESCE(jsonb_agg(v),'[]') FROM (SELECT i.product_name,sum(i.revenue-round(i.price*i.returned,2)) revenue,
        CASE WHEN bool_or(EXISTS(SELECT 1 FROM preciso.commercial_allocations a WHERE a.item_id=i.id AND a.quantity>a.returned AND a.unit_cost IS NULL)) THEN NULL
        ELSE sum((SELECT COALESCE(sum((a.quantity-a.returned)*a.unit_cost),0) FROM preciso.commercial_allocations a WHERE a.item_id=i.id)) END goods_cost
        FROM preciso.commercial_sale_items i JOIN preciso.commercial_sales s ON s.id=i.sale_id
        WHERE (s.created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date GROUP BY i.product_name) v)
    ) AS data`);
    const report = result.rows[0]?.data as Report;
    const first = Date.parse(start);
    const last = Date.parse(end);
    const length = (last - first) / 86400000 + 1;
    if (length <= 367) {
      const recorded = new Map(report.daily.map((row) => [row.day, row]));
      report.daily = Array.from({ length }, (_, index) => {
        const day = new Date(first + index * 86400000).toISOString().slice(0, 10);
        return recorded.get(day) ?? { day, good: 0, medium: 0, bad: 0, pending: 0 };
      });
    }
    if (format === "pdf" || format === "xlsx") return reportDownload(report, start, end, format);
    return json(report);
  }
  if (request.method !== "POST") return json({ error: "Operação indisponível." }, 405);
  const kind = path.replace(/^commercial\//, "");
  const input = validateCommercialCommand(kind, await readBody());
  try {
    const result = await db.execute(
      sql`SELECT preciso.commercial_command(${actor.id}::uuid,${kind},${JSON.stringify(input)}::jsonb) AS result`,
    );
    return json(result.rows[0]?.result);
  } catch (error) {
    const messages = [
      error instanceof Error ? error.message : "",
      (error as { cause?: { message?: string } })?.cause?.message ?? "",
    ];
    const match = Object.keys(errors).find((code) =>
      messages.some((message) => message.includes(code)),
    );
    if (match) return json({ error: errors[match] }, 409);
    const databaseCode = error as { code?: string; cause?: { code?: string } };
    const code = databaseCode.cause?.code ?? databaseCode.code;
    if (code === "23505")
      return json(
        { error: "O registro já existe ou o caixa já está aberto. Atualize a tela." },
        409,
      );
    if (["23503", "23514", "22003"].includes(code ?? ""))
      return json(
        { error: "Confira os valores, as datas e os cadastros relacionados à operação." },
        409,
      );
    throw error;
  }
}
