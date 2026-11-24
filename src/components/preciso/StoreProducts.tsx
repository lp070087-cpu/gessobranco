import { useState } from "react";
import { Search } from "lucide-react";
import { moneyBR, quantityBR, type Product } from "@/lib/commercial-client";
import { ExampleCards } from "@/components/preciso/ExampleCards";

const low = (product: Product) =>
  product.active && Number(product.balance) <= Number(product.minimum_stock);

/** Produtos em cartões, com busca e filtro: funciona bem no computador e no celular. */
export function ProductCards({
  products,
  edit,
  create,
}: {
  products: Product[];
  edit: (product: Product) => void;
  create: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"todos" | "baixo" | "site" | "inativos">("todos");
  const text = query.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = products.filter((product) => {
    const name = (product.name + " " + product.category)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
    if (text && !name.includes(text)) return false;
    if (filter === "baixo") return low(product);
    if (filter === "site") return product.published;
    if (filter === "inativos") return !product.active;
    return true;
  });
  const counts = {
    todos: products.length,
    baixo: products.filter(low).length,
    site: products.filter((product) => product.published).length,
    inativos: products.filter((product) => !product.active).length,
  };
  return (
    <section className="panel">
      <div className="panel-title-row">
        <h2>Produtos e unidades</h2>
        <button className="action primary" onClick={create}>
          Cadastrar produto
        </button>
      </div>
      <p className="hint">
        Toque no produto para mudar preço, unidades, estoque mínimo e se aparece no site.
      </p>
      <label className="search-field">
        <Search className="size-4" aria-hidden="true" />
        <input
          type="search"
          placeholder="Buscar produto ou categoria"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Buscar produto"
        />
      </label>
      <div className="filter-chips" role="group" aria-label="Filtrar produtos">
        {(
          [
            ["todos", "Todos"],
            ["baixo", "Estoque baixo"],
            ["site", "No site"],
            ["inativos", "Inativos"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="hint space">Nenhum produto encontrado.</p>}
      <div className="product-cards">
        {shown.map((product) => (
          <button
            type="button"
            key={product.id}
            className={"product-card" + (low(product) ? " is-low" : "")}
            onClick={() => edit(product)}
          >
            <span className="product-card-top">
              <strong>{product.name}</strong>
              <small>{product.category || "Sem categoria"}</small>
            </span>
            <span className="product-stock">
              <b>{quantityBR(product.balance)}</b> {product.base_unit}
              {low(product) && <em>Repor</em>}
            </span>
            <span className="product-units">
              {product.units.map((unit) => (
                <span key={unit.id}>
                  <span>{unit.name}</span>
                  <b>{unit.price === null ? "Sem preço" : moneyBR(unit.price)}</b>
                </span>
              ))}
            </span>
            {product.purchase_reference && (
              <small>
                Custo de referência:{" "}
                {moneyBR(product.purchase_reference.cost / product.purchase_reference.quantity)} /{" "}
                {product.base_unit}
              </small>
            )}
            <span className="product-tags">
              <span>{product.published ? "No site" : "Só na loja"}</span>
              {!product.active && <span>Inativo</span>}
              {product.example && <span>Exemplo</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Explicação simples de cada tipo de ajuste do estoque. */
export function StockGuide() {
  return (
    <ExampleCards
      title="Qual opção usar?"
      hint="Escolha a operação de acordo com o que aconteceu. Sempre diga o motivo, para o dono saber depois."
      cards={[
        {
          title: "Contagem física",
          tag: "Conferência",
          lines: [
            "Contou na prateleira? Coloque quanto tem de verdade.",
            "O sistema acerta a diferença sozinho.",
            "Ex.: o sistema diz 80 placas, você contou 75 → coloque 75.",
          ],
        },
        {
          title: "Entrada por ajuste",
          tag: "Somar",
          lines: [
            "Entrou produto sem ser compra.",
            "Ex.: sobrou material de uma obra e voltou para a loja.",
            "Compra de fornecedor vai na aba Compras.",
          ],
        },
        {
          title: "Saída por ajuste",
          tag: "Tirar",
          lines: [
            "Saiu produto sem ser venda.",
            "Ex.: material usado numa obra da própria empresa.",
          ],
        },
        {
          title: "Perda ou avaria",
          tag: "Prejuízo",
          lines: [
            "Quebrou, molhou ou estragou.",
            "Ex.: 3 placas quebradas na descarga.",
            "Entra como prejuízo no relatório.",
          ],
        },
      ]}
    />
  );
}

/** Saldo atual em cartões, com aviso do que precisa repor. */
export function StockBalances({ products }: { products: Product[] }) {
  const [all, setAll] = useState(false);
  const active = products.filter((product) => product.active);
  const lowItems = active.filter(low);
  const ordered = [...lowItems, ...active.filter((product) => !low(product))];
  const shown = all ? ordered : ordered.slice(0, Math.max(6, lowItems.length));
  return (
    <section className="panel">
      <h2>Saldo atual</h2>
      <p className="hint">
        {lowItems.length
          ? `${lowItems.length} produto(s) no estoque mínimo ou abaixo. Eles aparecem primeiro.`
          : "Tudo acima do estoque mínimo."}
      </p>
      <div className="stock-cards">
        {shown.map((product) => (
          <div key={product.id} className={"stock-card" + (low(product) ? " is-low" : "")}>
            <span>{product.name}</span>
            <b>
              {quantityBR(product.balance)} <small>{product.base_unit}</small>
            </b>
            <small>Mínimo: {quantityBR(product.minimum_stock)}</small>
          </div>
        ))}
      </div>
      {ordered.length > shown.length || all ? (
        <button type="button" className="action space" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Ver todos os ${ordered.length} produtos`}
        </button>
      ) : null}
    </section>
  );
}
