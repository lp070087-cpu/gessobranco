import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Lock,
  LockOpen,
  PackageCheck,
  Plus,
  Truck,
} from "lucide-react";
import { commercialFetch, localDay, type CommercialState } from "@/lib/commercial-client";
import type { CompanyActor } from "@/lib/company-permissions";
import { PanelSkeleton } from "./LoadingSkeleton";
import {
  addDays,
  brl,
  dayLabel,
  debtKinds,
  methodLabel,
  mondayOf,
  qty,
  sendStore,
  shortDate,
  type Closing,
  type Debt,
  type Sheet,
  type SheetCash,
  type SupplierOrder,
} from "./store-sheets";
import "./store-sheets.css";

// Guarda a última resposta de cada tela: ao voltar, mostra na hora e atualiza por trás.
const loaded = new Map<string, unknown>();

export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(() =>
    path ? ((loaded.get(path) as T | undefined) ?? null) : null,
  );
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setError("");
    if (loaded.has(path)) setData(loaded.get(path) as T);
    void commercialFetch<T>(path, undefined, controller.signal)
      .then((value) => {
        loaded.set(path, value);
        if (!controller.signal.aborted) setData(value);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, error, reload: () => setRevision((value) => value + 1) };
}

/** Envia um formulário e mostra o resultado; reaproveitado em todas as folhas. */
export function useAction(done: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function run(task: () => Promise<unknown>, success: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
      setMessage(success);
      done();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const feedback = (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </>
  );
  return { busy, run, feedback };
}

export const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
export const number = (form: FormData, key: string) => {
  const raw = value(form, key).replace(/\./g, "").replace(",", ".");
  return raw === "" ? null : Number(raw);
};

export function SheetHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="sheet-header">
      <div>
        <p className="eyebrow">{subtitle}</p>
        <h2>{title}</h2>
      </div>
      <div className="sheet-header-tools">{children}</div>
    </div>
  );
}

function DayPicker({
  day,
  onChange,
  step = 1,
}: {
  day: string;
  onChange: (day: string) => void;
  step?: number;
}) {
  return (
    <div className="day-picker">
      <button
        type="button"
        className="icon-button"
        aria-label="Anterior"
        onClick={() => onChange(addDays(day, -step))}
      >
        <ArrowLeft size={16} />
      </button>
      <input
        type="date"
        value={day}
        aria-label="Escolher data"
        onChange={(event) => event.target.value && onChange(event.target.value)}
      />
      <button
        type="button"
        className="icon-button"
        aria-label="Próximo"
        onClick={() => onChange(addDays(day, step))}
      >
        <ArrowRight size={16} />
      </button>
      <button type="button" className="action" onClick={() => onChange(localDay())}>
        Hoje
      </button>
    </div>
  );
}

function TotalsBand({
  totals,
}: {
  totals: { sales: number; pix: number; dinheiro: number; cartao: number; fiado: number };
}) {
  return (
    <dl className="totals-band">
      <div className="is-main">
        <dt>Total de vendas</dt>
        <dd>{brl(totals.sales)}</dd>
      </div>
      <div>
        <dt>Pix</dt>
        <dd>{brl(totals.pix)}</dd>
      </div>
      <div>
        <dt>Dinheiro</dt>
        <dd>{brl(totals.dinheiro)}</dd>
      </div>
      <div>
        <dt>Cartão</dt>
        <dd>{brl(totals.cartao)}</dd>
      </div>
      <div>
        <dt>Fiado</dt>
        <dd>{brl(totals.fiado)}</dd>
      </div>
    </dl>
  );
}

