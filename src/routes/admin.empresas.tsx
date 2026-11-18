import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Ban, CheckCircle2, Trash2, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, EmptyState } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/empresas")({
  component: AdminEmpresas,
});

type Company = {
  id: string;
  email: string | null;
  company_name: string | null;
  responsible_name: string | null;
  cnpj: string | null;
  phone: string | null;
  company_status: "pendente" | "aprovada" | "bloqueada";
  blocked: boolean;
  created_at: string;
};

const STATUS_STYLE: Record<Company["company_status"], string> = {
  pendente: "bg-amber-500/15 text-amber-400",
  aprovada: "bg-emerald-500/15 text-emerald-400",
  bloqueada: "bg-destructive/15 text-destructive",
};

function AdminEmpresas() {
  const [list, setList] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Company["company_status"]>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("account_type", "empresa")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Não foi possível carregar empresas");
      setLoading(false);
      return;
    }
    setList((data ?? []) as unknown as Company[]);
    setLoading(false);
  };

  const setStatus = async (c: Company, status: Company["company_status"]) => {
    setBusyId(c.id);
    const { error } = await supabase
      .from("profiles")
      .update({ company_status: status, blocked: status === "bloqueada" })
      .eq("id", c.id);
    setBusyId(null);
    if (error) return toast.error("Erro", { description: error.message });
    setList((arr) => arr.map((x) => (x.id === c.id ? { ...x, company_status: status } : x)));
    toast.success("Status atualizado");
  };

  const remove = async (c: Company) => {
    if (!confirm(`Bloquear empresa ${c.company_name}? Os dados serão preservados.`)) return;
    const { error } = await supabase
      .from("profiles")
      .update({ company_status: "bloqueada", blocked: true })
      .eq("id", c.id);
    if (error) return toast.error("Erro", { description: error.message });
    setList((arr) =>
      arr.map((x) => (x.id === c.id ? { ...x, company_status: "bloqueada", blocked: true } : x)),
    );
    toast.success("Empresa bloqueada; dados preservados");
  };

  const filtered = list.filter((c) => {
    if (filter !== "all" && c.company_status !== filter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (c.company_name ?? "").toLowerCase().includes(s) || (c.email ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <AdminShell title="Empresas" subtitle={`${list.length} empresas no marketplace.`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-accent outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "pendente", "aprovada", "bloqueada"] as const).map((f) => (
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
                {f === "all" ? "Todas" : f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-accent" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhuma empresa"
            hint="Empresas se cadastram pelo formulário de signup."
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <article
                key={c.id}
                className="bg-surface border border-border rounded-2xl p-5 space-y-4 hover:border-accent/40 transition-colors"
              >
                <header className="flex items-start gap-3">
                  <div className="size-11 rounded-xl bg-gradient-to-br from-accent to-navy text-accent-foreground flex items-center justify-center font-extrabold shrink-0">
                    {(c.company_name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{c.company_name || "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.responsible_name || c.email}
                    </div>
                  </div>
                  <span
                    className={
                      "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap " +
                      STATUS_STYLE[c.company_status]
                    }
                  >
                    {c.company_status}
                  </span>
                </header>
                <div className="text-xs space-y-1 text-muted-foreground">
                  <div>{c.phone || "—"}</div>
                  <div className="font-mono">{c.cnpj || "—"}</div>
                </div>
                <div className="flex gap-1.5 pt-3 border-t border-border">
                  <button
                    onClick={() => setStatus(c, "aprovada")}
                    disabled={busyId === c.id || c.company_status === "aprovada"}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-border hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
                  >
                    <CheckCircle2 className="size-3.5" /> Aprovar
                  </button>
                  <button
                    onClick={() => setStatus(c, "bloqueada")}
                    disabled={busyId === c.id || c.company_status === "bloqueada"}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-border hover:border-destructive hover:text-destructive disabled:opacity-40 disabled:hover:border-border"
                  >
                    <Ban className="size-3.5" /> Bloquear
                  </button>
                  <button
                    aria-label="Bloquear empresa preservando o histórico"
                    disabled={c.company_status === "bloqueada" || busyId === c.id}
                    onClick={() => remove(c)}
                    className="size-9 rounded-lg border border-border text-destructive flex items-center justify-center hover:bg-destructive/10 disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
