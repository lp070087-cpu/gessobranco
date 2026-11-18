import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Plus,
  MapPin,
  Phone,
  Clock,
  User as UserIcon,
  ChevronRight,
  CheckCircle2,
  Circle,
  Truck,
  CircleDashed,
  ArrowLeft,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Ouro Branco" }] }),
  component: AgendaPage,
});

type Appt = {
  id: string;
  service_name: string | null;
  full_name: string;
  phone: string;
  whatsapp: string | null;
  address: string;
  city: string;
  postal_code: string | null;
  complement: string | null;
  scheduled_date: string;
  scheduled_time: string;
  notes: string | null;
  professional_name: string | null;
  status: "aguardando_confirmacao" | "confirmado" | "a_caminho" | "realizada" | "cancelada";
  created_at: string;
};

type Media = { id: string; path: string; kind: string; appointment_id: string };

const STATUS_LABEL: Record<Appt["status"], string> = {
  aguardando_confirmacao: "Aguardando confirmação",
  confirmado: "Confirmado",
  a_caminho: "Profissional a caminho",
  realizada: "Visita realizada",
  cancelada: "Cancelada",
};

const STATUS_STYLES: Record<Appt["status"], string> = {
  aguardando_confirmacao: "bg-muted text-muted-foreground",
  confirmado: "bg-navy/40 text-accent",
  a_caminho: "bg-amber-500/15 text-amber-400",
  realizada: "bg-emerald-500/15 text-emerald-400",
  cancelada: "bg-destructive/15 text-destructive",
};

const TIMELINE_STEPS: { key: Appt["status"]; label: string; icon: typeof Circle }[] = [
  { key: "aguardando_confirmacao", label: "Aguardando confirmação", icon: CircleDashed },
  { key: "confirmado", label: "Confirmado", icon: CheckCircle2 },
  { key: "a_caminho", label: "Profissional a caminho", icon: Truck },
  { key: "realizada", label: "Visita realizada", icon: CheckCircle2 },
];

