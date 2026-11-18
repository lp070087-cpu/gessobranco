import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Check, Calculator as CalcIcon } from "lucide-react";
import { SERVICES } from "@/components/preciso/services";
import { useServiceCatalog } from "@/components/preciso/use-service-catalog";
import { Calculator } from "@/components/preciso/Calculator";

export const Route = createFileRoute("/_app/services/$key")({
  head: ({ params }) => {
    const s = SERVICES.find((x) => x.key === params.key);
    return {
      meta: [
        { title: `${s?.name ?? "Serviço"} — Ouro Branco` },
        { name: "description", content: s?.description ?? "Detalhes do serviço" },
      ],
    };
  },
  component: ServiceDetail,
  notFoundComponent: () => (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Serviço não encontrado</h1>
      <Link to="/services" className="text-accent text-sm mt-4 inline-block">
        ← Voltar para serviços
      </Link>
    </div>
  ),
});

function ServiceDetail() {
  const { key } = Route.useParams();
  const { services, loading, error } = useServiceCatalog();
  const service = services.find((item) => item.key === key);
  if (loading)
    return (
      <p role="status" className="p-8 text-muted-foreground">
        Carregando serviço…
      </p>
    );
  if (error)
    return (
      <div role="alert" className="p-8">
        <p>Não foi possível carregar o serviço.</p>
        <Link to="/services" className="text-accent">
          Voltar aos serviços
        </Link>
      </div>
    );
  if (!service)
    return (
      <div className="p-8">
        <p>Serviço não encontrado.</p>
        <Link to="/services" className="text-accent">
          Voltar aos serviços
        </Link>
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-8">
      <Link
        to="/services"
        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Voltar
      </Link>

      {/* Hero */}
      <div className="grid lg:grid-cols-5 gap-6 md:gap-8 animate-fade-in-up">
        <div className="lg:col-span-3 relative aspect-[4/3] rounded-3xl overflow-hidden border border-border">
          <img
            src={service.image}
            alt={service.name}
            width={1200}
            height={900}
            className="absolute inset-0 size-full object-cover"
          />
        </div>
        <div className="lg:col-span-2 space-y-5">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent">
              {service.category}
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tighter mt-2">
              {service.name}
            </h1>
          </div>
          <p className="text-muted-foreground leading-relaxed text-pretty">{service.description}</p>

          <div className="bg-surface border border-border rounded-2xl p-5">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              A partir de
            </div>
            <div className="font-mono text-4xl font-extrabold tracking-tighter mt-1">
              {service.pricePerM2 === null
                ? "Sob avaliação"
                : service.pricePerM2.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
              {service.pricePerM2 !== null && (
                <span className="text-base text-muted-foreground font-normal">
                  /{service.billingUnit}
                </span>
              )}
            </div>
          </div>

          <a
            href="#calcular"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform"
          >
            <CalcIcon className="size-4" /> Calcular orçamento
          </a>
        </div>
      </div>

      {/* Benefits */}
      <section className="bg-surface border border-border rounded-3xl p-6 md:p-8">
        <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold mb-4">
          Benefícios
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {service.benefits.map((b: string) => (
            <div key={b} className="flex items-start gap-3">
              <div className="size-6 rounded-full bg-gold-soft text-accent flex items-center justify-center shrink-0 mt-0.5">
                <Check className="size-3.5" />
              </div>
              <span className="text-sm leading-relaxed">{b}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Calculator */}
      <section id="calcular">
        <Calculator />
      </section>
    </div>
  );
}
