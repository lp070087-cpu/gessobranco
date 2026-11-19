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
          Escolha o material, a unidade e a quantidade para consultar a compra. Se já tem uma lista
          de materiais, deixe os detalhes no pedido.
        </p>
      </div>
      {status === "loading" && <PanelSkeleton label="Carregando produtos…" />}
      {status === "error" && (
        <p className="editorial-intro">
          O catálogo está indisponível no momento. Você pode enviar uma consulta de material à
          equipe.
        </p>
      )}
      {status === "ready" && !products.length && (
        <p className="editorial-intro">
          Os materiais abaixo são referências para consulta. Confirme preço, embalagem e
          disponibilidade com a equipe.
        </p>
      )}
      <div className="editorial-services catalogue-grid">
        {(status === "loading"
          ? []
          : [
              ...products,
              ...references.filter(
                (reference) =>
                  !products.some((product) => family(product.name) === family(reference.name)),
              ),
            ]
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
  {
    name: "Gesso em pó",
    match: /(?:^gesso$|\bgesso (?:em po|a granel|em saco)\b)/,
    description:
      "Para acabamentos em paredes e tetos. Consulte a apresentação e a unidade de venda.",
  },
  {
    name: "Placa de gesso",
    match: /\bplacas? de gesso\b/,
    description: "Placas para montagem de forros e acabamentos.",
  },
  {
    name: "Bloco de gesso",
    match: /\bblocos? de gesso\b/,
    description: "Blocos para divisórias e vedações internas.",
  },
  {
    name: "Alicate",
    match: /\balicates?\b/,
    description: "Ferramenta para corte e manuseio na instalação.",
  },
  {
    name: "Arame",
    match: /\barames?\b/,
    description: "Consulte os tipos de arame para sua instalação.",
  },
  {
    name: "Trena",
    match: /\btrenas?\b/,
    description: "Trena para medir os ambientes e planejar os cortes.",
  },
];

function family(name: string) {
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(drywall|impermeavel|mineral|acartonad[oa]s?)\b/.test(normalized)) return -1;
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
  units:
    index === 0
      ? [
          { name: "Quilo", factor: "1", price: null },
          { name: "Meio saco", factor: "", price: null },
          { name: "Saco", factor: "", price: null },
        ]
      : [],
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
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = product.image_url === failedImage ? null : product.image_url;
  const amount = Number(quantity);
  const validQuantity = Number.isFinite(amount) && amount >= 0.000001 && amount <= 1_000_000;
  const unitId = customer ? unit?.id : undefined;
  const [pricing, setPricing] = useState<{
    unit: string;
    quantity: string;
    price: number | string | null;
    next_tier: { quantity: number; price: number } | null;
  } | null>(null);
  useEffect(() => {
    if (!unitId || !validQuantity) return;
    const controller = new AbortController();
    const id = unitId;
    const timeout = window.setTimeout(() => {
      void commercialFetch<Pick<NonNullable<typeof pricing>, "price" | "next_tier">>(
        "portal/price",
        {
          unit_id: id,
          quantity: amount,
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
  }, [amount, quantity, unitId, validQuantity]);
  const quote = pricing?.unit === unitId && pricing?.quantity === quantity ? pricing : null;
  const estimate = unitId ? quote?.price : unit?.price;
  const tier = quote?.next_tier;
  return (
    <article className="catalogue-card" data-reveal>
      {image ? (
        <div className="editorial-service-photo catalogue-photo">
          <img
            src={image}
            alt={product.name}
            width="600"
            height="600"
            loading="lazy"
            onError={() => setFailedImage(image)}
          />
        </div>
      ) : imageIndex >= 0 ? (
        <div
          className="catalogue-photo catalogue-illustration"
          role="img"
          aria-label={`Ilustração de ${materials[imageIndex].name.toLowerCase()}`}
          style={{
            backgroundPosition: `${(imageIndex % 3) * 50}% ${imageIndex < 3 ? 0 : 100}%`,
          }}
        >
          <span className="editorial-caption">Imagem ilustrativa</span>
        </div>
      ) : (
        <div className="editorial-service-photo catalogue-photo catalogue-placeholder">
          <span className="editorial-caption">Imagem indisponível</span>
        </div>
      )}
      <div className="editorial-service-title">
        <h3>{product.name}</h3>
      </div>
      <p>{product.description}</p>
      <p className="editorial-caption">
        {reference
          ? "Material sob consulta"
          : product.available
            ? "Disponível para consulta"
            : "Consulte a disponibilidade"}
      </p>
      <form
        className="commercial request-fields"
        onSubmit={(event) => {
          event.preventDefault();
          onRequest({
            kind: "material",
            subject: product.name,
            product_id: reference || !unitName ? undefined : product.id,
            unit_name: unitName || undefined,
            quantity: unitName ? amount : undefined,
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
        {unit?.factor && validQuantity && (
          <p>
            {quantityBR(Number(unit.factor) * amount)} {product.base_unit}
          </p>
        )}
        <p aria-live="polite">
          {estimate != null && validQuantity
            ? `Valor estimado ${moneyBR(Number(estimate) * amount)} · ${moneyBR(estimate)} por unidade`
            : "Preço sob consulta"}
        </p>
        {tier && (
          <p aria-live="polite">
            Faltam {quantityBR(tier.quantity - amount)} para pagar{" "}
            <strong>{moneyBR(tier.price)}</strong> por unidade.{" "}
            <button type="button" onClick={() => setQuantity(String(tier.quantity))}>
              Aplicar faixa de {quantityBR(tier.quantity)}
            </button>
          </p>
        )}
        <div className="catalogue-actions">
          {!reference && (
            <Link to="/minha-conta" search={{ secao: "materiais" }} className="editorial-text-link">
              Ver preços por quantidade na minha conta <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          )}
          <button className="editorial-text-link" type="submit">
            Consultar compra <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </article>
  );
}
