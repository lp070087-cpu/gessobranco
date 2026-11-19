import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, EmptyState } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { AdminQuoteDetails } from "@/components/preciso/AdminQuoteDetails";

export const Route = createFileRoute("/admin/orcamentos")({
  component: AdminOrcamentos,
});

type Quote = {
  id: string;
  user_id: string;
  service_name: string;
  area: number;
  estimated_total: number;
  status: "estimado" | "aguardando_visita" | "aprovado" | "finalizado";
  created_at: string;
  notes?: string | null;
};

const STATUS_LABEL: Record<Quote["status"], string> = {
  estimado: "Estimado",
  aguardando_visita: "Aguardando visita",
  aprovado: "Aprovado",
  finalizado: "Finalizado",
};
const STATUS_STYLE: Record<Quote["status"], string> = {
  estimado: "bg-muted text-muted-foreground",
  aguardando_visita: "bg-amber-500/15 text-amber-400",
  aprovado: "bg-emerald-500/15 text-emerald-400",
  finalizado: "bg-navy/40 text-accent",
};

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AdminOrcamentos() {
  const [list, setList] = useState<Quote[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | Quote["status"]>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Quote | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Não foi possível carregar os orçamentos");
      setLoading(false);
      return;
    }
    const quotes = (data ?? []) as unknown as Quote[];
    setList(quotes);
    const ids = Array.from(new Set(quotes.map((q) => q.user_id)));
    if (ids.length) {
      const { data: pr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const m: Record<string, string> = {};
      (pr ?? []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
        m[p.id] = p.full_name || p.email || "—";
      });
      setProfiles(m);
    }
    setLoading(false);
  };

  const changeStatus = async (q: Quote, status: Quote["status"]) => {
    setBusyId(q.id);
    const { error } = await supabase.from("quotes").update({ status }).eq("id", q.id);
    setBusyId(null);
    if (error) return toast.error("Erro", { description: error.message });
    setList((arr) => arr.map((x) => (x.id === q.id ? { ...x, status } : x)));
    toast.success("Status atualizado");
  };

  const filtered = useMemo(
    () =>
      list.filter((q) => {
        if (filter !== "all" && q.status !== filter) return false;
        if (!search) return true;
        const s = search.toLowerCase();
        return (
          q.service_name.toLowerCase().includes(s) ||
          (profiles[q.user_id] ?? "").toLowerCase().includes(s)
        );
      }),
    [list, filter, search, profiles],
  );

  return (
    <AdminShell title="Orçamentos" subtitle={`${list.length} solicitações no total.`}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou serviço…"
              className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-accent outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "estimado", "aguardando_visita", "aprovado", "finalizado"] as const).map(
              (f) => (
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
              ),
            )}
          </div>
        </div>

        {loading ? (
          <PanelSkeleton label="Carregando orçamentos…" />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhum orçamento" />
        ) : (
          <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <th className="px-5 py-3">Cliente</th>
                  <th className="px-5 py-3">Serviço</th>
                  <th className="px-5 py-3">m²</th>
                  <th className="px-5 py-3">Valor</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((q) => (
                  <tr key={q.id} className="hover:bg-background/50">
                    <td className="px-5 py-3 font-semibold truncate max-w-[180px]">
                      {profiles[q.user_id] ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground truncate max-w-[180px]">
                      {q.service_name}
                    </td>
                    <td className="px-5 py-3 font-mono">{Number(q.area).toFixed(2)}</td>
                    <td className="px-5 py-3 font-mono font-bold">
                      {fmt(Number(q.estimated_total))}
                    </td>
                    <td className="px-5 py-3">
                      <select
                        disabled={busyId === q.id}
                        value={q.status}
                        onChange={(e) => changeStatus(q, e.target.value as Quote["status"])}
                        className={
                          "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border-0 outline-none cursor-pointer " +
                          STATUS_STYLE[q.status]
                        }
                      >
                        {(Object.keys(STATUS_LABEL) as Quote["status"][]).map((s) => (
                          <option
                            key={s}
                            value={s}
                            className="bg-surface text-foreground normal-case"
                          >
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {new Date(q.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        aria-label={`Ver detalhes de ${q.service_name}`}
                        onClick={() => setSelected(q)}
                        className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-accent hover:text-accent"
                      >
                        <Eye className="size-4" /> Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {selected && (
          <AdminQuoteDetails
            quote={list.find((q) => q.id === selected.id) ?? selected}
            client={profiles[selected.user_id] ?? "Cliente"}
            onClose={() => setSelected(null)}
            onChanged={load}
          />
        )}
      </div>
    </AdminShell>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
