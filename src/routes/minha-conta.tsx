import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, CalendarDays, ClipboardList, Package, Settings } from "lucide-react";
import { AccountLayout, hasManagementAccess } from "@/components/preciso/AccountMenu";
import { CustomerBusiness, type BusinessData } from "@/components/preciso/CustomerBusiness";
import { CompanySession } from "@/components/preciso/CompanySession";
import { commercialFetch, moneyBR, quantityBR } from "@/lib/commercial-client";
import type { CompanyActor } from "@/lib/company-permissions";
import { measuredArea } from "@/lib/estimate";

export const Route = createFileRoute("/minha-conta")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { secao?: "agenda" | "orcamento" | "materiais" | "configuracoes" | "empresa" } =>
    search.secao === "agenda" ||
    search.secao === "orcamento" ||
    search.secao === "materiais" ||
    search.secao === "configuracoes" ||
    search.secao === "empresa"
      ? { secao: search.secao }
      : {},
  head: () => ({ meta: [{ title: "Minha conta — Ouro Branco" }] }),
  component: AccountRoute,
});
function AccountRoute() {
  const { secao } = Route.useSearch();
  return (
    <CompanySession title="Minha conta" destination={secao === "materiais" ? secao : undefined}>
      {(user) => <Account user={user} />}
    </CompanySession>
  );
}
type Material = {
  id: string;
  name: string;
  description: string;
  available: boolean;
  image_url: string | null;
  units: { id: string; name: string; factor: number }[];
};
type Service = {
  id: string;
  name: string;
  pricePerM2: string;
  billingUnit: string;
  available: boolean;
};
type Order = {
  id: string;
  kind: "material" | "service";
  subject: string;
  unit_name: string | null;
  quantity: string | null;
  quoted_unit_price: string | null;
  proposal: { quantity: number; unit: string; unit_price: number; work: string } | null;
  notes: string;
  status: string;
  created_at: string;
};
type Quote = {
  id: string;
  title: string;
  status: string;
  total: string;
  preliminary: boolean;
  createdAt: string;
};
type Appointment = { id: string; status: string; scheduled_at: string; address: string };
const labels: Record<string, string> = {
  new: "Recebido",
  contacted: "Em atendimento",
  closed: "Encerrado",
  requested: "Solicitado",
  reviewing: "Em análise",
  visit_required: "Visita necessária",
  proposed: "Proposta enviada",
  approved: "Aprovado",
  rejected: "Não aprovado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  planned: "Planejado",
  in_progress: "Em andamento",
  paused: "Pausado",
};
const unitNames: Record<string, string> = {
  m2: "m²",
  linear: "metro linear",
  unit: "unidade",
  day: "diária",
  project: "projeto",
  quote: "sob orçamento",
};
const options = [
  { label: "Orçamentos e pedidos", section: undefined, icon: ClipboardList },
  { label: "Materiais", section: "materiais", icon: Package },
  { label: "Agendamentos", section: "agenda", icon: CalendarDays },
  { label: "Empresa e obras", section: "empresa", icon: Building2 },
  { label: "Minha conta", section: "configuracoes", icon: Settings },
] as const;
const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function Account({ user }: { user: CompanyActor }) {
  const { secao } = Route.useSearch();
  const navigate = useNavigate({ from: "/minha-conta" });
  const business = usePortal<BusinessData>(hasManagementAccess(user) ? null : "portal/business");
  const showHistory = () => void navigate({ search: {} });
  if (hasManagementAccess(user))
    return (
      <section className="panel">
        <h2>Área do cliente</h2>
        <p className="hint">Entre com uma conta de cliente para consultar materiais e pedidos.</p>
        <Link
          to="/login"
          search={secao === "materiais" ? { destino: secao } : {}}
          className="action primary"
        >
          Entrar como cliente
        </Link>
      </section>
    );
  return (
    <AccountLayout
      key={secao ?? "historico"}
      label="Menu da conta"
      menu={options.filter(({ section }) => section !== "empresa" || business.data?.eligible).map(({ label, section, icon: Icon }) => (
        <Link
          key={label}
          to="/minha-conta"
          search={section ? { secao: section } : {}}
          activeOptions={{ exact: true, includeSearch: false }}
          aria-current={secao === section ? "page" : undefined}
          activeProps={{ "aria-current": secao === section ? "page" : undefined }}
          className="account-menu-item"
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </Link>
      ))}
    >
      {secao === "materiais" && <Materials done={showHistory} />}
      {secao === "orcamento" && <QuotesForm done={showHistory} />}
      {!secao && <History />}
      {secao === "agenda" && <Appointments />}
      {secao === "empresa" && (
        business.data?.eligible ? (
          <CustomerBusiness data={business.data} reload={business.reload} />
        ) : (
          <section className="panel">
            <h2>Empresa e obras</h2>
            {business.data ? (
              <p className="hint">Esta área está disponível para contas cadastradas com CNPJ.</p>
            ) : (
              <PortalStatus error={business.error} loaded={false} />
            )}
          </section>
        )
      )}
      {secao === "configuracoes" && (
        <section className="panel account-profile">
          <h2>Dados da conta</h2>
          <dl>
            <dt className="hint">Nome</dt>
            <dd>{user.full_name}</dd>
            <dt className="hint space">E-mail de acesso</dt>
            <dd>{user.email}</dd>
          </dl>
        </section>
      )}
    </AccountLayout>
  );
}

