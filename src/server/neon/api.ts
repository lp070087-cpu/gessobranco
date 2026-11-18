import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { hashPassword, verifyPassword } from "./passwords";
import { projects, quotes, services, sessions, users } from "./schema";
import { commercialRequest, publicCatalogue } from "./commercial";

const COOKIE = "preciso_session";
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
const credentials = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((v) => v.trim().toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const registration = credentials.extend({ full_name: z.string().trim().min(2).max(160) });
const serviceInput = z
  .object({
    key: z.string().regex(/^[a-z0-9-]{2,80}$/),
    name: z.string().trim().min(2).max(160),
    short_name: z.string().max(80).default(""),
    description: z.string().max(10000).default(""),
    category: z.string().max(100).default(""),
    price_per_m2: z.number().finite().min(0).max(100000000),
    billing_unit: z.enum(["m2", "linear", "unit", "day", "project", "quote"]),
    is_active: z.boolean(),
    available: z.boolean().default(true),
    image_url: z
      .string()
      .url()
      .refine((v) => v.startsWith("https://"))
      .nullable()
      .default(null),
    availability_notes: z.string().max(2000).default(""),
    sort_order: z.number().int().min(0).default(0),
  })
  .strict();

function cookie(value: string, maxAge: number) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function token(request: Request) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) || ""
  );
}
async function actor(request: Request) {
  const value = token(request);
  if (!/^[a-f0-9]{64}$/.test(value)) return null;
  const db = database();
  const [row] = await db
    .select({ id: users.id, email: users.email, full_name: users.fullName, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, sha256(value)),
        gt(sessions.expiresAt, new Date()),
        eq(users.disabled, false),
      ),
    )
    .limit(1);
  return row || null;
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("INVALID_INPUT");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65536))
    throw new Error("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new Error("INVALID_INPUT");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("INVALID_INPUT");
  }
}

async function withinRateLimit(db: ReturnType<typeof database>, key: string, limit: number) {
  const result =
    await db.execute(sql`INSERT INTO preciso.login_attempts(key_hash) VALUES (${sha256(key)})
    ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN preciso.login_attempts.window_started_at < now()-interval '15 minutes'
        THEN 1 ELSE preciso.login_attempts.attempts+1 END,
      window_started_at=CASE WHEN preciso.login_attempts.window_started_at < now()-interval '15 minutes'
        THEN now() ELSE preciso.login_attempts.window_started_at END
    RETURNING attempts`);
  return Number(result.rows[0]?.attempts) <= limit;
}

async function allowAuthentication(
  db: ReturnType<typeof database>,
  request: Request,
  action: "login" | "register",
  email: string,
) {
  // Check the global bucket first so varying emails/IP headers cannot create unlimited rows or scrypt work.
  if (!(await withinRateLimit(db, `${action}:global`, action === "login" ? 500 : 50))) return false;
  // Only trust an address supplied by the deployment proxy, never arbitrary client forwarding headers.
  const address = process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    : undefined;
  if (
    address &&
    /^[a-fA-F0-9:.]{3,64}$/.test(address) &&
    !(await withinRateLimit(db, `${action}:ip:${address}`, action === "login" ? 50 : 5))
  )
    return false;
  return withinRateLimit(db, `${action}:email:${email}`, action === "login" ? 10 : 3);
}
function toService(v: z.infer<typeof serviceInput>) {
  return {
    key: v.key,
    name: v.name,
    shortName: v.short_name,
    description: v.description,
    category: v.category,
    pricePerM2: v.price_per_m2.toFixed(2),
    billingUnit: v.billing_unit,
    isActive: v.is_active,
    available: v.available,
    imageUrl: v.image_url,
    availabilityNotes: v.availability_notes,
    sortOrder: v.sort_order,
    updatedAt: new Date(),
  };
}

