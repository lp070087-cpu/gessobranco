import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, FileText, TrendingUp, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkspaceShell, StatCard } from "@/components/preciso/WorkspaceShell";

export const Route = createFileRoute("/workspace/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { user } = useAuth();
  const [visits, setVisits] = useState(0);
  const [quotes, setQuotes] = useState(0);
  const [shares, setShares] = useState(0);
  const [daily, setDaily] = useState<{ day: string; visits: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceIso = since.toISOString();
      const [{ count: v }, { count: q }, { count: s }, { data: vd }] = await Promise.all([
        supabase
          .from("page_visits")
          .select("id", { head: true, count: "exact" })
          .eq("owner_id", user.id)
          .gte("created_at", sinceIso),
        supabase
          .from("quotes")
          .select("id", { head: true, count: "exact" })
          .gte("created_at", sinceIso),
        supabase
          .from("shares")
          .select("id", { head: true, count: "exact" })
          .eq("owner_id", user.id)
          .gte("created_at", sinceIso),
        supabase
          .from("page_visits")
          .select("created_at")
          .eq("owner_id", user.id)
          .gte("created_at", sinceIso),
      ]);
      setVisits(v ?? 0);
      setQuotes(q ?? 0);
      setShares(s ?? 0);
      const buckets = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      (vd ?? []).forEach((row) => {
        const k = (row.created_at as string).slice(0, 10);
        if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
      });
      setDaily(
        Array.from(buckets.entries()).map(([day, visits]) => ({ day: day.slice(5), visits })),
      );
    })();
  }, [user]);

  const max = Math.max(1, ...daily.map((d) => d.visits));
  const conv = visits ? ((quotes / visits) * 100).toFixed(1) : "0.0";

  return (
    <WorkspaceShell title="Analytics" subtitle="Últimos 30 dias da sua página pública.">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Visitas" value={visits} hint="página pública" icon={Eye} accent />
        <StatCard label="Orçamentos" value={quotes} hint="gerados" icon={FileText} />
        <StatCard label="Compartilhamentos" value={shares} hint="canais" icon={Share2} />
        <StatCard
          label="Conversão"
          value={`${conv}%`}
          hint="visita → orçamento"
          icon={TrendingUp}
          accent
        />
      </div>

      <div className="bg-surface border border-border rounded-2xl p-6">
        <div className="text-sm font-bold mb-4">Visitas por dia (últimos 7 dias)</div>
        <div className="flex items-end gap-2 h-48">
          {daily.map((d) => (
            <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
              <div className="text-[10px] font-mono text-muted-foreground">{d.visits}</div>
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-accent to-accent/40 transition-all hover:from-accent hover:to-accent"
                style={{ height: `${(d.visits / max) * 100}%`, minHeight: 4 }}
              />
              <div className="text-[10px] text-muted-foreground">{d.day}</div>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  );
}