function usePortal<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [revision, refresh] = useState(0);
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    void commercialFetch<T>(path, undefined, abort.signal)
      .then((value) => {
        if (!abort.signal.aborted) {
          setData(value);
          setError("");
        }
      })
      .catch((failure: Error) => {
        if (!abort.signal.aborted) setError(failure.message);
      });
    return () => abort.abort();
  }, [path, revision]);
  return { data, error, reload: () => refresh((value) => value + 1) };
}
function PortalStatus({
  error,
  loaded,
  empty,
}: {
  error: string;
  loaded: boolean;
  empty?: boolean;
}) {
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
  ) : !loaded ? (
    <PanelSkeleton />
  ) : empty ? (
    <p className="hint">Nenhum registro disponível.</p>
  ) : null;
}
function Materials({ done }: { done: () => void }) {
  const { data, error } = usePortal<Material[]>("portal/catalogue");
  return (
    <>
      <h2>Comprar materiais</h2>
      <PortalStatus error={error} loaded={!!data} empty={!data?.length} />
      <div className="grid space">
        {data
          ?.filter((item) => item.units.length > 0)
          .map((item) => (
            <MaterialCard key={item.id} material={item} done={done} />
          ))}
      </div>
    </>
  );
}
function MaterialCard({ material, done }: { material: Material; done: () => void }) {
  const [unit, setUnit] = useState(material.units[0].id),
    [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState<{
    unit: string;
    quantity: number;
    price: string | number | null;
    next_tier: { quantity: number; price: number } | null;
  } | null>(null);
  const [waiting, setWaiting] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ key: string; unit: string; qty: number; notes: string } | null>(null);
  useEffect(() => {
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return;
    const abort = new AbortController();
    const timeout = window.setTimeout(() => {
      void commercialFetch<{
        price: string | number | null;
        next_tier: { quantity: number; price: number } | null;
      }>("portal/price", { unit_id: unit, quantity }, abort.signal)
        .then((value) => {
          if (!abort.signal.aborted) {
            setPrice({ unit, quantity, ...value });
            setError("");
          }
        })
        .catch((failure: Error) => {
          if (!abort.signal.aborted) setError(failure.message);
        });
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      abort.abort();
    };
  }, [unit, quantity]);
  async function order(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waiting) return;
    setError("");
    setWaiting(true);
    const notes = field(new FormData(event.currentTarget), "notes");
    if (
      !pending.current ||
      pending.current.unit !== unit ||
      pending.current.qty !== quantity ||
      pending.current.notes !== notes
    )
      pending.current = { key: crypto.randomUUID(), unit, qty: quantity, notes };
    try {
      await commercialFetch("portal/orders", {
        request_key: pending.current.key,
        unit_id: unit,
        quantity,
        notes,
      });
      done();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Pedido indisponível.");
    } finally {
      setWaiting(false);
    }
  }
  const current = price?.unit === unit && price.quantity === quantity ? price : null;
  return (
    <form className="panel" onSubmit={(event) => void order(event)}>
      <h2>{material.name}</h2>
      <p>{material.description}</p>
      <p className="hint">
        {material.available ? "Disponível para solicitação" : "Disponibilidade sob consulta"}
      </p>
      <div className="fields space">
        <label>
          Unidade
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {material.units.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade
          <input
            type="number"
            min="0.000001"
            max="1000000"
            step="0.000001"
            required
            value={Number.isNaN(quantity) ? "" : quantity}
            onChange={(e) => setQuantity(e.target.valueAsNumber)}
          />
        </label>
      </div>
      {current && (
        <p aria-live="polite">
          {current.price == null
            ? "Preço sob consulta"
            : `Total estimado ${moneyBR(Number(current.price) * quantity)} · ${moneyBR(current.price)} por unidade`}
        </p>
      )}
      {current?.next_tier && (
        <div className="notice" aria-live="polite">
          <p>
            Faltam {quantityBR(current.next_tier.quantity - quantity)} para chegar a{" "}
            {quantityBR(current.next_tier.quantity)}{" "}
            {material.units.find((item) => item.id === unit)?.name} e pagar{" "}
            <strong>{moneyBR(current.next_tier.price)}</strong> por unidade.
          </p>
          <button
            className="action"
            type="button"
            onClick={() => setQuantity(current.next_tier!.quantity)}
          >
            Aplicar próxima faixa
          </button>
        </div>
      )}
      <label className="space">
        Observações
        <textarea name="notes" rows={2} maxLength={2000} />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button className="action primary" disabled={waiting}>
        {waiting ? "Enviando…" : "Enviar pedido de material"}
      </button>
    </form>
  );
}
type QuoteLine = {
  key: string;
  serviceId: string;
  environment: string;
  quantity: string;
  width: string;
  height: string;
};
const newLine = (): QuoteLine => ({
  key: crypto.randomUUID(),
  serviceId: "",
  environment: "",
  quantity: "1",
  width: "",
  height: "",
});
function QuotesForm({ done }: { done: () => void }) {
  const query = usePortal<Service[]>("services");
  const services = query.data?.filter((item) => item.available) ?? [];
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef<{ body: string; key: string } | null>(null);
  const setLine = (key: string, patch: Partial<QuoteLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const items = lines.map((line) => {
      const type = services.find((service) => service.id === line.serviceId)?.billingUnit;
      const dimensions = type === "m2" && line.width && line.height;
      return {
        service_id: line.serviceId,
        environment: line.environment,
        quantity: dimensions
          ? measuredArea(Number(line.height), Number(line.width))
          : Number(line.quantity),
        notes: dimensions ? `Medidas informadas: ${line.width} m × ${line.height} m` : "",
      };
    });
    const payload = {
      title: field(form, "title"),
      notes: field(form, "notes"),
      project_type: field(form, "scope"),
      items,
    };
    const body = JSON.stringify(payload);
    if (pending.current?.body !== body) pending.current = { body, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await commercialFetch("quotes", { ...payload, request_key: pending.current.key });
      done();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível enviar o orçamento.");
    } finally {
      setBusy(false);
    }
  }
  async function general(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      kind: "service",
      subject: field(form, "subject"),
      notes: field(form, "notes"),
      phone: field(form, "phone"),
    };
    const key = JSON.stringify(payload);
    if (pending.current?.body !== key) pending.current = { body: key, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await commercialFetch("portal/service-request", {
        ...payload,
        request_key: pending.current.key,
      });
      done();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível enviar o orçamento.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Solicitar orçamento de serviço</h2>
      <PortalStatus error={query.error} loaded={!!query.data} />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!!services.length && (
        <form onSubmit={(event) => void send(event)}>
          <fieldset disabled={busy}>
            <label>
              Nome do projeto
              <input name="title" required minLength={3} maxLength={200} />
            </label>
            <label>
              Tipo de projeto
              <select name="scope">
                {Object.entries({
                  residencial: "Residencial",
                  casa_completa: "Casa completa",
                  edificio: "Edifício",
                  condominio: "Condomínio",
                  fachada: "Fachada",
                  comercial: "Comercial",
                }).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {lines.map((line) => {
              const unit = services.find((item) => item.id === line.serviceId)?.billingUnit;
              return (
                <div className="fields space" key={line.key}>
                  <label>
                    Serviço
                    <select
                      required
                      value={line.serviceId}
                      onChange={(e) =>
                        setLine(line.key, { serviceId: e.target.value, width: "", height: "" })
                      }
                    >
                      <option value="">Escolha</option>
                      {services.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {unitNames[item.billingUnit]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ambiente
                    <input
                      required
                      maxLength={160}
                      value={line.environment}
                      onChange={(e) => setLine(line.key, { environment: e.target.value })}
                    />
                  </label>
                  <label>
                    Quantidade {unit && `(${unitNames[unit]})`}
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      required
                      value={line.quantity}
                      onChange={(e) => setLine(line.key, { quantity: e.target.value })}
                    />
                  </label>
                  {unit === "m2" && (
                    <>
                      <label>
                        Largura, opcional (m)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.width}
                          required={!!line.height}
                          onChange={(e) => setLine(line.key, { width: e.target.value })}
                        />
                      </label>
                      <label>
                        Altura, se informou a largura (m)
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={line.height}
                          required={!!line.width}
                          onChange={(e) => setLine(line.key, { height: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                  <button
                    className="action"
                    type="button"
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  >
                    Remover item
                  </button>
                </div>
              );
            })}
            <div className="actions">
              <button
                type="button"
                className="action"
                disabled={lines.length >= 100}
                onClick={() => setLines((current) => [...current, newLine()])}
              >
                Adicionar serviço
              </button>
            </div>
            <label>
              Informações adicionais
              <textarea name="notes" maxLength={10000} />
            </label>
            <button className="action primary" disabled={!lines.length}>
              {busy ? "Enviando…" : "Enviar orçamento"}
            </button>
          </fieldset>
        </form>
      )}
      {query.data && (
        <details open={services.length === 0}>
          <summary>Solicitar orçamento sem serviço cadastrado</summary>
          <form onSubmit={(event) => void general(event)}>
            <fieldset disabled={busy}>
              <label>
                Serviço desejado
                <input name="subject" required minLength={2} maxLength={180} />
              </label>
              <label>
                Medidas, quantidades e informações
                <textarea name="notes" required minLength={2} maxLength={2000} />
              </label>
              <label>
                Telefone
                <input name="phone" type="tel" maxLength={40} />
              </label>
              <button className="action primary">Enviar solicitação</button>
            </fieldset>
          </form>
        </details>
      )}
    </section>
  );
}
function History() {
  const orders = usePortal<Order[]>("portal/orders"),
    quotes = usePortal<Quote[]>("portal/quotes");
  const projects =
    usePortal<{ id: string; title: string; progress: number; status: string }[]>("portal/projects");
  return (
    <div className="grid">
      <section className="panel">
        <h2>Pedidos e solicitações</h2>
        <PortalStatus loaded={!!orders.data} error={orders.error} empty={!orders.data?.length} />
        {orders.data?.map((item) => (
          <details key={item.id}>
            <summary>
              {item.subject} · {labels[item.status] ?? item.status}
            </summary>
            <p>{new Date(item.created_at).toLocaleDateString("pt-BR")}</p>
            {item.quantity && (
              <p>
                {item.quantity} × {item.unit_name}{" "}
                {item.quoted_unit_price !== null &&
                  `· ${moneyBR(Number(item.quantity) * Number(item.quoted_unit_price))}`}
              </p>
            )}
            {item.notes && <p className="request-notes">{item.notes}</p>}
            {item.proposal && (
              <div className="space">
                <strong>Proposta da Ouro Branco</strong>
                <p>
                  {item.proposal.quantity} {item.proposal.unit} ×{" "}
                  {moneyBR(item.proposal.unit_price)} ·{" "}
                  {moneyBR(item.proposal.quantity * item.proposal.unit_price)}
                </p>
                <p className="request-notes">{item.proposal.work}</p>
              </div>
            )}
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Orçamentos e andamento</h2>
        <PortalStatus loaded={!!quotes.data} error={quotes.error} empty={!quotes.data?.length} />
        {quotes.data?.map((item) => (
          <QuoteHistory key={item.id} item={item} />
        ))}
        {projects.data?.map((item) => (
          <p className="space" key={item.id}>
            {item.title} · {labels[item.status] ?? item.status} · {item.progress}%
          </p>
        ))}
      </section>
    </div>
  );
}

function QuoteHistory({ item }: { item: Quote }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {item.title} · {labels[item.status] ?? item.status}
      </summary>
      <p>
        {!item.preliminary
          ? `Valor da proposta ${moneyBR(item.total)}`
          : Number(item.total) > 0
            ? `Estimativa preliminar ${moneyBR(item.total)}`
            : "Valor sob análise da equipe"}
      </p>
      {open && !item.preliminary && <PublishedQuote id={item.id} />}
    </details>
  );
}

function PublishedQuote({ id }: { id: string }) {
  const query = usePortal<{
    items: {
      id: string;
      name: string;
      environment: string;
      quantity: number;
      billing_unit: string;
      unit_price: string;
      professional_work: string;
    }[];
  }>(`quotes/${id}`);
  return (
    <>
      <PortalStatus error={query.error} loaded={!!query.data} />
      {query.data?.items.map((item) => (
        <div key={item.id} className="space">
          <strong>
            {item.name} · {item.environment}
          </strong>
          <p>
            {item.quantity} {unitNames[item.billing_unit] ?? item.billing_unit} ×{" "}
            {moneyBR(item.unit_price)}
          </p>
          <p className="request-notes">{item.professional_work}</p>
        </div>
      ))}
    </>
  );
}

function Appointments() {
  const { data, error, reload } = usePortal<Appointment[]>("portal/appointments");
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy(true);
    setFailure("");
    try {
      await commercialFetch("appointments", {
        kind: "visit",
        scheduled_at: field(values, "date") + ":00-03:00",
        address: field(values, "address"),
        notes: field(values, "notes"),
      });
      form.reset();
      reload();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Não foi possível solicitar a visita.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Agendamentos e visitas</h2>
      <PortalStatus error={error} loaded={!!data} empty={!data?.length} />
      {data?.map((item) => (
        <p key={item.id}>
          {new Date(item.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} ·{" "}
          {labels[item.status] ?? item.status} · {item.address}
        </p>
      ))}
      <form className="space" onSubmit={(e) => void request(e)}>
        <fieldset disabled={busy}>
          <label>
            Horário desejado (Brasília)
            <input type="datetime-local" name="date" required />
          </label>
          <label>
            Endereço
            <input name="address" required minLength={5} maxLength={1000} />
          </label>
          <label>
            Observações
            <textarea name="notes" maxLength={5000} />
          </label>
          {failure && (
            <p className="notice error" role="alert">
              {failure}
            </p>
          )}
          <button className="action primary">Solicitar visita</button>
        </fieldset>
      </form>
    </section>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
