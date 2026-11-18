import { useEffect, useMemo, useState, useRef } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Ruler,
  PaintBucket,
  Sparkles,
  Check,
  Calendar as CalendarIcon,
  Save,
  RefreshCw,
  ImagePlus,
  X,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SERVICES as LOCAL_SERVICES } from "@/components/preciso/services";
import { toast } from "sonner";
import { estimateProject, measuredArea } from "@/lib/estimate";

export const Route = createFileRoute("/_app/calcular")({
  head: () => ({
    meta: [
      { title: "Calculadora — Ouro Branco" },
      { name: "description", content: "Calcule sua estimativa de orçamento em segundos." },
    ],
  }),
  component: CalcWizard,
});

type DbService = {
  id: string;
  key: string;
  name: string;
  short_name: string;
  description: string;
  category: string;
  price_per_m2: number;
  image_url: string | null;
  billing_unit?: string;
  unit?: string;
};

function localImageFor(key: string): string | undefined {
  return LOCAL_SERVICES.find((s) => s.key === key)?.image;
}

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CalcWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [altura, setAltura] = useState("3");
  const [largura, setLargura] = useState("2");
  const [projectScope, setProjectScope] = useState("ambiente");
  const [measureMode, setMeasureMode] = useState("medidas");
  const [totalArea, setTotalArea] = useState("");
  const [environmentName, setEnvironmentName] = useState("Ambiente principal");
  const [extraRooms, setExtraRooms] = useState<{ name: string; area: string }[]>([]);
  const [services, setServices] = useState<DbService[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [extraServiceIds, setExtraServiceIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calcAnim, setCalcAnim] = useState(false);
  // Schedule action navigates to /agendar
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (!error && data) {
        setServices(data as unknown as DbService[]);
      }
      setLoadingServices(false);
    })();
  }, []);

  const aNum = parseFloat(altura);
  const lNum = parseFloat(largura);
  const primaryArea = measureMode === "total" ? Number(totalArea) : measuredArea(aNum, lNum);
  const area = useMemo(() => {
    if (!Number.isFinite(primaryArea) || primaryArea <= 0 || primaryArea > 10_000_000) return 0;
    if (
      extraRooms.some(
        (room) =>
          !room.name.trim() || !Number.isFinite(Number(room.area)) || Number(room.area) <= 0,
      )
    )
      return 0;
    const sum = primaryArea + extraRooms.reduce((total, room) => total + Number(room.area), 0);
    return sum <= 10_000_000 ? sum : 0;
  }, [primaryArea, extraRooms]);

  const validMeasures = area > 0 && environmentName.trim().length > 0;
  const selected = services.find((s) => s.id === serviceId) ?? null;
  const chosenServices = services.filter(
    (s) => s.id === serviceId || extraServiceIds.includes(s.id),
  );
  const billingUnit = selected?.billing_unit ?? selected?.unit ?? "m²";
  const estimate = estimateProject(
    chosenServices.map((service) => ({
      environment: environmentName,
      unit: service.billing_unit ?? service.unit ?? "m²",
      quantity: area,
      unitPrice: Number(service.price_per_m2),
    })),
    projectScope,
  );
  const requiresTechnicalQuote =
    estimate.needsVisit ||
    !estimate.valid ||
    chosenServices.some(
      (service) => !["m²", "m2"].includes(service.billing_unit ?? service.unit ?? "m²"),
    );
  const total = estimate.total ?? 0;
  const combinedRate = chosenServices.reduce(
    (sum, service) => sum + Number(service.price_per_m2),
    0,
  );

  const goStep = (n: 1 | 2 | 3) => {
    if (n === 2 && !validMeasures) {
      toast.error("Informe medidas válidas.");
      return;
    }
    if (n === 3 && !selected) {
      toast.error("Escolha um acabamento.");
      return;
    }
    if (n === 3) {
      setCalcAnim(true);
      setTimeout(() => setCalcAnim(false), 700);
    }
    setStep(n);
  };

  const handlePhoto = (file: File | null) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use uma foto JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Imagem grande demais (máx 10MB).");
      return;
    }
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photo || !user) return null;
    const ext = photo.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("quote-photos").upload(path, photo, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      throw new Error(
        "Não foi possível anexar a foto. O orçamento não foi salvo; tente novamente.",
      );
    }
    return path;
  };

  const handleSave = async () => {
    if (!user || !selected) return;
    setSaving(true);
    try {
      const photoPath = await uploadPhoto();
      const { error } = await supabase.from("quotes").insert({
        user_id: user.id,
        service_id: selected.id,
        service_name: chosenServices.map((service) => service.name).join(" + "),
        height: measureMode === "medidas" ? aNum : 1,
        width: measureMode === "medidas" ? lNum : primaryArea,
        area,
        price_per_m2: requiresTechnicalQuote ? 0 : combinedRate,
        estimated_total: total,
        notes: [
          `Tipo de projeto: ${projectScope}. ${requiresTechnicalQuote ? "SOLICITAÇÃO DE PROPOSTA TÉCNICA — valor a definir após visita; não é proposta de R$ 0." : "Estimativa preliminar sujeita à visita técnica."}`,
          `Ambientes: ${environmentName}: ${primaryArea} m²${extraRooms.map((room) => `; ${room.name}: ${room.area} m²`).join("")}.`,
          `Serviços aplicados à área informada: ${chosenServices.map((service) => `${service.name} (${service.billing_unit ?? service.unit ?? "m²"})`).join("; ")}.`,
          notes,
        ]
          .filter(Boolean)
          .join("\n"),
        photo_url: photoPath,
        status: requiresTechnicalQuote ? "aguardando_visita" : "estimado",
      });
      if (error) throw error;
      toast.success(
        requiresTechnicalQuote
          ? "Solicitação técnica salva. Agende uma visita para definir a proposta."
          : "Orçamento salvo no histórico",
      );
      navigate({ to: "/orcamentos" });
    } catch (e) {
      toast.error("Erro ao salvar", {
        description: e instanceof Error ? e.message : "Tente novamente",
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setStep(1);
    setServiceId(null);
    setExtraServiceIds([]);
    setExtraRooms([]);
    setPhoto(null);
    setPhotoPreview(null);
    setNotes("");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6 animate-fade-in-up">
      <Link
        to="/home"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Voltar
      </Link>

      {/* Stepper */}
      <Stepper step={step} />

      {/* STEP 1 — MEASURES */}
      {step === 1 && (
        <section className="bg-surface border border-border rounded-3xl p-6 md:p-10 shadow-2xl shadow-black/40 animate-slide-up">
          <div className="space-y-1 mb-8">
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent flex items-center gap-2">
              <Ruler className="size-3.5" /> Passo 1
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter">
              Calcule seu orçamento
            </h1>
            <p className="text-muted-foreground">Informe as medidas da área.</p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 mb-5">
            <label className="text-xs text-muted-foreground space-y-2">
              <span className="block">Tipo de projeto</span>
              <select
                value={projectScope}
                onChange={(e) => setProjectScope(e.target.value)}
                className="w-full border border-border rounded-xl bg-background px-4 py-3 text-foreground"
              >
                <option value="ambiente">Parede ou ambiente</option>
                <option value="casa">Casa completa</option>
                <option value="predio">Edifício ou condomínio</option>
                <option value="comercial">Empreendimento comercial</option>
                <option value="fachada">Fachada ou trabalho em altura</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground space-y-2">
              <span className="block">Como deseja medir?</span>
              <select
                value={measureMode}
                onChange={(e) => setMeasureMode(e.target.value)}
                className="w-full border border-border rounded-xl bg-background px-4 py-3 text-foreground"
              >
                <option value="medidas">Altura × largura</option>
                <option value="total">Metragem total conhecida</option>
              </select>
            </label>
          </div>
          <label className="block text-xs text-muted-foreground mb-5">
            Nome do ambiente
            <input
              value={environmentName}
              maxLength={80}
              onChange={(e) => setEnvironmentName(e.target.value)}
              className="block w-full border border-border rounded-xl bg-background px-4 py-3 text-foreground mt-2"
            />
          </label>
          {measureMode === "medidas" ? (
            <div className="grid md:grid-cols-2 gap-4 md:gap-6">
              <MeasureField label="Altura (m)" value={altura} onChange={setAltura} />
              <MeasureField label="Largura (m)" value={largura} onChange={setLargura} />
            </div>
          ) : (
            <MeasureField label="Área total (m²)" value={totalArea} onChange={setTotalArea} />
          )}
          <div className="mt-5 space-y-3">
            {extraRooms.map((room, index) => (
              <div key={index} className="flex flex-wrap sm:flex-nowrap gap-2 items-end">
                <label className="flex-1 min-w-32 text-xs text-muted-foreground">
                  Ambiente {index + 2}
                  <input
                    aria-label={`Nome do ambiente ${index + 2}`}
                    value={room.name}
                    maxLength={80}
                    onChange={(e) =>
                      setExtraRooms((rooms) =>
                        rooms.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    className="block w-full bg-background border border-border rounded-xl p-3 mt-2 text-foreground"
                  />
                </label>
                <label className="w-28 text-xs text-muted-foreground">
                  Área (m²)
                  <input
                    aria-label={`Área do ambiente ${index + 2}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={room.area}
                    onChange={(e) =>
                      setExtraRooms((rooms) =>
                        rooms.map((r, i) => (i === index ? { ...r, area: e.target.value } : r)),
                      )
                    }
                    className="block w-full bg-background border border-border rounded-xl p-3 mt-2 text-foreground"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remover ambiente ${index + 2}`}
                  onClick={() => setExtraRooms((rooms) => rooms.filter((_, i) => i !== index))}
                  className="p-3 text-muted-foreground hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={extraRooms.length >= 49}
              onClick={() => setExtraRooms((rooms) => [...rooms, { name: "", area: "" }])}
              className="text-xs text-accent border border-dashed border-accent/40 rounded-xl px-4 py-3"
            >
              + Adicionar ambiente
            </button>
          </div>

          <div className="mt-8 bg-navy/30 border border-navy/40 rounded-2xl p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-accent font-bold">
                Área calculada
              </div>
              <div className="font-mono text-5xl font-extrabold tracking-tighter mt-1">
                {area.toFixed(2)} <span className="text-2xl text-muted-foreground">m²</span>
              </div>
              {!validMeasures && (
                <p className="text-xs text-destructive mt-2 animate-fade-in">
                  Informe medidas válidas (maiores que zero).
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => goStep(2)}
              disabled={!validMeasures}
              className="px-6 py-4 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 inline-flex items-center justify-center gap-2"
            >
              Continuar <ArrowRight className="size-4" />
            </button>
          </div>
        </section>
      )}

      {/* STEP 2 — FINISH */}
      {step === 2 && (
        <section className="space-y-5 animate-slide-up">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent flex items-center gap-2">
              <PaintBucket className="size-3.5" /> Passo 2
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter">
              Escolha o acabamento
            </h1>
            <p className="text-muted-foreground text-sm">
              {area.toFixed(2)} m² selecionados — escolha o tipo de serviço.
            </p>
          </div>

          {loadingServices ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 rounded-2xl bg-surface animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {services.map((s) => {
                const active = s.id === serviceId;
                const img = s.image_url || localImageFor(s.key);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setServiceId(s.id)}
                    className={
                      "group text-left rounded-2xl overflow-hidden border-2 transition-all duration-300 bg-surface " +
                      (active
                        ? "border-accent shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-accent)_25%,transparent),0_20px_60px_-20px_color-mix(in_oklab,var(--color-accent)_55%,transparent)] scale-[1.02]"
                        : "border-border hover:border-muted-foreground hover:scale-[1.01]")
                    }
                  >
                    <div className="relative aspect-[5/3] overflow-hidden">
                      {img ? (
                        <img
                          src={img}
                          alt={s.name}
                          className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-navy/40 to-background" />
                      )}
                      {active && (
                        <div className="absolute top-3 right-3 size-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center shadow-lg">
                          <Check className="size-4" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold truncate">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {s.description}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-extrabold text-accent">
                          R$ {Number(s.price_per_m2).toFixed(0)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">/m²</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-5 py-3 border border-border rounded-xl text-sm font-bold uppercase tracking-tighter hover:border-accent hover:text-accent transition-colors inline-flex items-center gap-2"
            >
              <ArrowLeft className="size-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => goStep(3)}
              disabled={!selected}
              className="px-6 py-3 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-50 disabled:hover:scale-100 inline-flex items-center gap-2"
            >
              Ver estimativa <Sparkles className="size-4" />
            </button>
          </div>
        </section>
      )}

      {step === 2 && selected && (
        <div className="rounded-2xl bg-surface border border-border p-5 space-y-3">
          <h2 className="text-sm font-medium">Adicionar outros serviços aos mesmos ambientes</h2>
          <p className="text-xs text-muted-foreground">
            Os serviços selecionados serão aplicados à metragem total informada. Escopos diferentes
            devem ser detalhados nas observações para avaliação técnica.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {services
              .filter((service) => service.id !== serviceId)
              .map((service) => (
                <label
                  key={service.id}
                  className="text-sm flex items-center gap-3 border border-border rounded-xl p-3"
                >
                  <input
                    type="checkbox"
                    checked={extraServiceIds.includes(service.id)}
                    onChange={(e) =>
                      setExtraServiceIds((ids) =>
                        e.target.checked
                          ? [...ids, service.id]
                          : ids.filter((id) => id !== service.id),
                      )
                    }
                    className="accent-[var(--color-accent)]"
                  />
                  {service.name}
                </label>
              ))}
          </div>
        </div>
      )}

      {/* STEP 3 — RESULT */}
      {step === 3 && selected && (
        <section className="space-y-5 animate-slide-up">
          <div className="bg-gradient-to-br from-navy/40 via-surface to-background border border-accent/40 rounded-3xl p-8 md:p-10 shadow-2xl shadow-accent/10 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--color-accent)_18%,transparent),transparent_60%)] pointer-events-none" />
            <div className="relative">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent flex items-center gap-2">
                <Sparkles className="size-3.5" /> Estimativa
              </div>
              <div className="text-sm text-muted-foreground mt-2">
                {chosenServices.map((service) => service.name).join(" + ")} · {area.toFixed(2)} m² ·{" "}
                {extraRooms.length + 1} ambiente(s)
              </div>
              <div
                className={
                  "font-mono text-5xl md:text-7xl font-extrabold tracking-tighter mt-3 " +
                  (calcAnim ? "animate-scale-in" : "")
                }
              >
                {requiresTechnicalQuote ? "Sob avaliação" : `R$ ${formatBRL(total)}`}
              </div>
              <p className="text-xs text-muted-foreground italic mt-4 max-w-md">
                {requiresTechnicalQuote
                  ? "Este projeto exige levantamento técnico, escopo, logística e cronograma próprios. O preço será definido na proposta após a visita, sem multiplicação automática por m²."
                  : "Este valor é apenas uma estimativa. O preço final poderá variar após visita técnica."}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <Metric label="Metragem" value={`${area.toFixed(2)} m²`} />
            <Metric label="Serviços" value={`${chosenServices.length} selecionado(s)`} />
            <Metric
              label={requiresTechnicalQuote ? "Definição do valor" : "Referência conjunta / m²"}
              value={requiresTechnicalQuote ? "Após visita" : `R$ ${combinedRate.toFixed(2)}`}
            />
          </div>

          {/* Optional notes + photo */}
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Detalhes adicionais (opcional)
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações sobre a parede, condições, prazo desejado…"
              rows={3}
              maxLength={500}
              className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm focus:border-accent outline-none transition-colors resize-none"
            />

            <div className="flex items-center gap-3 flex-wrap">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
              />
              {!photoPreview ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-dashed border-border rounded-lg text-xs font-bold uppercase tracking-tighter hover:border-accent hover:text-accent transition-colors"
                >
                  <ImagePlus className="size-4" /> Anexar foto da parede
                </button>
              ) : (
                <div className="relative inline-block">
                  <img
                    src={photoPreview}
                    alt="Foto da parede"
                    className="size-20 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPhoto(null);
                      setPhotoPreview(null);
                    }}
                    className="absolute -top-2 -right-2 size-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    aria-label="Remover foto"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-60 disabled:hover:scale-100"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {requiresTechnicalQuote ? "Solicitar proposta técnica" : "Salvar orçamento"}
            </button>
            <button
              type="button"
              onClick={() =>
                navigate({
                  to: "/agendar",
                  search: { service: selected.name } as never,
                })
              }
              className="inline-flex items-center justify-center gap-2 px-6 py-4 border border-accent text-accent font-bold uppercase tracking-tighter rounded-xl hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <CalendarIcon className="size-4" /> Agendar visita
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-xl text-xs font-bold uppercase tracking-tighter hover:border-accent hover:text-accent transition-colors"
            >
              <PaintBucket className="size-4" /> Outro serviço
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 border border-border rounded-xl text-xs font-bold uppercase tracking-tighter hover:border-accent hover:text-accent transition-colors"
            >
              <RefreshCw className="size-4" /> Refazer cálculo
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function MeasureField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        min={0}
        step={0.01}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full bg-background border border-border rounded-xl px-5 py-5 font-mono text-2xl focus:border-accent outline-none transition-colors"
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        {label}
      </div>
      <div className="font-mono font-extrabold text-xl mt-1 truncate">{value}</div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Medidas", "Acabamento", "Resultado"];
  return (
    <div className="flex items-center gap-2 md:gap-3">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 md:gap-3 flex-1">
            <div
              className={
                "size-9 rounded-full flex items-center justify-center font-bold text-xs transition-all " +
                (active
                  ? "bg-accent text-accent-foreground scale-110 shadow-lg shadow-accent/30"
                  : done
                    ? "bg-accent/20 text-accent"
                    : "bg-surface text-muted-foreground border border-border")
              }
            >
              {done ? <Check className="size-4" /> : n}
            </div>
            <div className="hidden sm:block min-w-0">
              <div
                className={
                  "text-[10px] uppercase tracking-widest font-bold " +
                  (active ? "text-accent" : done ? "text-foreground" : "text-muted-foreground")
                }
              >
                {label}
              </div>
            </div>
            {i < labels.length - 1 && <div className="flex-1 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
