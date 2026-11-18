import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { commercialFetch, moneyBR, quantityBR } from "@/lib/commercial-client";
import { ScheduleDialog } from "./ScheduleDialog";

type PublicProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  base_unit: string;
  image_url: string | null;
  available: boolean;
  units: { name: string; factor: string; price: string | null }[];
};

export function PublicProducts() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [status, setStatus] = useState("loading");
  const [selected, setSelected] = useState<PublicProduct | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<PublicProduct[]>("catalogue", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setProducts(data);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, []);
  return (
    <section id="produtos" className="editorial-container editorial-section">
      <div className="editorial-section-heading" data-reveal>
        <div>
          <p className="editorial-kicker">MATERIAIS PARA A SUA OBRA</p>
          <h2>
            Produtos em gesso
            <br />
            <em>e acabamentos.</em>
          </h2>
        </div>
        <p>
          Consulte os materiais disponíveis e solicite uma proposta para a quantidade de que
          precisa.
        </p>
      </div>
      {status === "loading" && <p role="status">Carregando produtos…</p>}
      {status === "error" && (
        <p className="editorial-intro">
          O catálogo está indisponível no momento. Solicite uma avaliação para consultar os
          materiais.
        </p>
      )}
      {status === "ready" && !products.length && (
        <p className="editorial-intro">
          Consulte a equipe para saber quais materiais estão disponíveis para sua obra.
        </p>
      )}
      <div className="editorial-services">
        {products.map((product) => (
          <article key={product.id} data-reveal>
            {product.image_url && (
              <div className="editorial-service-photo">
                <img
                  src={product.image_url}
                  alt={product.name}
                  width="600"
                  height="750"
                  loading="lazy"
                />
              </div>
            )}
            <div className="editorial-service-title">
              <h3>{product.name}</h3>
            </div>
            <p>{product.description}</p>
            <p className="editorial-caption">
              {product.available ? "Disponível para consulta" : "Consulte a disponibilidade"}
            </p>
            {product.units.map((unit) => (
              <p key={unit.name}>
                {unit.name} · {quantityBR(unit.factor)} {product.base_unit}
                {unit.price !== null ? ` · ${moneyBR(unit.price)}` : ""}
              </p>
            ))}
            <button
              type="button"
              className="editorial-text-link"
              onClick={() => setSelected(product)}
            >
              Solicitar orçamento <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
      <ScheduleDialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        context={{ service: selected?.name }}
      />
    </section>
  );
}
