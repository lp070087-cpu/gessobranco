import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HardHat, CalendarDays, CheckCircle2, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/obras")({
  head: () => ({ meta: [{ title: "Minhas obras — OURO BRANCO" }] }),
  component: ClientWorks,
});
import { projectDatabase as db } from "@/components/preciso/project-data";
type Project = {
  id: string;
  title: string;
  status: string;
  kind: string;
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
  end_date: string | null;
  progress: number;
};
type Payment = {
  id: string;
  project_id: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
};
const labels: Record<string, string> = {
  planejamento: "Planejamento",
  em_andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const money = (n: number) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (value: string | null) =>
  value ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR") : "A definir";

function ClientWorks() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]),
    [stages, setStages] = useState<Stage[]>([]),
    [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const pr = await db
          .from("projects")
          .select("*")
          .or(`user_id.eq.${user!.id},company_id.eq.${user!.id}`)
          .order("created_at", { ascending: false });
        if (pr.error)
          throw new Error("Não foi possível carregar suas obras. Tente novamente em instantes.");
        const list = (pr.data ?? []) as Project[];
        let nextStages: Stage[] = [],
          nextPayments: Payment[] = [];
        if (list.length) {
          const ids = list.map((p) => p.id);
          const [sr, fr] = await Promise.all([
            db
              .from("project_stages")
              .select("id,project_id,title,responsible_name,end_date,progress")
              .in("project_id", ids)
              .order("created_at"),
            db
              .from("project_payments")
              .select("id,project_id,description,amount,due_date,status")
              .in("project_id", ids)
              .order("due_date"),
          ]);
          if (sr.error || fr.error)
            throw new Error("Não foi possível consultar o andamento e as parcelas das obras.");
          nextStages = sr.data ?? [];
          nextPayments = fr.data ?? [];
        }
        if (active) {
          setProjects(list);
          setStages(nextStages);
          setPayments(nextPayments);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Falha ao carregar suas obras.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [user, reload]);
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-7">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-accent mb-2">
            Execução e acompanhamento
          </p>
          <h1 className="text-3xl font-semibold">Minhas obras</h1>
          <p className="text-sm text-muted-foreground mt-3">
            Veja o cronograma, as etapas e os pagamentos dos seus projetos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          disabled={loading}
          aria-label="Atualizar minhas obras"
          className="p-3 rounded-xl border border-border hover:border-accent disabled:opacity-50"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>
      {loading ? (
        <div role="status" className="space-y-4">
          <span className="sr-only">Carregando obras</span>
          {[0, 1].map((n) => (
            <div
              key={n}
              className="h-48 rounded-2xl bg-surface border border-border animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6"
        >
          <p className="text-sm">{error}</p>
          <button
            type="button"
            onClick={() => setReload((n) => n + 1)}
            className="mt-4 text-accent text-sm font-semibold"
          >
            Tentar novamente
          </button>
        </div>
      ) : !projects.length ? (
        <section className="bg-surface border border-dashed border-border rounded-3xl p-10 text-center">
          <HardHat className="size-10 mx-auto text-accent mb-4" />
          <h2 className="text-xl font-semibold">Seu próximo projeto começa com uma proposta.</h2>
          <p className="max-w-md mx-auto text-sm text-muted-foreground mt-3 leading-relaxed">
            As obras aparecem aqui quando sua proposta aprovada é programada pela equipe. Você
            poderá acompanhar cada etapa com segurança.
          </p>
          <Link
            to="/orcamentos"
            className="inline-flex items-center gap-2 mt-6 rounded-xl bg-accent text-accent-foreground px-5 py-3 text-sm font-semibold"
          >
            Ver meus orçamentos
            <ArrowRight className="size-4" />
          </Link>
        </section>
      ) : (
        projects.map((project) => {
          const ownStages = stages.filter((s) => s.project_id === project.id),
            ownPayments = payments.filter((p) => p.project_id === project.id);
          const received = ownPayments
            .filter((p) => p.status === "recebido")
            .reduce((sum, p) => sum + Number(p.amount), 0);
          return (
            <article
              key={project.id}
              className="preciso-card rounded-3xl bg-surface border border-border overflow-hidden"
            >
              <div className="p-5 sm:p-7 border-b border-border">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl sm:text-2xl font-semibold">{project.title}</h2>
                  <span className="text-xs rounded-full border border-accent/25 bg-accent/10 text-accent px-3 py-1.5">
                    {labels[project.status] ?? project.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Responsável: {project.responsible_name || "A definir pela equipe"}
                </p>
                <div className="flex justify-between items-center gap-3 mt-6 text-sm">
                  <span>Progresso das etapas</span>
                  <strong className="font-mono">{Number(project.progress).toFixed(0)}%</strong>
                </div>
                <progress
                  aria-label={`Progresso de ${project.title}`}
                  max={100}
                  value={Number(project.progress)}
                  className="w-full h-2 mt-3 accent-accent"
                />
                <div className="mt-5 grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-accent" />
                    Início: {date(project.start_date)}
                  </p>
                  <p>Previsão de entrega: {date(project.end_date)}</p>
                </div>
                {project.notes && (
                  <p className="mt-5 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {project.notes}
                  </p>
                )}
              </div>
              <div className="grid lg:grid-cols-2">
                <section className="p-5 sm:p-7 lg:border-r border-border">
                  <h3 className="font-semibold mb-4">Etapas de execução</h3>
                  {!ownStages.length ? (
                    <p className="text-sm text-muted-foreground">
                      O cronograma detalhado está em preparação.
                    </p>
                  ) : (
                    <ol className="space-y-4">
                      {ownStages.map((stage) => (
                        <li key={stage.id} className="flex items-start gap-3">
                          <CheckCircle2
                            className={`size-4 mt-1 shrink-0 ${Number(stage.progress) >= 100 ? "text-emerald-400" : "text-muted-foreground"}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="font-medium">{stage.title}</span>
                              <span className="font-mono shrink-0">
                                {Number(stage.progress).toFixed(0)}%
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {stage.responsible_name || "Equipe PRECISO"} · previsão{" "}
                              {date(stage.end_date)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="p-5 sm:p-7 border-t lg:border-t-0 border-border">
                  <h3 className="font-semibold mb-4">Situação financeira</h3>
                  <dl className="grid grid-cols-2 gap-4 mb-5">
                    <div>
                      <dt className="text-xs text-muted-foreground">Proposta aprovada</dt>
                      <dd className="font-mono text-lg mt-1">{money(project.total_amount)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Recebido pela equipe</dt>
                      <dd className="font-mono text-lg mt-1">{money(received)}</dd>
                    </div>
                  </dl>
                  {ownPayments.length ? (
                    <ul className="space-y-3">
                      {ownPayments.map((payment) => (
                        <li
                          key={payment.id}
                          className="p-3 rounded-xl border border-border text-sm"
                        >
                          <div className="flex justify-between gap-3">
                            <span>{payment.description}</span>
                            <strong className="font-mono shrink-0">{money(payment.amount)}</strong>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            {payment.status === "recebido"
                              ? "Recebido"
                              : payment.status === "cancelado"
                                ? "Cancelado"
                                : `Pendente · vencimento ${date(payment.due_date)}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma parcela programada até o momento.
                    </p>
                  )}
                </section>
              </div>
            </article>
          );
        })
      )}
    </div>
  );
}
