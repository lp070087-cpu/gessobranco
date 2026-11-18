import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Import this module only from server entrypoints. DATABASE_URL is never a VITE_* variable.
export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("NEON_NOT_CONFIGURED");
  return drizzle(neon(url), { schema });
}
