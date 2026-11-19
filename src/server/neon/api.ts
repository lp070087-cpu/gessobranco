import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { database } from "./db";
import { hashPassword, verifyPassword } from "./passwords";
import { projects, quotes, sessions, users } from "./schema";
import { commercialRequest, publicCatalogue } from "./commercial";
import { companyRequests, createCompanyRequest } from "./company-requests";
import { cfoRequest, scheduledCfo } from "./cfo";
import { portal } from "./portal";
import {
  businessAddress,
  businessSettingsSchema,
  defaultBusinessSettings,
} from "@/lib/business-settings";
import {
  companyPermissions,
  hasCompanyPermission,
  type CompanyActor,
  type CompanyPermission,
} from "@/lib/company-permissions";

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
const registration = credentials.extend({
  full_name: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(30).default(""),
  company_name: z.string().trim().min(2).max(160).optional(),
  document: z.string().trim().max(30).optional(),
  accepted_terms: z.boolean().default(false),
});
const proposalLine = z
  .object({
    quantity: z.number().finite().min(0.001).max(10_000_000),
    unit_price: z.number().finite().min(0).max(1_000_000),
    work: z.string().trim().min(3).max(1500),
  })
  .strict();
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
    image_upload: z
      .string()
      .max(1_650_000)
      .regex(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/)
      .optional(),
    keep_image: z.boolean().default(false),
    availability_notes: z.string().max(2000).default(""),
    sort_order: z.number().int().min(0).default(0),
  })
  .strict();

const imageUrl = sql`CASE WHEN image_url LIKE 'data:image/%' THEN
  '/api/neon/services/'||id||'/image?v='||md5(image_url) ELSE image_url END`;
const serviceColumns = sql`id,key,name,short_name AS "shortName",category,
  sort_order AS "sortOrder",availability_notes AS "availabilityNotes",description,
  price_per_m2 AS "pricePerM2",billing_unit AS "billingUnit",${imageUrl} AS "imageUrl",
  is_active AS "isActive",available,updated_at AS "updatedAt"`;

async function businessProfile(db: ReturnType<typeof database>) {
  const result = await db.execute(
    sql`SELECT value FROM preciso.platform_settings WHERE key='business_profile'`,
  );
  return {
    ...defaultBusinessSettings,
    ...(result.rows[0]?.value as Partial<typeof defaultBusinessSettings> | undefined),
  };
}

function decodeServiceImage(data: string) {
  const [header, encoded] = data.split(",");
  const bytes = Buffer.from(encoded, "base64");
  const png = header === "data:image/png;base64";
  const signature = png ? "89504e470d0a1a0a" : "ffd8ff";
  if (
    bytes.length > 1_200_000 ||
    !bytes.subarray(0, 8).toString("hex").startsWith(signature) ||
    bytes.toString("base64") !== encoded
  )
    return null;
  return { bytes, type: png ? "image/png" : "image/jpeg" };
}

function cookie(value: string, maxAge: number) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
async function issueSession(db: ReturnType<typeof database>, userId: string, keep = true) {
  const raw = randomBytes(32).toString("hex");
  const maxAge = keep ? 604800 : 43200;
  await db
    .insert(sessions)
    .values({ tokenHash: sha256(raw), userId, expiresAt: new Date(Date.now() + maxAge * 1000) });
  return keep ? cookie(raw, maxAge) : cookie(raw, maxAge).replace(/; Max-Age=\d+/, "");
}

