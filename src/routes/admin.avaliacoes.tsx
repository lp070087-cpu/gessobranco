import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { AdminShell, EmptyState } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/avaliacoes")({ component: Page });

type Rating = {
  id: string;
  service_score: number;
  quality_score: number;
  punctuality_score: number;
  comment: string | null;
  created_at: string;
};

function Stars({ n }: { n: number }) {
  return (
    <div className="inline-flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={"size-3.5 " + (i < n ? "fill-accent text-accent" : "text-muted-foreground")}
        />
      ))}
    </div>
  );
}

function Page() {
  const [list, setList] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (s: string) => {
              order: (c: string, o: object) => Promise<{ data: Rating[] | null }>;
            };
          };
        }
      )
        .from("ratings")
        .select("*")
        .order("created_at", { ascending: false });
      setList(data ?? []);
      setLoading(false);
    })();
  }, []);

  const avg = (k: keyof Rating) =>
    list.length ? (list.reduce((s, r) => s + Number(r[k]), 0) / list.length).toFixed(1) : "—";

  return (
    <AdminShell title="Avaliações" subtitle={`${list.length} avaliações recebidas.`}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {(["service_score", "quality_score", "punctuality_score"] as const).map((k, i) => (
            <div key={k} className="bg-surface border border-border rounded-2xl p-5 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {["Atendimento", "Qualidade", "Pontualidade"][i]}
              </div>
              <div className="text-3xl font-extrabold tracking-tighter font-mono mt-1">
                {avg(k)}
              </div>
              <div className="text-xs text-accent mt-1">de 5,0</div>
            </div>
          ))}
        </div>
        {loading ? (
          <PanelSkeleton label="Carregando avaliações…" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Sem avaliações ainda"
            hint="Clientes podem avaliar após visitas realizadas."
          />
        ) : (
          <div className="space-y-3">
            {list.map((r) => (
              <article key={r.id} className="bg-surface border border-border rounded-2xl p-5">
                <div className="flex flex-wrap gap-4 text-xs">
                  <span>
                    Atend. <Stars n={r.service_score} />
                  </span>
                  <span>
                    Qual. <Stars n={r.quality_score} />
                  </span>
                  <span>
                    Pont. <Stars n={r.punctuality_score} />
                  </span>
                  <span className="ml-auto text-muted-foreground font-mono">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-muted-foreground italic mt-3">"{r.comment}"</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
