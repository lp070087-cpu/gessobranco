import { useMemo, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, FileUp, Minus, PackageCheck, Plus, Truck } from "lucide-react";
import { localDay, type CommercialState } from "@/lib/commercial-client";
import { readCsv } from "@/lib/commercial-import";
import { readDocument } from "@/lib/document-import";
import { readOrder, type OrderOption } from "@/lib/order-import";
import { PanelSkeleton } from "./LoadingSkeleton";
import { SheetHeader, number, useAction, useLoad, value } from "./StoreSheets";
import { qty, sendStore, shortDate, type SupplierOrder } from "./store-sheets";

type Draft = { unit: string; quantity: string; total: string; text?: string };

const statusLabel = {
  aguardando: "Aguardando entrega",
  chegou: "Chegou · conferir",
  conferido: "Conferido",
};

function arrival(order: SupplierOrder) {
  const today = localDay();
  if (!order.expected_on) return { text: "Sem dia marcado", tone: "" };
  if (order.expected_on === today) return { text: "Chega hoje", tone: "is-today" };
  if (order.expected_on < today && order.status === "aguardando")
    return { text: `Atrasada · era ${shortDate(order.expected_on)}`, tone: "is-late" };
  return { text: `Chega ${shortDate(order.expected_on)}`, tone: "" };
}

async function readFile(file: File) {
  if (file.size > 20_000_000) throw new Error("Escolha um arquivo de até 20 MB.");
  if (/\.csv$/i.test(file.name)) return readCsv(file);
  if (/\.xlsx$/i.test(file.name)) {
    const { default: readWorkbook } = await import("read-excel-file/browser");
    const [sheet] = await readWorkbook(file);
    return (sheet?.data ?? []).map((row) => row.map((cell) => (cell === null ? "" : String(cell))));
  }
  if (/\.xls$/i.test(file.name)) return readDocument(file, "xls");
  if (/\.pdf$/i.test(file.name)) return readDocument(file, "pdf");
  throw new Error("Envie o pedido em Excel (.xlsx ou .xls), CSV ou PDF.");
}