async function legacyAccount(db: ReturnType<typeof database>, accessToken: string) {
  const origin = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!origin || !key || new URL(origin).protocol !== "https:") return null;
  const response = await fetch(new URL("/auth/v1/user", origin), {
    headers: { apikey: key, Authorization: "Bearer " + accessToken },
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const checked = z
    .object({
      id: z.string().uuid(),
      email: z.string().email().max(254),
      email_confirmed_at: z.string().min(1),
      user_metadata: z.object({ full_name: z.string().max(160).optional() }).optional(),
    })
    .safeParse(await response.json());
  if (!checked.success) return null;
  const { id, email, user_metadata } = checked.data;
  const name = user_metadata?.full_name?.trim() || email.split("@")[0];
  const existing =
    await db.execute(sql`SELECT u.id FROM preciso.legacy_identities l JOIN preciso.users u ON u.id=l.user_id
    WHERE l.subject=${id}::uuid AND NOT u.disabled AND u.role='client'`);
  if (existing.rows[0]) return String(existing.rows[0].id);
  const created = await db.execute(sql`WITH account AS (
    INSERT INTO preciso.users(email,full_name,password_hash,role) VALUES (${email.toLowerCase()},${name},'provider:legacy','client')
    ON CONFLICT(email) DO NOTHING RETURNING id
  ) INSERT INTO preciso.legacy_identities(subject,user_id) SELECT ${id}::uuid,id FROM account
    ON CONFLICT(subject) DO NOTHING RETURNING user_id`);
  return created.rows[0] ? String(created.rows[0].user_id) : null;
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
async function actor(request: Request): Promise<CompanyActor | null> {
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
  if (!row) return null;
  const grants = await db.execute(
    sql`SELECT permission FROM preciso.staff_permissions WHERE user_id=${row.id}::uuid ORDER BY permission`,
  );
  return { ...row, permissions: grants.rows.map((entry) => entry.permission as CompanyPermission) };
}
async function body(request: Request, limit = 65536) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("INVALID_INPUT");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit))
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
      if (size > limit) {
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
export async function handleNeonRequest(request: Request, now = new Date()): Promise<Response> {
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
    if (path === "cron/cfo" && request.method === "GET") return await scheduledCfo(request, now);
    if (path === "catalogue" && request.method === "GET") return await publicCatalogue();
    if (path === "company-requests" && request.method === "POST") {
      const input = await body(request);
      const owner = await actor(request);
      const email =
        owner?.email ?? z.object({ email: z.string().trim().email().max(254) }).parse(input).email;
      if (
        !(await withinRateLimit(db, "company-requests:global", 120)) ||
        !(await withinRateLimit(db, `company-requests:${email.toLowerCase()}`, 8))
      )
        return json({ error: "Muitas solicitações. Aguarde 15 minutos." }, 429);
      return json(await createCompanyRequest(db, input, owner ?? undefined), 201);
    }
    if (path === "auth/register" && request.method === "POST") {
      const input = registration.parse(await body(request));
      if (!(await allowAuthentication(db, request, "register", input.email)))
        return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
      // Never accept role, company membership or an arbitrary user id from a registration payload.
      const passwordHash = await hashPassword(input.password);
      const registered = await db.execute(sql`WITH account AS (
        INSERT INTO preciso.users(email,full_name,password_hash,role)
        VALUES (${input.email},${input.full_name},${passwordHash},'client')
        ON CONFLICT(email) DO NOTHING RETURNING id
      ), profile AS (
        INSERT INTO preciso.client_profiles(user_id,phone,accepted_terms_at)
        SELECT id,${input.phone},CASE WHEN ${input.accepted_terms}::boolean THEN now() END FROM account
      ), business AS (
        INSERT INTO preciso.companies(owner_id,name,document) SELECT id,${input.company_name ?? null},${input.document ?? null} FROM account
        WHERE ${input.company_name ?? null}::text IS NOT NULL
      ) SELECT id FROM account`);
      return registered.rows.length
        ? json({ ok: true }, 201)
        : json({ error: "Já existe uma conta com este e-mail. Entre para continuar." }, 409);
    }
    if (path === "auth/legacy-session" && request.method === "POST") {
      if (!(await withinRateLimit(db, "legacy-session", 120)))
        return json({ error: "Muitas tentativas." }, 429);
      const input = z
        .object({ access_token: z.string().min(30).max(6000) })
        .strict()
        .parse(await body(request));
      const userId = await legacyAccount(db, input.access_token);
      return userId
        ? json({ ok: true }, 200, { "Set-Cookie": await issueSession(db, userId) })
        : json({ error: "A conexão com a conta original não está disponível." }, 401);
    }
    if (path === "auth/login" && request.method === "POST") {
      const input = credentials
        .extend({ keep_connected: z.boolean().default(true) })
        .parse(await body(request));
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
      return json(
        { user: { id: user.id, email: user.email, full_name: user.fullName, role: user.role } },
        200,
        { "Set-Cookie": await issueSession(db, user.id, input.keep_connected) },
      );
    }
    if (path === "auth/logout" && request.method === "POST") {
      await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token(request))));
      return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (path === "business/location" && request.method === "GET") {
      const settings = await businessProfile(db);
      return json({
        address: businessAddress(settings),
        latitude: settings.latitude,
        longitude: settings.longitude,
      });
    }
    if (path === "services" && request.method === "GET") {
      const result = await db.execute(
        sql`SELECT ${serviceColumns} FROM preciso.services WHERE is_active ORDER BY sort_order`,
      );
      return json(result.rows);
    }
    if (/^services\/[0-9a-f-]{36}\/image$/.test(path) && request.method === "GET") {
      const id = z.string().uuid().parse(path.split("/")[1]);
      const result = await db.execute(
        sql`SELECT image_url,is_active FROM preciso.services WHERE id=${id}::uuid`,
      );
      const image = result.rows[0];
      if (
        !image ||
        typeof image.image_url !== "string" ||
        !image.image_url.startsWith("data:image/")
      )
        return new Response(null, { status: 404 });
      if (!image.is_active) {
        const viewer = await actor(request);
        if (!viewer || !hasCompanyPermission(viewer, "service_catalogue"))
          return new Response(null, { status: 404 });
      }
      const asset = decodeServiceImage(image.image_url);
      if (!asset) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(asset.bytes), {
        headers: {
          "Content-Type": asset.type,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": image.is_active ? "public, max-age=120" : "private, no-store",
        },
      });
    }
    const user = await actor(request);
    if (!user) return json({ error: "Autenticação necessária." }, 401);
    if (path === "auth/me" && request.method === "GET") return json({ user });
    if (
      path === "admin/owner-expenses" ||
      /^admin\/owner-expenses\/[0-9a-f-]{36}\/receipt$/.test(path)
    ) {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      if (path.endsWith("/receipt") && request.method === "GET") {
        const id = z.string().uuid().parse(path.split("/")[2]);
        const result = await db.execute(
          sql`SELECT value->>'photo' AS photo FROM preciso.platform_settings WHERE key=${"owner_expense:" + id}`,
        );
        const photo = result.rows[0]?.photo;
        const asset = typeof photo === "string" ? decodeServiceImage(photo) : null;
        return asset
          ? new Response(new Uint8Array(asset.bytes), {
              headers: {
                "Content-Type": asset.type,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
              },
            })
          : new Response(null, { status: 404 });
      }
      if (path === "admin/owner-expenses" && request.method === "GET") {
        const result =
          await db.execute(sql`SELECT e.id,e.description,e.amount,e.due_on::text,e.paid_on::text,
          s.value->>'category' AS category, (s.value->>'photo' IS NOT NULL) AS receipt
          FROM preciso.commercial_expenses e JOIN preciso.platform_settings s ON s.key='owner_expense:'||e.id::text
          ORDER BY e.due_on DESC,e.id DESC LIMIT 100`);
        return json(result.rows);
      }
      if (path === "admin/owner-expenses" && request.method === "POST") {
        const input = z
          .object({
            request_id: z.string().uuid(),
            description: z.string().trim().min(3).max(180),
            amount: z.number().finite().positive().max(100000000).multipleOf(0.01),
            day: z.string().date(),
            category: z.enum(["Combustível", "Materiais", "Frete", "Serviços", "Outras despesas"]),
            paid: z.boolean(),
            photo: z
              .string()
              .max(1_650_000)
              .regex(/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/)
              .optional(),
          })
          .strict()
          .parse(await body(request, 1_700_000));
        if (input.photo && !decodeServiceImage(input.photo))
          return json({ error: "Selecione um comprovante JPG ou PNG válido." }, 400);
        const key = "owner_expense_claim:" + (input.photo ? sha256(input.photo) : input.request_id);
        const payload = {
          request_key: input.request_id,
          description: input.description,
          amount: input.amount,
          due_on: input.day,
          paid_on: input.paid ? input.day : null,
          method: input.paid ? "pix" : null,
          confirmed: input.paid,
        };
        try {
          const result = await db.execute(sql`WITH claimed AS (
            INSERT INTO preciso.platform_settings(key,value,updated_by)
            VALUES (${key},jsonb_build_object('request_id',${input.request_id}::text),${user.id}::uuid)
            ON CONFLICT(key) DO NOTHING RETURNING key
          ), created AS MATERIALIZED (
            SELECT preciso.commercial_command(${user.id}::uuid,'expense',${JSON.stringify(payload)}::jsonb)->>'id' AS id FROM claimed
          ), attached AS (
            INSERT INTO preciso.platform_settings(key,value,updated_by)
            SELECT 'owner_expense:'||id,${JSON.stringify({ category: input.category, photo: input.photo ?? null, request_id: input.request_id })}::jsonb,${user.id}::uuid
            FROM created RETURNING key
          ) SELECT id FROM created`);
          if (result.rows[0]) return json(result.rows[0], 201);
          const previous = await db.execute(sql`SELECT 1 FROM preciso.platform_settings
            WHERE key=${key} AND value->>'request_id'=${input.request_id} AND updated_by=${user.id}::uuid`);
          return previous.rows.length
            ? json({ ok: true })
            : json({ error: "Este comprovante já consta nas despesas do proprietário." }, 409);
        } catch (failure) {
          if (
            failure instanceof Error &&
            (failure.message.includes("CASH_CLOSED") ||
              String(failure.cause).includes("CASH_CLOSED"))
          )
            return json(
              {
                error:
                  "Abra o caixa da loja para registrar o Pix como pago, ou salve a despesa em aberto.",
              },
              409,
            );
          throw failure;
        }
      }
    }
    if (path === "admin/business-settings") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      if (request.method === "GET") return json(await businessProfile(db));
      if (request.method === "PATCH") {
        const settings = businessSettingsSchema.parse(await body(request));
        await db.execute(sql`WITH changed AS (
          INSERT INTO preciso.platform_settings(key,value,updated_by)
          VALUES ('business_profile',${JSON.stringify(settings)}::jsonb,${user.id}::uuid)
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()
          RETURNING key
        ) INSERT INTO preciso.audit_logs(actor_id,action,metadata)
          SELECT ${user.id}::uuid,'business.settings',jsonb_build_object('key',key) FROM changed`);
        return json(settings);
      }
    }
    if (path.startsWith("portal/"))
      return await portal(db, user, path, request, () => body(request));
    if (path.startsWith("cfo/")) {
      if (!hasCompanyPermission(user, "finance_cfo"))
        return json({ error: "Acesso restrito." }, 403);
      return await cfoRequest(
        path,
        request.method,
        user.id,
        () => body(request, path === "cfo/import" ? 4_050_000 : 65536),
        new URL(request.url).searchParams,
      );
    }
    if (path === "admin/permissions" && request.method === "POST") {
      if (user.role !== "admin") return json({ error: "Acesso restrito." }, 403);
      const change = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((v) => v.toLowerCase()),
          permissions: z.array(z.enum(companyPermissions)).optional(),
          customer_id: z.string().uuid().nullable().optional(),
        })
        .strict()
        .parse(await body(request));
      const target = (
        await db.execute(
          sql`SELECT id,full_name,email FROM preciso.users WHERE role='client' AND NOT disabled AND email=${change.email}`,
        )
      ).rows[0];
      if (!target) return json({ error: "Conta ativa não encontrada." }, 404);
      if (change.permissions) {
        const permissions = [...new Set(change.permissions)];
        // Upsert retained grants and delete only those absent in the submitted set.
        await db.execute(sql`WITH removed AS (
          DELETE FROM preciso.staff_permissions WHERE user_id=${target.id}::uuid AND permission NOT IN
          (SELECT jsonb_array_elements_text(${JSON.stringify(permissions)}::jsonb))
        ), added AS (
          INSERT INTO preciso.staff_permissions(user_id,permission)
          SELECT ${target.id}::uuid,jsonb_array_elements_text(${JSON.stringify(permissions)}::jsonb)
          ON CONFLICT DO NOTHING
        ) INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
          VALUES (${user.id}::uuid,'staff.permissions',${target.id}::uuid,${JSON.stringify({ permissions })}::jsonb)`);
      }
      if (change.customer_id !== undefined) {
        const changed = await db.execute(sql`WITH linked AS (
          UPDATE preciso.commercial_customers SET account_user_id=CASE WHEN ${change.customer_id}::uuid IS NULL THEN NULL ELSE ${target.id}::uuid END
          WHERE (${change.customer_id}::uuid IS NULL AND account_user_id=${target.id}::uuid)
          OR (id=${change.customer_id}::uuid AND (account_user_id IS NULL OR account_user_id=${target.id}::uuid)
            AND NOT EXISTS(SELECT 1 FROM preciso.commercial_customers c WHERE c.account_user_id=${target.id}::uuid AND c.id<>${change.customer_id}::uuid)) RETURNING id
        ) INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
          SELECT ${user.id}::uuid,'customer.account_link',${target.id}::uuid,jsonb_build_object('customer_id',${change.customer_id}::uuid)
          WHERE ${change.customer_id}::uuid IS NULL OR EXISTS(SELECT 1 FROM linked) RETURNING id`);
        if (!changed.rows.length)
          return json({ error: "Cliente comercial indisponível para vínculo." }, 409);
      }
      const grants = await db.execute(
        sql`SELECT permission FROM preciso.staff_permissions WHERE user_id=${target.id}::uuid ORDER BY permission`,
      );
      const link = await db.execute(
        sql`SELECT id FROM preciso.commercial_customers WHERE account_user_id=${target.id}::uuid`,
      );
      return json({
        ...target,
        permissions: grants.rows.map((row) => row.permission),
        customer_id: link.rows[0]?.id ?? null,
      });
    }
    if (path === "admin/company-requests") {
      if (!hasCompanyPermission(user, "service_requests"))
        return json({ error: "Acesso restrito." }, 403);
      const kind =
        user.role !== "admin"
          ? "service"
          : z
              .enum(["material", "service"])
              .nullable()
              .parse(new URL(request.url).searchParams.get("kind"));
      if (request.method === "GET") return json(await companyRequests(db, kind));
      if (request.method === "PATCH") {
        const input = z
          .union([
            z
              .object({ id: z.string().uuid(), status: z.enum(["new", "contacted", "closed"]) })
              .strict(),
            z
              .object({
                id: z.string().uuid(),
                proposal: proposalLine.extend({
                  unit: z.enum(["m²", "metro linear", "unidade", "diária", "projeto"]),
                }),
              })
              .strict(),
          ])
          .parse(await body(request));
        if ("proposal" in input) {
          const result = await db.execute(sql`WITH changed AS (
            UPDATE preciso.company_requests
            SET proposal=${JSON.stringify(input.proposal)}::jsonb,
                status=CASE WHEN status='new' THEN 'contacted' ELSE status END
            WHERE id=${input.id}::uuid AND kind='service' AND ${kind ?? "service"}='service'
            RETURNING id,status,proposal
          ), audited AS (
            INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
            SELECT ${user.id}::uuid,'request.proposal',id,proposal FROM changed
          ) SELECT status,proposal FROM changed`);
          return result.rows[0]
            ? json(result.rows[0])
            : json({ error: "Solicitação de serviço não encontrada." }, 404);
        }
        const result = await db.execute(sql`WITH changed AS (
          UPDATE preciso.company_requests SET status=${input.status} WHERE id=${input.id}::uuid AND (${kind}::text IS NULL OR kind=${kind}::text) RETURNING id
        ), audited AS (
          INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
          SELECT ${user.id}::uuid,'request.status',id,jsonb_build_object('status',${input.status}::text) FROM changed
        ) SELECT id FROM changed`);
        return result.rows.length
          ? json({ ok: true })
          : json({ error: "Solicitação não encontrada." }, 404);
      }
    }
    if (path.startsWith("commercial/"))
      return await commercialRequest(request, path, user, () => body(request));
    if (path === "admin/services" && request.method === "GET") {
      if (!hasCompanyPermission(user, "service_catalogue"))
        return json({ error: "Acesso restrito." }, 403);
      const result = await db.execute(
        sql`SELECT ${serviceColumns} FROM preciso.services ORDER BY sort_order`,
      );
      return json(result.rows);
    }
    if (path === "admin/service-categories") {
      if (!hasCompanyPermission(user, "service_catalogue"))
        return json({ error: "Acesso restrito." }, 403);
      if (request.method === "GET") {
        const result =
          await db.execute(sql`SELECT value->>'name' AS name FROM preciso.platform_settings
          WHERE key LIKE 'service_category:%' UNION SELECT category FROM preciso.services WHERE category<>'' ORDER BY name`);
        return json(result.rows.map(({ name }) => name));
      }
      if (request.method === "POST") {
        const { name } = z
          .object({ name: z.string().trim().min(2).max(100) })
          .strict()
          .parse(await body(request));
        const normalized = name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/\s+/g, " ");
        const result =
          await db.execute(sql`INSERT INTO preciso.platform_settings(key,value,updated_by)
          VALUES (${"service_category:" + sha256(normalized)},jsonb_build_object('name',${name}::text),${user.id}::uuid)
          ON CONFLICT (key) DO UPDATE SET key=EXCLUDED.key RETURNING value->>'name' AS name`);
        return json(result.rows[0], 201);
      }
    }
    if (path === "admin/service-rules") {
      if (!hasCompanyPermission(user, "service_catalogue"))
        return json({ error: "Acesso restrito." }, 403);
      if (request.method === "GET") {
        const result = await db.execute(
          sql`SELECT value FROM preciso.platform_settings WHERE key='service_quote_rules'`,
        );
        return json(result.rows[0]?.value ?? { visit_quantity: 500 });
      }
      if (request.method === "PATCH") {
        const data = z
          .object({ visit_quantity: z.number().finite().positive().max(10000000) })
          .strict()
          .parse(await body(request));
        const encoded = JSON.stringify(data);
        await db.execute(sql`WITH changed AS (
          INSERT INTO preciso.platform_settings(key,value,updated_by) VALUES ('service_quote_rules',${encoded}::jsonb,${user.id}::uuid)
          ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now() RETURNING value
        ) INSERT INTO preciso.audit_logs(actor_id,action,metadata)
          SELECT ${user.id}::uuid,'service.rules',value FROM changed`);
        return json(data);
      }
    }
    if (
      (path === "services" || /^services\/[0-9a-f-]{36}$/.test(path)) &&
      request.method !== "GET"
    ) {
      if (!hasCompanyPermission(user, "service_catalogue"))
        return json({ error: "Acesso restrito." }, 403);
      const input = serviceInput.parse(await body(request, 1_700_000));
      if (input.image_upload && !decodeServiceImage(input.image_upload))
        return json({ error: "Selecione uma imagem JPG ou PNG válida." }, 400);
      const value = toService(input);
      const storedImage = input.image_upload ?? value.imageUrl;
      const mutation =
        request.method === "POST" && path === "services"
          ? sql`INSERT INTO preciso.services(key,name,short_name,description,category,price_per_m2,billing_unit,
            is_active,available,image_url,availability_notes,sort_order,updated_at)
          VALUES(${value.key},${value.name},${value.shortName},${value.description},${value.category},
            ${value.pricePerM2},${value.billingUnit},${value.isActive},${value.available},${storedImage},
            ${value.availabilityNotes},${value.sortOrder},${value.updatedAt.toISOString()}) RETURNING *`
          : request.method === "PATCH" && path.startsWith("services/")
            ? sql`UPDATE preciso.services SET key=${value.key},name=${value.name},short_name=${value.shortName},
              description=${value.description},category=${value.category},price_per_m2=${value.pricePerM2},
              billing_unit=${value.billingUnit},is_active=${value.isActive},available=${value.available},
              image_url=CASE WHEN ${input.keep_image && !storedImage} THEN image_url ELSE ${storedImage} END,
              availability_notes=${value.availabilityNotes},sort_order=${value.sortOrder},
              updated_at=${value.updatedAt.toISOString()}
            WHERE id=${z.string().uuid().parse(path.split("/")[1])} RETURNING *`
            : null;
      if (!mutation) return json({ error: "Método não permitido." }, 405);
      // The write and audit record commit or roll back together.
      const result = await db.execute(sql`WITH saved AS (${mutation}), logged AS (
        INSERT INTO preciso.audit_logs(actor_id,action,target_id)
        SELECT ${user.id},'service.saved',id FROM saved
      ) SELECT ${serviceColumns} FROM saved`);
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
          .where(
            hasCompanyPermission(user, "service_requests") ? undefined : eq(quotes.userId, user.id),
          ),
      );
    }
    if (path === "quotes" && request.method === "POST") {
      const input = z
        .object({
          request_key: z.string().uuid().optional(),
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
        INSERT INTO preciso.quotes(user_id,title,notes,project_type,total,preliminary,status,request_key)
        SELECT ${user.id},${input.title},${input.notes},${input.project_type},sum(quantity*price_per_m2),true,
          CASE WHEN ${input.project_type} <> 'residencial' OR sum(quantity)>COALESCE((SELECT (value->>'visit_quantity')::numeric FROM preciso.platform_settings WHERE key='service_quote_rules'),500) OR bool_or(billing_unit='quote') THEN 'visit_required' ELSE 'requested' END,${input.request_key ?? null}::uuid
        FROM priced HAVING count(*)=${input.items.length}
        ON CONFLICT(request_key) DO NOTHING
        RETURNING *
      ), inserted_items AS (
        INSERT INTO preciso.quote_items(quote_id,service_id,environment,quantity,unit_price,billing_unit,notes)
        SELECT c.id,p.service_id,p.environment,p.quantity,p.price_per_m2,p.billing_unit,p.notes FROM created c CROSS JOIN priced p
      ), history AS (
        INSERT INTO preciso.quote_history(quote_id,actor_id,status) SELECT id,${user.id},status FROM created
      ) SELECT * FROM created UNION ALL SELECT * FROM preciso.quotes WHERE request_key=${input.request_key ?? null}::uuid AND user_id=${user.id}::uuid AND NOT EXISTS(SELECT 1 FROM created)`);
      if (!result.rows[0]) return json({ error: "Um dos serviços não está disponível." }, 409);
      return json(result.rows[0], 201);
    }
    if (path === "projects" && request.method === "GET") {
      return json(
        await db
          .select()
          .from(projects)
          .where(
            hasCompanyPermission(user, "service_projects")
              ? undefined
              : eq(projects.userId, user.id),
          ),
      );
    }
    if (/^quotes\/[0-9a-f-]{36}$/.test(path) && request.method === "GET") {
      const id = z.string().uuid().parse(path.split("/")[1]);
      const result = await db.execute(sql`SELECT q.*,
        (SELECT COALESCE(jsonb_agg(i ORDER BY i.id),'[]') FROM (
          SELECT i.id,s.name,i.environment,i.quantity,i.unit_price,i.billing_unit,i.notes,i.professional_work
          FROM preciso.quote_items i JOIN preciso.services s ON s.id=i.service_id WHERE i.quote_id=q.id
        ) i) AS items,
        (SELECT COALESCE(jsonb_agg(jsonb_build_object('status',h.status,'created_at',h.created_at) ORDER BY h.created_at,h.id),'[]')
          FROM preciso.quote_history h WHERE h.quote_id=q.id) AS history
        FROM preciso.quotes q WHERE q.id=${id}::uuid
          AND (${hasCompanyPermission(user, "service_requests")}::boolean OR q.user_id=${user.id}::uuid)`);
      return result.rows[0]
        ? json(result.rows[0])
        : json({ error: "Orçamento não encontrado." }, 404);
    }
    if (/^quotes\/[0-9a-f-]{36}$/.test(path) && request.method === "PATCH") {
      if (!hasCompanyPermission(user, "service_requests"))
        return json({ error: "Acesso restrito." }, 403);
      const id = z.string().uuid().parse(path.split("/")[1]);
      const raw = await body(request);
      const proposal = z
        .object({
          items: z
            .array(proposalLine.extend({ id: z.string().uuid() }))
            .min(1)
            .max(100),
        })
        .strict()
        .refine(
          ({ items }) =>
            items.reduce((total, item) => total + item.quantity * item.unit_price, 0) <
            90_000_000_000_000,
        )
        .safeParse(raw);
      if (proposal.success) {
        const result = await db.execute(sql`WITH input AS (
          SELECT * FROM jsonb_to_recordset(${JSON.stringify(proposal.data.items)}::jsonb)
            AS x(id uuid,quantity numeric(14,3),unit_price numeric(14,2),work text)
        ), locked AS (
          SELECT id FROM preciso.quotes WHERE id=${id}::uuid
            AND status IN ('requested','reviewing','visit_required','proposed') FOR UPDATE
        ), valid AS (
          SELECT l.id FROM locked l
          WHERE (SELECT count(DISTINCT id) FROM input)=${proposal.data.items.length}
            AND (SELECT count(*) FROM preciso.quote_items WHERE quote_id=l.id)=${proposal.data.items.length}
            AND (SELECT count(*) FROM preciso.quote_items i JOIN input x ON x.id=i.id WHERE i.quote_id=l.id)=${proposal.data.items.length}
        ), changed_items AS (
          UPDATE preciso.quote_items i SET quantity=x.quantity,unit_price=x.unit_price,professional_work=x.work
          FROM input x,valid v WHERE i.id=x.id AND i.quote_id=v.id RETURNING i.quantity,i.unit_price
        ), changed AS (
          UPDATE preciso.quotes q SET status='proposed',preliminary=false,
            total=(SELECT sum(round(quantity*unit_price,2)) FROM changed_items),updated_at=now()
          FROM valid v WHERE q.id=v.id RETURNING q.*
        ), history AS (
          INSERT INTO preciso.quote_history(quote_id,actor_id,status,notes)
          SELECT id,${user.id},status,'Proposta comercial salva' FROM changed
        ) SELECT * FROM changed`);
        return result.rows[0]
          ? json(result.rows[0])
          : json(
              { error: "O orçamento foi alterado ou já está encerrado. Atualize a lista." },
              409,
            );
      }
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
        .parse(raw);
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
      if (!hasCompanyPermission(user, "service_projects"))
        return json({ error: "Acesso restrito." }, 403);
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
      if (!hasCompanyPermission(user, "service_projects"))
        return json({ error: "Acesso restrito." }, 403);
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
      const result = hasCompanyPermission(user, "service_agenda")
        ? await db.execute(
            sql`SELECT a.*,u.full_name,u.email FROM preciso.appointments a JOIN preciso.users u ON u.id=a.user_id ORDER BY scheduled_at`,
          )
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
    if (/^appointments\/[0-9a-f-]{36}$/.test(path) && request.method === "PATCH") {
      if (!hasCompanyPermission(user, "service_agenda"))
        return json({ error: "Acesso restrito." }, 403);
      const id = z.string().uuid().parse(path.split("/")[1]);
      const change = z
        .object({
          status: z.enum(["requested", "confirmed", "completed", "cancelled"]),
          scheduled_at: z.string().datetime({ offset: true }).optional(),
        })
        .strict()
        .parse(await body(request));
      const r = await db.execute(sql`WITH changed AS (
        UPDATE preciso.appointments SET status=${change.status},scheduled_at=COALESCE(${change.scheduled_at ?? null}::timestamptz,scheduled_at)
        WHERE id=${id}::uuid RETURNING id
      ), audited AS (
        INSERT INTO preciso.audit_logs(actor_id,action,target_id,metadata)
        SELECT ${user.id}::uuid,'appointment.updated',id,${JSON.stringify(change)}::jsonb FROM changed
      ) SELECT id FROM changed`);
      return r.rows.length
        ? json({ ok: true })
        : json({ error: "Agendamento não encontrado." }, 404);
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