function statusIndex(s: Appt["status"]) {
  return TIMELINE_STEPS.findIndex((t) => t.key === s);
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function AgendaPage() {
  const { user } = useAuth();
  const [list, setList] = useState<Appt[] | null>(null);
  const [selected, setSelected] = useState<Appt | null>(null);
  const [media, setMedia] = useState<Media[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("scheduled_date", { ascending: false });
      if (error) {
        toast.error("Falha ao carregar agenda");
        setList([]);
        return;
      }
      setList((data ?? []) as unknown as Appt[]);
    })();
  }, [user]);

  useEffect(() => {
    if (!selected) {
      setMedia([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("appointment_media")
        .select("id,path,kind,appointment_id")
        .eq("appointment_id", selected.id);
      setMedia((data ?? []) as unknown as Media[]);
    })();
  }, [selected]);

  if (selected) return <Detail appt={selected} media={media} onBack={() => setSelected(null)} />;

  const isLoading = list === null;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 animate-fade-in-up space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
            Agendamentos
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter">Minha agenda</h1>
        </div>
        <Link
          to="/agendar"
          search={{ quoteId: undefined, service: undefined }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform"
        >
          <Plus className="size-4" /> Agendar
        </Link>
      </header>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && list && list.length === 0 && (
        <div className="bg-surface border border-border border-dashed rounded-3xl p-10 md:p-16 text-center space-y-5">
          <div className="size-16 rounded-2xl bg-gold-soft text-accent flex items-center justify-center mx-auto">
            <CalendarDays className="size-7" />
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-lg">Sem agendamentos</h2>
            <p className="text-sm text-muted-foreground">Agende uma visita técnica para começar.</p>
          </div>
          <Link
            to="/agendar"
            search={{ quoteId: undefined, service: undefined }}
            className="inline-flex items-center gap-2 px-5 py-3 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform"
          >
            <Plus className="size-4" /> Agendar agora
          </Link>
        </div>
      )}

      {!isLoading && list && list.length > 0 && (
        <div className="space-y-3">
          {list.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a)}
              className="w-full text-left bg-surface border border-border hover:border-accent/60 rounded-2xl p-5 flex items-center gap-4 transition-colors group"
            >
              <div className="size-12 rounded-xl bg-gold-soft text-accent flex items-center justify-center shrink-0">
                <CalendarDays className="size-5" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold truncate">{a.service_name || "Visita técnica"}</span>
                  <span
                    className={
                      "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full " +
                      STATUS_STYLES[a.status]
                    }
                  >
                    {STATUS_LABEL[a.status]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatDate(a.scheduled_date)} · {a.scheduled_time}
                  </span>
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="size-3" />
                    {a.city}
                  </span>
                </div>
              </div>
              <ChevronRight className="size-5 text-muted-foreground group-hover:text-accent transition-colors" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Detail({ appt, media, onBack }: { appt: Appt; media: Media[]; onBack: () => void }) {
  const activeIdx = statusIndex(appt.status);
  const isCancelled = appt.status === "cancelada";

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Voltar para agenda
      </button>

      <header className="space-y-2">
        <span
          className={
            "inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full " +
            STATUS_STYLES[appt.status]
          }
        >
          {STATUS_LABEL[appt.status]}
        </span>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter">
          {appt.service_name || "Visita técnica"}
        </h1>
        <p className="text-sm text-muted-foreground font-mono">
          {formatDate(appt.scheduled_date)} às {appt.scheduled_time}
        </p>
      </header>

      {/* Timeline */}
      {!isCancelled && (
        <section className="bg-surface border border-border rounded-2xl p-6">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold mb-4">
            Status
          </h2>
          <ol className="space-y-4">
            {TIMELINE_STEPS.map((step, i) => {
              const done = i <= activeIdx;
              const current = i === activeIdx;
              const Icon = step.icon;
              return (
                <li key={step.key} className="flex items-start gap-3 relative">
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div
                      className={
                        "absolute left-[15px] top-8 bottom-[-16px] w-px " +
                        (i < activeIdx ? "bg-accent" : "bg-border")
                      }
                    />
                  )}
                  <div
                    className={
                      "size-8 rounded-full flex items-center justify-center shrink-0 transition-all " +
                      (done
                        ? "bg-accent text-accent-foreground"
                        : "bg-background border border-border text-muted-foreground") +
                      (current ? " ring-4 ring-accent/30 scale-110" : "")
                    }
                  >
                    <Icon className="size-4" />
                  </div>
                  <div className="pt-1 flex-1">
                    <div
                      className={
                        "text-sm font-bold " + (done ? "text-foreground" : "text-muted-foreground")
                      }
                    >
                      {step.label}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Professional */}
      {appt.professional_name && (
        <section className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
          <div className="size-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-extrabold">
            {appt.professional_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Profissional
            </div>
            <div className="font-bold">{appt.professional_name}</div>
          </div>
        </section>
      )}

      <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <h2 className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">Detalhes</h2>
        <Row icon={UserIcon} label="Cliente" value={appt.full_name} />
        <Row icon={Phone} label="Telefone" value={appt.phone} />
        {appt.whatsapp && <Row icon={Phone} label="WhatsApp" value={appt.whatsapp} />}
        <Row
          icon={MapPin}
          label="Endereço"
          value={
            <>
              {appt.address} — {appt.city}
              {appt.postal_code ? `, ${appt.postal_code}` : ""}
              {appt.complement ? ` (${appt.complement})` : ""}
            </>
          }
        />
        {appt.notes && <Row icon={Circle} label="Observações" value={appt.notes} />}
      </section>

      {media.length > 0 && (
        <section className="bg-surface border border-border rounded-2xl p-5 space-y-3">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">Anexos</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {media.map((m) => {
              const { data } = supabase.storage.from("appointment-media").getPublicUrl(m.path);
              return m.kind === "video" ? (
                <video
                  key={m.id}
                  src={data.publicUrl}
                  controls
                  className="aspect-square rounded-lg object-cover border border-border"
                />
              ) : (
                <a key={m.id} href={data.publicUrl} target="_blank" rel="noreferrer">
                  <img
                    src={data.publicUrl}
                    alt=""
                    className="aspect-square w-full rounded-lg object-cover border border-border hover:opacity-90 transition-opacity"
                  />
                </a>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Circle;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="size-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {label}
        </div>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}
