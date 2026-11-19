export type QualityThresholds = { good: number; medium: number };
export type QualityPeriod = "day" | "month" | "year";
export type QualityPoint = {
  day: string;
  good: number | null;
  medium: number | null;
  bad: number | null;
};
export type SalesQuality = {
  thresholds: QualityThresholds;
  points: QualityPoint[];
  granularity: QualityPeriod;
  sales: number;
  pending: number;
};

export function qualityAxis(points: QualityPoint[]) {
  let min = 0;
  let max = 0;
  for (const { good, medium, bad } of points) {
    min = Math.min(min, good ?? 0, medium ?? 0, bad ?? 0);
    max = Math.max(max, good ?? 0, medium ?? 0, bad ?? 0);
  }
  if (min === 0 && max === 0) return [0, 500, 1000, 1500, 2000];
  const approx = Math.max((max - min) / 4, 0.01);
  const scale = 10 ** Math.floor(Math.log10(approx));
  const step = ([1, 2, 2.5, 5, 10].find((value) => value * scale >= approx) ?? 10) * scale;
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  return Array.from({ length: last - first + 1 }, (_, index) =>
    Number(((first + index) * step).toFixed(2)),
  );
}

export function qualityLabel(day: string, granularity: QualityPeriod, full = false) {
  const [year, month, date] = day.split("-");
  if (granularity === "year") return year;
  if (granularity === "month") return `${month}/${year}`;
  return `${date}/${month}${full ? "/" + year : ""}`;
}
