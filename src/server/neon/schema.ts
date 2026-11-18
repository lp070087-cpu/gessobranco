import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const preciso = pgSchema("preciso");
export const users = preciso.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("client"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const sessions = preciso.table("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const services = preciso.table("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull().default(""),
  category: text("category").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  availabilityNotes: text("availability_notes").notNull().default(""),
  description: text("description").notNull().default(""),
  pricePerM2: numeric("price_per_m2", { precision: 14, scale: 2 }).notNull().default("0"),
  billingUnit: text("billing_unit").notNull().default("m2"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  available: boolean("available").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const quotes = preciso.table("quotes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  companyId: uuid("company_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("requested"),
  notes: text("notes").notNull().default(""),
  projectType: text("project_type").notNull().default("residencial"),
  preliminary: boolean("preliminary").notNull().default(true),
  total: numeric("total", { precision: 16, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const projects = preciso.table("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  quoteId: uuid("quote_id")
    .notNull()
    .unique()
    .references(() => quotes.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  companyId: uuid("company_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("planned"),
  progress: integer("progress").notNull().default(0),
  responsibleId: uuid("responsible_id"),
});
export const platformSettings = preciso.table("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
