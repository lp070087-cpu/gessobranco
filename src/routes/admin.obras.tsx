import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { HardHat, Plus, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, EmptyState } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/obras")({ component: Works });
// New operational tables are introduced by 20261023020000_project_operations.sql.
// Keep this adapter local until Supabase types are regenerated against that migration.
import { projectDatabase as db } from "@/components/preciso/project-data";
type Project = {
  id: string;
  quote_id: string;
  user_id: string;
  title: string;
  kind: string;
  status: string;
  responsible_name: string;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  total_amount: number;
  notes: string;
};
type Stage = {
  id: string;
  project_id: string;
  title: string;
  responsible_name: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  notes: string;
};
type Payment = {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  status: string;
  due_date: string;
  paid_at: string | null;
};
type Quote = { id: string; user_id: string; service_name: string; estimated_total: number };
const labels: Record<string, string> = {
  planejamento: "Planejamento",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const money = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const input =
  "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-accent";
const button =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50";

function Works() {
  const [projects, setProjects] = useState<Project[]>([]),
    [quotes, setQuotes] = useState<Quote[]>([]);
  const [stages, setStages] = useState<Stage[]>([]),
    [payments, setPayments] = useState<Payment[]>([]);
  const [selected, setSelected] = useState<string>(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [create, setCreate] = useState(false);
  const project = projects.find((p) => p.id === selected);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const [pr, qr] = await Promise.all([
        db.from("projects").select("*").order("created_at", { ascending: false }),
        supabase
          .from("quotes")
          .select("id,user_id,service_name,estimated_total")
          .eq("status", "aprovado"),
      ]);
      if (pr.error || qr.error)
        throw new Error(
          "Não foi possível consultar as obras. Verifique a conexão e a aplicação da migração operacional.",
        );
      const next = (pr.data ?? []) as Project[];
      setProjects(next);
      setQuotes((qr.data ?? []) as Quote[]);
      setSelected((current) =>
        next.some((p) => p.id === current) ? current : (next[0]?.id ?? ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar obras.");
    } finally {
      setLoading(false);
    }
  }
  async function loadDetails(id: string) {
    try {
      const [sr, pr] = await Promise.all([
        db.from("project_stages").select("*").eq("project_id", id).order("created_at"),
        db.from("project_payments").select("*").eq("project_id", id).order("due_date"),
      ]);
      if (sr.error || pr.error) throw new Error("Não foi possível carregar as etapas e parcelas.");
      setStages(sr.data ?? []);
      setPayments(pr.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar detalhes.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setStages([]);
    setPayments([]);
    if (selected) void loadDetails(selected);
  }, [selected]);
  async function execute(action: () => PromiseLike<{ error: unknown }>, message: string) {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await action();
      if (result.error) throw result.error;
      toast.success(message);
      await load();
      if (selected) await loadDetails(selected);
      return true;
    } catch {
      toast.error(
        "A alteração não foi salva. Verifique sua conexão, permissões e os campos informados.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    const quote = quotes.find((q) => q.id === f.get("quote"));
    if (!quote) return;
    const saved = await execute(
      () =>
        db.from("projects").insert({
          quote_id: quote.id,
          user_id: quote.user_id,
          title: String(f.get("title")).trim(),
          kind: String(f.get("kind") ?? "residencial"),
          responsible_name: String(f.get("responsible")).trim(),
          total_amount: quote.estimated_total,
        }),
      "Obra criada a partir do orçamento aprovado",
    );
    if (saved) setCreate(false);
  }
  function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const f = new FormData(event.currentTarget);
    void execute(
      () =>
        db
          .from("projects")
          .update({
            title: String(f.get("title")).trim(),
            status: String(f.get("status") ?? "planejamento"),
            responsible_name: String(f.get("responsible")).trim(),
            start_date: String(f.get("start") ?? "") || null,
            end_date: String(f.get("end") ?? "") || null,
            notes: String(f.get("notes")),
          })
          .eq("id", project.id),
      "Planejamento atualizado",
    );
  }
  function addStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const form = event.currentTarget;
    const f = new FormData(form);
    void execute(
      () =>
        db.from("project_stages").insert({
          project_id: project.id,
          title: String(f.get("title")).trim(),
          responsible_name: String(f.get("responsible")).trim(),
          start_date: String(f.get("start") ?? "") || null,
          end_date: String(f.get("end") ?? "") || null,
        }),
      "Etapa criada",
    ).then((saved) => {
      if (saved) form.reset();
    });
  }
  function addPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project) return;
    const form = event.currentTarget;
    const f = new FormData(form);
    const amount = Number(f.get("amount"));
    if (!Number.isFinite(amount) || amount <= 0) return;
    void execute(
      () =>
        db.from("project_payments").insert({
          project_id: project.id,
          description: String(f.get("description")).trim(),
          amount,
          due_date: String(f.get("due") ?? ""),
        }),
      "Parcela registrada",
    ).then((saved) => {
      if (saved) form.reset();
    });
  }
  const availableQuotes = quotes.filter((q) => !projects.some((p) => p.quote_id === q.id));
  const received = payments
    .filter((p) => p.status === "recebido")
    .reduce((a, p) => a + Number(p.amount), 0);
  const pending = payments
    .filter((p) => p.status === "pendente")
    .reduce((a, p) => a + Number(p.amount), 0);
  return (
    <AdminShell
      title="Obras"
      subtitle="Do orçamento aprovado à entrega, com etapas, responsáveis e parcelas."
    >
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <p className="text-sm text-muted-foreground">{projects.length} obra(s) cadastrada(s)</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl border border-border px-3 py-2"
            aria-label="Atualizar obras"
          >
            <RefreshCw className="size-4" />
          </button>
          <button type="button" onClick={() => setCreate(!create)} className={button}>
            <Plus className="size-4" />
            Nova obra
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          {error}
        </div>
      )}
      {create && (
        <form
          onSubmit={createProject}
          className="rounded-2xl border border-accent/30 bg-surface p-5 mb-6 grid sm:grid-cols-2 gap-4"
        >
          <h2 className="sm:col-span-2 font-semibold">
            Criar obra vinculada a uma proposta aprovada
          </h2>
          <label className="text-xs space-y-2">
            Orçamento
            <select name="quote" required className={input}>
              <option value="">Selecione uma proposta</option>
              {availableQuotes.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.service_name} · {money(q.estimated_total)} · {q.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-2">
            Nome da obra
            <input name="title" required minLength={3} maxLength={180} className={input} />
          </label>
          <label className="text-xs space-y-2">
            Tipo
            <select name="kind" className={input}>
              {Object.entries({
                residencial: "Residencial",
                casa: "Casa completa",
                edificio: "Edifício",
                condominio: "Condomínio",
                fachada: "Fachada",
                comercial: "Comercial",
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-2">
            Responsável
            <input name="responsible" maxLength={180} className={input} />
          </label>
          {!availableQuotes.length && (
            <p className="sm:col-span-2 text-xs text-muted-foreground">
              Aprove um orçamento antes de criar uma obra. Cada proposta pode originar uma obra.
            </p>
          )}
          <button disabled={busy || !availableQuotes.length} className={button}>
            Criar obra
          </button>
        </form>
      )}
      {loading ? (
        <PanelSkeleton label="Carregando obras…" />
      ) : !projects.length ? (
        <EmptyState
          icon={HardHat}
          title="Nenhuma obra cadastrada"
          hint="Converta uma proposta aprovada em obra para acompanhar a execução."
        />
      ) : (
        <div className="grid xl:grid-cols-[280px_minmax(0,1fr)] gap-6">
          <nav aria-label="Lista de obras" className="space-y-3">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                aria-pressed={selected === p.id}
                className={`w-full text-left rounded-2xl border p-4 bg-surface ${selected === p.id ? "border-accent/60" : "border-border"}`}
              >
                <p className="font-semibold text-sm">{p.title}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  {labels[p.status]} · {Number(p.progress).toFixed(0)}%
                </p>
                <progress
                  className="w-full h-1.5 mt-3 accent-accent"
                  value={Number(p.progress)}
                  max={100}
                />
              </button>
            ))}
          </nav>
          {project && (
            <div className="space-y-6 min-w-0">
              <form
                key={project.id}
                onSubmit={saveProject}
                className="bg-surface border border-border rounded-2xl p-5 grid sm:grid-cols-2 gap-4"
              >
                <h2 className="sm:col-span-2 font-semibold text-lg">Planejamento da obra</h2>
                <label className="text-xs space-y-2">
                  Nome
                  <input
                    name="title"
                    defaultValue={project.title}
                    minLength={3}
                    maxLength={180}
                    required
                    className={input}
                  />
                </label>
                <label className="text-xs space-y-2">
                  Situação
                  <select name="status" defaultValue={project.status} className={input}>
                    {Object.entries(labels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs space-y-2">
                  Responsável
                  <input
                    name="responsible"
                    defaultValue={project.responsible_name}
                    maxLength={180}
                    className={input}
                  />
                </label>
                <div className="text-sm flex items-center">
                  Valor aprovado:{" "}
                  <strong className="ml-2 font-mono">{money(project.total_amount)}</strong>
                </div>
                <label className="text-xs space-y-2">
                  Início
                  <input
                    name="start"
                    type="date"
                    defaultValue={project.start_date ?? ""}
                    className={input}
                  />
                </label>
                <label className="text-xs space-y-2">
                  Previsão de entrega
                  <input
                    name="end"
                    type="date"
                    defaultValue={project.end_date ?? ""}
                    className={input}
                  />
                </label>
                <label className="text-xs space-y-2 sm:col-span-2">
                  Observações
                  <textarea
                    name="notes"
                    defaultValue={project.notes}
                    maxLength={10000}
                    rows={3}
                    className={input}
                  />
                </label>
                <button disabled={busy} className={button}>
                  Salvar planejamento
                </button>
              </form>
              <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
                <h2 className="font-semibold text-lg">Etapas e progresso</h2>
                <p className="text-xs text-muted-foreground">
                  Progresso geral calculado pela média das etapas cadastradas.
                </p>
                {stages.map((stage) => (
                  <form
                    key={stage.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void execute(
                        () =>
                          db
                            .from("project_stages")
                            .update({ progress: Number(f.get("progress")) })
                            .eq("id", stage.id),
                        "Progresso da etapa atualizado",
                      );
                    }}
                    className="rounded-xl bg-background p-4 flex flex-wrap items-end gap-3"
                  >
                    <div className="flex-1 min-w-40">
                      <p className="text-sm font-medium">{stage.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stage.responsible_name || "Responsável a definir"} ·{" "}
                        {stage.end_date
                          ? new Date(stage.end_date + "T12:00:00").toLocaleDateString("pt-BR")
                          : "Prazo a definir"}
                      </p>
                    </div>
                    <label className="text-xs">
                      Progresso (%)
                      <input
                        name="progress"
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        defaultValue={Number(stage.progress)}
                        required
                        className={input + " mt-1 max-w-24"}
                      />
                    </label>
                    <button disabled={busy} className={button}>
                      Salvar
                    </button>
                  </form>
                ))}
                <form
                  onSubmit={addStage}
                  className="grid sm:grid-cols-2 gap-3 border-t border-border pt-4"
                >
                  <label className="text-xs">
                    Etapa
                    <input
                      name="title"
                      required
                      minLength={2}
                      maxLength={180}
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-xs">
                    Responsável
                    <input name="responsible" maxLength={180} className={input + " mt-1"} />
                  </label>
                  <label className="text-xs">
                    Início
                    <input name="start" type="date" className={input + " mt-1"} />
                  </label>
                  <label className="text-xs">
                    Conclusão prevista
                    <input name="end" type="date" className={input + " mt-1"} />
                  </label>
                  <button disabled={busy} className={button}>
                    <Plus className="size-4" />
                    Adicionar etapa
                  </button>
                </form>
              </section>
              <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
                <h2 className="font-semibold text-lg">Pagamentos por etapa</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 rounded-xl bg-background">
                    <p className="text-xs text-muted-foreground">Recebido</p>
                    <p className="font-mono text-lg mt-1">{money(received)}</p>
                  </div>
                  <div className="p-4 rounded-xl bg-background">
                    <p className="text-xs text-muted-foreground">Parcelas pendentes</p>
                    <p className="font-mono text-lg mt-1">{money(pending)}</p>
                  </div>
                </div>
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="rounded-xl bg-background p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {payment.description} · {money(payment.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Vencimento{" "}
                        {new Date(payment.due_date + "T12:00:00").toLocaleDateString("pt-BR")} ·{" "}
                        {payment.status === "recebido"
                          ? "Recebido"
                          : payment.status === "cancelado"
                            ? "Cancelado"
                            : "Pendente"}
                      </p>
                    </div>
                    {payment.status === "pendente" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm("Confirmar que esta parcela foi efetivamente recebida?")
                          )
                            void execute(
                              () =>
                                db
                                  .from("project_payments")
                                  .update({ status: "recebido", paid_at: new Date().toISOString() })
                                  .eq("id", payment.id),
                              "Recebimento registrado",
                            );
                        }}
                        className={button}
                      >
                        <CheckCircle2 className="size-4" />
                        Registrar recebimento
                      </button>
                    )}
                  </div>
                ))}
                <form
                  onSubmit={addPayment}
                  className="grid sm:grid-cols-3 gap-3 border-t border-border pt-4"
                >
                  <label className="text-xs">
                    Descrição
                    <input
                      name="description"
                      required
                      minLength={2}
                      maxLength={180}
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-xs">
                    Valor (R$)
                    <input
                      name="amount"
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      max="999999999999"
                      className={input + " mt-1"}
                    />
                  </label>
                  <label className="text-xs">
                    Vencimento
                    <input name="due" required type="date" className={input + " mt-1"} />
                  </label>
                  <button disabled={busy} className={button}>
                    Adicionar parcela
                  </button>
                </form>
              </section>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
