import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Sun,
  CloudSun,
  Moon,
  ImagePlus,
  X,
  Loader2,
  MapPin,
  User as UserIcon,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/agendar")({
  head: () => ({ meta: [{ title: "Agendar visita — Ouro Branco" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    quoteId: typeof search.quoteId === "string" ? search.quoteId : undefined,
    service: typeof search.service === "string" ? search.service : undefined,
  }),
  component: AgendarPage,
});

const TIME_SLOTS = [
  { period: "Manhã", icon: Sun, times: ["08:00", "09:00", "10:00", "11:00"] },
  { period: "Tarde", icon: CloudSun, times: ["13:00", "14:00", "15:00", "16:00", "17:00"] },
  { period: "Noite", icon: Moon, times: ["18:00", "19:00", "20:00"] },
];

function todayISO() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

function AgendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const search = Route.useSearch();
  const [step, setStep] = useState<"intro" | "form" | "done">("intro");
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [complement, setComplement] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prefill from profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name,phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        if (data.full_name) setFullName(data.full_name);
        if (data.phone) {
          setPhone(data.phone);
          setWhatsapp(data.phone);
        }
      }
    })();
  }, [user]);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);

  const addFiles = (selected: FileList | null) => {
    if (!selected) return;
    const newOnes = Array.from(selected).filter((f) => f.size <= 20 * 1024 * 1024);
    if (newOnes.length !== selected.length) {
      toast.error("Algum arquivo é maior que 20MB e foi ignorado.");
    }
    setFiles((prev) => [...prev, ...newOnes].slice(0, 6));
  };

  const canSubmit =
    fullName.trim() && phone.trim() && address.trim() && city.trim() && date && time;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !canSubmit) {
      toast.error("Preencha os campos obrigatórios.");
      return;
    }
    setSubmitting(true);
    try {
      const { data: appt, error } = await supabase
        .from("appointments")
        .insert({
          user_id: user.id,
          quote_id: search.quoteId ?? null,
          service_name: search.service ?? null,
          full_name: fullName.trim(),
          phone: phone.trim(),
          whatsapp: whatsapp.trim() || null,
          address: address.trim(),
          city: city.trim(),
          postal_code: postalCode.trim() || null,
          complement: complement.trim() || null,
          scheduled_date: date,
          scheduled_time: time,
          notes: notes.trim() || null,
          status: "aguardando_confirmacao",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Upload media (parallel)
      if (files.length > 0) {
        await Promise.all(
          files.map(async (file) => {
            const ext = file.name.split(".").pop() || "jpg";
            const path = `${user.id}/${appt.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("appointment-media")
              .upload(path, file, { cacheControl: "3600" });
            if (upErr) return;
            await supabase.from("appointment_media").insert({
              appointment_id: appt.id,
              user_id: user.id,
              path,
              kind: file.type.startsWith("video") ? "video" : "image",
            });
          }),
        );
      }

      // Mark quote as awaiting visit when linked
      if (search.quoteId) {
        await supabase
          .from("quotes")
          .update({ status: "aguardando_visita" })
          .eq("id", search.quoteId);
      }

      setStep("done");
    } catch (err) {
      toast.error("Erro ao agendar", {
        description: err instanceof Error ? err.message : "Tente novamente",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (step === "done") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center animate-fade-in-up space-y-6">
        <div className="size-20 rounded-full bg-accent/15 text-accent flex items-center justify-center mx-auto animate-scale-in">
          <CheckCircle2 className="size-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tighter">Visita agendada com sucesso.</h1>
          <p className="text-muted-foreground">Nossa equipe entrará em contato em breve.</p>
        </div>
        <div className="flex gap-3 justify-center pt-2">
          <Link
            to="/agenda"
            className="px-5 py-3 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform"
          >
            Ver minha agenda
          </Link>
          <Link
            to="/home"
            className="px-5 py-3 border border-border rounded-lg text-xs font-bold uppercase tracking-tighter hover:border-accent hover:text-accent transition-colors"
          >
            Início
          </Link>
        </div>
      </div>
    );
  }

  if (step === "intro") {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 md:py-24 animate-fade-in-up space-y-8 text-center">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
            Visita técnica
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter">
            Deseja agendar uma visita técnica?
          </h1>
          <p className="text-muted-foreground">
            Um profissional vai até o local para conferir as medidas e validar o orçamento.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="px-6 py-4 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform inline-flex items-center justify-center gap-2"
          >
            Sim, agendar <ArrowRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/home" })}
            className="px-6 py-4 border border-border rounded-xl font-bold uppercase tracking-tighter text-sm hover:border-accent hover:text-accent transition-colors"
          >
            Talvez depois
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-6 animate-fade-in-up"
    >
      <button
        type="button"
        onClick={() => setStep("intro")}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Voltar
      </button>

      <header className="space-y-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold inline-flex items-center gap-2">
          <CalendarIcon className="size-3.5" /> Agendamento
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter">Dados da visita</h1>
        {search.service && (
          <p className="text-sm text-muted-foreground">Serviço: {search.service}</p>
        )}
      </header>

      <Section title="Contato" icon={UserIcon}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Nome completo *" required>
            <input
              className="inp"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Field>
          <Field label="Telefone *" required>
            <input
              className="inp"
              type="tel"
              placeholder="(11) 9 0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>
          <Field label="WhatsApp" className="sm:col-span-2">
            <input
              className="inp"
              type="tel"
              placeholder="(11) 9 0000-0000"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Endereço" icon={MapPin}>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Endereço *" className="sm:col-span-2">
            <input
              className="inp"
              placeholder="Rua e número"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
            />
          </Field>
          <Field label="Cidade *">
            <input
              className="inp"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
            />
          </Field>
          <Field label="CEP">
            <input
              className="inp"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </Field>
          <Field label="Complemento" className="sm:col-span-2">
            <input
              className="inp"
              placeholder="Apto, bloco, referência…"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Data e horário" icon={CalendarIcon}>
        <div className="space-y-5">
          <Field label="Data desejada *">
            <input
              className="inp"
              type="date"
              min={todayISO()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <div className="space-y-4">
            {TIME_SLOTS.map((slot) => {
              const Icon = slot.icon;
              return (
                <div key={slot.period} className="space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1.5">
                    <Icon className="size-3" /> {slot.period}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {slot.times.map((t) => {
                      const active = time === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTime(t)}
                          className={
                            "px-4 py-2.5 rounded-xl text-sm font-mono font-bold border transition-all " +
                            (active
                              ? "bg-accent text-accent-foreground border-accent scale-105 shadow-lg shadow-accent/30"
                              : "border-border hover:border-accent hover:text-accent")
                          }
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      <Section title="Detalhes">
        <div className="space-y-4">
          <Field label="Observações">
            <textarea
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="inp resize-none"
              placeholder="Condição da parede, materiais já adquiridos, prazo desejado…"
            />
          </Field>

          <Field label="Fotos / vídeos curtos (opcional)">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              hidden
              onChange={(e) => addFiles(e.target.files)}
            />
            <div className="flex flex-wrap gap-3">
              {previews.map((src, i) => {
                const isVideo = files[i]?.type.startsWith("video");
                return (
                  <div key={i} className="relative">
                    {isVideo ? (
                      <video
                        src={src}
                        className="size-20 rounded-lg object-cover border border-border"
                      />
                    ) : (
                      <img
                        src={src}
                        alt=""
                        className="size-20 rounded-lg object-cover border border-border"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-2 -right-2 size-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      aria-label="Remover"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
              {files.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="size-20 rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-accent hover:text-accent transition-colors"
                >
                  <ImagePlus className="size-5" />
                  <span className="text-[9px] uppercase tracking-widest font-bold">Anexar</span>
                </button>
              )}
            </div>
          </Field>
        </div>
      </Section>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !canSubmit}
          className="px-6 py-4 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-60 disabled:hover:scale-100 inline-flex items-center justify-center gap-2"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          Confirmar agendamento
        </button>
      </div>

      <style>{`
        .inp {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 0.625rem;
          padding: 0.75rem 1rem;
          font-size: 0.9rem;
          outline: none;
          transition: border-color .15s;
        }
        .inp:focus { border-color: var(--color-accent); }
      `}</style>
    </form>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-border rounded-2xl p-5 md:p-6 space-y-4">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent inline-flex items-center gap-2">
        {Icon && <Icon className="size-3.5" />} {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
  required,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={"space-y-1.5 " + className}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
        {required ? null : null}
      </div>
      {children}
    </div>
  );
}
