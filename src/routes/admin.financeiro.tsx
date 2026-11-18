import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, TrendingUp, Clock, RefreshCw, AlertTriangle } from "lucide-react";
import { AdminShell, StatCard, EmptyState } from "@/components/preciso/AdminShell";
import { adminDb } from "@/components/preciso/admin-data";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin/financeiro")({ component: Page });
const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
type Payment = {
  id: string;
  description: string;
  project_id: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
};
type Quote = { estimated_total: number; status: string };

function Page() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);
  const [period, setPeriod] = useState("12");
  const load = async () => {
    setLoading(true);
    setError("");
    const [q, p] = await Promise.all([
      adminDb.from("quotes").select("estimated_total,status"),
      adminDb.from("project_payments").select("*").order("due_date"),
    ]);
    if (q.error)
      setError("Não foi possível carregar os orçamentos. Verifique sua conexão e permissões.");
    else setQuotes(q.data ?? []);
    setPaymentsUnavailable(Boolean(p.error));
    if (!p.error) setPayments(p.data ?? []);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);
  const estimated = quotes.reduce((sum, q) => sum + Number(q.estimated_total), 0);
  const approved = quotes
    .filter((q) => ["aprovado", "finalizado"].includes(q.status))
    .reduce((sum, q) => sum + Number(q.estimated_total), 0);
  const received = payments
    .filter((p) => p.status === "recebido")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const pending = payments
    .filter((p) => p.status === "pendente")
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const monthly = Array.from({ length: Number(period) }, (_, i) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - Number(period) + i + 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return {
      month: date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      revenue: payments
        .filter((p) => p.status === "recebido" && p.paid_at?.slice(0, 7) === key)
        .reduce((sum, p) => sum + Number(p.amount), 0),
    };
  });
  return (
    <AdminShell
      title="Financeiro"
      subtitle="Estimativas, propostas aprovadas e recebimentos separados com clareza."
    >
      <div className="space-y-6" aria-busy={loading}>
        <div className="flex flex-wrap justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Pagamentos e parcelas são gerenciados em cada obra.
          </p>
          <button
            disabled={loading}
            onClick={load}
            className="inline-flex gap-2 items-center text-sm text-accent disabled:opacity-50"
          >
            <RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} /> Atualizar
          </button>
        </div>
        {error && (
          <p role="alert" className="p-4 border border-destructive rounded-xl text-destructive">
            {error}
          </p>
        )}
        {paymentsUnavailable && (
          <div role="status" className="p-4 rounded-xl border border-accent/40 flex gap-3">
            <AlertTriangle className="size-5 shrink-0 text-accent" />
            <p className="text-sm text-muted-foreground">
              Recebimentos indisponíveis. A tabela de pagamentos requer a migração operacional e
              permissões válidas. Nenhum orçamento é contado automaticamente como pagamento.
            </p>
          </div>
        )}
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Estimativas"
            value={loading ? "…" : fmt(estimated)}
            hint="Todas as solicitações; não é receita"
            icon={TrendingUp}
          />
          <StatCard
            label="Propostas aprovadas"
            value={loading ? "…" : fmt(approved)}
            icon={Wallet}
          />
          <StatCard
            label="Recebido"
            value={loading || paymentsUnavailable ? "Indisponível" : fmt(received)}
            hint="Somente pagamentos confirmados"
            icon={Wallet}
            accent
          />
          <StatCard
            label="Parcelas pendentes"
            value={loading || paymentsUnavailable ? "Indisponível" : fmt(pending)}
            icon={Clock}
          />
        </div>
        {!paymentsUnavailable && (
          <>
            <section className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex justify-between items-center gap-3 mb-5">
                <h2 className="text-lg font-bold">Recebimentos mensais</h2>
                <select
                  aria-label="Período do gráfico"
                  className="bg-background border border-border rounded-lg p-2 text-sm"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                >
                  <option value="3">3 meses</option>
                  <option value="6">6 meses</option>
                  <option value="12">12 meses</option>
                </select>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip
                    formatter={(v) => fmt(Number(v))}
                    contentStyle={{
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 12,
                    }}
                  />
                  <Area
                    dataKey="revenue"
                    name="Recebido"
                    stroke="var(--color-accent)"
                    fill="var(--color-accent)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </section>
            {!payments.length ? (
              <EmptyState
                icon={Wallet}
                title="Nenhum pagamento registrado"
                hint="Cadastre as etapas financeiras na página de Obras."
              />
            ) : (
              <div className="overflow-x-auto border border-border rounded-2xl bg-surface">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-border text-muted-foreground">
                      <th className="p-4">Parcela</th>
                      <th className="p-4">Vencimento</th>
                      <th className="p-4">Situação</th>
                      <th className="p-4 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        <td className="p-4">{p.description}</td>
                        <td className="p-4 whitespace-nowrap">
                          {p.due_date
                            ? p.due_date.split("-").reverse().join("/")
                            : "Sem vencimento"}
                        </td>
                        <td className="p-4">
                          {p.status === "recebido"
                            ? "Recebido"
                            : p.status === "cancelado"
                              ? "Cancelado"
                              : "Pendente"}
                        </td>
                        <td className="p-4 text-right font-mono whitespace-nowrap">
                          {fmt(Number(p.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <Link
          to={"/admin/obras" as string}
          className="inline-flex py-3 px-5 rounded-xl bg-accent text-accent-foreground font-semibold text-sm"
        >
          Gerenciar obras e pagamentos
        </Link>
      </div>
    </AdminShell>
  );
}