function Result({ sales, expenses, label }: { sales: number; expenses: number; label: string }) {
  const result = Math.round((Number(sales) - Number(expenses)) * 100) / 100;
  return (
    <section className="panel result-card">
      <h3>{label}</h3>
      <div className="result-line">
        <span>Vendas</span>
        <strong>{brl(sales)}</strong>
      </div>
      <div className="result-line">
        <span>Gastos</span>
        <strong>− {brl(expenses)}</strong>
      </div>
      <div className={"result-line is-total " + (result < 0 ? "is-negative" : "is-positive")}>
        <span>Subtotal</span>
        <strong>{brl(result)}</strong>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Folha do dia */

export function DaySheet({ user, initialDay }: { user: CompanyActor; initialDay?: string }) {
  const [day, setDay] = useState(() => initialDay ?? localDay());
  const sheet = useLoad<Sheet>(`store/sheet?start=${day}&end=${day}`);
  const today = day === localDay();
  const data = sheet.data?.start === day ? sheet.data : null;
  const current = data?.days[0];
  const action = useAction(sheet.reload);

  async function closeDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(
      () =>
        sendStore("closing", {
          period: "dia",
          start_on: day,
          end_on: day,
          notes: value(form, "notes"),
        }),
      "Dia fechado e guardado em Fechamentos.",
    );
  }

  return (
    <div className="store-sheet">
      <SheetHeader title={dayLabel(day)} subtitle="Folha do dia · Loja de Prazeres">
        <DayPicker day={day} onChange={setDay} />
      </SheetHeader>
      {sheet.error && <p className="notice error">{sheet.error}</p>}
      {action.feedback}
      {!current ? (
        <PanelSkeleton label="Montando a folha do dia…" />
      ) : (
        <>
          <div className="sheet-grid">
            <section className="panel sales-sheet">
              <h3>Vendas do dia</h3>
              {current.sales.length === 0 ? (
                <p className="hint">Nenhuma venda registrada neste dia.</p>
              ) : (
                <div className="table-scroll">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Itens</th>
                        <th>Forma</th>
                        <th className="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.sales.map((sale) => (
                        <tr key={sale.id}>
                          <td className="time">{sale.time}</td>
                          <td>
                            {sale.items.map((item, index) => (
                              <div className="sale-item" key={index}>
                                <span>
                                  {qty(item.quantity)} {item.product}
                                  <small> · {item.unit}</small>
                                </span>
                                {sale.items.length > 1 && <small>{brl(item.value)}</small>}
                              </div>
                            ))}
                            {sale.customer && <small className="hint">{sale.customer}</small>}
                          </td>
                          <td>
                            <div className="chips">
                              {sale.methods.map((method) => (
                                <span key={method} className={"chip chip-" + method}>
                                  {methodLabel[method]}
                                </span>
                              ))}
                              {Number(sale.fiado) > 0 && (
                                <span className="chip chip-fiado">Fiado</span>
                              )}
                            </div>
                          </td>
                          <td className="num">{brl(sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TotalsBand totals={current.totals} />
              <Link
                to="/admin/comercial"
                search={{ secao: "vender" }}
                className="action primary space"
              >
                <Plus size={16} /> Lançar venda
              </Link>
            </section>
            <div className="sheet-side">
              <CashCard
                user={user}
                today={today}
                sessions={current.cash}
                openElsewhere={Boolean(data?.open_cash && !current.cash.some((c) => !c.closed_at))}
                reload={sheet.reload}
              />
              <ExpensesCard day={day} expenses={current.expenses} reload={sheet.reload} />
              <Result
                sales={current.totals.sales}
                expenses={current.totals.expenses}
                label="Resultado do dia"
              />
            </div>
          </div>
          <form className="panel closing-bar" onSubmit={(event) => void closeDay(event)}>
            <div>
              <h3>Fechar o dia</h3>
              <p className="hint">
                O sistema fecha sozinho todo dia às 23h. Aqui o dono ou a secretária fecham na hora
                e deixam uma observação.
              </p>
            </div>
            <label>
              Observação
              <input name="notes" placeholder="Ex.: conferido, faltou R$ 90 no caixa…" />
            </label>
            <button className="action primary" disabled={action.busy}>
              <CheckCircle2 size={16} /> Fechar o dia agora
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function CashCard({
  user,
  today,
  sessions,
  openElsewhere,
  reload,
}: {
  user: CompanyActor;
  today: boolean;
  sessions: SheetCash[];
  openElsewhere: boolean;
  reload: () => void;
}) {
  const action = useAction(reload);
  const open = sessions.find((session) => !session.closed_at);
  const [mode, setMode] = useState<"retirada" | "fechar" | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>, kind: string, body: object, ok: string) {
    event.preventDefault();
    if (await action.run(() => sendStore(kind, body as Record<string, unknown>), ok)) setMode(null);
  }
  return (
    <section className="panel cash-card">
      <h3>Contabilidade do caixa</h3>
      {action.feedback}
      {sessions.length === 0 && <p className="hint">O caixa não foi aberto neste dia.</p>}
      {sessions.map((session) => {
        const difference =
          session.counted === null ? null : Number(session.counted) - Number(session.expected);
        return (
          <div className="cash-lines" key={session.id}>
            <div className="cash-line">
              <span>Abrir caixa</span>
              <strong>{brl(session.opening)}</strong>
            </div>
            <div className="cash-line">
              <span>+ Vendas em dinheiro</span>
              <strong>{brl(session.cash_sales)}</strong>
            </div>
            {session.withdrawals.map((item) => (
              <div className="cash-line is-out" key={item.id}>
                <span>
                  − {item.category === "vale" ? "Vale" : "Retirada"} {item.person}
                  <small> · {item.description}</small>
                </span>
                <strong>{brl(item.amount)}</strong>
              </div>
            ))}
            {Number(session.cash_expenses) > 0 && (
              <div className="cash-line is-out">
                <span>− Contas pagas com o caixa</span>
                <strong>{brl(session.cash_expenses)}</strong>
              </div>
            )}
            {Number(session.purchase_cash) > 0 && (
              <div className="cash-line is-out">
                <span>− Compras pagas com o caixa</span>
                <strong>{brl(session.purchase_cash)}</strong>
              </div>
            )}
            <div className="cash-line is-total">
              <span>{session.closed_at ? "Deveria fechar com" : "Deve ter agora"}</span>
              <strong>{brl(session.expected)}</strong>
            </div>
            {session.closed_at && (
              <>
                <div className="cash-line">
                  <span>Fechando caixa (contado)</span>
                  <strong>{brl(session.counted)}</strong>
                </div>
                <div
                  className={"cash-line is-difference " + (difference === 0 ? "is-ok" : "is-alert")}
                >
                  <span>
                    {difference === 0 ? (
                      <>
                        <CheckCircle2 size={15} /> Caixa bateu
                      </>
                    ) : (
                      <>
                        <AlertTriangle size={15} /> {Number(difference) < 0 ? "Faltou" : "Sobrou"}
                      </>
                    )}
                  </span>
                  <strong>{brl(Math.abs(Number(difference)))}</strong>
                </div>
                {session.notes && <p className="hint">{session.notes}</p>}
              </>
            )}
          </div>
        );
      })}
      {today && !open && !openElsewhere && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            const form = new FormData(event.currentTarget);
            void submit(
              event,
              "cash_open",
              { opening: number(form, "opening") ?? 0 },
              "Caixa aberto.",
            );
          }}
        >
          <label>
            Dinheiro para abrir o caixa
            <input name="opening" inputMode="decimal" placeholder="0,00" required />
          </label>
          <button className="action primary" disabled={action.busy}>
            <LockOpen size={16} /> Abrir caixa
          </button>
        </form>
      )}
      {openElsewhere && (
        <p className="notice warning">Existe um caixa aberto em outro dia. Feche ele primeiro.</p>
      )}
      {open && (
        <div className="actions">
          <button
            type="button"
            className="action"
            onClick={() => setMode(mode === "retirada" ? null : "retirada")}
          >
            <CircleDollarSign size={16} /> Retirada ou vale
          </button>
          <button
            type="button"
            className="action primary"
            onClick={() => setMode(mode === "fechar" ? null : "fechar")}
          >
            <Lock size={16} /> Fechar caixa
          </button>
        </div>
      )}
      {open && mode === "retirada" && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            const form = new FormData(event.currentTarget);
            void submit(
              event,
              "withdrawal",
              {
                category: value(form, "category"),
                person: value(form, "person"),
                description: value(form, "description") || "Retirada do caixa",
                amount: number(form, "amount"),
              },
              "Saída do caixa registrada.",
            );
          }}
        >
          <div className="fields">
            <label>
              Tipo
              <select name="category" defaultValue="retirada">
                <option value="retirada">Retirada (RT)</option>
                <option value="vale">Vale de funcionário</option>
              </select>
            </label>
            <label>
              Quem pegou
              <input name="person" required placeholder="Ítalo, STE…" />
            </label>
            <label>
              Valor
              <input name="amount" inputMode="decimal" required placeholder="0,00" />
            </label>
          </div>
          <label>
            Motivo
            <input name="description" placeholder="Retirada do dono, vale…" />
          </label>
          <button className="action primary" disabled={action.busy}>
            Lançar saída
          </button>
        </form>
      )}
      {open && mode === "fechar" && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            const form = new FormData(event.currentTarget);
            void submit(
              event,
              "cash_close",
              { counted: number(form, "counted") ?? 0, notes: value(form, "notes") },
              "Caixa fechado.",
            );
          }}
        >
          <p className="hint">
            Conte o dinheiro da gaveta. O sistema compara com {brl(open.expected)} e mostra se
            faltou ou sobrou.
          </p>
          <label>
            Dinheiro contado
            <input name="counted" inputMode="decimal" required placeholder="0,00" />
          </label>
          <label>
            Observação {user.role !== "admin" ? "(a secretária pode explicar a diferença)" : ""}
            <input name="notes" />
          </label>
          <button className="action primary" disabled={action.busy}>
            Confirmar fechamento do caixa
          </button>
        </form>
      )}
    </section>
  );
}

