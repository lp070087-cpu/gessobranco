import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { normalizeStatementText, priorMonth, reviewTypes } from "@/lib/cfo";
import type { Report } from "@/lib/commercial-client";
import { database } from "./db";
import { commercialRequest } from "./commercial";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const date = z.string().date();
const input = z
  .object({
    file: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/\.(csv|xls|xlsx|pdf)$/i),
    account: z.string().trim().min(2).max(100),
    authorized: z.literal(true),
    entries: z
      .array(
        z
          .object({
            day: date,
            cents: z
              .number()
              .int()
              .min(-100_000_000_000)
              .max(100_000_000_000)
              .refine((value) => value !== 0),
            description: z.string().trim().min(1).max(180),
            reference: z.string().trim().max(100).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2000),
  })
  .strict();
const review = z
  .object({
    id: z.string().uuid(),
    classification: z
      .enum(["external_revenue", "external_expense", "external_fee", "external_cost", "transfer"])
      .nullable(),
    reason: z.string().trim().min(4).max(500),
  })
  .strict();
const period = z
  .object({ start: date, end: date, request_key: z.string().uuid() })
  .strict()
  .refine(
    ({ start, end }) => end >= start && Date.parse(end) - Date.parse(start) <= 366 * 86400000,
  );

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const ledger = sql`
  SELECT 'sale:'||id::text AS key,(created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,round(amount*100)::bigint AS cents
    FROM preciso.commercial_payments WHERE method <> 'dinheiro'
  UNION ALL SELECT 'purchase:'||id::text,(created_at AT TIME ZONE 'America/Sao_Paulo')::date,-round(amount*100)::bigint
    FROM preciso.commercial_purchase_payments WHERE method <> 'dinheiro'
  UNION ALL SELECT 'expense:'||id::text,paid_on,-round(amount*100)::bigint
    FROM preciso.commercial_expenses WHERE paid_on IS NOT NULL AND method <> 'dinheiro'
  UNION ALL SELECT 'service:'||id::text,(received_at AT TIME ZONE 'America/Sao_Paulo')::date,round(amount*100)::bigint
    FROM preciso.payments WHERE received_at IS NOT NULL`;

async function storeImport(actorId: string, body: unknown) {
  const statement = input.parse(body);
  const account = normalizeStatementText(statement.account);
  const occurrence = new Map<string, number>();
  const entries = statement.entries.map(({ day, cents, description, reference }) => {
    const signature = JSON.stringify([day, cents, normalizeStatementText(description)]);
    const next = (occurrence.get(signature) ?? 0) + 1;
    occurrence.set(signature, next);
    return {
      day,
      cents,
      description,
      fingerprint: hash(
        reference ? "reference:" + normalizeStatementText(reference) : signature + ":" + next,
      ),
    };
  });
  const fingerprint = hash(
    entries
      .map((entry) => entry.fingerprint)
      .sort()
      .join(","),
  );
  const db = database();
  const result = await db.execute(sql`WITH batch AS (
    INSERT INTO preciso.cfo_imports(actor_id,account,file_name,fingerprint)
    VALUES (${actorId}::uuid,${account},${statement.file},${fingerprint})
    ON CONFLICT(account,fingerprint) DO NOTHING RETURNING id
  ), inserted AS (
    INSERT INTO preciso.cfo_entries(import_id,account,fingerprint,booked_on,description,amount_cents)
    SELECT b.id,${account},e.fingerprint,e.day,e.description,e.cents FROM batch b
      CROSS JOIN jsonb_to_recordset(${JSON.stringify(entries)}::jsonb)
        AS e(fingerprint text,day date,description text,cents bigint)
    ON CONFLICT(account,fingerprint) DO NOTHING RETURNING id
  ), audited AS (
    INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
    SELECT ${actorId}::uuid,'cfo.import',id,jsonb_build_object('received',${entries.length}::int,'inserted',(SELECT count(*) FROM inserted)) FROM batch
  ) SELECT (SELECT id FROM batch) AS id,(SELECT count(*)::int FROM inserted) AS inserted`);
  const row = result.rows[0];
  return {
    id: row.id,
    inserted: Number(row.inserted),
    duplicates: entries.length - Number(row.inserted),
  };
}

async function classify(actorId: string, body: unknown) {
  const item = review.parse(body);
  const type = item.classification;
  const direction = !type || type === "transfer" ? 0 : type === "external_revenue" ? 1 : -1;
  const db = database();
  const result = await db.execute(sql`WITH ledger AS (${ledger}), changed AS (
    UPDATE preciso.cfo_entries e SET classification=${type},reviewed_by=${actorId}::uuid,reviewed_at=now()
    WHERE e.id=${item.id}::uuid AND (${direction}::int=0 OR (sign(e.amount_cents)=${direction}::int AND
      NOT EXISTS(SELECT 1 FROM ledger l WHERE l.day=e.booked_on AND l.cents=e.amount_cents)))
    RETURNING id
  ), audited AS (
    INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
    SELECT ${actorId}::uuid,'cfo.review',id,jsonb_build_object('classification',${type}::text,'reason',${item.reason}::text) FROM changed
  ) SELECT id FROM changed`);
  return result.rows.length > 0;
}

async function analysis(start: string, end: string) {
  const response = await commercialRequest(
    new Request(`https://internal.invalid/api/neon/commercial/report?start=${start}&end=${end}`),
    "commercial/report",
    { role: "admin", id: "" },
    async () => null,
  );
  if (!response.ok) throw new Error("commercial_report_unavailable");
  const base: Report = await response.json();
  const db = database();
  const result = await db.execute(sql`WITH ledger AS (
    SELECT * FROM (${ledger}) l WHERE day BETWEEN ${start}::date AND ${end}::date
  ), ranked AS (
    SELECT e.id,e.booked_on,e.description,e.account,e.amount_cents,e.classification,
      count(l.key) OVER (PARTITION BY e.id) AS candidate_count, l.key,
      count(e.id) OVER (PARTITION BY l.key) AS competition
    FROM preciso.cfo_entries e LEFT JOIN ledger l ON l.day=e.booked_on AND l.cents=e.amount_cents
    WHERE e.booked_on BETWEEN ${start}::date AND ${end}::date
  ), settled AS (
    SELECT DISTINCT ON (id) id,booked_on,description,account,amount_cents,classification,
      CASE WHEN candidate_count=1 AND competition=1 AND classification IS DISTINCT FROM 'transfer' THEN key END AS matched,
      candidate_count>0 AS has_candidate
    FROM ranked ORDER BY id,key
  ) SELECT jsonb_build_object(
    'matched',count(*) FILTER (WHERE matched IS NOT NULL),
    'review',count(*) FILTER (WHERE matched IS NULL AND (classification IS NULL OR (has_candidate AND classification<>'transfer'))),
    'transfers',count(*) FILTER (WHERE classification='transfer'),
    'unmatchedLedger',(SELECT count(*) FROM ledger l WHERE NOT EXISTS (SELECT 1 FROM settled s WHERE s.matched=l.key)),
    'income',COALESCE(sum(amount_cents) FILTER (WHERE NOT has_candidate AND classification='external_revenue'),0),
    'operating',COALESCE(-sum(amount_cents) FILTER (WHERE NOT has_candidate AND classification='external_expense'),0),
    'fees',COALESCE(-sum(amount_cents) FILTER (WHERE NOT has_candidate AND classification='external_fee'),0),
    'costs',COALESCE(-sum(amount_cents) FILTER (WHERE NOT has_candidate AND classification='external_cost'),0),
    'queue',(SELECT COALESCE(jsonb_agg(q),'[]') FROM (
      SELECT id,booked_on,description,account,amount_cents,has_candidate FROM settled
      WHERE matched IS NULL AND (classification IS NULL OR (has_candidate AND classification<>'transfer'))
      ORDER BY booked_on DESC,id LIMIT 100
    ) q)
  ) AS data FROM settled`);
  const bank = result.rows[0].data as {
    matched: number;
    review: number;
    transfers: number;
    unmatchedLedger: number;
    income: number;
    operating: number;
    fees: number;
    costs: number;
    queue: unknown[];
  };
  const extras = (
    await db.execute(sql`SELECT
    COALESCE(sum(amount) FILTER (WHERE (received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${start}::date AND ${end}::date),0) AS received,
    count(*) FILTER (WHERE received_at IS NOT NULL AND (received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${start}::date AND ${end}::date)::int AS service_count
    FROM preciso.payments`)
  ).rows[0];
  const revenue = Number(base.revenue) + bank.income / 100;
  const contribution = base.partial_sales
    ? null
    : Number(base.contribution ?? 0) + (bank.income - bank.fees - bank.costs) / 100;
  const expenses = Number(base.operating_expenses) + bank.operating / 100;
  const received = Number(base.received) + Number(extras.received) + bank.income / 100;
  const paid = Number(base.cash_out) + (bank.operating + bank.fees + bank.costs) / 100;
  return {
    bank,
    dre: {
      revenue,
      goodsCost: base.partial_sales ? null : Number(base.goods_cost ?? 0) + bank.costs / 100,
      contribution,
      expenses,
      result: contribution === null ? null : contribution - expenses,
      margin: contribution === null || revenue === 0 ? null : (contribution / revenue) * 100,
      pendingSales: Number(base.partial_sales),
      pendingPurchases: Number(base.pending_purchase_costs),
      receivedServices: Number(extras.received),
      servicePayments: Number(extras.service_count),
    },
    cash: { received, paid, net: received - paid },
  };
}

async function run(
  start: string,
  end: string,
  requestKey: string,
  actorId: string | null,
  source: "manual" | "cron",
) {
  const db = database();
  const claimed =
    await db.execute(sql`INSERT INTO preciso.cfo_runs(request_key,source,actor_id,start_on,end_on,status)
    VALUES (${requestKey},${source},${actorId}::uuid,${start}::date,${end}::date,'running')
    ON CONFLICT(request_key) DO UPDATE SET status='running',attempts=preciso.cfo_runs.attempts+1,started_at=now(),finished_at=NULL,error=NULL
    WHERE preciso.cfo_runs.start_on=EXCLUDED.start_on AND preciso.cfo_runs.end_on=EXCLUDED.end_on
      AND preciso.cfo_runs.actor_id IS NOT DISTINCT FROM EXCLUDED.actor_id
      AND (preciso.cfo_runs.status='failed' OR (preciso.cfo_runs.status='running' AND preciso.cfo_runs.started_at<now()-interval '10 minutes'))
    RETURNING id,attempts`);
  const row = claimed.rows[0];
  if (!row) {
    const found =
      await db.execute(sql`SELECT id,status,report FROM preciso.cfo_runs WHERE request_key=${requestKey}
      AND actor_id IS NOT DISTINCT FROM ${actorId}::uuid AND start_on=${start}::date AND end_on=${end}::date`);
    return found.rows[0] ? { ...found.rows[0], reused: true } : { status: "conflict" };
  }
  try {
    const report = await analysis(start, end);
    await db.execute(sql`UPDATE preciso.cfo_runs SET status='succeeded',report=${JSON.stringify(report)}::jsonb,finished_at=now()
      WHERE id=${row.id}::uuid AND attempts=${row.attempts}::int`);
    return { id: row.id, status: "succeeded", report, reused: false };
  } catch {
    await db.execute(sql`UPDATE preciso.cfo_runs SET status='failed',error='Falha ao calcular o relatório.',finished_at=now()
      WHERE id=${row.id}::uuid AND attempts=${row.attempts}::int`);
    return { id: row.id, status: "failed" };
  }
}

export async function scheduledCfo(request: Request, now = new Date()) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  if (
    !secret ||
    secret.length < 24 ||
    !timingSafeEqual(Buffer.from(hash(authorization)), Buffer.from(hash("Bearer " + secret)))
  )
    return json({ error: "Não autorizado." }, 401);
  const schedule = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
  }).format(now);
  if (schedule !== "5") return json({ status: "outside_schedule" });
  const { start, end } = priorMonth(now);
  const result = await run(start, end, "cron:" + start, null, "cron");
  return json(result, result.status === "failed" ? 500 : 200);
}

