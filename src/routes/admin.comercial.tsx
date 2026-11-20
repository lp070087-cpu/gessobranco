import {
  groupPurchases,
  PurchaseDeliveryForm,
  PurchaseDeliveryHistory,
} from "@/components/preciso/CommercialPurchases";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  commercialFetch,
  localDay,
  moneyBR,
  quantityBR,
  type CommercialState,
  type Product,
  type Report,
} from "@/lib/commercial-client";
import {
  CommandForm,
  ProductEditor,
  paymentOptions,
  productForUnit,
  productUnits,
  type Command,
} from "@/components/preciso/CommercialForms";
import { CommercialSales } from "@/components/preciso/CommercialSales";
import { CommercialImport } from "@/components/preciso/CommercialImport";
import { CompanyAccess } from "@/components/preciso/CompanyAccess";
import { CompanyRequests } from "@/components/preciso/CompanyRequests";
import { AccountLayout, ManagementMenu } from "@/components/preciso/AccountMenu";
import type { CompanyActor } from "@/lib/company-permissions";
import { SalesQualityChart } from "@/components/preciso/SalesQualityChart";
import {
  CommercialIncomeStatement,
  CommercialOverview,
} from "@/components/preciso/CommercialOverview";
import { CommercialReportTools } from "@/components/preciso/CommercialInsights";
import "@/components/preciso/commercial.css";

const sections = {
  vender: "Vender",
  produtos: "Produtos",
  estoque: "Estoque",
  clientes: "Clientes",
  compras: "Compras",
  materiais: "Pedidos de material",
  financeiro: "Financeiro",
  importar: "Importar",
} as const;
type Section = keyof typeof sections;
export const Route = createFileRoute("/admin/comercial")({
  validateSearch: (search: Record<string, unknown>): { secao?: Section } =>
    typeof search.secao === "string" && search.secao in sections
      ? { secao: search.secao as Section }
      : {},
  head: () => ({ meta: [{ title: "Gestão da Loja — Ouro Branco" }] }),
  component: Commercial,
});
type Actor = CompanyActor;
type Pending = { actor: string; kind: string; body: Record<string, unknown> };
const monthStart = () => localDay().slice(0, 7) + "-01";
type Tab = "Visão Geral" | "Caixa" | (typeof sections)[Section];

