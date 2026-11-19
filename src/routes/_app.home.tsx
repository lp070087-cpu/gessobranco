import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Building2, CalendarCheck, FileText, HardHat, Plus, Ruler } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { SERVICES } from "@/components/preciso/services";
import bannerImg from "@/assets/banner-home.jpg";

export const Route = createFileRoute("/_app/home")({
  head: () => ({ meta: [{ title: "Seu projeto — OURO BRANCO" }] }),
  component: HomePage,
});
type QuoteSummary = {
  id: string;
  service_name: string;
  estimated_total: number;
  status: string;
  created_at: string;
};
const STATUS: Record<string, string> = {
  estimado: "Estimativa",
  aguardando_visita: "Aguardando visita",
  aprovado: "Aprovado",
  finalizado: "Concluído",
  cancelado: "Cancelado",
  em_analise: "Em análise",
  enviado: "Enviado",
  rejeitado: "Não aprovado",
};

function HomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<{ quotes: QuoteSummary[]; appointments: number } | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    void (async () => {
      try {
        const [quotes, appointments] = await Promise.all([
          supabase
            .from("quotes")
            .select("id,service_name,estimated_total,status,created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false }),
          supabase.from("appointments").select("id,status").eq("user_id", user.id),
        ]);
        if (!mounted) return;
        if (quotes.error || appointments.error) {
          setFailed(true);
          return;
        }
        setSummary({
          quotes: (quotes.data ?? []) as unknown as QuoteSummary[],
          appointments: (appointments.data ?? []).filter(
            (a) => !["cancelado", "concluido", "finalizado"].includes(a.status),
          ).length,
        });
      } catch {
        if (mounted) setFailed(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user]);
  const name = String(
    user?.user_metadata?.full_name ??
      user?.user_metadata?.name ??
      user?.email?.split("@")[0] ??
      "Cliente",
  ).split(" ")[0];
  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10 space-y-9 md:space-y-12">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow mb-2">Seu espaço OURO BRANCO</p>
          <h1 className="text-3xl md:text-4xl font-medium tracking-tighter">Olá, {name}.</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Tudo pronto para o próximo passo do seu projeto.
          </p>
        </div>
        <Link to="/minha-conta" className="gold-button">
          Comprar materiais
        </Link>
        <Link to="/calcular" className="gold-button">
          <Plus className="size-4" />
          Novo orçamento
        </Link>
      </header>
      <section
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        aria-label="Resumo dos seus projetos"
      >
        {[
          {
            label: "Meus orçamentos",
            value: summary?.quotes.length,
            icon: FileText,
            to: "/orcamentos",
          },
          {
            label: "Propostas aprovadas",
            value: summary?.quotes.filter((q) => q.status === "aprovado").length,
            icon: HardHat,
            to: "/orcamentos",
          },
          {
            label: "Visitas em aberto",
            value: summary?.appointments,
            icon: CalendarCheck,
            to: "/agenda",
          },
        ].map((item) => (
          <Link key={item.label} to={item.to} className="client-stat">
            <div className="flex justify-between items-center text-muted-foreground">
              <span className="text-xs">{item.label}</span>
              <item.icon className="size-4 text-accent" />
            </div>
            {failed ? (
              <p className="mt-4 text-xs text-muted-foreground">Consulta indisponível</p>
            ) : summary ? (
              <p className="text-4xl tracking-tight font-medium mt-4">{item.value}</p>
            ) : (
              <div
                className="w-16 h-9 mt-4 rounded bg-muted animate-pulse"
                aria-label="Carregando resumo"
              />
            )}
          </Link>
        ))}
      </section>
      <section className="relative overflow-hidden rounded-3xl border border-border min-h-[300px] sm:min-h-[340px] flex items-center">
        <img
          src={bannerImg}
          alt="Acabamento em ambiente residencial"
          width="1600"
          height="900"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/10" />
        <div className="relative p-7 md:p-11 max-w-lg">
          <p className="eyebrow mb-4">Planeje com confiança</p>
          <h2 className="text-3xl sm:text-4xl font-medium tracking-tighter leading-tight text-white">
            Da primeira parede
            <br />
            ao projeto completo.
          </h2>
          <p className="text-white/70 text-sm leading-relaxed mt-4 max-w-sm">
            Simule os acabamentos ou marque uma visita para definir o escopo com nossa equipe.
          </p>
          <Link
            to="/agendar"
            search={{ quoteId: undefined, service: "Visita técnica" }}
            className="gold-button mt-6"
          >
            Solicitar visita
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
      <section>
        <div className="flex justify-between items-end gap-3 mb-5">
          <div>
            <p className="eyebrow mb-2">Acompanhamento</p>
            <h2 className="text-2xl font-medium tracking-tight">Seus últimos orçamentos</h2>
          </div>
          <Link to="/orcamentos" className="text-xs text-accent inline-flex gap-2 items-center">
            Ver todos
            <ArrowRight className="size-3" />
          </Link>
        </div>
        {failed ? (
          <div className="rounded-2xl border border-border p-6 text-sm text-muted-foreground">
            Não foi possível carregar seu histórico. Acesse Orçamentos para tentar novamente.
          </div>
        ) : summary === null ? (
          <div className="h-32 rounded-2xl bg-surface animate-pulse" />
        ) : !summary.quotes.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Ruler className="size-8 text-accent shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium">Seu próximo ambiente começa aqui.</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Crie uma estimativa e acompanhe cada etapa no seu histórico.
              </p>
            </div>
            <Link to="/calcular" className="text-sm text-accent font-medium">
              Começar agora →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {summary.quotes.slice(0, 3).map((quote) => (
              <Link
                to="/orcamentos"
                key={quote.id}
                className="flex flex-wrap justify-between gap-3 p-5 rounded-2xl bg-surface border border-border hover:border-accent/40 transition-colors"
              >
                <div>
                  <h3 className="font-medium text-sm">{quote.service_name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(quote.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    {STATUS[quote.status] ?? quote.status.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="text-sm font-mono text-accent">
                  {Number(quote.estimated_total).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="grid md:grid-cols-2 gap-4">
        <Link to="/obras" className="client-stat flex items-start gap-4">
          <HardHat className="size-6 text-accent shrink-0" />
          <div>
            <h2 className="font-medium">Minhas obras</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              Acompanhe etapas, progresso e atualizações dos projetos aprovados.
            </p>
            <span className="text-xs text-accent inline-flex gap-2 items-center mt-4">
              Acompanhar obra
              <ArrowRight className="size-3" />
            </span>
          </div>
        </Link>
        <Link
          to="/agendar"
          search={{ quoteId: undefined, service: "Projeto de grande porte" }}
          className="client-stat flex items-start gap-4"
        >
          <Building2 className="size-6 text-accent shrink-0" />
          <div>
            <h2 className="font-medium">Um projeto maior?</h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-2">
              Casas completas, condomínios e empreendimentos exigem avaliação personalizada.
            </p>
            <span className="text-xs text-accent inline-flex gap-2 items-center mt-4">
              Conversar com a equipe
              <ArrowRight className="size-3" />
            </span>
          </div>
        </Link>
      </section>
      <section>
        <div className="flex justify-between items-end mb-5">
          <div>
            <p className="eyebrow mb-2">Explore as possibilidades</p>
            <h2 className="text-2xl font-medium tracking-tight">Acabamentos para o seu espaço</h2>
          </div>
          <Link to="/services" className="text-xs text-accent">
            Ver serviços →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {SERVICES.filter((s) => ["pintura", "gesso", "drywall", "textura"].includes(s.key)).map(
            (service) => (
              <Link
                to="/services/$key"
                params={{ key: service.key }}
                key={service.key}
                className="group overflow-hidden rounded-2xl border border-border bg-surface"
              >
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={service.image}
                    alt={service.name}
                    width="400"
                    height="300"
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4 text-sm font-medium">{service.name}</div>
              </Link>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
