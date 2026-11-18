import { useEffect, useState } from "react";
import { Plus, X, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminDb, BILLING_UNITS } from "./admin-data";
import { inputCss } from "./AdminShell";

type Item = {
  id: string;
  service_name: string;
  environment: string;
  billing_unit: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
};
type History = { id: string; old_status: string | null; new_status: string; created_at: string };
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const label = (status: string) =>
  ({
    estimado: "Estimado",
    aguardando_visita: "Aguardando visita",
    aprovado: "Aprovado",
    finalizado: "Finalizado",
  })[status] ?? status;

export function AdminQuoteDetails({
  quote,
  client,
  onClose,
  onChanged,
}: {
  quote: {
    id: string;
    service_name: string;
    status: string;
    estimated_total: number;
    notes?: string | null;
  };
  client: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    service_name: "",
    environment: "",
    billing_unit: "m2",
    quantity: "",
    unit_price: "",
    notes: "",
  });
  const editable = ["estimado", "aguardando_visita"].includes(quote.status);
  const load = async () => {
    setLoading(true);
    setError("");
    const [i, h] = await Promise.all([
      adminDb.from("quote_items").select("*").eq("quote_id", quote.id).order("created_at"),
      adminDb
        .from("quote_status_history")
        .select("*")
        .eq("quote_id", quote.id)
        .order("created_at", { ascending: false }),
    ]);
    if (i.error || h.error)
      setError(
        "Detalhamento ou histórico indisponível. A migração operacional e as permissões precisam estar configuradas.",
      );
    if (!i.error) setItems(i.data ?? []);
    if (!h.error) setHistory(h.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, [quote.id]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", close);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = previous;
    };
  }, [busy, onClose]);
  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const quantity = Number(draft.quantity),
      price = Number(draft.unit_price);
    if (
      !draft.service_name.trim() ||
      !draft.environment.trim() ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !draft.unit_price ||
      !Number.isFinite(price) ||
      price < 0
    )
      return toast.error("Informe serviço, ambiente, quantidade positiva e preço válido.");
    setBusy(true);
    const { error: saveError } = await adminDb.from("quote_items").insert({
      quote_id: quote.id,
      service_name: draft.service_name.trim(),
      environment: draft.environment.trim(),
      billing_unit: draft.billing_unit,
      quantity,
      unit_price: price,
      notes: draft.notes.trim() || null,
    });
    setBusy(false);
    if (saveError)
      return toast.error("Não foi possível salvar o item", { description: saveError.message });
    setDraft({
      service_name: "",
      environment: "",
      billing_unit: "m2",
      quantity: "",
      unit_price: "",
      notes: "",
    });
    toast.success("Item salvo. O total foi recalculado pelo banco.");
    await load();
    onChanged();
  };
  const remove = async (id: string) => {
    if (!confirm("Remover este item da proposta em elaboração?")) return;
    setBusy(true);
    const { error: removeError } = await adminDb
      .from("quote_items")
      .delete()
      .eq("id", id)
      .eq("quote_id", quote.id);
    setBusy(false);
    if (removeError) return toast.error("Não foi possível remover o item");
    await load();
    onChanged();
  };
  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex justify-end"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-detail-title"
        className="w-full max-w-2xl h-full overflow-y-auto bg-surface border-l border-border shadow-2xl p-5 md:p-8 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-accent">Proposta técnica</p>
            <h2 id="quote-detail-title" className="text-2xl font-bold mt-2">
              {quote.service_name}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {client} · {label(quote.status)}
            </p>
          </div>
          <button
            autoFocus
            disabled={busy}
            aria-label="Fechar detalhes"
            onClick={onClose}
            className="size-10 grid place-items-center rounded-xl border border-border"
          >
            <X className="size-4" />
          </button>
        </header>
        <div className="rounded-2xl bg-background border border-border p-4">
          <span className="text-xs text-muted-foreground">Estimativa / proposta atual</span>
          <p className="text-2xl font-mono text-accent font-bold">
            {money(Number(quote.estimated_total))}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Obras complexas dependem de vistoria, escopo e validação técnica. O valor preliminar não
            substitui uma proposta definitiva.
          </p>
        </div>
        {quote.notes && (
          <section>
            <h3 className="font-semibold mb-2">Solicitação e ambientes informados</h3>
            <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground p-4 border border-border rounded-xl">
              {quote.notes}
            </p>
          </section>
        )}
        {loading && (
          <div role="status" className="py-8 flex gap-2 justify-center">
            <Loader2 className="size-5 animate-spin" />
            Carregando detalhamento
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="border border-accent/40 rounded-xl p-4 text-sm text-muted-foreground"
          >
            {error}
          </p>
        )}
        <section className="space-y-3">
          <h3 className="font-semibold">Serviços e medições</h3>
          {items.map((item) => (
            <article key={item.id} className="p-4 border border-border rounded-xl space-y-2">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{item.service_name}</p>
                  <p className="text-xs text-muted-foreground">{item.environment}</p>
                </div>
                {editable && (
                  <button
                    aria-label={`Remover ${item.service_name}`}
                    disabled={busy}
                    onClick={() => remove(item.id)}
                    className="size-8 grid place-items-center text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span>
                  {Number(item.quantity).toLocaleString("pt-BR")}{" "}
                  {BILLING_UNITS[item.billing_unit as keyof typeof BILLING_UNITS] ??
                    item.billing_unit}{" "}
                  × {money(Number(item.unit_price))}
                </span>
                <strong className="font-mono">
                  {money(Number(item.quantity) * Number(item.unit_price))}
                </strong>
              </div>
              {item.notes && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{item.notes}</p>
              )}
            </article>
          ))}
          {!loading && !error && !items.length && (
            <p className="text-sm text-muted-foreground">
              Nenhum item técnico lançado. A solicitação original permanece preservada acima.
            </p>
          )}
        </section>
        {editable && !error && !loading && (
          <form onSubmit={add} className="p-4 rounded-2xl border border-accent/30 space-y-3">
            <h3 className="font-semibold">Adicionar serviço ou ambiente</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-xs space-y-1 block">
                Serviço
                <input
                  required
                  maxLength={160}
                  className={inputCss}
                  value={draft.service_name}
                  onChange={(e) => setDraft({ ...draft, service_name: e.target.value })}
                />
              </label>
              <label className="text-xs space-y-1 block">
                Ambiente
                <input
                  required
                  maxLength={160}
                  className={inputCss}
                  value={draft.environment}
                  onChange={(e) => setDraft({ ...draft, environment: e.target.value })}
                  placeholder="Torre A · 8º andar"
                />
              </label>
              <label className="text-xs space-y-1 block">
                Unidade
                <select
                  className={inputCss}
                  value={draft.billing_unit}
                  onChange={(e) => setDraft({ ...draft, billing_unit: e.target.value })}
                >
                  {Object.entries(BILLING_UNITS).map(([key, title]) => (
                    <option key={key} value={key}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1 block">
                Quantidade
                <input
                  type="number"
                  required
                  min="0.001"
                  step="0.001"
                  className={inputCss}
                  value={draft.quantity}
                  onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                />
              </label>
              <label className="text-xs space-y-1 block">
                Preço unitário (R$)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCss}
                  value={draft.unit_price}
                  onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })}
                />
              </label>
              <label className="text-xs space-y-1 block">
                Observações
                <input
                  maxLength={1000}
                  className={inputCss}
                  value={draft.notes}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </label>
            </div>
            <button
              disabled={busy}
              className="px-4 py-2.5 inline-flex items-center gap-2 bg-accent text-accent-foreground rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{" "}
              Adicionar item
            </button>
          </form>
        )}
        {!editable && (
          <p className="text-sm text-muted-foreground">
            Proposta aprovada ou finalizada: medições preservadas para acompanhamento da obra.
          </p>
        )}
        <section className="border-t border-border pt-5 space-y-3">
          <h3 className="font-semibold">Histórico de situação</h3>
          {history.map((h) => (
            <div key={h.id} className="border-l-2 border-accent/40 pl-3 text-sm">
              <p>
                {h.old_status ? `${label(h.old_status)} → ` : ""}
                {label(h.new_status)}
              </p>
              <time className="text-xs text-muted-foreground">
                {new Date(h.created_at).toLocaleString("pt-BR")}
              </time>
            </div>
          ))}
          {!loading && !history.length && !error && (
            <p className="text-xs text-muted-foreground">
              Sem alterações registradas desde a ativação do histórico.
            </p>
          )}
        </section>
      </section>
    </div>
  );
}
