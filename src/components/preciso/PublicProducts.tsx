import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { commercialFetch, moneyBR, quantityBR } from "@/lib/commercial-client";
import { CompanyRequestDialog, type RequestContext } from "./CompanyRequestDialog";
import gessoImage from "@/assets/service-gesso.jpg";
import "./commercial.css";

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
  const [selected, setSelected] = useState<RequestContext | null>(null);
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
        {(products.length ? products : status === "loading" ? [] : [sample]).map((product) => (
          <ProductCard key={product.id} product={product} onRequest={setSelected} />
        ))}
      </div>
      {selected && <CompanyRequestDialog context={selected} close={() => setSelected(null)} />}
    </section>
  );
}

const sample: PublicProduct = {
  id: "reference",
  name: "Gesso em pó",
  description: "Consulte o fornecimento de gesso por quilo ou em saco.",
  category: "Gesso",
  base_unit: "kg",
  image_url: "https://upload.wikimedia.org/wikipedia/commons/6/69/Plaster1.jpg",
  available: false,
  units: [
    { name: "1 quilo", factor: "1", price: "2" },
    { name: "Saco", factor: "", price: "25" },
  ],
};

function ProductCard({
  product,
  onRequest,
}: {
  product: PublicProduct;
  onRequest: (context: RequestContext) => void;
}) {
  const [unitName, setUnitName] = useState(product.units[0]?.name ?? "");
  const [quantity, setQuantity] = useState("1");
  const unit = product.units.find((entry) => entry.name === unitName);
  const reference = product.id === "reference";
  return (
    <article data-reveal>
      {product.image_url && (
        <div className="editorial-service-photo">
          <img
            src={product.image_url}
            alt={product.name}
            width="600"
            height="750"
            loading="lazy"
            onError={
              reference
                ? (event) => {
                    if (!event.currentTarget.src.endsWith(gessoImage))
                      event.currentTarget.src = gessoImage;
                  }
                : undefined
            }
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
      {reference && (
        <>
          <p className="editorial-caption">
            Valores ilustrativos. Confirme o preço, o peso do saco e o frete com a equipe.
          </p>
          <p className="editorial-caption">
            <a href="https://commons.wikimedia.org/wiki/File:Plaster1.jpg">
              Foto ilustrativa: Lionel Allorge
            </a>{" "}
            · <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>
          </p>
        </>
      )}
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
        {unit?.price != null && Number(quantity) > 0 && (
          <p aria-live="polite">Valor estimado {moneyBR(Number(unit.price) * Number(quantity))}</p>
        )}
        <button className="editorial-text-link">
          Solicitar orçamento <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </form>
    </article>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
