import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  Building2,
  FileText,
  CalendarDays,
  TrendingUp,
  Wallet,
  Activity,
} from "lucide-react";
import { AdminShell, StatCard } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { adminDb } from "@/components/preciso/admin-data";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type Stats = {
  users: number;
  companies: number;
  quotes: number;
  appts: number;
  revenue: number;
  trend: { day: string; quotes: number; appts: number }[];
  topServices: { name: string; total: number }[];
  approved: number;
  received: number | null;
  pending: number | null;
  works: number | null;
};

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);
  const [displayed, setDisplayed] = useState({
    users: 0,
    companies: 0,
    quotes: 0,
    appts: 0,
    revenue: 0,
  });

  useEffect(() => {
    (async () => {
      const [profilesRes, quotesRes, apptsRes, worksRes, paymentsRes] = await Promise.all([
        supabase.from("profiles").select("id, account_type"),
        supabase.from("quotes").select("estimated_total, service_name, created_at, status"),
        supabase.from("appointments").select("id, scheduled_date, created_at, status"),
        adminDb.from("projects").select("id,status"),
        adminDb.from("project_payments").select("amount,status"),
      ]);
      if (profilesRes.error || quotesRes.error || apptsRes.error) {
        setError(true);
        return;
      }
      const profiles = profilesRes.data ?? [];
      const quotes = (quotesRes.data ?? []) as {
        estimated_total: number;
        service_name: string;
        created_at: string;
        status: string;
      }[];
      const appts = (apptsRes.data ?? []) as {
        id: string;
        created_at: string;
        status: string;
        scheduled_date: string;
      }[];

      const users = profiles.filter((p) => p.account_type === "cliente").length;
      const companies = profiles.filter((p) => p.account_type === "empresa").length;
      const revenue = quotes.reduce((s, q) => s + Number(q.estimated_total ?? 0), 0);

      // last 7 days trend
      const days: { day: string; quotes: number; appts: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
        days.push({
          day: label,
          quotes: quotes.filter((q) => q.created_at.slice(0, 10) === key).length,
          appts: appts.filter((a) => a.created_at.slice(0, 10) === key).length,
        });
      }

      const tally: Record<string, number> = {};
      quotes.forEach((q) => {
        tally[q.service_name] = (tally[q.service_name] ?? 0) + 1;
      });
      const topServices = Object.entries(tally)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, total]) => ({ name, total }));

      setStats({
        users,
        companies,
        quotes: quotes.length,
        appts: appts.filter((a) =>
          ["aguardando_confirmacao", "confirmado", "a_caminho"].includes(a.status),
        ).length,
        revenue,
        trend: days,
        topServices,
        approved: quotes
          .filter((q) => ["aprovado", "finalizado"].includes(q.status))
          .reduce((sum, q) => sum + Number(q.estimated_total), 0),
        works: worksRes.error
          ? null
          : worksRes.data.filter((w) => w.status === "em_andamento").length,
        received: paymentsRes.error
          ? null
          : paymentsRes.data
              .filter((p) => p.status === "recebido")
              .reduce((sum, p) => sum + Number(p.amount), 0),
        pending: paymentsRes.error
          ? null
          : paymentsRes.data
              .filter((p) => p.status === "pendente")
              .reduce((sum, p) => sum + Number(p.amount), 0),
      });
    })();
  }, []);

  // animated counters
  useEffect(() => {
    if (!stats) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayed(stats);
      return;
    }
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayed({
        users: Math.round(stats.users * e),
        companies: Math.round(stats.companies * e),
        quotes: Math.round(stats.quotes * e),
        appts: Math.round(stats.appts * e),
        revenue: Math.round(stats.revenue * e),
      });
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    let frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stats]);

  return (
    <AdminShell title="Visão geral" subtitle="Pulso da plataforma — atualizado em tempo real.">
      <div className="space-y-6">
        {error && (
          <p role="alert" className="p-4 rounded-xl border border-destructive text-destructive">
            Não foi possível carregar os indicadores. Verifique conexão e permissões; os números não
            foram atualizados.
          </p>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard label="Usuários" value={displayed.users} icon={Users} accent />
          <StatCard label="Empresas" value={displayed.companies} icon={Building2} />
          <StatCard label="Orçamentos" value={displayed.quotes} icon={FileText} />
          <StatCard label="Visitas" value={displayed.appts} icon={CalendarDays} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Obras em andamento"
            value={stats?.works ?? "Indisponível"}
            icon={Building2}
          />
          <StatCard
            label="Receita aprovada"
            value={stats ? fmtBRL(stats.approved) : "…"}
            icon={Wallet}
          />
          <StatCard
            label="Receita recebida"
            value={stats?.received == null ? "Indisponível" : fmtBRL(stats.received)}
            icon={Wallet}
            accent
          />
          <StatCard
            label="Parcelas pendentes"
            value={stats?.pending == null ? "Indisponível" : fmtBRL(stats.pending)}
            icon={FileText}
          />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                  Crescimento semanal
                </div>
                <h3 className="font-extrabold tracking-tighter">Orçamentos & visitas (7d)</h3>
              </div>
              <Activity className="size-5 text-accent" />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats?.trend ?? []}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-navy)" stopOpacity={0.75} />
                    <stop offset="100%" stopColor="var(--color-navy)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="quotes"
                  stroke="var(--color-accent)"
                  fill="url(#g1)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="appts"
                  stroke="var(--color-navy)"
                  fill="url(#g2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-surface border border-accent/40 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
                Faturamento estimado
              </div>
              <Wallet className="size-5 text-accent" />
            </div>
            <div className="text-3xl md:text-4xl font-extrabold tracking-tighter font-mono">
              {fmtBRL(displayed.revenue)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Soma de todos os orçamentos estimados.
            </p>
            <div className="mt-4 pt-4 border-t border-border space-y-2">
              <Row
                label="Ticket médio"
                value={stats && stats.quotes ? fmtBRL(stats.revenue / stats.quotes) : "—"}
              />
              <Row
                label="Taxa orç. / visita"
                value={
                  stats && stats.quotes ? `${Math.round((stats.appts / stats.quotes) * 100)}%` : "—"
                }
              />
            </div>
          </div>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                Mais solicitados
              </div>
              <h3 className="font-extrabold tracking-tighter">Top 5 serviços</h3>
            </div>
            <TrendingUp className="size-5 text-accent" />
          </div>
          {!stats?.topServices?.length ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Sem dados ainda — quando clientes pedirem orçamento, eles aparecem aqui.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats.topServices}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" fill="var(--color-accent)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}
