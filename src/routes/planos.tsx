import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Sparkles, Crown, Briefcase, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/planos")({
  head: () => ({
    meta: [
      { title: "Planos — Ouro Branco" },
      {
        name: "description",
        content: "Escolha o plano ideal para autônomos e empresas de pintura, gesso e reformas.",
      },
      { property: "og:title", content: "Planos Ouro Branco" },
      {
        property: "og:description",
        content: "Autônomo, Empresa e Premium — orçamento ilimitado, equipe e regiões.",
      },
    ],
  }),
  component: PlansPage,
});

type Plan = {
  id: string;
  key: string;
  name: string;
  tagline: string;
  monthly_price: number;
  audience: string;
  highlighted: boolean;
  features: string[];
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  autonomo: Briefcase,
  empresa: Building2,
  premium: Crown,
};

function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plans")
        .select("id,key,name,tagline,monthly_price,audience,highlighted,features,sort_order")
        .eq("is_active", true)
        .order("sort_order");
      setPlans((data ?? []) as unknown as Plan[]);
      setLoading(false);
    })();
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 bg-accent rounded-sm flex items-center justify-center">
              <div className="size-3.5 border-2 border-background rotate-45" />
            </div>
            <span className="font-extrabold tracking-tighter text-lg uppercase">
              Ouro Branco<span className="text-accent">.</span>
            </span>
          </Link>
          <Link
            to="/signup"
            className="px-4 py-2 bg-accent text-accent-foreground text-xs font-bold uppercase tracking-widest rounded-full"
          >
            Criar conta
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24 text-center space-y-4 animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-accent/20 bg-gold-soft text-accent text-[10px] font-bold uppercase tracking-widest">
          <Sparkles className="size-3" /> Planos SaaS
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tighter">
          Cresça com a <span className="text-accent">Ouro Branco</span>
        </h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Escolha o plano certo para o tamanho do seu time. Sem fidelidade, cancele quando quiser.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-4 md:px-6 pb-24">
        {loading ? (
          <PanelSkeleton label="Carregando planos…" />
        ) : (
          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {plans.map((p) => {
              const I = ICONS[p.key] ?? Sparkles;
              return (
                <div
                  key={p.id}
                  className={
                    "relative rounded-3xl border p-7 md:p-8 bg-surface flex flex-col gap-5 transition-all hover:-translate-y-1 " +
                    (p.highlighted
                      ? "border-accent shadow-[0_30px_80px_-30px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]"
                      : "border-border hover:border-accent/40")
                  }
                >
                  {p.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-widest">
                      Mais escolhido
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div
                      className={
                        "size-12 rounded-2xl flex items-center justify-center " +
                        (p.highlighted
                          ? "bg-accent text-accent-foreground"
                          : "bg-background border border-border text-accent")
                      }
                    >
                      <I className="size-5" />
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.audience}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold tracking-tighter">{p.name}</h3>
                    <p className="text-sm text-muted-foreground">{p.tagline}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-5xl font-extrabold tracking-tighter">
                      R$ {Number(p.monthly_price).toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground">/mês</span>
                  </div>
                  <ul className="space-y-2.5 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="size-4 text-accent shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/workspace"
                    className={
                      "mt-auto text-center px-5 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all " +
                      (p.highlighted
                        ? "bg-accent text-accent-foreground hover:scale-[1.02]"
                        : "border border-border hover:border-accent hover:text-accent")
                    }
                  >
                    Conhecer {p.name}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-10">
          Cobrança via PIX ou cartão de crédito · Cancele a qualquer momento · A cobrança real será
          habilitada em breve.
        </p>
      </section>
    </main>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