/** Conferir entregas: pedido › dia da chegada › escolhe o cartão › confere item por item. */
export function Deliveries() {
  const orders = useLoad<SupplierOrder[]>("store/orders");
  const state = useLoad<CommercialState>("commercial/state");
  const [form, setForm] = useState<{
    items: Draft[];
    reference: string;
    expected_on: string;
    note: string;
  } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reading, setReading] = useState("");
  const [fileError, setFileError] = useState("");
  const action = useAction(orders.reload);
  const checkRef = useRef<HTMLDivElement>(null);
  const options: OrderOption[] = useMemo(
    () =>
      (state.data?.products ?? [])
        .filter((product) => !product.example)
        .flatMap((product) =>
          product.units.map((unit) => ({
            unit_id: unit.id,
            product_id: product.id,
            label: `${product.name} · ${unit.name}`,
          })),
        ),
    [state.data?.products],
  );
  const waiting = orders.data?.filter((order) => order.status !== "conferido") ?? [];
  const done = orders.data?.filter((order) => order.status === "conferido") ?? [];
  const current = waiting.find((order) => order.id === selected) ?? null;

  async function importFile(file: File) {
    setFileError("");
    setReading(file.name);
    try {
      const rows = await readFile(file);
      const order = readOrder(rows, options, file.name);
      if (!order.lines.length)
        throw new Error("Não achei itens no arquivo. Confira se ele tem produto e quantidade.");
      const matched = order.lines.filter((line) => line.unit_id).length;
      setForm({
        reference: order.reference,
        expected_on: order.expected_on ?? localDay(),
        note: `Li ${order.lines.length} itens do arquivo. ${matched} já ligados aos produtos da loja${
          matched < order.lines.length ? "; escolha o produto dos outros." : "."
        }`,
        items: order.lines.map((line) => ({
          unit: line.unit_id ?? "",
          quantity: String(line.quantity).replace(".", ","),
          total: line.total === null ? "" : line.total.toFixed(2).replace(".", ","),
          text: line.text,
        })),
      });
    } catch (failure) {
      setFileError(failure instanceof Error ? failure.message : "Não foi possível ler o arquivo.");
    } finally {
      setReading("");
    }
  }

  function choose(id: string) {
    setSelected(id);
    requestAnimationFrame(() =>
      checkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <div className="store-sheet">
      <SheetHeader title="Conferir entregas" subtitle="Pedido › dia da chegada › conferência">
        <label className="action file-action">
          <FileUp size={16} /> {reading ? "Lendo…" : "Enviar pedido (Excel, CSV ou PDF)"}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            disabled={Boolean(reading) || !state.data}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
        </label>
        <button
          type="button"
          className="action primary"
          onClick={() =>
            setForm(
              form
                ? null
                : {
                    items: [{ unit: "", quantity: "", total: "" }],
                    reference: "",
                    expected_on: localDay(),
                    note: "",
                  },
            )
          }
        >
          <Plus size={16} /> Novo pedido
        </button>
      </SheetHeader>
      {(orders.error || fileError) && <p className="notice error">{orders.error || fileError}</p>}
      {action.feedback}
      {form && state.data && (
        <OrderForm
          state={state.data}
          options={options}
          initial={form}
          cancel={() => setForm(null)}
          done={() => {
            setForm(null);
            orders.reload();
          }}
        />
      )}
      {!orders.data ? (
        <PanelSkeleton label="Carregando entregas…" />
      ) : (
        <>
          <h3 className="list-title">Escolha a entrega para conferir</h3>
          {waiting.length === 0 && (
            <section className="panel">
              <p className="hint">
                Nenhuma entrega esperando. Envie o pedido do fornecedor ou crie um novo pedido.
              </p>
            </section>
          )}
          <div className="delivery-cards" role="list">
            {waiting.map((order) => {
              const when = arrival(order);
              const total = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);
              return (
                <article
                  role="listitem"
                  key={order.id}
                  className={"delivery-card" + (selected === order.id ? " is-selected" : "")}
                >
                  <button
                    type="button"
                    className="delivery-pick"
                    aria-pressed={selected === order.id}
                    onClick={() => choose(order.id)}
                  >
                    <span className={"arrival " + when.tone}>
                      <CalendarDays size={15} /> {when.text}
                    </span>
                    <strong>{order.reference || "Pedido sem número"}</strong>
                    <small>{order.supplier ?? "Fornecedor não informado"}</small>
                    <span className="delivery-items">
                      {order.items.slice(0, 3).map((item, index) => (
                        <span key={index}>
                          {qty(item.quantity)} {item.product}
                        </span>
                      ))}
                      {order.items.length > 3 && <span>+{order.items.length - 3} itens</span>}
                    </span>
                    <span className="delivery-foot">
                      <span className={"chip chip-status-" + order.status}>
                        {statusLabel[order.status]}
                      </span>
                      <span>{qty(total)} peças</span>
                    </span>
                  </button>
                  <div className="delivery-actions">
                    {order.status === "aguardando" && (
                      <button
                        type="button"
                        className="action"
                        disabled={action.busy}
                        onClick={() =>
                          void action
                            .run(
                              () => sendStore("order_arrived", { order_id: order.id }),
                              "Entrega marcada como chegou. Confira os itens.",
                            )
                            .then((ok) => ok && choose(order.id))
                        }
                      >
                        <Truck size={16} /> Chegou
                      </button>
                    )}
                    <button
                      type="button"
                      className="action primary"
                      onClick={() => choose(order.id)}
                    >
                      <PackageCheck size={16} /> Conferir
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <div ref={checkRef}>
            {current && (
              <OrderCheck
                key={current.id}
                order={current}
                cancel={() => setSelected(null)}
                done={() => {
                  setSelected(null);
                  orders.reload();
                }}
              />
            )}
          </div>
          <h3 className="list-title">Conferidos</h3>
          {done.length === 0 && (
            <section className="panel">
              <p className="hint">Nenhuma entrega conferida ainda.</p>
            </section>
          )}
          {done.map((order) => (
            <CheckedOrder key={order.id} order={order} />
          ))}
        </>
      )}
    </div>
  );
}

function CheckedOrder({ order }: { order: SupplierOrder }) {
  const problems =
    order.check_result?.items.reduce(
      (sum, item) => sum + Number(item.broken) + Number(item.damaged) + Number(item.missing),
      0,
    ) ?? 0;
  return (
    <details className="panel checked-order">
      <summary>
        <span>
          <strong>{order.reference || "Pedido sem número"}</strong>
          <small>
            {" "}
            · {order.supplier ?? "Fornecedor não informado"} · conferido{" "}
            {order.checked_at ? new Date(order.checked_at).toLocaleDateString("pt-BR") : ""}
          </small>
        </span>
        <span className={"chip " + (problems ? "chip-late" : "chip-paid")}>
          {problems ? `${qty(problems)} com problema` : "Tudo certo"}
        </span>
      </summary>
      <div className="check-list">
        {order.items.map((item, index) => {
          const checked = order.check_result?.items[index];
          return (
            <div className="check-item is-done" key={index}>
              <div className="check-name">
                <strong>{item.product}</strong>
                <small>
                  Pedido {qty(item.quantity)} {item.unit}
                  {checked?.note ? ` · ${checked.note}` : ""}
                </small>
              </div>
              <dl className="check-result">
                <div>
                  <dt>Bom</dt>
                  <dd>{qty(checked?.ok ?? 0)}</dd>
                </div>
                <div className={checked?.broken ? "is-alert" : ""}>
                  <dt>Quebradas</dt>
                  <dd>{qty(checked?.broken ?? 0)}</dd>
                </div>
                <div className={checked?.damaged ? "is-alert" : ""}>
                  <dt>Avariadas</dt>
                  <dd>{qty(checked?.damaged ?? 0)}</dd>
                </div>
                <div className={checked?.missing ? "is-alert" : ""}>
                  <dt>Faltou</dt>
                  <dd>{qty(checked?.missing ?? 0)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
      {order.check_result?.notes && <p className="hint">“{order.check_result.notes}”</p>}
    </details>
  );
}

function Stepper({
  label,
  value: current,
  onChange,
  alert,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  alert?: boolean;
}) {
  return (
    <div className={"stepper" + (alert && current > 0 ? " is-alert" : "")}>
      <span>{label}</span>
      <div>
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          onClick={() => onChange(Math.max(0, current - 1))}
        >
          <Minus size={16} />
        </button>
        <input
          inputMode="decimal"
          aria-label={label}
          value={String(current).replace(".", ",")}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value.replace(",", ".")) || 0))
          }
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          onClick={() => onChange(current + 1)}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

function OrderCheck({
  order,
  cancel,
  done,
}: {
  order: SupplierOrder;
  cancel: () => void;
  done: () => void;
}) {
  const action = useAction(done);
  const [rows, setRows] = useState(() =>
    order.items.map((item) => ({ ok: Number(item.quantity), broken: 0, damaged: 0, note: "" })),
  );
  const set = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const problems = rows.reduce(
    (sum, row, index) =>
      sum +
      row.broken +
      row.damaged +
      Math.max(Number(order.items[index].quantity) - row.ok - row.broken - row.damaged, 0),
    0,
  );
  return (
    <form
      className="panel check-panel"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(
          () =>
            sendStore("order_check", {
              order_id: order.id,
              notes: value(form, "notes"),
              items: rows,
            }),
          "Entrega conferida. Só o que chegou bom entrou no estoque.",
        );
      }}
    >
      <div className="panel-title">
        <h3>Conferindo: {order.reference || "Pedido sem número"}</h3>
        <span className="hint">{order.supplier ?? ""}</span>
      </div>
      {action.feedback}
      <p className="hint">
        Conte o que chegou. Pedras e placas quebradas ou avariadas não entram no estoque e ficam
        anotadas para cobrar do fornecedor.
      </p>
      <div className="check-list">
        {order.items.map((item, index) => {
          const row = rows[index];
          const missing = Math.max(Number(item.quantity) - row.ok - row.broken - row.damaged, 0);
          return (
            <div className="check-item" key={index}>
              <div className="check-name">
                <strong>{item.product}</strong>
                <small>
                  Pedido: <b>{qty(item.quantity)}</b> {item.unit}
                  {missing > 0 && <span className="missing"> · faltou {qty(missing)}</span>}
                </small>
              </div>
              <div className="steppers">
                <Stepper label="Chegou bom" value={row.ok} onChange={(ok) => set(index, { ok })} />
                <Stepper
                  label="Quebradas"
                  value={row.broken}
                  alert
                  onChange={(broken) => set(index, { broken })}
                />
                <Stepper
                  label="Avariadas"
                  value={row.damaged}
                  alert
                  onChange={(damaged) => set(index, { damaged })}
                />
              </div>
              <input
                className="check-note"
                value={row.note}
                placeholder="Observação (ex.: quinas lascadas)"
                onChange={(event) => set(index, { note: event.target.value })}
              />
            </div>
          );
        })}
      </div>
      <label className="space">
        Observação da entrega
        <input name="notes" placeholder="Motorista, nota fiscal, combinado com o fornecedor…" />
      </label>
      <div className="check-summary">
        <span className={problems ? "is-alert" : "is-ok"}>
          {problems ? `${qty(problems)} peça(s) com problema ou faltando` : "Tudo certo até agora"}
        </span>
        <div className="actions">
          <button type="button" className="action" onClick={cancel}>
            Voltar
          </button>
          <button className="action primary" disabled={action.busy}>
            <CheckCircle2 size={16} /> Confirmar conferência
          </button>
        </div>
      </div>
    </form>
  );
}

function OrderForm({
  state,
  options,
  initial,
  cancel,
  done,
}: {
  state: CommercialState;
  options: OrderOption[];
  initial: { items: Draft[]; reference: string; expected_on: string; note: string };
  cancel: () => void;
  done: () => void;
}) {
  const action = useAction(done);
  const [items, setItems] = useState<Draft[]>(initial.items);
  const update = (index: number, patch: Partial<Draft>) =>
    setItems((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <form
      className="panel space order-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const ready = items.filter((item) => item.unit && item.quantity);
        if (!ready.length) return;
        void action.run(
          () =>
            sendStore("order", {
              supplier_id: value(form, "supplier") || null,
              reference: value(form, "reference"),
              ordered_on: value(form, "ordered_on"),
              expected_on: value(form, "expected_on") || null,
              due_on: value(form, "due_on") || null,
              freight: number(form, "freight") ?? 0,
              other_costs: 0,
              notes: "",
              items: ready.map((item) => ({
                product_id: options.find((option) => option.unit_id === item.unit)?.product_id,
                unit_id: item.unit,
                quantity: Number(item.quantity.replace(",", ".")),
                goods_total: Number(item.total.replace(/\./g, "").replace(",", ".")) || 0,
              })),
            }),
          "Pedido salvo no dia da chegada. Quando chegar, escolha o cartão e confira.",
        );
      }}
    >
      <h3>{initial.note ? "Pedido lido do arquivo" : "Novo pedido ao fornecedor"}</h3>
      {initial.note && <p className="notice">{initial.note}</p>}
      {action.feedback}
      <div className="fields">
        <label>
          Fornecedor
          <select name="supplier" defaultValue="">
            <option value="">Não informado</option>
            {state.suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Número / referência
          <input name="reference" defaultValue={initial.reference} placeholder="Nota, pedido…" />
        </label>
        <label>
          Data do pedido
          <input name="ordered_on" type="date" defaultValue={localDay()} required />
        </label>
        <label className="arrival-field">
          <span>
            <CalendarDays size={14} /> Dia da chegada
          </span>
          <input name="expected_on" type="date" defaultValue={initial.expected_on} required />
        </label>
        <label>
          Vencimento do pagamento
          <input name="due_on" type="date" />
        </label>
        <label>
          Frete
          <input name="freight" inputMode="decimal" placeholder="0,00" />
        </label>
      </div>
      <div className="order-lines">
        {items.map((item, index) => (
          <div className={"order-line" + (item.unit ? "" : " is-missing")} key={index}>
            {item.text && <small className="hint">No arquivo: “{item.text}”</small>}
            <label>
              Produto
              <select
                value={item.unit}
                required={index === 0}
                onChange={(event) => update(index, { unit: event.target.value })}
              >
                <option value="">{item.text ? "Escolha o produto da loja" : "Escolha"}</option>
                {options.map((option) => (
                  <option key={option.unit_id} value={option.unit_id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quantidade
              <input
                inputMode="decimal"
                value={item.quantity}
                required={index === 0}
                onChange={(event) => update(index, { quantity: event.target.value })}
              />
            </label>
            <label>
              Valor total do item
              <input
                inputMode="decimal"
                value={item.total}
                placeholder="0,00"
                onChange={(event) => update(index, { total: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="action"
              aria-label="Tirar item"
              onClick={() => setItems(items.filter((_, i) => i !== index))}
            >
              <Minus size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          className="action"
          onClick={() => setItems([...items, { unit: "", quantity: "", total: "" }])}
        >
          <Plus size={16} /> Mais um item
        </button>
        <button type="button" className="action" onClick={cancel}>
          Cancelar
        </button>
        <button className="action primary" disabled={action.busy}>
          Salvar pedido
        </button>
      </div>
    </form>
  );
}