export async function cfoRequest(
  path: string,
  method: string,
  actorId: string,
  read: () => Promise<unknown>,
) {
  if (method === "GET" && /^cfo\/history\/[0-9a-f-]{36}$/.test(path)) {
    const id = z.string().uuid().parse(path.split("/")[2]);
    const result = await database()
      .execute(sql`SELECT id,source,start_on::text,end_on::text,status,started_at,finished_at,error,report
      FROM preciso.cfo_runs WHERE id=${id}::uuid`);
    return result.rows[0] ? json(result.rows[0]) : json({ error: "Execução não encontrada." }, 404);
  }
  if (path === "cfo/import" && method === "POST")
    return json(await storeImport(actorId, await read()), 201);
  if (path === "cfo/review" && method === "PATCH")
    return (await classify(actorId, await read()))
      ? json({ ok: true })
      : json(
          {
            error:
              "Revise a movimentação: o sinal deve combinar com a categoria e lançamentos com candidatos só podem ser marcados como já contabilizados.",
          },
          409,
        );
  if (path === "cfo/run" && method === "POST") {
    const { start, end, request_key } = period.parse(await read());
    const result = await run(start, end, "manual:" + request_key, actorId, "manual");
    return json(
      result,
      result.status === "failed" ? 500 : result.status === "conflict" ? 409 : 200,
    );
  }
  if (path === "cfo/history" && method === "GET") {
    const db = database();
    const r =
      await db.execute(sql`SELECT r.id,r.source,r.start_on::text,r.end_on::text,r.status,r.started_at,r.finished_at,r.error,
      CASE WHEN r.id=(SELECT id FROM preciso.cfo_runs WHERE status='succeeded' ORDER BY finished_at DESC,id LIMIT 1) THEN r.report END AS report
      FROM preciso.cfo_runs r ORDER BY started_at DESC,id LIMIT 30`);
    const imports = await db.execute(
      sql`SELECT id,account,file_name,created_at FROM preciso.cfo_imports ORDER BY created_at DESC,id LIMIT 20`,
    );
    return json({ runs: r.rows, imports: imports.rows, categories: reviewTypes });
  }
  return json({ error: "Operação indisponível." }, 405);
}