/** Node server API. Kept opt-in until Neon data and frontend migration are verified. */
export async function handleNeonRequest(request: Request): Promise<Response> {
  if (!process.env.DATABASE_URL) return json({ error: "Banco Neon ainda não configurado." }, 503);
  const path = new URL(request.url).pathname.replace(/^\/api\/neon\/?/, "");
  if (!["GET", "POST", "PATCH"].includes(request.method))
    return json({ error: "Método não permitido." }, 405);
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const expected = process.env.APP_URL || new URL(request.url).origin;
    if (origin !== new URL(expected).origin) return json({ error: "Origem inválida." }, 403);
  }
  try {
    const db = database();
    if (path === "catalogue" && request.method === "GET") return await publicCatalogue();
    if (path === "auth/register" && request.method === "POST") {
      const input = registration.parse(await body(request));
      if (!(await allowAuthentication(db, request, "register", input.email)))
        return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
      // Never accept role, company membership or an arbitrary user id from a registration payload.
      await db.insert(users).values({
        email: input.email,
        fullName: input.full_name,
        passwordHash: await hashPassword(input.password),
        role: "client",
      });
      return json({ ok: true }, 201);
    }
    if (path === "auth/login" && request.method === "POST") {
      const input = credentials.parse(await body(request));
      if (!(await allowAuthentication(db, request, "login", input.email)))
        return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
      const [user] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
      const valid = await verifyPassword(
        input.password,
        user?.passwordHash || "scrypt:00000000000000000000000000000000:" + "0".repeat(128),
      );
      if (!user || user.disabled || !valid)
        return json({ error: "Email ou senha inválidos." }, 401);
      await db.execute(
        sql`DELETE FROM preciso.login_attempts WHERE key_hash = ${sha256(`login:email:${input.email}`)}`,
      );
      const raw = randomBytes(32).toString("hex");
      await db.insert(sessions).values({
        tokenHash: sha256(raw),
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
      return json(
        { user: { id: user.id, email: user.email, full_name: user.fullName, role: user.role } },
        200,
        { "Set-Cookie": cookie(raw, 604800) },
      );
    }
    if (path === "auth/logout" && request.method === "POST") {
      await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token(request))));
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (path === "services" && request.method === "GET") {
      return json(
        await db
          .select()
          .from(services)
          .where(eq(services.isActive, true))
          .orderBy(services.sortOrder),
      );
    }
    const user = await actor(request);
    if (!user) return json({ error: "Autenticação necessária." }, 401);
    if (path === "auth/me" && request.method === "GET") return json({ user });
    if (path.startsWith("commercial/"))
      return await commercialRequest(request, path, user, () => body(request));
    if (path === "admin/services" && request.method === "GET") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      return json(await db.select().from(services).orderBy(services.sortOrder));
    }
    if (
      (path === "services" || /^services\/[0-9a-f-]{36}$/.test(path)) &&
      request.method !== "GET"
    ) {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const value = toService(serviceInput.parse(await body(request)));
      const mutation =
        request.method === "POST" && path === "services"
          ? sql`INSERT INTO preciso.services(key,name,short_name,description,category,price_per_m2,billing_unit,
            is_active,available,image_url,availability_notes,sort_order,updated_at)
          VALUES(${value.key},${value.name},${value.shortName},${value.description},${value.category},
            ${value.pricePerM2},${value.billingUnit},${value.isActive},${value.available},${value.imageUrl},
            ${value.availabilityNotes},${value.sortOrder},${value.updatedAt.toISOString()}) RETURNING *`
          : request.method === "PATCH" && path.startsWith("services/")
            ? sql`UPDATE preciso.services SET key=${value.key},name=${value.name},short_name=${value.shortName},
              description=${value.description},category=${value.category},price_per_m2=${value.pricePerM2},
              billing_unit=${value.billingUnit},is_active=${value.isActive},available=${value.available},
              image_url=${value.imageUrl},availability_notes=${value.availabilityNotes},sort_order=${value.sortOrder},
              updated_at=${value.updatedAt.toISOString()}
            WHERE id=${z.string().uuid().parse(path.split("/")[1])} RETURNING *`
            : null;
      if (!mutation) return json({ error: "Método não permitido." }, 405);
      // The write and audit record commit or roll back together.
      const result = await db.execute(sql`WITH saved AS (${mutation}), logged AS (
        INSERT INTO preciso.audit_logs(actor_id,action,target_id)
        SELECT ${user.id},'service.saved',id FROM saved
      ) SELECT id,key,name,short_name AS "shortName",category,
          sort_order AS "sortOrder",availability_notes AS "availabilityNotes",description,
          price_per_m2 AS "pricePerM2",billing_unit AS "billingUnit",image_url AS "imageUrl",
          is_active AS "isActive",available,updated_at AS "updatedAt"
        FROM saved`);
      const saved = result.rows[0];
      return saved
        ? json({ ...saved, updatedAt: new Date(String(saved.updatedAt)).toISOString() })
        : json({ error: "Serviço não encontrado." }, 404);
    }
    if (path === "quotes" && request.method === "GET") {
      // Company membership never grants access to another customer's personal quote.
      return json(
        await db
          .select()
          .from(quotes)
          .where(user.role === "admin" ? undefined : eq(quotes.userId, user.id)),
      );
    }
    if (path === "quotes" && request.method === "POST") {
      const input = z
        .object({
          title: z.string().trim().min(3).max(200),
          notes: z.string().max(10000).default(""),
          project_type: z.enum([
            "residencial",
            "casa_completa",
            "edificio",
            "condominio",
            "fachada",
            "comercial",
          ]),
          items: z
            .array(
              z
                .object({
                  service_id: z.string().uuid(),
                  environment: z.string().trim().min(1).max(160),
                  quantity: z.number().finite().positive().max(10000000),
                  notes: z.string().max(2000).default(""),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict()
        .parse(await body(request));
      const encoded = JSON.stringify(input.items);
      // Single SQL statement: snapshot prices from the server catalogue and write all rows atomically.
      const result = await db.execute(sql`WITH input AS (
        SELECT * FROM jsonb_to_recordset(${encoded}::jsonb) AS x(service_id uuid, environment text, quantity numeric, notes text)
      ), priced AS (
        SELECT i.*, s.price_per_m2, s.billing_unit FROM input i JOIN preciso.services s ON s.id=i.service_id WHERE s.is_active AND s.available
      ), created AS (
        INSERT INTO preciso.quotes(user_id,title,notes,project_type,total,preliminary,status)
        SELECT ${user.id},${input.title},${input.notes},${input.project_type},sum(quantity*price_per_m2),true,
          CASE WHEN ${input.project_type} <> 'residencial' OR sum(quantity)>500 OR bool_or(billing_unit='quote') THEN 'visit_required' ELSE 'requested' END
        FROM priced HAVING count(*)=${input.items.length}
        RETURNING *
      ), inserted_items AS (
        INSERT INTO preciso.quote_items(quote_id,service_id,environment,quantity,unit_price,billing_unit,notes)
        SELECT c.id,p.service_id,p.environment,p.quantity,p.price_per_m2,p.billing_unit,p.notes FROM created c CROSS JOIN priced p
      ), history AS (
        INSERT INTO preciso.quote_history(quote_id,actor_id,status) SELECT id,${user.id},status FROM created
      ) SELECT * FROM created`);
      if (!result.rows[0]) return json({ error: "Um dos serviços não está disponível." }, 409);
      return json(result.rows[0], 201);
    }
    if (path === "projects" && request.method === "GET") {
      return json(
        await db
          .select()
          .from(projects)
          .where(user.role === "admin" ? undefined : eq(projects.userId, user.id)),
      );
    }
    if (/^quotes\/[0-9a-f-]{36}$/.test(path) && request.method === "PATCH") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const id = z.string().uuid().parse(path.split("/")[1]);
      const input = z
        .object({
          status: z.enum([
            "requested",
            "reviewing",
            "visit_required",
            "proposed",
            "approved",
            "rejected",
            "cancelled",
          ]),
          notes: z.string().max(5000).default(""),
        })
        .strict()
        .parse(await body(request));
      const result = await db.execute(sql`WITH changed AS (
        UPDATE preciso.quotes SET status=${input.status},updated_at=now() WHERE id=${id} RETURNING *
      ), history AS (
        INSERT INTO preciso.quote_history(quote_id,actor_id,status,notes)
        SELECT id,${user.id},status,${input.notes} FROM changed
      ) SELECT * FROM changed`);
      return result.rows[0]
        ? json(result.rows[0])
        : json({ error: "Orçamento não encontrado." }, 404);
    }
    if (path === "projects" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const input = z
        .object({ quote_id: z.string().uuid() })
        .strict()
        .parse(await body(request));
      const result =
        await db.execute(sql`INSERT INTO preciso.projects(quote_id,user_id,company_id,title)
        SELECT id,user_id,company_id,title FROM preciso.quotes WHERE id=${input.quote_id} AND status='approved'
        ON CONFLICT(quote_id) DO NOTHING RETURNING *`);
      return result.rows[0]
        ? json(result.rows[0], 201)
        : json({ error: "A obra já existe ou o orçamento ainda não foi aprovado." }, 409);
    }
    if (/^projects\/[0-9a-f-]{36}$/.test(path) && request.method === "PATCH") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const id = z.string().uuid().parse(path.split("/")[1]);
      const input = z
        .object({
          status: z.enum(["planned", "in_progress", "paused", "completed", "cancelled"]),
          progress: z.number().int().min(0).max(100),
          responsible_id: z.string().uuid().nullable(),
          starts_on: z.string().date().nullable(),
          ends_on: z.string().date().nullable(),
        })
        .strict()
        .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on)
        .parse(await body(request));
      const result =
        await db.execute(sql`UPDATE preciso.projects SET status=${input.status},progress=${input.progress},
        responsible_id=${input.responsible_id},starts_on=${input.starts_on},ends_on=${input.ends_on} WHERE id=${id} RETURNING *`);
      return result.rows[0] ? json(result.rows[0]) : json({ error: "Obra não encontrada." }, 404);
    }
    if (path === "appointments" && request.method === "GET") {
      const result =
        user.role === "admin"
          ? await db.execute(sql`SELECT * FROM preciso.appointments ORDER BY scheduled_at`)
          : await db.execute(
              sql`SELECT * FROM preciso.appointments WHERE user_id=${user.id} ORDER BY scheduled_at`,
            );
      return json(result.rows);
    }
    if (path === "appointments" && request.method === "POST") {
      const input = z
        .object({
          kind: z.enum(["visit", "meeting", "execution", "inspection", "completion"]),
          scheduled_at: z.string().datetime({ offset: true }),
          address: z.string().trim().min(5).max(1000),
          notes: z.string().max(5000).default(""),
        })
        .strict()
        .refine((v) => new Date(v.scheduled_at).getTime() > Date.now())
        .parse(await body(request));
      const result =
        await db.execute(sql`INSERT INTO preciso.appointments(user_id,kind,scheduled_at,address,notes)
        VALUES(${user.id},${input.kind},${input.scheduled_at},${input.address},${input.notes}) RETURNING *`);
      return json(result.rows[0], 201);
    }
    if (path === "payments" && request.method === "GET") {
      const result =
        user.role === "admin"
          ? await db.execute(sql`SELECT p.* FROM preciso.payments p ORDER BY due_on`)
          : await db.execute(
              sql`SELECT p.* FROM preciso.payments p JOIN preciso.projects j ON j.id=p.project_id WHERE j.user_id=${user.id} ORDER BY p.due_on`,
            );
      return json(result.rows);
    }
    if (path === "payments" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const input = z
        .object({
          project_id: z.string().uuid(),
          description: z.string().trim().min(3).max(300),
          amount: z.number().finite().positive().max(1000000000),
          due_on: z.string().date(),
        })
        .strict()
        .parse(await body(request));
      const result =
        await db.execute(sql`INSERT INTO preciso.payments(project_id,description,amount,due_on)
        VALUES(${input.project_id},${input.description},${input.amount.toFixed(2)},${input.due_on}) RETURNING *`);
      return json(result.rows[0], 201);
    }
    if (/^payments\/[0-9a-f-]{36}$/.test(path) && request.method === "PATCH") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const id = z.string().uuid().parse(path.split("/")[1]);
      const input = z
        .object({ received: z.boolean() })
        .strict()
        .parse(await body(request));
      const result = await db.execute(
        sql`UPDATE preciso.payments SET received_at=${input.received ? new Date().toISOString() : null} WHERE id=${id} RETURNING *`,
      );
      return result.rows[0]
        ? json(result.rows[0])
        : json({ error: "Pagamento não encontrado." }, 404);
    }
    return json({ error: "Recurso não encontrado." }, 404);
  } catch (error) {
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      (error instanceof Error && error.message === "INVALID_INPUT")
    )
      return json({ error: "Dados inválidos." }, 400);
    console.error(
      "[Neon API] Falha na operação",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
}
