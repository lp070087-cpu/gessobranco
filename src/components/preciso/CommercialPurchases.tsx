import { useRef, useState, type FormEvent } from "react";
import {
  localDay,
  moneyBR,
  quantityBR,
  type CommercialState,
  type Purchase,
} from "@/lib/commercial-client";
import { CommandForm, paymentOptions, type Command } from "./CommercialForms";

export function groupPurchases(purchases: Purchase[]) {
  const groups = new Map<string, Purchase[]>();
  for (const item of purchases) {
    const id = item.delivery_id ?? item.id;
    const group = groups.get(id);
    if (group) group.push(item);
    else groups.set(id, [item]);
  }
  return [...groups.values()];
}

const emptyItem = (id: number) => ({ id, productId: "", unit: "", quantity: "", total: "" });
const kilogram = /^(kg|quilo(s)?|quilograma(s)?)$/i;
const tonne = /^(t|ton|tonelada(s)?)$/i;
const piece = /^(un|und|unid|unidade(s)?|peça(s)?)\.?$/i;
const tonnesInKilograms = "tonnes-in-kilograms";

function purchaseUnits(product: CommercialState["products"][number]) {
  const options = product.units.map((unit) => ({
    value: unit.id,
    label: kilogram.test(unit.name.trim())
      ? "Quilo (kg)"
      : tonne.test(unit.name.trim())
        ? "Tonelada (t)"
        : unit.name,
    stockUnitId: unit.id,
    multiplier: 1,
    factor: Number(unit.factor),
  }));
  const kg = kilogram.test(product.base_unit.trim()) && options.find((unit) => unit.factor === 1);
  if (
    kg &&
    !product.units.some((unit) => tonne.test(unit.name.trim()) && Number(unit.factor) === 1000)
  ) {
    options.push({
      value: tonnesInKilograms,
      label: "Tonelada (t)",
      stockUnitId: kg.stockUnitId,
      multiplier: 1000,
      factor: 1000,
    });
  }
  return options;
}
const cents = (value: string | number | null) => Math.round(Number(value) * 100);

