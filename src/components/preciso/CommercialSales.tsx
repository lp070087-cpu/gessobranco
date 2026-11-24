import { useEffect, useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  applicablePrice,
  moneyBR,
  quantityBR,
  type CommercialState,
  type Sale,
} from "@/lib/commercial-client";
import { CommandForm, paymentOptions, type Command } from "./CommercialForms";

type CartLine = {
  key: string;
  unit_id: string;
  quantity: string;
  negotiated: string;
  reason: string;
};
type PaymentLine = { key: string; method: string; amount: string; reference: string };

export function CommercialSales({ state, command }: { state: CommercialState; command: Command }) {
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [costs, setCosts] = useState({ freight: "", fees: "", taxes: "", other_costs: "" });
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState("");
  const person = state.customers.find((item) => item.id === customer);
  const lines = cart.map((line) => {
    const product = state.products.find((item) =>
      item.units.some((unit) => unit.id === line.unit_id),
    )!;
    const unit = product.units.find((item) => item.id === line.unit_id)!;
    const price = applicablePrice(unit, person, Number(line.quantity), state.rules);
    return {
      ...line,
      product,
      unit,
      applied: line.negotiated === "" ? price : Number(line.negotiated),
      original: price,
    };
  });
  const total = lines.reduce(
    (sum, line) => sum + Math.round((line.applied ?? 0) * Number(line.quantity) * 100) / 100,
    0,
  );
  const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const projectedLots = state.lots.map((lot) => ({ ...lot, balance: Number(lot.remaining) }));
  const marginWarnings = lines.flatMap((line) => {
    let needed = Number(line.quantity) * Number(line.unit.factor),
      cost = 0,
      known = true;
    for (const lot of projectedLots.filter((item) => item.product_id === line.product.id)) {
      const used = Math.min(needed, lot.balance);
      if (used > 0 && lot.unit_cost === null) known = false;
      cost += used * Number(lot.unit_cost ?? 0);
      lot.balance -= used;
      needed -= used;
      if (needed <= 0) break;
    }
    if (!known || needed > 0 || line.applied === null)
      return [`${line.product.name}: margem ainda não calculável.`];
    const revenue = line.applied * Number(line.quantity);
    return revenue === 0 || ((revenue - cost) / revenue) * 100 < Number(line.product.minimum_margin)
      ? [`${line.product.name}: margem dos produtos abaixo do mínimo desejado.`]
      : [];
  });
  const sale = state.sales.find((item) => item.id === selected);

  async function finish() {
    if (!window.confirm("Finalizar esta venda e separar os produtos do estoque?")) return;
    setBusy(true);
    setFeedback("");
    try {
      const result = await command("sale", {
        customer_id: customer || null,
        items: lines.map((line) => ({
          unit_id: line.unit_id,
          quantity: Number(line.quantity),
          price: line.negotiated === "" ? null : Number(line.negotiated),
          reason: line.reason,
        })),
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
          reference: payment.reference,
          confirmed: true,
        })),
        ...Object.fromEntries(
          Object.entries(costs).map(([key, value]) => [key, value === "" ? null : Number(value)]),
        ),
      });
      setSelected(result.id);
      setCart([]);
      setCustomer("");
      setPayments([]);
      setConfirmed(false);
      setCosts({ freight: "", fees: "", taxes: "", other_costs: "" });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Venda não confirmada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!state.cash && (
        <div className="notice">
          Abra o caixa na Folha do dia antes de registrar vendas e pagamentos.
        </div>
      )}
      <div className="grid">
        <section className="panel">
          <h2>Selecionar produtos</h2>
          <label>
            Buscar produto
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nome ou categoria"
            />
          </label>
          {state.products
            .filter(
              (product) =>
                product.active &&
                `${product.name} ${product.category}`.toLowerCase().includes(query.toLowerCase()),
            )
            .map((product) => (
              <div key={product.id} className="space">
                <strong>{product.name}</strong>
                <p
                  className={
                    Number(product.balance) <= Number(product.minimum_stock)
                      ? "hint warning"
                      : "hint"
                  }
                >
                  {quantityBR(product.balance)} {product.base_unit} em estoque
                </p>
                <div className="actions">
                  {product.units.map((unit) => (
                    <button
                      key={unit.id}
                      type="button"
                      className="action"
                      onClick={() =>
                        setCart((list) => [
                          ...list,
                          {
                            key: crypto.randomUUID(),
                            unit_id: unit.id,
                            quantity: "1",
                            negotiated: "",
                            reason: "",
                          },
                        ])
                      }
                    >
                      {unit.name} · {unit.price === null ? "Configurar preço" : moneyBR(unit.price)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          {!state.products.some((product) => product.active) && (
            <p className="hint">Cadastre e ative um produto para começar.</p>
          )}
        </section>
        <section className="panel">
          <h2>Venda atual</h2>
          <label>
            Nome do cliente
            <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="">Consumidor não identificado</option>
              {state.customers.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.profile}
                </option>
              ))}
            </select>
          </label>
          <Link to="/admin/comercial" search={{ secao: "clientes" }} className="action">
            Cadastrar cliente
          </Link>
          {lines.map((line) => {
            const demand = lines
              .filter((item) => item.product.id === line.product.id)
              .reduce((sum, item) => sum + Number(item.quantity) * Number(item.unit.factor), 0);
            const update = (field: "quantity" | "negotiated" | "reason", value: string) =>
              setCart((list) =>
                list.map((item) => (item.key === line.key ? { ...item, [field]: value } : item)),
              );
            return (
              <div key={line.key} className="space">
                <strong>
                  {line.product.name} · {line.unit.name}
                </strong>
                <div className="fields">
                  <label>
                    Quantidade
                    <input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={line.quantity}
                      onChange={(e) => update("quantity", e.target.value)}
                    />
                  </label>
                  <label>
                    Preço aplicável
                    <input
                      readOnly
                      value={line.original === null ? "Cadastre o preço" : moneyBR(line.original)}
                    />
                  </label>
                  <label>
                    Preço negociado por unidade
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Usar preço aplicável"
                      value={line.negotiated}
                      onChange={(e) => update("negotiated", e.target.value)}
                    />
                  </label>
                </div>
                {line.negotiated !== "" && (
                  <label>
                    Motivo da negociação
                    <input value={line.reason} onChange={(e) => update("reason", e.target.value)} />
                  </label>
                )}
                {demand > Number(line.product.balance) && (
                  <p className="warning hint">Quantidade acima do estoque disponível.</p>
                )}
                {line.original !== null &&
                  line.applied !== null &&
                  line.applied <
                    line.original * (1 - Number(line.product.maximum_discount) / 100) && (
                    <p className="warning hint">Desconto acima da referência deste produto.</p>
                  )}
                <p className="hint">
                  {quantityBR(Number(line.quantity) * Number(line.unit.factor))}{" "}
                  {line.product.base_unit} · Total{" "}
                  {moneyBR((line.applied ?? 0) * Number(line.quantity))}
                </p>
                <button
                  type="button"
                  className="action"
                  onClick={() => setCart((list) => list.filter((item) => item.key !== line.key))}
                >
                  Retirar item
                </button>
              </div>
            );
          })}
          {!cart.length && (
            <p className="hint">Selecione um produto ao lado para começar a venda.</p>
          )}
          <details>
            <summary>Custos desta venda</summary>
            <p className="hint">
              Informe zero quando confirmar que não existe custo. Campo vazio mantém o resultado
              como parcial.
            </p>
            <div className="fields">
              {Object.entries({
                freight: "Frete desta venda",
                fees: "Taxas do pagamento",
                taxes: "Impostos atribuídos",
                other_costs: "Outros custos",
              }).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={costs[key as keyof typeof costs]}
                    onChange={(e) => setCosts((current) => ({ ...current, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </details>
          <h3>Pagamentos recebidos</h3>
          <p className="hint">
            Registre Pix após conferir o recebimento, cartão após aprovação e dinheiro após receber.
            Venda a prazo exige cliente autorizado.
          </p>
          {marginWarnings.map((warning, index) => (
            <p key={index} className="notice warning">
              {warning} Estimativa sujeita à confirmação do estoque no fechamento.
            </p>
          ))}
          {payments.map((payment) => (
            <div className="line" key={payment.key}>
              <label>
                Forma
                <select
                  value={payment.method}
                  onChange={(e) =>
                    setPayments((list) =>
                      list.map((item) =>
                        item.key === payment.key ? { ...item, method: e.target.value } : item,
                      ),
                    )
                  }
                >
                  {paymentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Valor
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) =>
                    setPayments((list) =>
                      list.map((item) =>
                        item.key === payment.key ? { ...item, amount: e.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Referência
                <input
                  value={payment.reference}
                  onChange={(e) =>
                    setPayments((list) =>
                      list.map((item) =>
                        item.key === payment.key ? { ...item, reference: e.target.value } : item,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="action"
                onClick={() =>
                  setPayments((list) => list.filter((item) => item.key !== payment.key))
                }
              >
                Retirar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="action space"
            onClick={() =>
              setPayments((list) => [
                ...list,
                {
                  key: crypto.randomUUID(),
                  method: "dinheiro",
                  amount: Math.max(0, total - paid).toFixed(2),
                  reference: "",
                },
              ])
            }
          >
            Adicionar pagamento
          </button>
          {!!payments.length && (
            <label className="check space">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Conferi e confirmo os pagamentos informados.
            </label>
          )}
          <div className="space">
            <p className="hint">Total da venda</p>
            <p className="sale-total">{moneyBR(total)}</p>
            <p className="hint">
              Recebido {moneyBR(paid)} · A receber {moneyBR(Math.max(0, total - paid))}
            </p>
          </div>
          {feedback && (
            <p role="alert" className="notice error space">
              {feedback}
            </p>
          )}
          <button
            type="button"
            className="action primary space"
            disabled={
              busy ||
              !state.cash ||
              !lines.length ||
              (payments.length > 0 && !confirmed) ||
              lines.some((line) => line.applied === null || Number(line.quantity) <= 0)
            }
            onClick={() => void finish()}
          >
            {busy ? "Confirmando…" : "Finalizar venda"}
          </button>
        </section>
      </div>
      <section className="panel space">
        <h2>Histórico de vendas</h2>
        <p className="hint">
          Últimas 500 vendas. O relatório financeiro consulta o período completo.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Código</th>
                <th>Cliente</th>
                <th>Venda líquida</th>
                <th>Recebido</th>
                <th>Saldo</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {state.sales.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.created_at).toLocaleString("pt-BR")}</td>
                  <td>
                    <button onClick={() => setSelected(item.id)}>{item.id.slice(0, 8)}</button>
                  </td>
                  <td>
                    {state.customers.find((customer) => customer.id === item.customer_id)?.name ??
                      "Consumidor não identificado"}
                  </td>
                  <td>{moneyBR(Number(item.revenue) - Number(item.returned_revenue))}</td>
                  <td>{moneyBR(item.received)}</td>
                  <td>{moneyBR(item.receivable)}</td>
                  <td>{item.status === "cancelled" ? "Cancelada" : "Confirmada"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {sale && <SaleDetails key={sale.id} sale={sale} state={state} command={command} />}
    </>
  );
}

function SaleDetails({
  sale,
  state,
  command,
}: {
  sale: Sale;
  state: CommercialState;
  command: Command;
}) {
  const receipt = useRef<HTMLDivElement>(null);
  useEffect(() => receipt.current?.scrollIntoView({ block: "start" }), []);
  return (
    <section className="panel space">
      <h2>Venda {sale.id.slice(0, 8)}</h2>
      <div className="stats">
        <div>
          <small>Mercadorias vendidas, com custos históricos</small>
          <strong>{moneyBR(sale.goods_cost)}</strong>
        </div>
        <div>
          <small>Margem de contribuição da operação</small>
          <strong>{moneyBR(sale.contribution)}</strong>
          <small>
            {sale.partial
              ? "Resultado parcial: faltam custos."
              : "Antes das despesas gerais da empresa."}
          </small>
        </div>
      </div>
      {sale.items.flatMap((item) =>
        item.warnings.map((warning, index) => (
          <p className="notice warning" key={`${item.id}-${index}`}>
            {item.product_name} · {warning}
          </p>
        )),
      )}
      <div ref={receipt} className="receipt">
        <h3>OURO BRANCO — SOLUÇÕES EM GESSO</h3>
        <p>Recibo de venda · {sale.id.slice(0, 8)}</p>
        <p>
          Data{" "}
          {new Date(sale.created_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </p>
        <p>
          Cliente{" "}
          {state.customers.find((customer) => customer.id === sale.customer_id)?.name ??
            "Consumidor não identificado"}
        </p>
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Quantidade</th>
              <th>Preço unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product_name}</td>
                <td>
                  {quantityBR(item.quantity)} {item.unit_name}
                  {Number(item.returned) > 0 && (
                    <p>
                      Devolvido {quantityBR(item.returned)} {item.unit_name}
                    </p>
                  )}
                </td>
                <td>{moneyBR(item.price)}</td>
                <td>
                  {moneyBR(Number(item.revenue) - Number(item.price) * Number(item.returned))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>Total após devoluções {moneyBR(Number(sale.revenue) - Number(sale.returned_revenue))}</p>
        <p>
          Recebido {moneyBR(sale.received)} · Saldo {moneyBR(sale.receivable)}
        </p>
        <p>{sale.status === "cancelled" ? "Venda cancelada" : "Venda confirmada"}</p>
        <small>Documento sem valor fiscal.</small>
        <div>
          <button className="action" onClick={() => window.print()}>
            Imprimir recibo
          </button>
        </div>
      </div>
      <details>
        <summary>Conferir custos da venda</summary>
        <CommandForm
          title="Atualizar custos da operação"
          kind="sale_costs"
          command={command}
          fields={[
            {
              name: "freight",
              label: "Frete",
              type: "number",
              nullable: true,
              value: sale.freight ?? "",
            },
            {
              name: "fees",
              label: "Taxas",
              type: "number",
              nullable: true,
              value: sale.fees ?? "",
            },
            {
              name: "taxes",
              label: "Impostos",
              type: "number",
              nullable: true,
              value: sale.taxes ?? "",
            },
            {
              name: "other_costs",
              label: "Outros custos",
              type: "number",
              nullable: true,
              value: sale.other_costs ?? "",
            },
            { name: "reason", label: "Motivo da atualização", required: true },
          ]}
          extra={(data) => ({ ...data, sale_id: sale.id })}
        />
      </details>
      {sale.status === "confirmed" && (
        <details>
          <summary>Devolução ou cancelamento</summary>
          <div className="grid">
            <CommandForm
              title="Devolver mercadorias"
              kind="return"
              command={command}
              fields={[
                {
                  name: "item_id",
                  label: "Item",
                  type: "select",
                  required: true,
                  options: sale.items
                    .filter((item) => Number(item.returned) < Number(item.quantity))
                    .map((item) => ({
                      value: item.id,
                      label: `${item.product_name} · saldo ${quantityBR(Number(item.quantity) - Number(item.returned))} ${item.unit_name}`,
                    })),
                },
                {
                  name: "quantity",
                  label: "Quantidade na unidade vendida",
                  type: "number",
                  required: true,
                },
                { name: "reason", label: "Motivo", required: true },
              ]}
              extra={(data) => ({
                sale_id: sale.id,
                reason: data.reason,
                items: [{ item_id: data.item_id, quantity: data.quantity }],
              })}
              label="Registrar devolução"
            >
              <p className="hint">
                O saldo físico volta aos lotes originais. O estorno financeiro é confirmado
                separadamente.
              </p>
            </CommandForm>
            <CommandForm
              title="Cancelar venda"
              kind="cancel"
              command={async (kind, data) => {
                if (
                  !window.confirm("Cancelar a venda e devolver o saldo de mercadorias ao estoque?")
                )
                  throw new Error("Cancelamento interrompido.");
                return command(kind, data);
              }}
              fields={[{ name: "reason", label: "Motivo do cancelamento", required: true }]}
              extra={(data) => ({ ...data, sale_id: sale.id })}
              label="Cancelar venda"
            />
          </div>
        </details>
      )}
      {Number(sale.receivable) !== 0 && (
        <details>
          <summary>
            {Number(sale.receivable) > 0 ? "Registrar recebimento" : "Confirmar estorno ao cliente"}
          </summary>
          <CommandForm
            title={Number(sale.receivable) > 0 ? "Recebimento" : "Estorno financeiro"}
            kind={Number(sale.receivable) > 0 ? "payment" : "refund"}
            command={command}
            fields={[
              { name: "amount", label: "Valor", type: "number", required: true },
              {
                name: "method",
                label: "Forma",
                type: "select",
                required: true,
                options: paymentOptions,
              },
              { name: "reference", label: "Referência ou comprovante", required: true },
              {
                name: "confirmed",
                label: "Confirmei a movimentação financeira",
                type: "checkbox",
                required: true,
              },
            ]}
            extra={(data) => ({ ...data, sale_id: sale.id })}
          />
        </details>
      )}
    </section>
  );
}
