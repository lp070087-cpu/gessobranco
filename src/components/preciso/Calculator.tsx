import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { AlertCircle, ArrowRight, Building2, Camera, Minus, Plus, Ruler, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ScheduleDialog } from "./ScheduleDialog";
import { estimateProject, measuredArea } from "@/lib/estimate";
import { commercialFetch } from "@/lib/commercial-client";
import { MAX_PHOTOS, saveVisitDraft, shrinkPhoto } from "@/lib/visit-draft";

type PriceService = {
  id: string;
  name: string;
  short_name: string;
  price_per_m2: number;
  billing_unit?: string;
  unit?: string;
};
type Scope = "ambiente" | "casa" | "apartamento" | "predio" | "comercial" | "fachada";
type Count = { key: string; label: string; short: string; start: number; min: number };
type ScopeConfig = {
  label: string;
  counts: Count[];
  placeTitle: string;
  places: string[];
  single?: boolean;
  whole?: string;
  works: string[];
  measures: boolean;
  approxArea: boolean;
  photos: boolean;
  note: string;
};
const WORKS = [
  "Forro / teto",
  "Sanca",
  "Parede ou divisória",
  "Moldura e roda-teto",
  "Reparo ou reforma",
  "Luz embutida",
];
const ROOMS = [
  "Sala",
  "Quartos",
  "Cozinha",
  "Banheiros",
  "Varanda",
  "Corredor",
  "Área de serviço",
  "Garagem",
];
const SCOPES: Record<Scope, ScopeConfig> = {
  ambiente: {
    label: "Um cômodo ou detalhe",
    counts: [],
    placeTitle: "Qual cômodo?",
    places: [
      "Sala",
      "Quarto",
      "Cozinha",
      "Banheiro",
      "Varanda",
      "Corredor",
      "Área de serviço",
      "Garagem",
      "Outro",
    ],
    single: true,
    works: WORKS,
    measures: true,
    approxArea: false,
    photos: true,
    note: "Mande fotos do local: o profissional já chega sabendo o que vai encontrar.",
  },
  casa: {
    label: "Casa completa",
    counts: [
      { key: "comodos", label: "Quantos cômodos tem a casa?", short: "Cômodos", start: 5, min: 1 },
    ],
    placeTitle: "Onde vai ser o serviço?",
    places: ROOMS,
    whole: "Casa toda",
    works: WORKS,
    measures: false,
    approxArea: true,
    photos: false,
    note: "Casa completa não precisa de foto nem de medida: na visita o profissional vê tudo no local.",
  },
  apartamento: {
    label: "Apartamento",
    counts: [
      {
        key: "comodos",
        label: "Quantos cômodos tem o apartamento?",
        short: "Cômodos",
        start: 4,
        min: 1,
      },
    ],
    placeTitle: "Onde vai ser o serviço?",
    places: ROOMS.filter((item) => item !== "Garagem"),
    whole: "Apartamento todo",
    works: WORKS,
    measures: false,
    approxArea: true,
    photos: false,
    note: "Não precisa de foto nem de medida: na visita o profissional vê tudo no local.",
  },
  predio: {
    label: "Edifício ou condomínio",
    counts: [
      { key: "andares", label: "Quantos andares?", short: "Andares", start: 4, min: 1 },
      {
        key: "unidades",
        label: "Quantos apartamentos ou salas?",
        short: "Unidades",
        start: 8,
        min: 0,
      },
    ],
    placeTitle: "Onde vai ser o serviço?",
    places: [
      "Hall de entrada",
      "Corredores",
      "Escadas",
      "Garagem",
      "Áreas comuns",
      "Dentro das unidades",
    ],
    whole: "Prédio todo",
    works: WORKS,
    measures: false,
    approxArea: true,
    photos: false,
    note: "Obra grande: o valor sai depois da visita técnica.",
  },
  comercial: {
    label: "Loja, escritório ou comércio",
    counts: [
      { key: "ambientes", label: "Quantos ambientes?", short: "Ambientes", start: 2, min: 1 },
    ],
    placeTitle: "Que tipo de lugar?",
    places: [
      "Loja",
      "Escritório",
      "Clínica ou consultório",
      "Restaurante",
      "Salão",
      "Galpão",
      "Outro",
    ],
    single: true,
    works: WORKS,
    measures: false,
    approxArea: true,
    photos: true,
    note: "Se puder, mande fotos do espaço para o profissional já ir preparado.",
  },
  fachada: {
    label: "Fachada ou trabalho em altura",
    counts: [
      {
        key: "andares",
        label: "Quantos andares tem a fachada?",
        short: "Andares",
        start: 2,
        min: 1,
      },
    ],
    placeTitle: "Onde fica?",
    places: ["Casa", "Prédio", "Comércio"],
    single: true,
    works: ["Moldura de fachada", "Marquise ou beiral", "Reparo ou reforma", "Outro"],
    measures: false,
    approxArea: true,
    photos: true,
    note: "Mande fotos da fachada: ajuda a planejar andaime e material.",
  },
};
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Calculator() {
  const [height, setHeight] = useState("3");
  const [width, setWidth] = useState("2");
  const [scope, setScope] = useState<Scope>("ambiente");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [places, setPlaces] = useState<string[]>([]);
  const [works, setWorks] = useState<string[]>([]);
  const [approx, setApprox] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const config = SCOPES[scope];
  const [serviceId, setServiceId] = useState("");
  const [services, setServices] = useState<PriceService[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

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

  function changeScope(next: Scope) {
    setScope(next);
    setWorks([]);
    setStep(1);
    setCounts({});
    setPlaces([]);
    setApprox("");
    if (!SCOPES[next].photos) setPhotos([]);
  }
  function togglePlace(place: string) {
    if (config.single) {
      setPlaces([place]);
      return setStep(step + 1);
    }
    if (place === config.whole) return setPlaces(places.includes(place) ? [] : [place]);
    const rest = places.filter((item) => item !== config.whole);
    setPlaces(rest.includes(place) ? rest.filter((item) => item !== place) : [...rest, place]);
  }
  function toggleWork(work: string) {
    setWorks(works.includes(work) ? works.filter((item) => item !== work) : [...works, work]);
  }
  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])].slice(0, MAX_PHOTOS - photos.length);
    event.target.value = "";
    if (!files.length) return;
    setPhotoBusy(true);
    setPhotoError("");
    const next: string[] = [];
    for (const file of files) {
      try {
        next.push(await shrinkPhoto(file));
      } catch {
        setPhotoError("Uma das fotos não abriu. Tente tirar de novo.");
      }
    }
    setPhotos((current) => [...current, ...next].slice(0, MAX_PHOTOS));
    setPhotoBusy(false);
  }
  const count = (item: Count) => counts[item.key] ?? item.start;

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
  const summary = [
    `Tipo: ${config.label}`,
    ...config.counts.map((item) => `${item.short}: ${count(item)}`),
    places.length ? `${config.placeTitle.replace("?", "")}: ${places.join(", ")}` : "",
    works.length ? `Serviço: ${works.join(", ")}` : "",
    config.measures && area > 0
      ? `Medidas: ${height} × ${width} m (${area.toLocaleString("pt-BR")} m²)`
      : "",
    config.approxArea && Number(approx) > 0 ? `Tamanho aproximado: ${approx} m²` : "",
    selected && config.measures ? `Referência: ${selected.name}` : "",
    photos.length ? `Fotos enviadas: ${photos.length}` : "",
  ].filter(Boolean);
  function requestVisit() {
    saveVisitDraft({ summary: summary.join("\n"), photos: config.photos ? photos : [] });
    setOpen(true);
  }

  type StepId = "tipo" | "contagem" | "lugar" | "servico" | "medidas" | "tamanho" | "fotos" | "fim";
  const placeFirst = config.single;
  const steps: StepId[] = [
    "tipo",
    ...(placeFirst ? (["lugar"] as StepId[]) : []),
    ...(config.counts.length ? (["contagem"] as StepId[]) : []),
    ...(placeFirst ? [] : (["lugar"] as StepId[])),
    "servico",
    ...(config.measures ? (["medidas"] as StepId[]) : []),
    ...(config.approxArea ? (["tamanho"] as StepId[]) : []),
    ...(config.photos ? (["fotos"] as StepId[]) : []),
    "fim",
  ];
  const current = steps[Math.min(step, steps.length - 1)];
  const last = steps.length - 1;
  const canGo =
    current === "lugar" ? places.length > 0 : current === "servico" ? works.length > 0 : true;
  const next = () => setStep(Math.min(last, step + 1));
  const back = () => setStep(Math.max(0, step - 1));
  const answered = [
    step > 0 ? config.label : "",
    ...(steps.indexOf("contagem") < step && steps.includes("contagem")
      ? config.counts.map((item) => `${count(item)} ${item.short.toLowerCase()}`)
      : []),
    steps.indexOf("lugar") < step ? places.join(", ") : "",
    steps.indexOf("servico") < step ? works.join(", ") : "",
    steps.includes("medidas") && steps.indexOf("medidas") < step
      ? `${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`
      : "",
  ].filter(Boolean);

  return (
    <>
      <div id="orcamento" className="public-calculator quote-wizard p-6 sm:p-8 reveal">
        <div className="flex justify-between items-start gap-4 mb-5">
          <div>
            <p className="eyebrow">Planeje seu investimento</p>
            <h2 className="text-2xl font-semibold tracking-tight mt-2">Seu projeto começa aqui.</h2>
          </div>
          <Ruler className="size-5 text-accent shrink-0" />
        </div>
        <div className="quote-progress" aria-hidden="true">
          {steps.map((id, index) => (
            <span key={id} className={index <= step ? "on" : undefined} />
          ))}
        </div>
        <p className="quote-step-count">
          Etapa {Math.min(step, last) + 1} de {steps.length}
        </p>
        {answered.length > 0 && (
          <p className="quote-answered">
            {answered.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </p>
        )}

        <div className="quote-step" key={current + scope}>
          {current === "tipo" && (
            <fieldset className="quote-options">
              <legend>Que tipo de serviço você precisa?</legend>
              {(Object.keys(SCOPES) as Scope[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={scope === key && step > 0}
                  onClick={() => changeScope(key)}
                >
                  <span>{SCOPES[key].label}</span>
                  <ArrowRight className="size-4" />
                </button>
              ))}
            </fieldset>
          )}

          {current === "contagem" && (
            <div>
              {config.counts.map((item) => (
                <div key={item.key} className="quote-count">
                  <span>{item.label}</span>
                  <div>
                    <button
                      type="button"
                      aria-label={`Menos — ${item.label}`}
                      disabled={count(item) <= item.min}
                      onClick={() => setCounts({ ...counts, [item.key]: count(item) - 1 })}
                    >
                      <Minus className="size-4" />
                    </button>
                    <strong aria-live="polite">{count(item)}</strong>
                    <button
                      type="button"
                      aria-label={`Mais — ${item.label}`}
                      disabled={count(item) >= 500}
                      onClick={() => setCounts({ ...counts, [item.key]: count(item) + 1 })}
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {current === "lugar" && (
            <fieldset className="quote-chips">
              <legend>{config.placeTitle}</legend>
              {!config.single && <p className="quote-hint">Pode marcar mais de um.</p>}
              <div>
                {[...(config.whole ? [config.whole] : []), ...config.places].map((place) => (
                  <button
                    key={place}
                    type="button"
                    aria-pressed={places.includes(place)}
                    className={place === config.whole ? "whole" : undefined}
                    onClick={() => togglePlace(place)}
                  >
                    {place}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {current === "servico" && (
            <fieldset className="quote-chips">
              <legend>O que você quer fazer?</legend>
              <p className="quote-hint">Pode marcar mais de um.</p>
              <div>
                {config.works.map((work) => (
                  <button
                    key={work}
                    type="button"
                    aria-pressed={works.includes(work)}
                    onClick={() => toggleWork(work)}
                  >
                    {work}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {current === "medidas" && (
            <div>
              <p className="quote-question">Qual o tamanho mais ou menos?</p>
              <div className="grid grid-cols-2 gap-4 mb-4">
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
              <div className="flex justify-between text-xs text-muted-foreground border-b border-border pb-4 mb-4">
                <span>Área informada</span>
                <span className="font-mono text-foreground">
                  {area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
                </span>
              </div>
              {loading ? (
                <div
                  className="h-12 rounded-xl bg-muted animate-pulse"
                  role="status"
                  aria-label="Carregando serviços"
                />
              ) : !failed && services.length > 0 ? (
                <label className="block text-xs text-muted-foreground">
                  Serviço para a estimativa
                  <select
                    id="calc-service"
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="block w-full bg-background border border-border rounded-xl p-3 text-base mt-2"
                  >
                    {services.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          )}

          {current === "tamanho" && (
            <label className="block">
              <span className="quote-question">Sabe o tamanho aproximado? (opcional)</span>
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="1"
                placeholder="Em m². Se não souber, deixe em branco"
                value={approx}
                onChange={(e) => setApprox(e.target.value)}
                className="block w-full bg-background border border-border rounded-xl p-3 text-base mt-2"
              />
              <p className="quote-note mt-4">{config.note}</p>
            </label>
          )}

          {current === "fotos" && (
            <div className="quote-photos">
              <p className="quote-question">
                Fotos do local <small>(até {MAX_PHOTOS}, opcional)</small>
              </p>
              <div>
                {photos.map((photo, index) => (
                  <figure key={index}>
                    <img src={photo} alt={`Foto ${index + 1} do local`} />
                    <button
                      type="button"
                      aria-label={`Tirar foto ${index + 1}`}
                      onClick={() => setPhotos(photos.filter((_, item) => item !== index))}
                    >
                      <X className="size-3.5" />
                    </button>
                  </figure>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <label className={photoBusy ? "busy" : undefined}>
                    <Camera className="size-5" />
                    <span>{photoBusy ? "Preparando…" : "Adicionar"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={photoBusy}
                      onChange={(event) => void addPhotos(event)}
                    />
                  </label>
                )}
              </div>
              {photoError && (
                <p className="quote-error" role="alert">
                  {photoError}
                </p>
              )}
              <small>{config.note}</small>
            </div>
          )}

          {current === "fim" && (
            <div>
              <div className="rounded-2xl border border-accent/15 bg-accent/5 p-5">
                <p className="eyebrow">
                  {custom ? "Proposta personalizada" : "Estimativa preliminar"}
                </p>
                <p
                  aria-live="polite"
                  className="text-3xl sm:text-4xl tracking-tight font-semibold mt-2"
                >
                  {custom ? "Vamos avaliar juntos." : money(total)}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-3">
                  {custom
                    ? "O valor sai depois da visita técnica, quando o profissional vê o local, as medidas e o material."
                    : `Referência de ${money(Number(selected?.price_per_m2))}/m². Sujeita à validação das medidas, condições da superfície e escopo na visita técnica.`}
                </p>
              </div>
              <ul className="quote-summary">
                {summary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <button type="button" onClick={requestVisit} className="gold-button w-full mt-5">
                {custom ? <Building2 className="size-4" /> : null}Solicitar visita técnica
                <ArrowRight className="size-4" />
              </button>
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                A simulação não substitui a proposta técnica definitiva.
              </p>
            </div>
          )}
        </div>

        {step > 0 && current !== "fim" && (
          <div className="quote-nav">
            <button type="button" className="quote-back" onClick={back}>
              Voltar
            </button>
            <button type="button" className="gold-button" disabled={!canGo} onClick={next}>
              {current === "fotos" || current === "tamanho" ? "Ver resultado" : "Continuar"}
              <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {current === "fim" && (
          <button type="button" className="quote-back quote-restart" onClick={back}>
            Voltar e mudar respostas
          </button>
        )}
      </div>
      <ScheduleDialog
        open={open}
        onOpenChange={setOpen}
        context={{
          service: config.label,
          area: config.measures ? area : undefined,
          price: custom ? undefined : total,
          details: summary.slice(1),
        }}
      />
    </>
  );
}
