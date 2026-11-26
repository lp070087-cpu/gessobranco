import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  applicablePrice,
  commercialFetch,
  moneyBR,
  type CommercialState,
} from "@/lib/commercial-client";
import {
  shopDocumentDate,
  shopQuoteLineCents,
  type ShopQuote,
  type ShopQuoteInput,
  type ShopQuoteSummary,
} from "@/lib/shop-quote";
import { ShopDocument } from "./ShopDocument";

type Line = { key: string; unitId: string; quantity: string; price: string };
const newLine = (): Line => ({ key: crypto.randomUUID(), unitId: "", quantity: "1", price: "" });

export function CommercialQuotes({ state }: { state: CommercialState }) {
  const [customerId, setCustomerId] = useState("");
  const [notes, setNotes] = useState("");
  const firstLine = useId();
  const [lines, setLines] = useState<Line[]>([
    { key: firstLine, unitId: "", quantity: "1", price: "" },
  ]);
  const [history, setHistory] = useState<ShopQuoteSummary[] | null>(null);
  const [opened, setOpened] = useState<ShopQuote | null>(null);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const lock = useRef(false);
  const documentRef = useRef<HTMLDivElement>(null);

  const customer = state.customers.find((entry) => entry.id === customerId);
  const products = state.products.filter((product) => product.active && product.units.length);
  const units = new Map(
    products.flatMap((product) => product.units.map((unit) => [unit.id, unit])),
  );
  const suggestedPrice = (line: Line) => {
    const unit = units.get(line.unitId);
    return unit && Number(line.quantity) > 0
      ? applicablePrice(unit, customer, Number(line.quantity), state.rules)
      : null;
  };
  const amount = (line: Line) => (line.price === "" ? suggestedPrice(line) : Number(line.price));
  const totalCents = lines.reduce(
    (sum, line) => sum + shopQuoteLineCents(Number(line.quantity || 0), amount(line) ?? 0),
    0,
  );

  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<ShopQuoteSummary[]>("commercial/shop-quotes", undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setHistory(data);
        setHistoryError("");
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setHistoryError(failure.message);
      });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (opened) documentRef.current?.scrollIntoView({ block: "start" });
  }, [opened]);

  function updateLine(key: string, change: Partial<Line>) {
    setLines((value) => value.map((line) => (line.key === key ? { ...line, ...change } : line)));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    if (
      !customer ||
      !lines.length ||
      lines.some((line) => !units.has(line.unitId) || amount(line) === null)
    ) {
      setError("Selecione o cliente e confira a unidade, a quantidade e o preço de cada item.");
      return;
    }

    const draft = {
      customer_id: customer.id,
      notes: notes.trim(),
      items: lines.map((line) => ({
        unit_id: line.unitId,
        quantity: Number(line.quantity),
        unit_price: amount(line) ?? 0,
      })),
    };
    const payload = JSON.stringify(draft);
    if (request.current?.payload !== payload) {
      request.current = { payload, key: crypto.randomUUID() };
    }
    const body: ShopQuoteInput = { ...draft, request_key: request.current.key };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const quote = await commercialFetch<ShopQuote>("commercial/shop-quotes", body);
      request.current = null;
      setOpened(quote);
      setCustomerId("");
      setNotes("");
      setLines([newLine()]);
      setReload((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar o orçamento.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function openQuote(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      setOpened(await commercialFetch<ShopQuote>(`commercial/shop-quotes?id=${id}`));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível abrir o orçamento.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Orçamento manual</h2>
        <p className="hint">
          Monte uma proposta com os materiais cadastrados. O estoque é baixado ao confirmar a venda.
        </p>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy} style={{ minWidth: 0 }}>
            <label>
              Nome do cliente
              <select
                required
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Selecione um cliente</option>
                {state.customers.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <Link className="action" to="/admin/comercial" search={{ secao: "clientes" }}>
              Cadastrar cliente
            </Link>
            {!products.length && (
              <p className="hint">
                <Link to="/admin/comercial" search={{ secao: "produtos" }}>
                  Cadastre um produto com unidade de venda
                </Link>{" "}
                para começar.
              </p>
            )}
            {lines.map((line, index) => (
              <div className="panel space" key={line.key}>
                <h3>Item {index + 1}</h3>
                <div className="fields">
                  <label>
                    Material e unidade
                    <select
                      required
                      value={line.unitId}
                      onChange={(event) =>
                        updateLine(line.key, { unitId: event.target.value, price: "" })
                      }
                    >
                      <option value="">Selecione o material</option>
                      {products.map((product) => (
                        <optgroup key={product.id} label={product.name}>
                          {product.units.map((unit) => (
                            <option value={unit.id} key={unit.id}>
                              {product.name} · {unit.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quantidade
                    <input
                      required
                      type="number"
                      min="0.001"
                      max="1000000"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    />
                  </label>
                  <label>
                    Preço unitário (R$)
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      step="0.01"
                      value={line.price}
                      required={line.unitId !== "" && suggestedPrice(line) === null}
                      placeholder={suggestedPrice(line)?.toFixed(2) ?? "Informe o preço"}
                      onChange={(event) => updateLine(line.key, { price: event.target.value })}
                    />
                  </label>
                </div>
                <p>
                  Subtotal{" "}
                  {moneyBR(shopQuoteLineCents(Number(line.quantity || 0), amount(line) ?? 0) / 100)}
                </p>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="action"
                    onClick={() =>
                      setLines((value) => value.filter((entry) => entry.key !== line.key))
                    }
                  >
                    Remover item
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="action space"
              disabled={lines.length >= 80 || !products.length}
              onClick={() => setLines((value) => [...value, newLine()])}
            >
              Adicionar item
            </button>
            <label className="space">
              Observações para o cliente
              <textarea
                maxLength={1500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            <p>
              Total do orçamento <strong>{moneyBR(totalCents / 100)}</strong>
            </p>
            <button
              type="submit"
              className="action primary"
              disabled={!products.length || !lines.length || !state.customers.length}
            >
              {busy ? "Aguarde…" : "Salvar orçamento"}
            </button>
          </fieldset>
        </form>
      </section>
      {opened && (
        <section className="panel space">
          <div className="actions">
            <Link
              className="action primary"
              to="/admin/comercial"
              search={{ secao: "vender", orcamento: opened.id }}
            >
              Preencher venda
            </Link>
          </div>
          <ShopDocument
            title="Orçamento de materiais"
            code={opened.id.toUpperCase()}
            date={opened.created_at}
            customer={opened.customer_name}
            items={opened.items.map((item, index) => ({
              id: String(index),
              name: item.product_name,
              unit: item.unit_name,
              quantity: item.quantity,
              price: item.unit_price,
              total: item.total_cents / 100,
            }))}
            total={opened.total_cents / 100}
            totalLabel="Total do orçamento"
            printLabel="Imprimir orçamento"
            documentRef={documentRef}
          >
            {opened.notes && <p className="shop-document-notes">{opened.notes}</p>}
          </ShopDocument>
        </section>
      )}
      <section className="panel space">
        <h2>Orçamentos salvos</h2>
        {historyError ? (
          <p className="notice error" role="alert">
            {historyError}{" "}
            <button
              type="button"
              className="action"
              onClick={() => setReload((value) => value + 1)}
            >
              Tentar novamente
            </button>
          </p>
        ) : history === null ? (
          <p role="status">Carregando orçamentos…</p>
        ) : history.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {history.map((quote) => (
                  <tr key={quote.id}>
                    <td>
                      <button
                        type="button"
                        className="action"
                        disabled={busy}
                        onClick={() => void openQuote(quote.id)}
                      >
                        {quote.id.slice(0, 8).toUpperCase()}
                      </button>
                    </td>
                    <td>{quote.customer_name}</td>
                    <td>{shopDocumentDate(quote.created_at)}</td>
                    <td>{moneyBR(quote.total_cents / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint">Nenhum orçamento salvo.</p>
        )}
      </section>
    </>
  );
}
