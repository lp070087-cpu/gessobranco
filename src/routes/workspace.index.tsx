import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Users,
  Package,
  MapPin,
  Wallet,
  CalendarDays,
  TrendingUp,
  FileText,
  ArrowRight,
} from "lucide-react";
import { StatCard, WorkspaceShell } from "@/components/preciso/WorkspaceShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/workspace/")({
  component: WorkspaceHome,
});

function WorkspaceHome() {
  const { user } = useAuth();
  const [team, setTeam] = useState(0);
  const [products, setProducts] = useState(0);
  const [regions, setRegions] = useState(0);
  const [quotes, setQuotes] = useState(0);
  const [appts, setAppts] = useState(0);
  const [revenue, setRevenue] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1);
      const [{ count: t }, { count: p }, { count: r }, { count: q }, { count: a }, finRes] =
        await Promise.all([
          supabase
            .from("team_members")
            .select("id", { head: true, count: "exact" })
            .eq("owner_id", user.id),
          supabase
            .from("products")
            .select("id", { head: true, count: "exact" })
            .eq("owner_id", user.id),
          supabase
            .from("service_regions")
            .select("id", { head: true, count: "exact" })
            .eq("owner_id", user.id),
          supabase
            .from("quotes")
            .select("id", { head: true, count: "exact" })
            .gte("created_at", monthStart.toISOString()),
          supabase
            .from("appointments")
            .select("id", { head: true, count: "exact" })
            .gte("scheduled_date", monthStart.toISOString().slice(0, 10)),
          supabase
            .from("financial_entries")
            .select("amount,kind")
            .eq("owner_id", user.id)
            .gte("entry_date", monthStart.toISOString().slice(0, 10)),
        ]);
      setTeam(t ?? 0);
      setProducts(p ?? 0);
      setRegions(r ?? 0);
      setQuotes(q ?? 0);
      setAppts(a ?? 0);
      const sum = (finRes.data ?? []).reduce<number>(
        (acc, e) => acc + (e.kind === "entrada" ? Number(e.amount) : -Number(e.amount)),
        0,
      );
      setRevenue(sum);
    })();
  }, [user]);

  return (
    <WorkspaceShell title="Visão geral" subtitle="Operação do mês corrente">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Equipe" value={team} hint="profissionais ativos" icon={Users} accent />
        <StatCard label="Produtos" value={products} hint="no catálogo" icon={Package} />
        <StatCard label="Regiões" value={regions} hint="cidades atendidas" icon={MapPin} />
        <StatCard label="Orçamentos / mês" value={quotes} hint="solicitações" icon={FileText} />
        <StatCard label="Visitas / mês" value={appts} hint="agendamentos" icon={CalendarDays} />
        <StatCard
          label="Faturamento"
          value={`R$ ${revenue.toFixed(0)}`}
          hint="líquido do mês"
          icon={Wallet}
          accent
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ActionCard
          to="/workspace/produtos"
          title="Cadastrar produto"
          desc="Adicione tintas, massas, gesso e iluminação ao catálogo."
          icon={Package}
        />
        <ActionCard
          to="/workspace/equipe"
          title="Convidar profissional"
          desc="Adicione pintores, gesseiros e ajudantes da sua equipe."
          icon={Users}
        />
        <ActionCard
          to="/workspace/regioes"
          title="Definir região"
          desc="Configure cidades e bairros atendidos."
          icon={MapPin}
        />
        <ActionCard
          to="/workspace/assinatura"
          title="Gerenciar assinatura"
          desc="Veja seu plano atual, vencimento e faça upgrade."
          icon={TrendingUp}
        />
      </div>
    </WorkspaceShell>
  );
}

function ActionCard({
  to,
  title,
  desc,
  icon: I,
}: {
  to: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      to={to}
      className="group bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-accent transition-colors"
    >
      <div className="size-12 rounded-xl bg-background border border-border flex items-center justify-center text-accent">
        <I className="size-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground group-hover:text-accent group-hover:translate-x-1 transition-all" />
    </Link>
  );
}
