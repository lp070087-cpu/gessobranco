import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SERVICES } from "./services";
import { normalizeBillingUnit } from "@/lib/estimate";

export type CatalogService = {
  id: string;
  key: string;
  name: string;
  short: string;
  description: string;
  category: string;
  image?: string;
  benefits: string[];
  pricePerM2: number | null;
  billingUnit: string;
};
export function useServiceCatalog() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await supabase
          .from("services")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (!active) return;
        if (response.error) {
          setError(true);
          return;
        }
        setServices(
          (response.data ?? []).map((row) => {
            const data = row as unknown as Record<string, unknown>;
            const reference = SERVICES.find((item) => item.key === row.key);
            return {
              id: row.id,
              key: row.key,
              name: row.name,
              short: row.short_name,
              description: row.description,
              category: row.category,
              image: row.image_url ?? reference?.image,
              benefits: reference?.benefits ?? [],
              pricePerM2:
                Number.isFinite(Number(row.price_per_m2)) && Number(row.price_per_m2) > 0
                  ? Number(row.price_per_m2)
                  : null,
              billingUnit: normalizeBillingUnit(String(data.billing_unit ?? data.unit ?? "m2")),
            };
          }),
        );
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return { services, loading, error };
}
