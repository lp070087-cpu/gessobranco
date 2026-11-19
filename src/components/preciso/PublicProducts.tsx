import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { commercialFetch, moneyBR, quantityBR } from "@/lib/commercial-client";
import { hasManagementAccess } from "./AccountMenu";
import type { CompanyActor } from "@/lib/company-permissions";
import { CompanyRequestDialog, type RequestContext } from "./CompanyRequestDialog";
import { PanelSkeleton } from "./LoadingSkeleton";
import "./commercial.css";

type PublicProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  base_unit: string;
  image_url: string | null;
  available: boolean;
  units: { id?: string; name: string; factor: string; price: string | null }[];
};

export function PublicProducts() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [status, setStatus] = useState("loading");
  const [selected, setSelected] = useState<RequestContext | null>(null);
  const [customer, setCustomer] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<{ user: CompanyActor }>("auth/me", undefined, controller.signal)
      .then(({ user }) => {
        if (!controller.signal.aborted) setCustomer(!hasManagementAccess(user));
      })
      .catch(() => {});
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
      {status === "loading" && <PanelSkeleton label="Carregando produtos…" />}
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
        {(status === "loading"
          ? []
          : [...products, ...references.filter((reference) =>
              !products.some((product) => family(product.name) === family(reference.name)),
            )]
        ).map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            customer={customer}
            onRequest={setSelected}
          />
        ))}
      </div>
      {selected && <CompanyRequestDialog context={selected} close={() => setSelected(null)} />}
    </section>
  );
}

const materials = [
  { name: "Gesso em pó", match: /\bgesso\b/, description: "Gesso a granel ou em saco para serviços de acabamento." },
  { name: "Placa de gesso", match: /\bplacas?\b/, description: "Placas para montagem de forros e acabamentos." },
  { name: "Bloco de gesso", match: /\bblocos?\b/, description: "Blocos para divisórias e vedações internas." },
  { name: "Alicate", match: /\balicates?\b/, description: "Ferramenta para corte e manuseio na instalação." },
  { name: "Arame", match: /\barames?\b/, description: "Consulte os tipos de arame para sua instalação." },
  { name: "Trena", match: /\btrenas?\b/, description: "Trena para medir os ambientes e planejar os cortes." },
];

function family(name: string) {
  const normalized = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const specific = materials.findIndex(({ match }, index) => index > 0 && match.test(normalized));
  return specific >= 0 ? specific : materials[0].match.test(normalized) ? 0 : -1;
}

const references: PublicProduct[] = materials.map(({ name, description }, index) => ({
  id: `reference-${index}`,
  name,
  description,
  category: "",
  base_unit: "kg",
  image_url: null,
  available: false,
  units: index === 0 ? [
    { name: "1 quilo", factor: "1", price: "2" },
    { name: "Saco", factor: "", price: "25" },
    { name: "Meio saco (20 kg)", factor: "20", price: "15" },
  ] : [],
}));

function ProductCard({
  product,
  onRequest,
  customer,
}: {
  product: PublicProduct;
  onRequest: (context: RequestContext) => void;
  customer: boolean;
}) {
  const [unitName, setUnitName] = useState(product.units[0]?.name ?? "");
  const [quantity, setQuantity] = useState("1");
  const unit = product.units.find((entry) => entry.name === unitName);
  const reference = product.id.startsWith("reference-");
  const imageIndex = family(product.name);
  const unitId = customer ? unit?.id : undefined;
  const [pricing, setPricing] = useState<{
    unit: string;
    quantity: string;
    price: number | string | null;
    next_tier: { quantity: number; price: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!unitId || Number(quantity) <= 0 || Number(quantity) > 1_000_000) return;
    const controller = new AbortController();
    const id = unitId;
    const timeout = window.setTimeout(() => {
      void commercialFetch<Pick<NonNullable<typeof pricing>, "price" | "next_tier">>(
        "portal/price",
        {
          unit_id: id,
          quantity: Number(quantity),
        },
        controller.signal,
      )
        .then((quote) => {
          if (!controller.signal.aborted) setPricing({ unit: id, quantity, ...quote });
        })
        .catch(() => {});
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [unitId, quantity]);
  const quote = pricing?.unit === unitId && pricing?.quantity === quantity ? pricing : null;
  const estimate = unitId ? quote?.price : unit?.price;
  const tier = quote?.next_tier;
  return (
    <article data-reveal>
      {product.image_url ? (
        <div className="editorial-service-photo">
          <img src={product.image_url} alt={product.name} width="600" height="750" loading="lazy" />
        </div>
      ) : imageIndex >= 0 ? (
        <div
          role="img"
          aria-label={`Ilustração de ${materials[imageIndex].name.toLowerCase()}`}
          style={{
            aspectRatio: "1",
            borderRadius: "8px",
            backgroundImage: "url('/materiais-ouro-branco.png')",
            backgroundSize: "300% 200%",
            backgroundPosition: `${(imageIndex % 3) * 50}% ${imageIndex < 3 ? 0 : 100}%`,
          }}
        />
      ) : null}
      <div className="editorial-service-title">
        <h3>{product.name}</h3>
      </div>
      <p>{product.description}</p>
      <p className="editorial-caption">
        {product.available ? "Disponível para consulta" : "Consulte a disponibilidade"}
      </p>
      {reference && imageIndex === 0 && (
        <p className="editorial-caption">
          Preços de referência. Confirme o valor, o peso da embalagem e o frete com a equipe.
        </p>
      )}
      {reference && imageIndex !== 0 && <p className="editorial-caption">Preço sob consulta</p>}
      <form
        className="commercial request-fields"
        onSubmit={(event) => {
          event.preventDefault();
          onRequest({
            kind: "material",
            subject: product.name,
            product_id: reference || !unitName ? undefined : product.id,
            unit_name: unitName || undefined,
            quantity: unitName ? Number(quantity) : undefined,
            order_unit_id: unitId,
          });
        }}
      >
        {product.units.length > 0 && (
          <div className="product-estimate">
            <label>
              Unidade
              <select value={unitName} onChange={(event) => setUnitName(event.target.value)}>
                {product.units.map((entry) => (
                  <option key={entry.name} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade
              <input
                type="number"
                required
                min="0.000001"
                max="1000000"
                step="0.000001"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
          </div>
        )}
        {unit?.factor && Number(quantity) > 0 && (
          <p>
            {quantityBR(Number(unit.factor) * Number(quantity))} {product.base_unit}
          </p>
        )}
        {estimate != null && Number(quantity) > 0 && (
          <p aria-live="polite">
            Valor estimado {moneyBR(Number(estimate) * Number(quantity))} · {moneyBR(estimate)} por
            unidade
          </p>
        )}
        {tier && (
          <p aria-live="polite">
            Faltam {quantityBR(tier.quantity - Number(quantity))} para pagar{" "}
            <strong>{moneyBR(tier.price)}</strong> por unidade.{" "}
            <button type="button" onClick={() => setQuantity(String(tier.quantity))}>
              Aplicar faixa de {quantityBR(tier.quantity)}
            </button>
          </p>
        )}
        <button className="editorial-text-link">
          Solicitar orçamento <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </form>
      {!reference && (
        <Link to="/minha-conta" search={{ secao: "materiais" }} className="editorial-text-link">
          Ver preços por quantidade na minha conta <ArrowUpRight size={17} aria-hidden="true" />
        </Link>
      )}
    </article>
  );
}