export function PurchaseDeliveryForm({
  state,
  command,
}: {
  state: CommercialState;
  command: Command;
}) {
  const [items, setItems] = useState([emptyItem(0)]);
  const [freight, setFreight] = useState("");
  const [extras, setExtras] = useState("");
  const [busy, setBusy] = useState(false);
  const next = useRef(1);
  const products = state.products.filter((product) => product.units.length > 0 && !product.example);
  const [error, setError] = useState("");
  const subtotal = items.reduce((total, row) => total + cents(row.total), 0);
  const update = (id: number, patch: Partial<ReturnType<typeof emptyItem>>) =>
    setItems((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    setBusy(true);
    try {
      const lines = items.map((row) => {
        const product = products.find((entry) => entry.id === row.productId);
        const unit = product && purchaseUnits(product).find((option) => option.value === row.unit);
        if (!product || !unit) throw new Error("Selecione o produto e a unidade de cada material.");
        const quantity = Number((Number(row.quantity) * unit.multiplier).toFixed(6));
        return {
          product_id: product.id,
          unit_id: unit.stockUnitId,
          quantity,
          goods_total: Number(row.total),
        };
      });
      await command("purchase_delivery", {
        items: lines,
        freight: Number(freight),
        other_costs: Number(extras),
        supplier_id: data.get("supplier_id") || null,
        reference: data.get("reference"),
        purchased_at: data.get("purchased_at"),
        due_on: data.get("due_on") || null,
        reason: data.get("reason") || "Compra e entrada",
      });
      setItems([emptyItem(next.current++)]);
      setFreight("");
      setExtras("");
      form.reset();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível registrar a compra.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2>Registrar compra e entrega</h2>
      <p className="hint">
        Adicione tudo o que chegou no mesmo pedido. Informe a quantidade e o valor total de cada
        material.
      </p>
      <fieldset disabled={busy}>
        {items.map((item, index) => {
          const product = products.find((entry) => entry.id === item.productId);
          const units = product ? purchaseUnits(product) : [];
          const selected = units.find((unit) => unit.value === item.unit);
          const whole = !!product && piece.test(product.base_unit.trim());
          const stockQuantity = Number(item.quantity) * (selected?.factor ?? 0);
          return (
            <div className="ouro-form-group space" key={item.id}>
              <div className="actions">
                <strong>Material {index + 1}</strong>
                {items.length > 1 && (
                  <button
                    className="action"
                    type="button"
                    onClick={() => setItems((rows) => rows.filter((row) => row.id !== item.id))}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="fields">
                <label>
                  Produto
                  <select
                    value={item.productId}
                    onChange={(event) => {
                      const productId = event.target.value;
                      const nextProduct = products.find((entry) => entry.id === productId);
                      const choices = nextProduct ? purchaseUnits(nextProduct) : [];
                      const base = choices.find((unit) => unit.factor === 1);
                      update(item.id, {
                        productId,
                        unit: base?.value ?? choices[0]?.value ?? "",
                        quantity: "",
                        total: "",
                      });
                    }}
                    required
                  >
                    <option value="">Selecione um produto</option>
                    {products.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                        {entry.category ? " · " + entry.category : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidade da compra
                  <select
                    value={item.unit}
                    disabled={!product}
                    onChange={(event) =>
                      update(item.id, { unit: event.target.value, quantity: "" })
                    }
                    required
                  >
                    <option value="">Selecione a unidade</option>
                    {units.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantidade {selected && <small>em {selected.label}</small>}
                  <input
                    type="number"
                    min={whole ? 1 : "0.000001"}
                    max={selected?.multiplier === 1000 ? 10000 : 10000000}
                    step={whole ? 1 : "0.000001"}
                    disabled={!selected}
                    value={item.quantity}
                    onChange={(event) => update(item.id, { quantity: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Valor total do material (R$){" "}
                  <input
                    type="number"
                    min="0"
                    max="1000000000"
                    step="0.01"
                    value={item.total}
                    onChange={(event) => update(item.id, { total: event.target.value })}
                    required
                  />
                </label>
              </div>
              {product && selected && selected.factor !== 1 && stockQuantity > 0 && (
                <p className="hint">
                  Entrada no estoque: {quantityBR(stockQuantity)} {product.base_unit}.
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="action"
          disabled={items.length >= 30}
          onClick={() => setItems([...items, emptyItem(next.current++)])}
        >
          Adicionar material
        </button>
        {!products.length && (
          <p className="hint">
            Cadastre um produto e sua unidade na aba Produtos para registrar uma compra.
          </p>
        )}
        <div className="fields space">
          <label>
            Frete total da entrega (R$){" "}
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              placeholder="0,00"
              value={freight}
              onChange={(event) => setFreight(event.target.value)}
            />
          </label>
          <label>
            Outros custos da entrega (R$){" "}
            <input
              type="number"
              min="0"
              max="1000000000"
              step="0.01"
              placeholder="0,00"
              value={extras}
              onChange={(event) => setExtras(event.target.value)}
            />
          </label>
          <label>
            Data da compra{" "}
            <input name="purchased_at" type="date" required defaultValue={localDay()} />
          </label>
          <label>
            Vencimento <input name="due_on" type="date" />
          </label>
          <label>
            Fornecedor{" "}
            <select name="supplier_id">
              <option value="">Não informado</option>
              {state.suppliers.map(({ id, name }) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nota ou referência <input name="reference" maxLength={200} />
          </label>
          <label className="full">
            Observações <input name="reason" maxLength={500} />
          </label>
        </div>
        <p className="hint">
          O frete e os outros custos são rateados pelo valor dos materiais para apurar o custo de
          cada lote.
        </p>
        <p className="space">
          Materiais {moneyBR(subtotal / 100)} ·{" "}
          <strong>Total {moneyBR((subtotal + cents(freight) + cents(extras)) / 100)}</strong>
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <button className="action primary" disabled={!products.length}>
          {busy ? "Salvando…" : "Registrar compra"}
        </button>
      </fieldset>
    </form>
  );
}

export function PurchaseDeliveryHistory({
  items,
  state,
  command,
}: {
  items: Purchase[];
  state: CommercialState;
  command: Command;
}) {
  const first = items[0];
  const sum = (key: "total" | "paid" | "goods_total" | "freight" | "other_costs") =>
    items.reduce((total, item) => total + cents(item[key]), 0) / 100;
  const balance = sum("total") - sum("paid");
  return (
    <details>
      <summary>
        {first.purchased_at.slice(0, 10).split("-").reverse().join("/")} · {items.length}{" "}
        {items.length === 1 ? "material" : "materiais"} · {moneyBR(sum("total"))}
      </summary>
      <p className="hint">
        {state.suppliers.find(({ id }) => id === first.supplier_id)?.name ??
          "Fornecedor não informado"}
        {first.reference && ` · ${first.reference}`}
        {first.due_on && ` · Vence em ${first.due_on}`}
      </p>
      <ul className="overview-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>
              {state.products.find(({ id }) => id === item.product_id)?.name ?? "Material"}
            </span>
            <span>
              {quantityBR(item.input_quantity ?? item.quantity)}{" "}
              {item.unit_name ?? "na unidade-base"} · {moneyBR(item.goods_total)}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        Materiais {moneyBR(sum("goods_total"))} · Frete {moneyBR(sum("freight"))} · Outros{" "}
        {moneyBR(sum("other_costs"))} · Pago {moneyBR(sum("paid"))} · Saldo {moneyBR(balance)}
      </p>
      {Math.round(balance * 100) > 0 && (
        <CommandForm
          title="Confirmar pagamento da compra"
          kind="purchase_delivery_payment"
          command={command}
          fields={[
            { name: "amount", label: "Valor pago", type: "number", required: true },
            {
              name: "method",
              label: "Forma",
              type: "select",
              required: true,
              options: paymentOptions,
            },
            {
              name: "confirmed",
              label: "Confirmei o pagamento ao fornecedor",
              type: "checkbox",
              required: true,
            },
          ]}
          extra={(data) => ({ ...data, delivery_id: first.delivery_id })}
        />
      )}
    </details>
  );
}
