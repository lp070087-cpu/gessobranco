import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Loader2,
  MapPin,
  Phone,
  CheckCircle2,
  Truck,
  CircleDashed,
  X,
  Search,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/agenda")({
  component: AdminAgenda,
});

type Appt = {
  id: string;
  user_id: string;
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
  admin_notes: string | null;
  status: "aguardando_confirmacao" | "confirmado" | "a_caminho" | "realizada" | "cancelada";
  created_at: string;
};

const STATUS_LABEL: Record<Appt["status"], string> = {
  aguardando_confirmacao: "Aguardando",
  confirmado: "Confirmado",
  a_caminho: "A caminho",
  realizada: "Realizada",
  cancelada: "Cancelada",
};
const STATUS_STYLES: Record<Appt["status"], string> = {
  aguardando_confirmacao: "bg-muted text-muted-foreground",
  confirmado: "bg-navy/40 text-accent",
  a_caminho: "bg-amber-500/15 text-amber-400",
  realizada: "bg-emerald-500/15 text-emerald-400",
  cancelada: "bg-destructive/15 text-destructive",
};
const ACTIONS = [
  { label: "Aceitar", status: "confirmado" as const, icon: CheckCircle2 },
  { label: "A caminho", status: "a_caminho" as const, icon: Truck },
  { label: "Finalizar", status: "realizada" as const, icon: CheckCircle2 },
  { label: "Cancelar", status: "cancelada" as const, icon: X },
];

function AdminAgenda() {
  const [list, setList] = useState<Appt[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Appt["status"]>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reload();
  }, []);
  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("scheduled_date", { ascending: false });
    if (error) toast.error("Falha ao carregar");
    else setList((data ?? []) as unknown as Appt[]);
    setLoading(false);
  };

  const setStatus = async (id: string, status: Appt["status"]) => {
    setBusyId(id);
    const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
    setBusyId(null);
    if (error) return toast.error("Erro", { description: error.message });
    setList((p) => p.map((a) => (a.id === id ? { ...a, status } : a)));
    toast.success("Status atualizado");
  };

  const saveEditing = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    const { error } = await supabase
      .from("appointments")
      .update({
        professional_name: editing.professional_name,
        admin_notes: editing.admin_notes,
        scheduled_date: editing.scheduled_date,
        scheduled_time: editing.scheduled_time,
      })
      .eq("id", editing.id);
    setBusyId(null);
    if (error) return toast.error("Erro", { description: error.message });
    toast.success("Salvo");
    await reload();
    setEditing(null);
  };

  const filtered = list.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      a.full_name.toLowerCase().includes(s) ||
      a.city.toLowerCase().includes(s) ||
      (a.service_name ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <AdminShell title="Agenda de visitas" subtitle="Aceite, remarque, cancele ou finalize.">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, cidade, serviço…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-accent outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                "all",
                "aguardando_confirmacao",
                "confirmado",
                "a_caminho",
                "realizada",
                "cancelada",
              ] as const
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={
                  "px-3 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-colors " +
                  (filter === f
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border text-muted-foreground hover:border-accent hover:text-accent")
                }
              >
                {f === "all" ? "Todos" : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <PanelSkeleton label="Carregando agenda…" />
        ) : filtered.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-2xl p-12 text-center">
            <CircleDashed className="size-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum agendamento encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <article
                key={a.id}
                className="bg-surface border border-border rounded-2xl p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start gap-3 justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">{a.full_name}</span>
                      <span
                        className={
                          "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full " +
                          STATUS_STYLES[a.status]
                        }
                      >
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>{a.service_name || "Visita técnica"}</div>
                      <div className="font-mono">
                        {a.scheduled_date.split("-").reverse().join("/")} · {a.scheduled_time}
                      </div>
                      <div className="inline-flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Phone className="size-3" />
                          {a.phone}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {a.address}, {a.city}
                        </span>
                      </div>
                      {a.notes && <div className="italic mt-1">"{a.notes}"</div>}
                      {a.professional_name && (
                        <div className="text-accent">Profissional: {a.professional_name}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing(a)}
                    className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border border-border rounded-lg hover:border-accent hover:text-accent transition-colors"
                  >
                    Editar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {ACTIONS.map((act) => {
                    const Icon = act.icon;
                    const active = a.status === act.status;
                    return (
                      <button
                        key={act.status}
                        disabled={busyId === a.id || active}
                        onClick={() => setStatus(a.id, act.status)}
                        className={
                          "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-colors " +
                          (active
                            ? "bg-accent/15 text-accent cursor-default"
                            : "border border-border hover:border-accent hover:text-accent")
                        }
                      >
                        <Icon className="size-3.5" /> {act.label}
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}

        {editing && (
          <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => setEditing(null)}
          >
            <div
              className="bg-surface border border-border rounded-3xl max-w-lg w-full p-6 space-y-4 animate-slide-up"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between">
                <h2 className="font-extrabold tracking-tighter text-lg">Editar visita</h2>
                <button
                  onClick={() => setEditing(null)}
                  className="size-8 rounded-lg border border-border hover:border-accent hover:text-accent"
                >
                  <X className="size-4 mx-auto" />
                </button>
              </header>
              <div className="space-y-3">
                <Lbl label="Profissional">
                  <input
                    value={editing.professional_name ?? ""}
                    onChange={(e) => setEditing({ ...editing, professional_name: e.target.value })}
                    placeholder="Ex.: Carlos Mendes"
                    className="ainp"
                  />
                </Lbl>
                <div className="grid grid-cols-2 gap-3">
                  <Lbl label="Data">
                    <input
                      type="date"
                      value={editing.scheduled_date}
                      onChange={(e) => setEditing({ ...editing, scheduled_date: e.target.value })}
                      className="ainp"
                    />
                  </Lbl>
                  <Lbl label="Horário">
                    <input
                      type="time"
                      value={editing.scheduled_time}
                      onChange={(e) => setEditing({ ...editing, scheduled_time: e.target.value })}
                      className="ainp"
                    />
                  </Lbl>
                </div>
                <Lbl label="Notas internas">
                  <textarea
                    rows={3}
                    value={editing.admin_notes ?? ""}
                    onChange={(e) => setEditing({ ...editing, admin_notes: e.target.value })}
                    className="ainp resize-none"
                  />
                </Lbl>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2.5 border border-border rounded-lg text-xs font-bold uppercase tracking-tighter hover:border-accent hover:text-accent"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveEditing}
                  disabled={busyId === editing.id}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform disabled:opacity-60"
                >
                  {busyId === editing.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`.ainp{width:100%;background:var(--color-background);border:1px solid var(--color-border);border-radius:.5rem;padding:.6rem .9rem;font-size:.875rem;outline:none}.ainp:focus{border-color:var(--color-accent)}`}</style>
      </div>
    </AdminShell>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
