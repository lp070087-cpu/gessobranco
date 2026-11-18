import { neon } from "@neondatabase/serverless";
import { randomBytes, scrypt as nodeScrypt } from "node:crypto";
import { promisify } from "node:util";
const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD || !ADMIN_NAME)
  throw new Error(
    "Defina DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_NAME somente no terminal seguro.",
  );
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL) ||
  ADMIN_PASSWORD.length < 16 ||
  ADMIN_PASSWORD.length > 128 ||
  ADMIN_NAME.length < 2
)
  throw new Error("Dados inválidos; a senha inicial exige ao menos 16 caracteres.");
const salt = randomBytes(16).toString("hex");
const key = await promisify(nodeScrypt)(ADMIN_PASSWORD, salt, 64);
const passwordHash = `scrypt:${salt}:${key.toString("hex")}`;
const sql = neon(DATABASE_URL);
// Advisory transaction lock serializes concurrent bootstrap invocations. Never promotes an existing customer.
await sql.transaction([
  sql`SELECT pg_advisory_xact_lock(741928351)`,
  sql`INSERT INTO preciso.users(email,full_name,password_hash,role)
      SELECT ${ADMIN_EMAIL.trim().toLowerCase()},${ADMIN_NAME},${passwordHash},'admin'
      WHERE NOT EXISTS (SELECT 1 FROM preciso.users WHERE role='admin')`,
]);
console.log("Provisionamento inicial verificado. Administrador já existente foi preservado.");
