import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  defaultQualityColors,
  type QualityPeriod,
  type QualityPoint,
  type SalesQuality,
} from "@/lib/sales-quality";
import { database } from "./db";

const key = "commercial_quality_thresholds";
const defaults = { good: 15, medium: 5, colors: defaultQualityColors };
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const thresholdsSchema = z
  .object({
    good: z.number().finite().min(0).max(100),
    medium: z.number().finite().min(0).max(100),
    colors: z
      .object({ good: color, medium: color, bad: color })
      .strict()
      .default(defaultQualityColors),
  })
  .strict()
  .refine(({ good, medium }) => good > medium, "O limite de Bom deve ser maior que o de Médio.");
const periodSchema = z.object({ start: z.string().date(), end: z.string().date() });
const DAY = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);

export async function saveSalesQuality(actorId: string, input: unknown) {
  const thresholds = thresholdsSchema.parse(input);
  await database().execute(sql`INSERT INTO preciso.platform_settings(key,value,updated_by)
    VALUES (${key},${JSON.stringify(thresholds)}::jsonb,${actorId}::uuid)
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=now()`);
  return thresholds;
}

function timeline(start: string, end: string, granularity: QualityPeriod) {
  const current = new Date(start + "T00:00:00Z");
  if (granularity !== "day") current.setUTCDate(1);
  if (granularity === "year") current.setUTCMonth(0);
  const first = iso(current);
  if (granularity === "year" && Number(end.slice(0, 4)) - Number(start.slice(0, 4)) > 100)
    return [first, end.slice(0, 4) + "-01-01"];
  const keys: string[] = [];
  const endTime = Date.parse(end);
  while (current.getTime() <= endTime) {
    keys.push(iso(current));
    if (granularity === "day") current.setUTCDate(current.getUTCDate() + 1);
    if (granularity === "month") current.setUTCMonth(current.getUTCMonth() + 1);
    if (granularity === "year") current.setUTCFullYear(current.getUTCFullYear() + 1);
  }
  return keys;
}

export async function salesQuality(url: URL): Promise<SalesQuality | null> {
  const { start, end } = periodSchema.parse({
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
  });
  if (end < start) return null;
  const days = (Date.parse(end) - Date.parse(start)) / DAY;
  const granularity: QualityPeriod = days <= 92 ? "day" : days <= 1096 ? "month" : "year";
  const db = database();
  const settings = await db.execute(
    sql`SELECT value FROM preciso.platform_settings WHERE key=${key}`,
  );
  const parsed = thresholdsSchema.safeParse(settings.rows[0]?.value);
  const thresholds = parsed.success ? parsed.data : defaults;
  const result = await db.execute(sql`WITH figures AS (
    SELECT date_trunc(${granularity}::text, created_at AT TIME ZONE 'America/Recife')::date AS bucket,
      contribution, revenue-returned_revenue AS net_revenue,
      partial OR contribution IS NULL AS incomplete
    FROM preciso.commercial_results
    WHERE status <> 'cancelled'
      AND (created_at AT TIME ZONE 'America/Recife')::date BETWEEN ${start}::date AND ${end}::date
  ), classified AS (
    SELECT bucket, contribution, CASE
      WHEN incomplete THEN 'pending'
      WHEN contribution < 0 THEN 'bad'
      WHEN COALESCE(100 * contribution / NULLIF(net_revenue,0),0) >= ${thresholds.good}::numeric THEN 'good'
      WHEN COALESCE(100 * contribution / NULLIF(net_revenue,0),0) >= ${thresholds.medium}::numeric THEN 'medium'
      ELSE 'bad' END AS level
    FROM figures
  )
  SELECT bucket::text AS day,
    round(sum(contribution) FILTER (WHERE level='good'),2) AS good,
    round(sum(contribution) FILTER (WHERE level='medium'),2) AS medium,
    round(sum(contribution) FILTER (WHERE level='bad'),2) AS bad,
    count(*) FILTER (WHERE level <> 'pending') AS sales,
    count(*) FILTER (WHERE level='pending') AS pending
  FROM classified GROUP BY bucket ORDER BY bucket`);
  const records = new Map(result.rows.map((row) => [String(row.day), row]));
  const buckets = [...new Set([...timeline(start, end, granularity), ...records.keys()])].sort();
  const money = (value: unknown) => (value == null ? null : Number(value));
  const points: QualityPoint[] = buckets.map((day) => {
    const row = records.get(day);
    return { day, good: money(row?.good), medium: money(row?.medium), bad: money(row?.bad) };
  });
  return {
    thresholds,
    points,
    granularity,
    sales: result.rows.reduce((sum, row) => sum + Number(row.sales), 0),
    pending: result.rows.reduce((sum, row) => sum + Number(row.pending), 0),
  };
}
