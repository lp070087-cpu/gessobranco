import { sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { hasCompanyPermission, type CompanyActor } from "@/lib/company-permissions";

/**
 * Folhas da loja: o mesmo controle que o dono fazia no papel (vendas do dia, caixa,
 * retiradas, gastos, fiados, débitos da empresa, estoque) e os fechamentos do dia e da semana.
 */
const money = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.001);
const amount = money.refine((v) => v > 0);
const count = z.number().finite().min(0).max(10_000_000);
const quantity = count.refine((v) => v > 0);
const id = z.string().uuid();
const day = z.string().date();
const text = z.string().trim().max(2000).default("");
const label = z.string().trim().min(2).max(160);
const method = z.enum(["dinheiro", "pix", "cartao"]);
const key = { request_key: id };

const schemas = {
  store_cash_open: z.object({ ...key, opening: money }).strict(),
  store_cash_close: z.object({ ...key, counted: money, notes: text }).strict(),
  store_withdrawal: z
    .object({
      ...key,
      category: z.enum(["retirada", "vale"]),
      person: z.string().trim().min(1).max(120),
      description: label,
      amount,
    })
    .strict(),
  store_expense: z
    .object({
      ...key,
      description: label,
      amount,
      expense_type: z.enum(["fixo", "variavel"]),
      person: text,
      due_on: day,
      paid_on: day.nullable(),
      method: method.nullable(),
    })
    .strict()
    .refine((v) => !v.paid_on || v.method, "Informe a forma do pagamento."),
  store_debt: z
    .object({
      ...key,
      id: id.optional(),
      kind: z.enum(["boleto", "divida", "credito", "aluguel", "outro", "fiado"]),
      person: text,
      description: text,
      amount: money.nullable(),
      due_on: day.nullable(),
      paid_on: day.nullable(),
      example: z.boolean(),
      notes: text,
    })
    .strict(),
  store_debt_remove: z.object({ ...key, id }).strict(),
  store_closing: z
    .object({
      ...key,
      period: z.enum(["dia", "semana"]),
      start_on: day,
      end_on: day,
      notes: text,
    })
    .strict()
    .refine((v) => v.end_on >= v.start_on && span(v.start_on, v.end_on) <= 7),
  store_order: z
    .object({
      ...key,
      supplier_id: id.nullable(),
      reference: text,
      ordered_on: day,
      expected_on: day.nullable(),
      due_on: day.nullable(),
      freight: money,
      other_costs: money,
      notes: text,
      items: z
        .array(z.object({ product_id: id, unit_id: id, quantity, goods_total: money }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
  store_order_arrived: z.object({ ...key, order_id: id }).strict(),
  store_order_check: z
    .object({
      ...key,
      order_id: id,
      notes: text,
      items: z
        .array(
          z
            .object({ ok: count, broken: count, damaged: count, note: z.string().trim().max(300) })
            .strict(),
        )
        .min(1)
        .max(30),
    })
    .strict(),
};
type Kind = keyof typeof schemas;
const staffKinds: Kind[] = [
  "store_cash_open",
  "store_cash_close",
  "store_withdrawal",
  "store_expense",
  "store_closing",
];

const errors: Record<string, string> = {
  CASH_CLOSED: "Abra o caixa antes de lançar saídas em dinheiro.",
  ORDER_NOT_AVAILABLE: "Este pedido já foi conferido ou não está mais disponível.",
  ORDER_ITEMS_MISMATCH: "A conferência precisa ter todos os itens do pedido.",
  UNIT_NOT_FOUND: "A unidade escolhida não pertence ao produto. Confira o pedido.",
  DEBT_NOT_FOUND: "Este débito não existe mais. Atualize a tela.",
  IDEMPOTENCY_CONFLICT: "A operação já foi enviada com outros dados. Atualize a tela.",
  FORBIDDEN: "Sua conta não tem acesso a esta operação.",
  PRODUCT_INACTIVE: "Um produto do pedido está inativo. Libere no cadastro de produtos.",
};

function span(start: string, end: string) {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
}
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export const canUseStoreSheets = (user: Pick<CompanyActor, "role" | "permissions">) =>
  user.role === "admin" || hasCompanyPermission(user, "store_closing");

/** Uma consulta só: tudo que a folha de papel mostrava, já somado. */
export async function storeSheet(start: string, end: string) {
  const db = database();
  const result = await db.execute(sql`WITH
  days AS (SELECT d::date AS day FROM generate_series(${start}::date,${end}::date,interval '1 day') d),
  sales AS (
    SELECT s.id,s.customer_id,(s.created_at AT TIME ZONE 'America/Recife') AS local_at,
      r.revenue-r.returned_revenue AS total,greatest(r.receivable,0) AS fiado
    FROM preciso.commercial_sales s JOIN preciso.commercial_results r ON r.id=s.id
    WHERE s.status='confirmed'
      AND (s.created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date
  ),
  pays AS (
    SELECT method,amount,(created_at AT TIME ZONE 'America/Recife')::date AS day FROM preciso.commercial_payments
    WHERE (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date
  ),
  costs AS (
    SELECT e.*,COALESCE(e.paid_on,e.due_on) AS day FROM preciso.commercial_expenses e
    WHERE COALESCE(e.paid_on,e.due_on) BETWEEN ${start}::date AND ${end}::date
  )
  SELECT jsonb_build_object(
    'start',${start}::date,'end',${end}::date,
    'days',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'day',d.day,
      'sales',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',s.id,'time',to_char(s.local_at,'HH24:MI'),'total',s.total,'fiado',s.fiado,'customer',c.name,
          'items',(SELECT COALESCE(jsonb_agg(jsonb_build_object('product',i.product_name,'unit',i.unit_name,
              'quantity',i.quantity-i.returned,'price',i.price,'value',i.revenue-round(i.price*i.returned,2)) ORDER BY i.id),'[]')
            FROM preciso.commercial_sale_items i WHERE i.sale_id=s.id AND i.quantity>i.returned),
          'methods',(SELECT COALESCE(jsonb_agg(DISTINCT p.method),'[]') FROM preciso.commercial_payments p WHERE p.sale_id=s.id AND p.amount>0)
        ) ORDER BY s.local_at),'[]')
        FROM sales s LEFT JOIN preciso.commercial_customers c ON c.id=s.customer_id WHERE s.local_at::date=d.day),
      'totals',jsonb_build_object(
        'sales',(SELECT COALESCE(sum(total),0) FROM sales WHERE local_at::date=d.day),
        'pix',(SELECT COALESCE(sum(amount),0) FROM pays WHERE day=d.day AND method='pix'),
        'dinheiro',(SELECT COALESCE(sum(amount),0) FROM pays WHERE day=d.day AND method='dinheiro'),
        'cartao',(SELECT COALESCE(sum(amount),0) FROM pays WHERE day=d.day AND method='cartao'),
        'fiado',(SELECT COALESCE(sum(fiado),0) FROM sales WHERE local_at::date=d.day),
        'expenses',(SELECT COALESCE(sum(amount),0) FROM costs WHERE day=d.day AND category='despesa')),
      'expenses',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'description',e.description,'amount',e.amount,
          'type',e.expense_type,'person',e.person,'paid',e.paid_on IS NOT NULL,'method',e.method) ORDER BY e.id),'[]')
        FROM costs e WHERE e.day=d.day AND e.category='despesa'),
      'cash',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id',c.id,'opening',c.opening,'opened_at',c.opened_at,'closed_at',c.closed_at,'counted',c.counted,'notes',c.notes,
          'cash_sales',COALESCE((SELECT sum(amount) FROM preciso.commercial_payments WHERE cash_id=c.id AND method='dinheiro'),0),
          'cash_expenses',COALESCE((SELECT sum(amount) FROM preciso.commercial_expenses WHERE cash_id=c.id AND paid_on IS NOT NULL AND method='dinheiro' AND category='despesa'),0),
          'purchase_cash',COALESCE((SELECT sum(amount) FROM preciso.commercial_purchase_payments WHERE cash_id=c.id AND method='dinheiro'),0),
          'withdrawals',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',w.id,'category',w.category,'person',w.person,
              'description',w.description,'amount',w.amount) ORDER BY w.id),'[]')
            FROM preciso.commercial_expenses w WHERE w.cash_id=c.id AND w.category<>'despesa'),
          'expected',c.opening
            +COALESCE((SELECT sum(amount) FROM preciso.commercial_payments WHERE cash_id=c.id AND method='dinheiro'),0)
            -COALESCE((SELECT sum(amount) FROM preciso.commercial_expenses WHERE cash_id=c.id AND paid_on IS NOT NULL AND method='dinheiro'),0)
            -COALESCE((SELECT sum(amount) FROM preciso.commercial_purchase_payments WHERE cash_id=c.id AND method='dinheiro'),0)
        ) ORDER BY c.opened_at),'[]') FROM preciso.commercial_cash_sessions c
        WHERE (c.opened_at AT TIME ZONE 'America/Recife')::date=d.day)
    ) ORDER BY d.day),'[]') FROM days d),
    'week',jsonb_build_object(
      'products',(SELECT COALESCE(jsonb_agg(v ORDER BY v.quantity DESC),'[]') FROM (
        SELECT i.product_name AS product,i.unit_name AS unit,sum(i.quantity-i.returned) AS quantity,
          sum(i.revenue-round(i.price*i.returned,2)) AS value
        FROM preciso.commercial_sale_items i JOIN sales s ON s.id=i.sale_id GROUP BY 1,2) v),
      'sales',(SELECT COALESCE(sum(total),0) FROM sales),
      'pix',(SELECT COALESCE(sum(amount),0) FROM pays WHERE method='pix'),
      'dinheiro',(SELECT COALESCE(sum(amount),0) FROM pays WHERE method='dinheiro'),
      'cartao',(SELECT COALESCE(sum(amount),0) FROM pays WHERE method='cartao'),
      'fiado',(SELECT COALESCE(sum(fiado),0) FROM sales),
      'expenses',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'day',e.day,'description',e.description,
          'amount',e.amount,'type',e.expense_type,'person',e.person,'paid',e.paid_on IS NOT NULL) ORDER BY e.expense_type,e.day,e.id),'[]')
        FROM costs e WHERE e.category='despesa'),
      'withdrawals',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'day',e.day,'category',e.category,
          'person',e.person,'description',e.description,'amount',e.amount) ORDER BY e.day,e.id),'[]')
        FROM costs e WHERE e.category<>'despesa'),
      'expense_total',(SELECT COALESCE(sum(amount),0) FROM costs WHERE category='despesa')
    ),
    'fiados',(SELECT COALESCE(jsonb_agg(v ORDER BY v.amount DESC),'[]') FROM (
      SELECT COALESCE(c.name,'Cliente não identificado') AS name,sum(r.receivable) AS amount,
        min((r.created_at AT TIME ZONE 'America/Recife')::date) AS since
      FROM preciso.commercial_results r LEFT JOIN preciso.commercial_customers c ON c.id=r.customer_id
      WHERE r.status='confirmed' AND r.receivable>0 GROUP BY c.id,c.name) v),
    'debts',(SELECT COALESCE(jsonb_agg(d ORDER BY d.kind,d.due_on NULLS LAST,d.created_at),'[]') FROM preciso.commercial_company_debts d),
    'stock',(SELECT COALESCE(jsonb_agg(v ORDER BY v.name),'[]') FROM (
      SELECT p.id,p.name,p.base_unit,s.balance,s.stock_cost AS value,
        CASE WHEN s.balance>0 AND s.stock_cost IS NOT NULL THEN round(s.stock_cost/s.balance,2) END AS unit_cost,
        (SELECT u.price FROM preciso.commercial_units u WHERE u.product_id=p.id ORDER BY abs(u.factor-1),u.name LIMIT 1) AS price
      FROM preciso.commercial_products p JOIN preciso.commercial_stock s ON s.id=p.id WHERE NOT p.example) v),
    'open_cash',(SELECT to_jsonb(c) FROM preciso.commercial_cash_sessions c WHERE closed_at IS NULL)
  ) AS data`);
  return result.rows[0]?.data as Record<string, unknown>;
}

async function orders() {
  const result = await database()
    .execute(sql`SELECT COALESCE(jsonb_agg(v ORDER BY v.status='conferido',
      v.expected_on NULLS LAST,v.created_at DESC),'[]') AS data FROM (
    SELECT o.id,o.reference,o.ordered_on,o.expected_on,o.due_on,o.freight,o.other_costs,o.status,o.arrived_at,
      o.checked_at,o.check_result,o.notes,o.created_at,s.name AS supplier,
      (SELECT jsonb_agg(item.value || jsonb_build_object('product',p.name,'unit',u.name) ORDER BY item.ordinality)
        FROM jsonb_array_elements(o.items) WITH ORDINALITY item
        LEFT JOIN preciso.commercial_products p ON p.id=(item.value->>'product_id')::uuid
        LEFT JOIN preciso.commercial_units u ON u.id=(item.value->>'unit_id')::uuid) AS items
    FROM preciso.commercial_supplier_orders o LEFT JOIN preciso.commercial_suppliers s ON s.id=o.supplier_id
    ORDER BY o.created_at DESC LIMIT 120) v`);
  return result.rows[0]?.data;
}

async function closings() {
  const result = await database()
    .execute(sql`SELECT COALESCE(jsonb_agg(v ORDER BY v.start_on DESC,v.created_at DESC),'[]') AS data FROM (
    SELECT c.id,c.period,c.start_on,c.end_on,c.source,c.notes,c.created_at,u.full_name AS actor,c.snapshot
    FROM preciso.commercial_closings c LEFT JOIN preciso.users u ON u.id=c.actor_id
    ORDER BY c.start_on DESC,c.created_at DESC LIMIT 60) v`);
  return result.rows[0]?.data;
}

/** Resumo guardado em cada fechamento (o que o dono confere no fim do dia ou da semana). */
export function closingSummary(sheet: Record<string, unknown>) {
  type Day = {
    day: string;
    totals: Record<string, number>;
    cash: { expected: number; counted: number | null; closed_at: string | null }[];
  };
  const days = (sheet.days ?? []) as Day[];
  const week = (sheet.week ?? {}) as Record<string, number>;
  const cash = days.flatMap((d) => d.cash);
  const sales = Number(week.sales ?? 0);
  const expenses = Number(week.expense_total ?? 0);
  return {
    sales,
    pix: Number(week.pix ?? 0),
    dinheiro: Number(week.dinheiro ?? 0),
    cartao: Number(week.cartao ?? 0),
    fiado: Number(week.fiado ?? 0),
    expenses,
    result: Math.round((sales - expenses) * 100) / 100,
    open_cash: cash.some((c) => !c.closed_at),
    cash_difference: cash.reduce(
      (total, c) => (c.counted == null ? total : total + Number(c.counted) - Number(c.expected)),
      0,
    ),
    days: days.map((d) => ({ day: d.day, ...d.totals })),
  };
}

/** Fechamento automático: todo dia; no sábado também a semana (segunda a sábado). */
export async function automaticClosings(today: string, weekday: number) {
  const db = database();
  const periods: { period: "dia" | "semana"; start: string; end: string }[] = [
    { period: "dia", start: today, end: today },
  ];
  if (weekday === 6) {
    const monday = new Date(Date.parse(today) - 5 * 86_400_000).toISOString().slice(0, 10);
    periods.push({ period: "semana", start: monday, end: today });
  }
  const done: string[] = [];
  for (const item of periods) {
    const sheet = await storeSheet(item.start, item.end);
    const snapshot = { summary: closingSummary(sheet), sheet };
    const saved =
      await db.execute(sql`INSERT INTO preciso.commercial_closings(period,start_on,end_on,source,snapshot)
      VALUES (${item.period},${item.start}::date,${item.end}::date,'automatico',${JSON.stringify(snapshot)}::jsonb)
      ON CONFLICT (period,start_on) WHERE source='automatico'
      DO UPDATE SET snapshot=EXCLUDED.snapshot,end_on=EXCLUDED.end_on,created_at=now() RETURNING id`);
    if (saved.rows[0]) done.push(item.period);
  }
  return done;
}

export async function storeRequest(
  request: Request,
  path: string,
  user: CompanyActor,
  readBody: () => Promise<unknown>,
) {
  if (!canUseStoreSheets(user)) return json({ error: "Acesso restrito à administração." }, 403);
  const admin = user.role === "admin";
  const url = new URL(request.url);
  if (request.method === "GET") {
    if (path === "store/sheet") {
      const start = day.parse(url.searchParams.get("start"));
      const end = day.parse(url.searchParams.get("end"));
      if (end < start || span(start, end) > 62)
        return json({ error: "Escolha um período de até 62 dias." }, 400);
      return json(await storeSheet(start, end));
    }
    if (path === "store/closings") return json(await closings());
    if (path === "store/orders" && admin) return json(await orders());
    return json({ error: "Operação indisponível." }, 404);
  }
  if (request.method !== "POST") return json({ error: "Operação indisponível." }, 405);
  const kind = ("store_" + path.replace(/^store\//, "")) as Kind;
  const schema = schemas[kind];
  if (!schema) return json({ error: "Operação indisponível." }, 404);
  if (!admin && !staffKinds.includes(kind))
    return json({ error: "Sua conta não tem acesso a esta operação." }, 403);
  const input = schema.parse(await readBody());
  const db = database();
  try {
    const result = await db.execute(
      sql`SELECT preciso.store_command(${user.id}::uuid,${kind},${JSON.stringify(input)}::jsonb) AS result`,
    );
    const data = result.rows[0]?.result as { id: string };
    if (kind === "store_closing") {
      const period = input as z.infer<(typeof schemas)["store_closing"]>;
      const sheet = await storeSheet(period.start_on, period.end_on);
      await db.execute(
        sql`UPDATE preciso.commercial_closings SET snapshot=${JSON.stringify({
          summary: closingSummary(sheet),
          sheet,
        })}::jsonb WHERE id=${data.id}::uuid AND snapshot='{}'::jsonb`,
      );
    }
    return json(data);
  } catch (error) {
    const messages = [
      error instanceof Error ? error.message : "",
      (error as { cause?: { message?: string } })?.cause?.message ?? "",
    ];
    const match = Object.keys(errors).find((code) => messages.some((m) => m.includes(code)));
    if (match) return json({ error: errors[match] }, 409);
    const code =
      (error as { cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505")
      return json(
        { error: "O caixa já está aberto ou o registro já existe. Atualize a tela." },
        409,
      );
    if (["23503", "23514", "22003"].includes(code ?? ""))
      return json({ error: "Confira os valores, as datas e os cadastros da operação." }, 409);
    throw error;
  }
}
