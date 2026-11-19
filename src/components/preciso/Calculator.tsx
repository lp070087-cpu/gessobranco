import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Building2, Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScheduleDialog } from "./ScheduleDialog";
import { estimateProject, measuredArea } from "@/lib/estimate";
import { commercialFetch } from "@/lib/commercial-client";

type PriceService = {
  id: string;
  name: string;
  short_name: string;
  price_per_m2: number;
  billing_unit?: string;
  unit?: string;
};
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Calculator() {
  const [height, setHeight] = useState("3");
  const [width, setWidth] = useState("2");
  const [scope, setScope] = useState("ambiente");
  const [serviceId, setServiceId] = useState("");
  const [services, setServices] = useState<PriceService[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const local = await commercialFetch<
          {
            id: string;
            name: string;
            shortName: string;
            pricePerM2: string;
            billingUnit: string;
            available: boolean;
          }[]
        >("services").catch(() => null);
        if (!mounted) return;
        if (local && (local.length > 0 || !import.meta.env.VITE_SUPABASE_URL)) {
          const next: PriceService[] = local
            .filter((item) => item.available)
            .map((item) => ({
              id: item.id,
              name: item.name,
              short_name: item.shortName,
              price_per_m2: Number(item.pricePerM2),
              billing_unit: item.billingUnit,
            }));
          setServices(next);
          setServiceId(next[0]?.id ?? "");
          return;
        }
        const { data, error } = await supabase
          .from("services")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", { ascending: true });
        if (!mounted) return;
        if (error) {
          setFailed(true);
          return;
        }
        const next = (data ?? []) as unknown as PriceService[];
        setServices(next);
        setServiceId(next[0]?.id ?? "");
      } catch {
        if (mounted) setFailed(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const area = useMemo(() => {
    return measuredArea(Number(height), Number(width));
  }, [height, width]);
  const selected = services.find((s) => s.id === serviceId);
  const unit = selected?.billing_unit ?? selected?.unit ?? "m²";
  const estimate = estimateProject(
    [
      {
        environment: "Área informada",
        unit,
        quantity: area,
        unitPrice: Number(selected?.price_per_m2 ?? 0),
      },
    ],
    scope,
  );
  const custom = !estimate.valid || estimate.needsVisit || !["m²", "m2"].includes(unit);
  const total = estimate.total ?? 0;

  return (
    <>
      <div id="orcamento" className="public-calculator p-6 sm:p-8 reveal">
        <div className="flex justify-between items-start gap-4 mb-7">
          <div>
            <p className="eyebrow">Planeje seu investimento</p>
            <h2 className="text-2xl font-semibold tracking-tight mt-2">Seu projeto começa aqui.</h2>
          </div>
          <Ruler className="size-5 text-accent shrink-0" />
        </div>
        <label htmlFor="project-scope" className="block text-xs text-muted-foreground mb-2">
          Tipo de projeto
        </label>
        <select
          id="project-scope"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full rounded-xl bg-background border border-border p-3 text-sm mb-5"
        >
          <option value="ambiente">Parede ou ambiente</option>
          <option value="casa">Casa completa</option>
          <option value="predio">Edifício ou condomínio</option>
          <option value="comercial">Empreendimento comercial</option>
          <option value="fachada">Fachada ou trabalho em altura</option>
        </select>
        <div className="grid grid-cols-2 gap-4 mb-5">
          {[
            { id: "calc-height", label: "Altura (m)", value: height, set: setHeight },
            { id: "calc-width", label: "Largura (m)", value: width, set: setWidth },
          ].map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="block text-xs text-muted-foreground mb-2">
                {field.label}
              </label>
              <input
                id={field.id}
                inputMode="decimal"
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                className="w-full min-w-0 bg-background border border-border rounded-xl p-4 font-mono text-xl focus:border-accent outline-none"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground border-b border-border pb-4 mb-5">
          <span>Área informada</span>
          <span className="font-mono text-foreground">
            {area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
          </span>
        </div>
        <label htmlFor="calc-service" className="block text-xs text-muted-foreground mb-2">
          Serviço
        </label>
        {loading ? (
          <div
            className="h-12 rounded-xl bg-muted animate-pulse"
            role="status"
            aria-label="Carregando serviços"
          />
        ) : failed || !services.length ? (
          <div className="flex gap-2 text-sm text-muted-foreground border border-border rounded-xl p-4">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            {failed
              ? "Não foi possível consultar os preços. Solicite uma avaliação técnica."
              : "Os serviços estão sendo preparados. Solicite uma avaliação técnica."}
          </div>
        ) : (
          <select
            id="calc-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full bg-background border border-border rounded-xl p-3 text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <div className="mt-6 rounded-2xl border border-accent/15 bg-accent/5 p-5">
          <p className="eyebrow">{custom ? "Proposta personalizada" : "Estimativa preliminar"}</p>
          <p aria-live="polite" className="text-3xl sm:text-4xl tracking-tight font-semibold mt-2">
            {custom ? "Vamos avaliar juntos." : money(total)}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-3">
            {custom
              ? "Obras completas, fachadas e grandes áreas exigem levantamento técnico, logística, etapas e materiais. O valor será definido após avaliação."
              : `Referência de ${money(Number(selected?.price_per_m2))}/m². Sujeita à validação das medidas, condições da superfície e escopo na visita técnica.`}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="gold-button w-full mt-5">
          {custom ? <Building2 className="size-4" /> : null}Solicitar visita técnica
          <ArrowRight className="size-4" />
        </button>
        <p className="text-[11px] text-muted-foreground text-center mt-3">
          A simulação não substitui a proposta técnica definitiva.
        </p>
      </div>
      <ScheduleDialog
        open={open}
        onOpenChange={setOpen}
        context={{
          service: selected?.name ?? "Orçamento personalizado",
          area,
          price: custom ? undefined : total,
        }}
      />
    </>
  );
}
