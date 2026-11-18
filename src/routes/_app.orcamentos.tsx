import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Plus, Trash2, Calendar, Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/orcamentos")({
  head: () => ({ meta: [{ title: "Orçamentos — Ouro Branco" }] }),
  component: OrcamentosPage,
});

type Quote = {
  id: string;
  service_name: string;
  area: number;
  price_per_m2: number;
  estimated_total: number;
  status: string;
  notes: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Quote["status"], string> = {
  estimado: "Estimado",
  aguardando_visita: "Aguardando visita",
  aprovado: "Aprovado",
  finalizado: "Finalizado",
  em_analise: "Em análise",
  enviado: "Enviado",
  rejeitado: "Não aprovado",
  cancelado: "Cancelado",
  em_execucao: "Em execução",
};

const STATUS_STYLES: Record<Quote["status"], string> = {
  estimado: "bg-muted text-muted-foreground",
  aguardando_visita: "bg-navy/40 text-accent",
  aprovado: "bg-accent/20 text-accent",
  finalizado: "bg-emerald-500/15 text-emerald-400",
  em_analise: "bg-accent/10 text-accent",
  enviado: "bg-accent/10 text-accent",
  rejeitado: "bg-destructive/10 text-destructive",
  cancelado: "bg-muted text-muted-foreground",
  em_execucao: "bg-accent/10 text-accent",
};

function OrcamentosPage() {
  const { user, loading: authLoading } = useAuth();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("id,service_name,area,price_per_m2,estimated_total,status,notes,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) {
        toast.error("Falha ao carregar orçamentos");
        setQuotes([]);
        return;
      }
      setQuotes((data ?? []) as unknown as Quote[]);
    })();
  }, [user]);

  const handleDelete = async (id: string) => {
    if (!user || !window.confirm("Cancelar esta solicitação? O histórico será preservado.")) return;
    const quote = quotes?.find((item) => item.id === id);
    if (!quote || !["estimado", "aguardando_visita"].includes(quote.status)) return;
    const { error } = await supabase
      .from("quotes")
      .update({ status: "cancelado" })
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) {
      toast.error("Não foi possível cancelar a solicitação.");
      return;
    }
    setQuotes((prev) => (prev ?? []).map((q) => (q.id === id ? { ...q, status: "cancelado" } : q)));
    toast.success("Solicitação cancelada. Seu histórico foi preservado.");
  };

  const isLoading = authLoading || quotes === null;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 animate-fade-in-up space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
            Histórico
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter">Meus orçamentos</h1>
        </div>
        <Link
          to="/calcular"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform"
        >
          <Plus className="size-4" /> Novo
        </Link>
      </header>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && quotes && quotes.length === 0 && (
        <div className="bg-surface border border-border border-dashed rounded-3xl p-10 md:p-16 text-center space-y-5">
          <div className="size-16 rounded-2xl bg-gold-soft text-accent flex items-center justify-center mx-auto">
            <FileText className="size-7" />
          </div>
          <div className="space-y-1">
            <h2 className="font-bold text-lg">Nenhum orçamento ainda</h2>
            <p className="text-sm text-muted-foreground">
              Seus orçamentos calculados aparecerão aqui.
            </p>
          </div>
          <Link
            to="/calcular"
            className="inline-flex items-center gap-2 px-5 py-3 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform"
          >
            <Plus className="size-4" /> Calcular agora
          </Link>
        </div>
      )}

      {!isLoading && quotes && quotes.length > 0 && (
        <div className="space-y-3">
          {quotes.map((q) => (
            <article
              key={q.id}
              className="bg-surface border border-border rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 hover:border-accent/60 transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold truncate">{q.service_name}</span>
                  <span
                    className={
                      "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full " +
                      STATUS_STYLES[q.status]
                    }
                  >
                    {STATUS_LABEL[q.status] ?? q.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                  <span className="inline-flex items-center gap-1">
                    <Ruler className="size-3" /> {Number(q.area).toFixed(2)} m²{" "}
                    {Number(q.price_per_m2) > 0
                      ? `× R$ ${Number(q.price_per_m2).toFixed(2)}`
                      : "· avaliação técnica"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="size-3" />
                    {new Date(q.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {q.notes && (
                  <details className="text-xs text-muted-foreground pt-2">
                    <summary className="cursor-pointer text-accent">Ver escopo e ambientes</summary>
                    <p className="mt-3 whitespace-pre-wrap leading-relaxed">{q.notes}</p>
                  </details>
                )}
                {["estimado", "aguardando_visita"].includes(q.status) && (
                  <Link
                    to="/agendar"
                    search={{ quoteId: q.id, service: q.service_name }}
                    className="inline-flex pt-2 text-xs text-accent"
                  >
                    Solicitar visita técnica →
                  </Link>
                )}
              </div>
              <div className="flex items-center justify-between md:justify-end gap-3 md:gap-5">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Valor
                  </div>
                  <div className="font-mono font-extrabold text-lg text-accent">
                    {Number(q.estimated_total) > 0
                      ? `R$ ${Number(q.estimated_total).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "A definir"}
                  </div>
                </div>
                {["estimado", "aguardando_visita"].includes(q.status) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(q.id)}
                    className="size-9 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors flex items-center justify-center"
                    aria-label="Cancelar solicitação"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