function Commercial() {
  const navigate = useNavigate();
  const [user, setUser] = useState<Actor | null>(null);
  const [state, setState] = useState<CommercialState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const { secao } = Route.useSearch();
  const tab: Tab = secao ? sections[secao] : "Visão Geral";
  const setTab = (next: Tab) => {
    setEditing(null);
    if (next === "Caixa") return void navigate({ to: "/admin/folha" });
    const slug = (Object.keys(sections) as Section[]).find((key) => sections[key] === next);
    void navigate({ to: "/admin/comercial", search: slug ? { secao: slug } : {} });
  };
  const [reportPeriod, setReportPeriod] = useState({ start: monthStart(), end: localDay() });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(localDay);
  const locked = useRef(false);
  const pendingOperation = useRef<Pending | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  async function loadReport(from: string, to: string, signal?: AbortSignal) {
    const result = await commercialFetch<Report>(
      `commercial/report?start=${from}&end=${to}`,
      undefined,
      signal,
    );
    if (signal?.aborted) return;
    setReport(result);
    setReportPeriod({ start: from, end: to });
  }

  async function load(signal?: AbortSignal) {
    setState(await commercialFetch<CommercialState>("commercial/state", undefined, signal));
    await loadReport(start, end, signal);
  }
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const data = await commercialFetch<{ user: Actor }>(
          "auth/me",
          undefined,
          controller.signal,
        );
        if (data.user.role !== "admin")
          throw new Error("Esta área exige uma conta administrativa.");
        setUser(data.user);
        try {
          const saved = JSON.parse(
            sessionStorage.getItem("ouro-pending-commercial") || "null",
          ) as Pending | null;
          pendingOperation.current = saved;
          setPending(saved);
        } catch {
          /* Storage can be unavailable in private mode. */
        }
        await load(controller.signal);
      } catch (failure) {
        if (!controller.signal.aborted && (failure as Error & { status?: number }).status !== 401)
          setError(failure instanceof Error ? failure.message : "Falha ao carregar a gestão.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // Reports update through the explicit period action, preserving unsaved forms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function storePending(value: Pending | null) {
    pendingOperation.current = value;
    setPending(value);
    try {
      if (value) sessionStorage.setItem("ouro-pending-commercial", JSON.stringify(value));
      else sessionStorage.removeItem("ouro-pending-commercial");
    } catch {
      /* The in-memory key still protects retries within this tab. */
    }
  }

  async function execute(operation: Pending) {
    if (locked.current) throw new Error("Aguarde a operação em andamento.");
    if (!user || operation.actor !== user.id)
      throw new Error("A operação pendente pertence a outra sessão. Entre com a conta original.");
    locked.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await commercialFetch<{ id: string }>(
        `commercial/${operation.kind}`,
        operation.body,
      );
      storePending(null);
      setMessage("Operação registrada.");
      try {
        await load();
      } catch {
        setError(
          "A operação foi registrada, mas a atualização da tela falhou. Atualize para conferir o histórico.",
        );
      }
      return result;
    } catch (failure) {
      const status = (failure as Error & { status?: number }).status;
      if (status && status >= 400 && status < 500) storePending(null);
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível confirmar a operação. Confira o histórico antes de reenviar.",
      );
      throw failure;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const command: Command = async (kind, data) => {
    if (!user) throw new Error("Entre na sua conta.");
    if (pendingOperation.current) {
      const error = new Error(
        "Existe uma operação aguardando confirmação. Use o botão de conferir e reenviar acima.",
      );
      setError(error.message);
      throw error;
    }
    const operation = { actor: user.id, kind, body: { ...data, request_key: crypto.randomUUID() } };
    storePending(operation);
    return execute(operation);
  };

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await commercialFetch<{ user: Actor }>("auth/login", {
        access: "management",
        email: String(data.get("email")),
        password: String(data.get("password")),
      });
      if (response.user.role !== "admin")
        throw new Error("Esta área exige uma conta administrativa.");
      setUser(response.user);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao entrar.");
      const field = form.elements.namedItem("password") as HTMLInputElement;
      field.value = "";
      field.focus();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingSkeleton sidebar />;
  if (!user)
    return (
      <main className="commercial">
        <header className="commercial-header">
          <h1>OURO BRANCO</h1>
          <Link to="/">Ver site</Link>
        </header>
        <form onSubmit={signIn} className="panel" style={{ maxWidth: 480, margin: "40px auto" }}>
          <h2>Login da gestão da loja e da empresa</h2>
          <p className="hint">Use o mesmo e-mail e senha para acessar a loja e os serviços.</p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <label>
            E-mail
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input type="password" name="password" autoComplete="current-password" required />
          </label>
          <button disabled={busy} className="action primary">
            {busy ? "Entrando…" : "Entrar"}
          </button>
          <Link to="/login" className="action">
            Login do cliente
          </Link>
        </form>
      </main>
    );

  return (
    <main className="commercial preciso-client">
      <header className="commercial-header">
        <div>
          <h1>OURO BRANCO</h1>
          <small>Gestão da Loja · {user.full_name}</small>
        </div>
        <div className="actions">
          <Link to="/" className="action">
            Ver site
          </Link>
          <button
            className="action"
            disabled={busy || Boolean(pending)}
            onClick={() =>
              void commercialFetch("auth/logout", {})
                .then(() => {
                  setUser(null);
                  setState(null);
                })
                .catch((failure) => setError(failure.message))
            }
          >
            Sair
          </button>
        </div>
      </header>
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
      {pending && (
        <div className="notice">
          <p>
            A última operação ainda precisa de confirmação. Reenviar mantém o mesmo identificador
            para evitar registro duplicado.
          </p>
          <button
            className="action"
            disabled={busy}
            onClick={() => void execute(pending).catch(() => {})}
          >
            Conferir e reenviar operação
          </button>
        </div>
      )}
      <AccountLayout label="Menu da gestão" menu={<ManagementMenu user={user} />}>
        {tab === "Pedidos de material" ? (
          <CompanyRequests kind="material" />
        ) : !state && !error ? (
          <PanelSkeleton label="Carregando dados da loja…" />
        ) : !state ? (
          <button
            className="action"
            onClick={() => {
              setError("");
              void load().catch((failure: Error) => setError(failure.message));
            }}
          >
            Tentar carregar novamente
          </button>
        ) : (
          <fieldset disabled={busy} style={{ minWidth: 0 }}>
            {tab === "Visão Geral" && (
              <CommercialOverview
                state={state}
                report={report}
                period={reportPeriod}
                sell={() => setTab("Vender")}
                createProduct={() => {
                  setTab("Produtos");
                  setEditing("new");
                }}
                openMaterials={() => setTab("Pedidos de material")}
                openQuotes={() => void navigate({ to: "/admin/gestao-servicos" })}
                openFinance={() => setTab("Financeiro")}
              />
            )}
            {tab === "Financeiro" && (
              <>
                <div className="actions">
                  <Link to="/admin/cfo" search={{ secao: "despesas" }} className="action">
                    Despesas e comprovantes Pix
                  </Link>
                </div>
                <form
                  className="actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setError("");
                    void loadReport(start, end).catch((failure: Error) =>
                      setError(failure.message),
                    );
                  }}
                >
                  <label>
                    De
                    <input
                      type="date"
                      value={start}
                      onChange={(event) => setStart(event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Até
                    <input
                      type="date"
                      value={end}
                      onChange={(event) => setEnd(event.target.value)}
                      required
                    />
                  </label>
                  <button className="action">Atualizar período</button>
                </form>
                <CommercialReportTools
                  report={report}
                  period={reportPeriod}
                  onPeriod={(from, to) => {
                    setStart(from);
                    setEnd(to);
                    setError("");
                    void loadReport(from, to).catch((failure: Error) => setError(failure.message));
                  }}
                />
                {report && (
                  <>
                    <div className="stats">
                      {[
                        ["Vendas após devoluções", moneyBR(report.revenue), "Pelo dia da venda."],
                        ["Recebimentos", moneyBR(report.received), "Pelo dia em que recebeu."],
                        [
                          "Ainda a receber",
                          moneyBR(report.receivable),
                          "Saldo de todas as vendas.",
                        ],
                        [
                          "Custo dos produtos vendidos",
                          moneyBR(report.goods_cost),
                          "Custo histórico dos lotes.",
                        ],
                        [
                          "Contribuição das vendas",
                          moneyBR(report.contribution),
                          report.partial_sales
                            ? `${report.partial_sales} venda(s) com custos pendentes. Soma conhecida é parcial.`
                            : "Após mercadorias, frete, taxas e custos atribuídos.",
                        ],
                        [
                          "Despesas operacionais",
                          moneyBR(report.operating_expenses),
                          "Pela data de vencimento.",
                        ],
                        [
                          "Resultado estimado",
                          moneyBR(
                            report.contribution === null || report.partial_sales
                              ? null
                              : Number(report.contribution) - Number(report.operating_expenses),
                          ),
                          "Contribuição menos despesas do período.",
                        ],
                        [
                          "Saldo de caixa no período",
                          moneyBR(Number(report.received) - Number(report.cash_out)),
                          "Entradas menos pagamentos efetuados.",
                        ],
                      ].map(([label, value, hint]) => (
                        <div className="panel" key={label}>
                          <small>{label}</small>
                          <strong>{value}</strong>
                          <small>{hint}</small>
                        </div>
                      ))}
                    </div>
                    <div className="notice">
                      Contas a pagar {moneyBR(report.payable)} · Estornos pendentes{" "}
                      {moneyBR(report.refund_due)}. Resultado econômico e movimentações de caixa
                      usam as datas indicadas em cada informação.
                    </div>
                    <CommercialIncomeStatement report={report} />
                    <div className="actions">
                      <Link to="/admin/cfo" className="action">
                        Abrir CFO financeiro
                      </Link>
                    </div>
                    <SalesQualityChart period={reportPeriod} report={report} />
                  </>
                )}
              </>
            )}
            {tab === "Vender" && <CommercialSales state={state} command={command} />}
            {tab === "Produtos" && (
              <>
                <section className="panel">
                  <h2>Produtos e unidades</h2>
                  <button className="action primary" onClick={() => setEditing("new")}>
                    Cadastrar produto
                  </button>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Estoque</th>
                          <th>Unidades e preços padrão</th>
                          <th>Site</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.products.map((product) => (
                          <tr key={product.id}>
                            <td>
                              <button onClick={() => setEditing(product)}>{product.name}</button>
                              {product.example && (
                                <p className="hint">Exemplo inativo · confirme peso e preços</p>
                              )}
                            </td>
                            <td>
                              {quantityBR(product.balance)} {product.base_unit}
                            </td>
                            <td>
                              {product.units.map((unit) => (
                                <p key={unit.id}>
                                  {unit.name} = {quantityBR(unit.factor)} {product.base_unit} ·{" "}
                                  {moneyBR(unit.price)}
                                </p>
                              ))}
                            </td>
                            <td>{product.published ? "Publicado" : "Oculto"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                {editing && (
                  <ProductEditor
                    key={editing === "new" ? "new" : editing.id}
                    product={editing === "new" ? undefined : editing}
                    command={command}
                    close={() => setEditing(null)}
                  />
                )}
                <details>
                  <summary>Preços por cliente, perfil ou quantidade</summary>
                  <CommandForm
                    title="Nova condição comercial"
                    kind="price_rule"
                    command={command}
                    fields={[
                      {
                        name: "unit_id",
                        label: "Produto e unidade",
                        type: "select",
                        required: true,
                        options: productUnits(state),
                      },
                      {
                        name: "customer_id",
                        label: "Cliente específico",
                        type: "select",
                        nullable: true,
                        options: state.customers.map((customer) => ({
                          value: customer.id,
                          label: customer.name,
                        })),
                      },
                      {
                        name: "profile",
                        label: "Perfil (CNPJ, balcão, recorrente, atacado ou revendedor)",
                        nullable: true,
                      },
                      {
                        name: "minimum_quantity",
                        label: "Quantidade mínima na unidade selecionada",
                        type: "number",
                        value: 1,
                        required: true,
                      },
                      {
                        name: "price",
                        label: "Preço por unidade",
                        type: "number",
                        required: true,
                      },
                      {
                        name: "valid_from",
                        label: "Válido a partir de",
                        type: "date",
                        nullable: true,
                      },
                      { name: "valid_until", label: "Válido até", type: "date", nullable: true },
                    ]}
                  >
                    <p className="hint">
                      Condição individual tem prioridade sobre perfil. Depois, aplica-se a maior
                      faixa de quantidade. Use CNPJ para aplicar a faixa a clientes pessoa jurídica
                      no site.
                    </p>
                  </CommandForm>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Unidade</th>
                          <th>Cliente ou perfil</th>
                          <th>Quantidade mínima</th>
                          <th>Preço</th>
                          <th>Condição</th>
                          <th>Validade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.rules.map((rule) => (
                          <tr key={rule.id}>
                            <td>
                              {
                                productUnits(state).find((unit) => unit.value === rule.unit_id)
                                  ?.label
                              }
                            </td>
                            <td>
                              {state.customers.find((customer) => customer.id === rule.customer_id)
                                ?.name ??
                                rule.profile ??
                                "Todos"}
                            </td>
                            <td>{quantityBR(rule.minimum_quantity)}</td>
                            <td>{moneyBR(rule.price)}</td>
                            <td>
                              <button
                                onClick={() =>
                                  void command("price_rule_status", {
                                    id: rule.id,
                                    active: !rule.active,
                                  }).catch(() => {})
                                }
                              >
                                {rule.active ? "Desativar condição" : "Reativar condição"}
                              </button>
                            </td>
                            <td>
                              {rule.valid_from ?? "Sem início"} / {rule.valid_until ?? "Sem fim"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
            {tab === "Estoque" && (
              <>
                <div className="notice">
                  Sacos, frações e quilos movimentam o mesmo saldo físico. Informe sempre a unidade
                  usada na contagem. Ajustes e perdas exigem motivo.
                </div>
                <CommandForm
                  title="Ajustar estoque ou registrar contagem"
                  kind="adjustment"
                  command={command}
                  fields={[
                    {
                      name: "unit_id",
                      label: "Produto e unidade",
                      type: "select",
                      required: true,
                      options: productUnits(state),
                    },
                    {
                      name: "mode",
                      label: "Operação",
                      type: "select",
                      required: true,
                      options: [
                        { value: "inventory", label: "Contagem física total" },
                        { value: "in", label: "Entrada por ajuste" },
                        { value: "out", label: "Saída por ajuste" },
                        { value: "loss", label: "Perda ou avaria" },
                      ],
                    },
                    { name: "quantity", label: "Quantidade", type: "number", required: true },
                    {
                      name: "base_unit_cost",
                      label: "Custo por unidade-base para saldo acrescentado",
                      type: "number",
                      nullable: true,
                      hint: "Deixe vazio se o custo é desconhecido.",
                    },
                    { name: "reference", label: "Referência" },
                    { name: "reason", label: "Motivo e observações", required: true },
                  ]}
                  extra={(data) => ({ ...data, product_id: productForUnit(state, data.unit_id) })}
                />
                <section className="panel space">
                  <h2>Últimas 500 movimentações</h2>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Produto</th>
                          <th>Quantidade-base</th>
                          <th>Operação</th>
                          <th>Motivo</th>
                          <th>Responsável</th>
                        </tr>
                      </thead>
                      <tbody>
                        {state.movements.map((movement) => (
                          <tr key={movement.id}>
                            <td>{new Date(movement.created_at).toLocaleString("pt-BR")}</td>
                            <td>
                              {
                                state.products.find((product) => product.id === movement.product_id)
                                  ?.name
                              }
                            </td>
                            <td>{quantityBR(movement.quantity)}</td>
                            <td>
                              {(
                                {
                                  purchase: "Compra",
                                  sale: "Venda",
                                  return: "Devolução",
                                  adjustment: "Inventário/ajuste",
                                } as Record<string, string>
                              )[movement.kind] ?? movement.kind}
                            </td>
                            <td>{movement.reason}</td>
                            <td>{movement.actor_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
            {tab === "Clientes" && (
              <div className="grid">
                <CommandForm
                  title="Cadastrar cliente"
                  kind="customer"
                  command={command}
                  fields={[
                    { name: "name", label: "Nome", required: true },
                    { name: "contact", label: "Telefone ou e-mail" },
                    {
                      name: "profile",
                      label: "Perfil comercial",
                      type: "select",
                      required: true,
                      options: [
                        { value: "balcao", label: "Balcão" },
                        { value: "recorrente", label: "Recorrente" },
                        { value: "atacado", label: "Atacado" },
                        { value: "revendedor", label: "Revendedor" },
                      ],
                    },
                    {
                      name: "allow_credit",
                      label: "Autorizar venda a prazo para este cliente",
                      type: "checkbox",
                    },
                  ]}
                />
                <section className="panel">
                  <h2>Clientes cadastrados</h2>
                  {state.customers.map((customer) => (
                    <details key={customer.id}>
                      <summary>
                        {customer.name} · {customer.profile}
                      </summary>
                      <CommandForm
                        title="Editar cliente"
                        kind="customer"
                        command={command}
                        fields={[
                          { name: "name", label: "Nome", value: customer.name, required: true },
                          { name: "contact", label: "Contato", value: customer.contact },
                          {
                            name: "profile",
                            label: "Perfil",
                            value: customer.profile,
                            required: true,
                          },
                          {
                            name: "allow_credit",
                            label: "Autorizar venda a prazo",
                            type: "checkbox",
                            value: customer.allow_credit,
                          },
                        ]}
                        extra={(data) => ({ ...data, id: customer.id })}
                      />
                    </details>
                  ))}
                </section>
              </div>
            )}
            {tab === "Compras" && (
              <>
                <div className="grid">
                  <PurchaseDeliveryForm state={state} command={command} />
                  <CommandForm
                    title="Cadastrar fornecedor"
                    kind="supplier"
                    command={command}
                    fields={[
                      { name: "name", label: "Nome", required: true },
                      { name: "contact", label: "Contato" },
                    ]}
                  />
                </div>
                <section className="panel space">
                  <h2>Histórico de compras e custos</h2>
                  {groupPurchases(state.purchases).map((items) => {
                    const purchase = items[0];
                    if (purchase.delivery_id)
                      return (
                        <PurchaseDeliveryHistory
                          key={purchase.delivery_id}
                          items={items}
                          state={state}
                          command={command}
                        />
                      );
                    return (
                      <details key={purchase.id}>
                        <summary>
                          {purchase.purchased_at} ·{" "}
                          {
                            state.products.find((product) => product.id === purchase.product_id)
                              ?.name
                          }{" "}
                          · {moneyBR(purchase.total)}
                        </summary>
                        <p className="hint">
                          Fornecedor{" "}
                          {state.suppliers.find((supplier) => supplier.id === purchase.supplier_id)
                            ?.name ?? "Não informado"}{" "}
                          · {quantityBR(purchase.quantity)} na unidade-base · custo médio da entrada{" "}
                          {purchase.total === null
                            ? "pendente"
                            : moneyBR(Number(purchase.total) / Number(purchase.quantity))}{" "}
                          · pago {moneyBR(purchase.paid)}
                        </p>
                        <p className="hint">
                          Material {moneyBR(purchase.goods_total)} · Frete{" "}
                          {moneyBR(purchase.freight)} · Outros custos{" "}
                          {moneyBR(purchase.other_costs)}
                        </p>
                        {purchase.total === null && (
                          <CommandForm
                            title="Completar custos da compra"
                            kind="purchase_costs"
                            command={command}
                            fields={[
                              {
                                name: "goods_total",
                                label: "Total das mercadorias",
                                type: "number",
                                required: true,
                              },
                              {
                                name: "freight",
                                label: "Frete atribuído",
                                type: "number",
                                required: true,
                              },
                              {
                                name: "other_costs",
                                label: "Outros custos",
                                type: "number",
                                required: true,
                              },
                              { name: "reason", label: "Motivo da atualização", required: true },
                            ]}
                            extra={(data) => ({ ...data, purchase_id: purchase.id })}
                          />
                        )}
                        {purchase.total !== null &&
                          Number(purchase.paid) < Number(purchase.total) && (
                            <CommandForm
                              title="Confirmar pagamento da compra"
                              kind="purchase_payment"
                              command={command}
                              fields={[
                                {
                                  name: "amount",
                                  label: "Valor pago",
                                  type: "number",
                                  required: true,
                                },
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
                              extra={(data) => ({ ...data, purchase_id: purchase.id })}
                            />
                          )}
                      </details>
                    );
                  })}
                </section>
              </>
            )}
            {tab === "Financeiro" && (
              <section className="panel space">
                <h2>Despesas e contas a pagar</h2>
                {state.expenses.map((expense) => (
                  <details key={expense.id}>
                    <summary>
                      {expense.description} · {moneyBR(expense.amount)} ·{" "}
                      {expense.paid_on
                        ? `Pago em ${expense.paid_on}`
                        : `A pagar em ${expense.due_on}`}
                    </summary>
                    {!expense.paid_on && (
                      <CommandForm
                        title="Confirmar pagamento da despesa"
                        kind="expense_payment"
                        command={command}
                        fields={[
                          {
                            name: "paid_on",
                            label: "Data do pagamento",
                            type: "date",
                            required: true,
                            value: localDay(),
                          },
                          {
                            name: "method",
                            label: "Forma",
                            type: "select",
                            required: true,
                            options: paymentOptions,
                          },
                          {
                            name: "confirmed",
                            label: "Confirmei a movimentação financeira",
                            type: "checkbox",
                            required: true,
                          },
                        ]}
                        extra={(data) => ({ ...data, expense_id: expense.id })}
                      />
                    )}
                  </details>
                ))}
                <h2 className="space">Resultado por produto</h2>
                {report?.by_product.map((row) => (
                  <p key={row.product_name}>
                    {row.product_name} · receita {moneyBR(row.revenue)} · custo{" "}
                    {moneyBR(row.goods_cost)} · diferença{" "}
                    {moneyBR(
                      row.goods_cost === null ? null : Number(row.revenue) - Number(row.goods_cost),
                    )}
                  </p>
                ))}
                <h2 className="space">Resultado por cliente</h2>
                {report?.by_customer.map((row) => (
                  <p key={row.name}>
                    {row.name} · receita {moneyBR(row.revenue)} · contribuição{" "}
                    {moneyBR(row.contribution)}
                    {row.partial_sales ? " · custos pendentes, resultado parcial" : ""}
                  </p>
                ))}
                {!!report?.pending_purchase_costs && (
                  <p className="notice warning">
                    {report.pending_purchase_costs} compra(s) com custos pendentes. O saldo a pagar
                    ainda é parcial.
                  </p>
                )}
                <p className="hint">
                  A diferença por produto ainda não desconta os custos atribuídos à venda e as
                  despesas gerais.
                </p>
              </section>
            )}

            {tab === "Clientes" && <CompanyAccess customers={state.customers} />}
            {tab === "Importar" && <CommercialImport command={command} state={state} />}
          </fieldset>
        )}
      </AccountLayout>
    </main>
  );
}
import { LoadingSkeleton, PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
