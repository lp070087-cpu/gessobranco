import { useRef, useState, type FormEvent } from "react";
import {
  localDay,
  moneyBR,
  quantityBR,
  type CommercialState,
  type Purchase,
} from "@/lib/commercial-client";
import {
  CommandForm,
  paymentOptions,
  productForUnit,
  productUnits,
  type Command,
} from "./CommercialForms";

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

const emptyItem = (id: number) => ({ id, unit: "", quantity: "", total: "" });
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
  const options = productUnits(state);
  const subtotal = items.reduce((total, row) => total + cents(row.total), 0);
  const update = (id: number, patch: Partial<ReturnType<typeof emptyItem>>) =>
    setItems((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    try {
      await command("purchase_delivery", {
        items: items.map((row) => ({
          product_id: productForUnit(state, row.unit),
          unit_id: row.unit,
          quantity: Number(row.quantity),
          goods_total: Number(row.total),
        })),
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
    } catch {
      // The store's shared command handler displays operation errors and keeps this draft.
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
          const product = state.products.find((entry) =>
            entry.units.some((unit) => unit.id === item.unit),
          );
          const kg = product?.units.find(
            (unit) => /^kg$/i.test(unit.name.trim()) && Number(unit.factor) === 1,
          );
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
              <label>
                Produto e unidade
                <select
                  value={item.unit}
                  onChange={(event) => update(item.id, { unit: event.target.value })}
                  required
                >
                  <option value="">Selecione um produto</option>
                  {options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="fields">
                <label>
                  Quantidade{" "}
                  <input
                    type="number"
                    min="0.000001"
                    max="10000000"
                    step="0.000001"
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
              {kg && /^kg$/i.test(product?.base_unit.trim() ?? "") && (
                <div className="actions">
                  {[5, 10, 20].map((tons) => (
                    <button
                      key={tons}
                      type="button"
                      className="action"
                      onClick={() =>
                        update(item.id, { unit: kg.id, quantity: String(tons * 1000) })
                      }
                    >
                      {tons} t em kg
                    </button>
                  ))}
                </div>
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
        {!options.length && (
          <p className="hint">Cadastre um produto ativo e sua unidade na aba Produtos.</p>
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
        <button className="action primary" disabled={!options.length}>
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
