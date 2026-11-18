import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Search, ArrowRight } from "lucide-react";
import { SERVICES, type ServiceKey } from "@/components/preciso/services";
import { useServiceCatalog } from "@/components/preciso/use-service-catalog";

export const Route = createFileRoute("/_app/services")({
  head: () => ({
    meta: [
      { title: "Serviços — Ouro Branco" },
      {
        name: "description",
        content: "Todos os serviços de pintura, gesso, drywall, parede 3D e mais.",
      },
    ],
  }),
  component: ServicesRoute,
});

function ServicesRoute() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.replace(/\/$/, "") === "/services" ? <ServicesPage /> : <Outlet />;
}

const FILTERS: { key: "todos" | ServiceKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pintura", label: "Pintura" },
  { key: "gesso", label: "Gesso" },
  { key: "parede3d", label: "Parede 3D" },
  { key: "drywall", label: "Drywall" },
  { key: "textura", label: "Textura" },
];

function ServicesPage() {
  const { services, loading, error } = useServiceCatalog();
  const [filter, setFilter] = useState<"todos" | ServiceKey>("todos");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (filter !== "todos" && s.key !== filter) return false;
      if (
        query &&
        !`${s.name} ${s.short} ${s.description}`.toLowerCase().includes(query.toLowerCase())
      )
        return false;
      return true;
    });
  }, [filter, query, services]);

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-6">
      <header className="space-y-2 animate-fade-in-up">
        <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
          Catálogo
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter">Serviços</h1>
        <p className="text-muted-foreground text-sm">
          Escolha um serviço para ver detalhes e calcular.
        </p>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar serviços..."
          className="w-full bg-surface border border-border rounded-xl pl-11 pr-4 py-3.5 text-sm focus:border-accent outline-none transition-colors"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={
                "shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-full border transition-colors " +
                (active
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label="Carregando serviços">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-72 rounded-2xl bg-surface animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">
          Não foi possível consultar o catálogo. Tente novamente em instantes.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Nenhum serviço encontrado.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {filtered.map((s, i) => (
            <Link
              key={s.key}
              to="/services/$key"
              params={{ key: s.key }}
              className="group bg-surface border border-border rounded-2xl overflow-hidden hover:border-accent hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/10 transition-all animate-fade-in-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="relative aspect-[16/10] overflow-hidden">
                <img
                  src={s.image}
                  alt={s.name}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
                <span className="absolute top-3 right-3 text-[10px] font-mono font-bold text-accent bg-background/80 backdrop-blur px-2 py-1 rounded">
                  {s.pricePerM2 && s.billingUnit !== "sob orçamento"
                    ? `R$ ${s.pricePerM2.toLocaleString("pt-BR")}/${s.billingUnit}`
                    : "Sob orçamento"}
                </span>
              </div>
              <div className="p-5 space-y-3">
                <h3 className="font-extrabold tracking-tight uppercase">{s.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {s.description}
                </p>
                <div className="pt-2 flex items-center justify-between border-t border-border">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.billingUnit}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-accent group-hover:gap-2 transition-all">
                    Calcular orçamento <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