function ExpensesCard({
  day,
  expenses,
  reload,
}: {
  day: string;
  expenses: Sheet["days"][number]["expenses"];
  reload: () => void;
}) {
  const action = useAction(reload);
  const [open, setOpen] = useState(false);
  return (
    <section className="panel">
      <h3>Gastos do dia</h3>
      {action.feedback}
      {expenses.length === 0 && <p className="hint">Nenhum gasto lançado.</p>}
      {expenses.map((expense) => (
        <div className="cash-line" key={expense.id}>
          <span>
            {expense.description}
            <small>
              {" "}
              · {expense.type === "fixo" ? "fixo" : "variável"}
              {expense.paid
                ? ` · pago${expense.method ? " no " + methodLabel[expense.method] : ""}`
                : " · a pagar"}
            </small>
          </span>
          <strong>{brl(expense.amount)}</strong>
        </div>
      ))}
      <button type="button" className="action space" onClick={() => setOpen(!open)}>
        <Plus size={16} /> Lançar gasto
      </button>
      {open && (
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const method = value(form, "method");
            const saved = await action.run(
              () =>
                sendStore("expense", {
                  description: value(form, "description"),
                  amount: number(form, "amount"),
                  expense_type: value(form, "type"),
                  person: "",
                  due_on: day,
                  paid_on: method ? day : null,
                  method: method || null,
                }),
              "Gasto lançado.",
            );
            if (saved) setOpen(false);
          }}
        >
          <div className="fields">
            <label>
              Gasto
              <input name="description" required placeholder="Água, luz, diária…" />
            </label>
            <label>
              Valor
              <input name="amount" inputMode="decimal" required placeholder="0,00" />
            </label>
            <label>
              Tipo
              <select name="type" defaultValue="variavel">
                <option value="fixo">Gasto fixo</option>
                <option value="variavel">Gasto variável</option>
              </select>
            </label>
            <label>
              Pago como?
              <select name="method" defaultValue="">
                <option value="">Ainda não foi pago</option>
                <option value="dinheiro">Dinheiro do caixa</option>
                <option value="pix">Pix</option>
                <option value="cartao">Cartão</option>
              </select>
            </label>
          </div>
          <button className="action primary" disabled={action.busy}>
            Salvar gasto
          </button>
        </form>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ Folha da semana */

export function WeekSheet({ openDay }: { openDay: (day: string) => void }) {
  const [monday, setMonday] = useState(() => mondayOf(localDay()));
  const saturday = addDays(monday, 5);
  const sheet = useLoad<Sheet>(`store/sheet?start=${monday}&end=${saturday}`);
  const data = sheet.data?.start === monday ? sheet.data : null;
  const action = useAction(sheet.reload);
  const fixed = data?.week.expenses.filter((item) => item.type === "fixo") ?? [];
  const variable = data?.week.expenses.filter((item) => item.type === "variavel") ?? [];
  const stockValue = data?.stock.reduce((total, item) => total + Number(item.value ?? 0), 0) ?? 0;
  return (
    <div className="store-sheet">
      <SheetHeader
        title={`${shortDate(monday)} até ${shortDate(saturday)}`}
        subtitle="Folha da semana · segunda a sábado"
      >
        <DayPicker day={monday} onChange={(day) => setMonday(mondayOf(day))} step={7} />
      </SheetHeader>
      {sheet.error && <p className="notice error">{sheet.error}</p>}
      {action.feedback}
      {!data ? (
        <PanelSkeleton label="Somando a semana…" />
      ) : (
        <>
          <div className="week-strip">
            {data.days.map((day) => (
              <button type="button" key={day.day} onClick={() => openDay(day.day)}>
                <small>{dayLabel(day.day, true)}</small>
                <strong>{brl(day.totals.sales)}</strong>
                <span>
                  {day.sales.length} venda{day.sales.length === 1 ? "" : "s"}
                  {day.cash.some(
                    (c) => c.counted !== null && Number(c.counted) !== Number(c.expected),
                  ) && <AlertTriangle size={13} aria-label="Diferença no caixa" />}
                </span>
              </button>
            ))}
          </div>
          <div className="sheet-grid">
            <section className="panel">
              <h3>Faturamento da semana</h3>
              {data.week.products.length === 0 ? (
                <p className="hint">Sem vendas nesta semana.</p>
              ) : (
                <div className="table-scroll">
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th className="num">Qtd.</th>
                        <th>Produto</th>
                        <th className="num">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.week.products.map((row) => (
                        <tr key={row.product + row.unit}>
                          <td className="num strong">{qty(row.quantity)}</td>
                          <td>
                            {row.product}
                            <small className="hint"> · {row.unit}</small>
                          </td>
                          <td className="num">{brl(row.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <TotalsBand totals={data.week} />
            </section>
            <div className="sheet-side">
              <Result
                sales={data.week.sales}
                expenses={data.week.expense_total}
                label="Faturamento − gastos"
              />
              <section className="panel">
                <h3>Gastos fixos</h3>
                {fixed.length === 0 && <p className="hint">Nenhum.</p>}
                {fixed.map((item) => (
                  <div className="cash-line" key={item.id}>
                    <span>
                      {item.description}
                      <small> · {shortDate(item.day ?? null)}</small>
                    </span>
                    <strong>{brl(item.amount)}</strong>
                  </div>
                ))}
                <h3 className="space">Gastos variáveis</h3>
                {variable.length === 0 && <p className="hint">Nenhum.</p>}
                {variable.map((item) => (
                  <div className="cash-line" key={item.id}>
                    <span>
                      {item.description}
                      <small> · {shortDate(item.day ?? null)}</small>
                    </span>
                    <strong>{brl(item.amount)}</strong>
                  </div>
                ))}
                <div className="cash-line is-total">
                  <span>Total de gastos</span>
                  <strong>{brl(data.week.expense_total)}</strong>
                </div>
              </section>
              <section className="panel">
                <h3>Retiradas e vales</h3>
                <p className="hint">Saíram do caixa, mas não entram como gasto da loja.</p>
                {data.week.withdrawals.length === 0 && <p className="hint">Nenhuma.</p>}
                {data.week.withdrawals.map((item) => (
                  <div className="cash-line is-out" key={item.id}>
                    <span>
                      {item.category === "vale" ? "Vale" : "RT"} {item.person}
                      <small> · {shortDate(item.day)}</small>
                    </span>
                    <strong>{brl(item.amount)}</strong>
                  </div>
                ))}
              </section>
            </div>
          </div>
          <section className="panel space">
            <h3>Estoque parado na loja</h3>
            <p className="hint">Quantidade atual × custo de compra. Total {brl(stockValue)}.</p>
            <div className="table-scroll">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="num">Quantidade</th>
                    <th className="num">Custo</th>
                    <th className="num">Valor</th>
                    <th className="num">Preço de venda</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td className="num">
                        {qty(item.balance)} {item.base_unit}
                      </td>
                      <td className="num">{brl(item.unit_cost, "A informar")}</td>
                      <td className="num">{brl(item.value, "A informar")}</td>
                      <td className="num">{brl(item.price, "Sem preço")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <form
            className="panel closing-bar"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void action.run(
                () =>
                  sendStore("closing", {
                    period: "semana",
                    start_on: monday,
                    end_on: saturday,
                    notes: value(form, "notes"),
                  }),
                "Semana fechada e guardada em Fechamentos.",
              );
            }}
          >
            <div>
              <h3>Fechar a semana</h3>
              <p className="hint">Fecha sozinho todo sábado às 23h. Também pode fechar na hora.</p>
            </div>
            <label>
              Observação
              <input name="notes" />
            </label>
            <button className="action primary" disabled={action.busy}>
              <CheckCircle2 size={16} /> Fechar a semana agora
            </button>
          </form>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Fechamentos */

export function Closings({ openDay }: { openDay: (day: string) => void }) {
  const list = useLoad<Closing[]>("store/closings");
  const action = useAction(list.reload);
  const today = localDay();
  return (
    <div className="store-sheet">
      <SheetHeader title="Fechamentos" subtitle="Automáticos às 23h · ou feitos na hora">
        <button
          type="button"
          className="action"
          disabled={action.busy}
          onClick={() =>
            void action.run(
              () =>
                sendStore("closing", { period: "dia", start_on: today, end_on: today, notes: "" }),
              "Dia de hoje fechado.",
            )
          }
        >
          Fechar hoje
        </button>
        <button
          type="button"
          className="action primary"
          disabled={action.busy}
          onClick={() => {
            const monday = mondayOf(today);
            const end = addDays(monday, 5) < today ? addDays(monday, 5) : today;
            void action.run(
              () =>
                sendStore("closing", {
                  period: "semana",
                  start_on: monday,
                  end_on: end,
                  notes: "",
                }),
              "Semana fechada.",
            );
          }}
        >
          Fechar a semana
        </button>
      </SheetHeader>
      {list.error && <p className="notice error">{list.error}</p>}
      {action.feedback}
      {!list.data ? (
        <PanelSkeleton label="Carregando fechamentos…" />
      ) : list.data.length === 0 ? (
        <section className="panel">
          <p className="hint">Nenhum fechamento ainda. O primeiro automático sai hoje às 23h.</p>
        </section>
      ) : (
        <div className="closing-list">
          {list.data.map((closing) => {
            const summary = closing.snapshot.summary;
            return (
              <article className="panel closing-card" key={closing.id}>
                <div className="closing-head">
                  <div>
                    <p className="eyebrow">
                      {closing.period === "dia" ? "Fechamento do dia" : "Fechamento da semana"}
                    </p>
                    <h3>
                      {closing.period === "dia"
                        ? dayLabel(closing.start_on)
                        : `${shortDate(closing.start_on)} até ${shortDate(closing.end_on)}`}
                    </h3>
                  </div>
                  <span
                    className={
                      "chip " + (closing.source === "manual" ? "chip-manual" : "chip-auto")
                    }
                  >
                    {closing.source === "manual" ? `Manual · ${closing.actor ?? ""}` : "Automático"}
                  </span>
                </div>
                {summary && (
                  <>
                    <dl className="closing-numbers">
                      <div>
                        <dt>Vendas</dt>
                        <dd>{brl(summary.sales)}</dd>
                      </div>
                      <div>
                        <dt>Pix</dt>
                        <dd>{brl(summary.pix)}</dd>
                      </div>
                      <div>
                        <dt>Dinheiro</dt>
                        <dd>{brl(summary.dinheiro)}</dd>
                      </div>
                      <div>
                        <dt>Cartão</dt>
                        <dd>{brl(summary.cartao)}</dd>
                      </div>
                      <div>
                        <dt>Gastos</dt>
                        <dd>{brl(summary.expenses)}</dd>
                      </div>
                      <div className={summary.result < 0 ? "is-negative" : "is-positive"}>
                        <dt>Subtotal</dt>
                        <dd>{brl(summary.result)}</dd>
                      </div>
                    </dl>
                    {(summary.open_cash || summary.cash_difference !== 0) && (
                      <p className="notice warning">
                        <AlertTriangle size={15} />{" "}
                        {summary.open_cash ? "O caixa ficou aberto. " : ""}
                        {summary.cash_difference !== 0
                          ? `Diferença no caixa: ${brl(summary.cash_difference)}.`
                          : ""}
                      </p>
                    )}
                  </>
                )}
                {closing.notes && <p className="hint">“{closing.notes}”</p>}
                <div className="actions">
                  <small className="hint">
                    Guardado em {new Date(closing.created_at).toLocaleString("pt-BR")}
                  </small>
                  <button
                    type="button"
                    className="action"
                    onClick={() => openDay(closing.start_on)}
                  >
                    Ver folha
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Débitos e fiados */

function DebtForm({ debt, kind, done }: { debt?: Debt; kind: Debt["kind"]; done: () => void }) {
  const action = useAction(done);
  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(
          () =>
            sendStore("debt", {
              ...(debt ? { id: debt.id } : {}),
              kind: value(form, "kind") || kind,
              person: value(form, "person"),
              description: value(form, "description"),
              amount: number(form, "amount"),
              due_on: value(form, "due_on") || null,
              paid_on: value(form, "paid_on") || null,
              example: form.get("example") === "on",
              notes: value(form, "notes"),
            }),
          "Salvo.",
        );
      }}
    >
      {action.feedback}
      <div className="fields">
        <label>
          Tipo
          <select name="kind" defaultValue={debt?.kind ?? kind}>
            {Object.entries(debtKinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {kind === "fiado" ? "Cliente" : "Pessoa / empresa"}
          <input name="person" defaultValue={debt?.person ?? ""} />
        </label>
        <label>
          Descrição
          <input name="description" defaultValue={debt?.description ?? ""} />
        </label>
        <label>
          Valor (pode deixar em branco)
          <input
            name="amount"
            inputMode="decimal"
            defaultValue={debt?.amount == null ? "" : String(debt.amount).replace(".", ",")}
          />
        </label>
        <label>
          Data / vencimento
          <input name="due_on" type="date" defaultValue={debt?.due_on ?? ""} />
        </label>
        <label>
          {kind === "fiado" ? "Recebido em" : "Pago em"}
          <input name="paid_on" type="date" defaultValue={debt?.paid_on ?? ""} />
        </label>
      </div>
      <label>
        Observação
        <input name="notes" defaultValue={debt?.notes ?? ""} />
      </label>
      <label className="check">
        <input type="checkbox" name="example" defaultChecked={debt?.example ?? false} /> É só
        exemplo (confirmar com o dono)
      </label>
      <button className="action primary" disabled={action.busy}>
        Salvar
      </button>
    </form>
  );
}

function DebtRow({ debt, reload }: { debt: Debt; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const action = useAction(reload);
  const overdue = debt.kind !== "fiado" && !debt.paid_on && debt.due_on && debt.due_on < localDay();
  return (
    <div className={"debt-row" + (debt.paid_on ? " is-paid" : "")}>
      <div className="debt-main">
        <span className="debt-date">{shortDate(debt.due_on)}</span>
        <span className="debt-person">
          {debt.person || debt.description || "Sem nome"}
          {debt.person && debt.description && <small> · {debt.description}</small>}
          {debt.notes && <small className="hint"> · {debt.notes}</small>}
        </span>
        <span className="chips">
          {debt.example && <span className="chip chip-example">Exemplo</span>}
          {debt.amount === null && <span className="chip chip-blank">Valor em branco</span>}
          {debt.paid_on && (
            <span className="chip chip-paid">
              {debt.kind === "fiado" ? "Recebido" : "Pago"} {shortDate(debt.paid_on)}
            </span>
          )}
          {overdue && <span className="chip chip-late">Vencido</span>}
        </span>
        <strong className="num">{brl(debt.amount, "—")}</strong>
        <span className="debt-actions">
          {!debt.paid_on && (
            <button
              type="button"
              className="action"
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () =>
                    sendStore("debt", {
                      id: debt.id,
                      kind: debt.kind,
                      person: debt.person,
                      description: debt.description,
                      amount: debt.amount === null ? null : Number(debt.amount),
                      due_on: debt.due_on,
                      paid_on: localDay(),
                      example: debt.example,
                      notes: debt.notes,
                    }),
                  debt.kind === "fiado" ? "Marcado como recebido." : "Marcado como pago.",
                )
              }
            >
              {debt.kind === "fiado" ? "Recebi" : "Paguei"}
            </button>
          )}
          <button type="button" className="action" onClick={() => setEditing(!editing)}>
            {editing ? "Fechar" : "Editar"}
          </button>
          <button
            type="button"
            className="action"
            disabled={action.busy}
            onClick={() => {
              if (window.confirm("Apagar este lançamento?"))
                void action.run(() => sendStore("debt_remove", { id: debt.id }), "Apagado.");
            }}
          >
            Apagar
          </button>
        </span>
      </div>
      {action.feedback}
      {editing && (
        <DebtForm
          debt={debt}
          kind={debt.kind}
          done={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

const open = (debts: Debt[]) =>
  debts
    .filter((debt) => !debt.paid_on)
    .reduce((total, debt) => total + Number(debt.amount ?? 0), 0);

export function CompanyDebts() {
  const sheet = useLoad<Sheet>(`store/sheet?start=${localDay()}&end=${localDay()}`);
  const [adding, setAdding] = useState<Debt["kind"] | null>(null);
  const debts = (sheet.data?.debts ?? []).filter((debt) => debt.kind !== "fiado");
  const groups = (["boleto", "divida", "aluguel", "outro", "credito"] as const).map((kind) => ({
    kind,
    items: debts.filter((debt) => debt.kind === kind),
  }));
  const payable = open(debts.filter((debt) => debt.kind !== "credito"));
  const credits = open(debts.filter((debt) => debt.kind === "credito"));
  return (
    <div className="store-sheet">
      <SheetHeader title="Débitos da empresa" subtitle="Boletos, dívidas, aluguel e créditos" />
      {sheet.error && <p className="notice error">{sheet.error}</p>}
      {!sheet.data ? (
        <PanelSkeleton label="Carregando débitos…" />
      ) : (
        <>
          <dl className="totals-band debt-totals">
            <div className="is-main">
              <dt>Todas as dívidas em aberto</dt>
              <dd>{brl(payable)}</dd>
            </div>
            <div>
              <dt>Todos os créditos</dt>
              <dd>{brl(credits)}</dd>
            </div>
            <div>
              <dt>Valores em branco</dt>
              <dd>{debts.filter((debt) => debt.amount === null).length}</dd>
            </div>
          </dl>
          {groups.map((group) => (
            <section className="panel space" key={group.kind}>
              <div className="panel-title">
                <h3>{debtKinds[group.kind]}</h3>
                <span className="hint">Em aberto {brl(open(group.items))}</span>
                <button
                  type="button"
                  className="action"
                  onClick={() => setAdding(adding === group.kind ? null : group.kind)}
                >
                  <Plus size={16} /> Adicionar
                </button>
              </div>
              {group.kind === "credito" && (
                <p className="hint">
                  Na folha do dono aparece “Crédito” para João e Ramom. Confirme com ele se é
                  dinheiro que eles colocaram na empresa.
                </p>
              )}
              {adding === group.kind && (
                <DebtForm
                  kind={group.kind}
                  done={() => {
                    setAdding(null);
                    sheet.reload();
                  }}
                />
              )}
              {group.items.length === 0 && <p className="hint">Nada lançado.</p>}
              {group.items.map((debt) => (
                <DebtRow key={debt.id} debt={debt} reload={sheet.reload} />
              ))}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

export function Fiados() {
  const sheet = useLoad<Sheet>(`store/sheet?start=${localDay()}&end=${localDay()}`);
  const [adding, setAdding] = useState(false);
  const previous = (sheet.data?.debts ?? []).filter((debt) => debt.kind === "fiado");
  const fromSales = sheet.data?.fiados ?? [];
  const total = fromSales.reduce((sum, item) => sum + Number(item.amount), 0) + open(previous);
  return (
    <div className="store-sheet">
      <SheetHeader title="Fiados" subtitle="Clientes devendo à loja" />
      {sheet.error && <p className="notice error">{sheet.error}</p>}
      {!sheet.data ? (
        <PanelSkeleton label="Carregando fiados…" />
      ) : (
        <>
          <dl className="totals-band debt-totals">
            <div className="is-main">
              <dt>Total devendo</dt>
              <dd>{brl(total)}</dd>
            </div>
            <div>
              <dt>Clientes</dt>
              <dd>{fromSales.length + previous.filter((debt) => !debt.paid_on).length}</dd>
            </div>
          </dl>
          <section className="panel space">
            <div className="panel-title">
              <h3>Fiado anterior (caderno)</h3>
              <button type="button" className="action" onClick={() => setAdding(!adding)}>
                <Plus size={16} /> Adicionar cliente
              </button>
            </div>
            {adding && (
              <DebtForm
                kind="fiado"
                done={() => {
                  setAdding(false);
                  sheet.reload();
                }}
              />
            )}
            {previous.length === 0 && <p className="hint">Nenhum fiado anterior lançado.</p>}
            {previous.map((debt) => (
              <DebtRow key={debt.id} debt={debt} reload={sheet.reload} />
            ))}
          </section>
          <section className="panel space">
            <h3>Fiado lançado nas vendas</h3>
            <p className="hint">
              Venda a prazo para cliente autorizado. Para receber, abra a venda em Vender ›
              Histórico.
            </p>
            {fromSales.length === 0 && <p className="hint">Nenhuma venda em aberto.</p>}
            {fromSales.map((item) => (
              <div className="cash-line" key={item.name}>
                <span>
                  {item.name}
                  <small> · desde {shortDate(item.since)}</small>
                </span>
                <strong>{brl(item.amount)}</strong>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
