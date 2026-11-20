import { useEffect, useState, type FormEvent } from "react";
import { commercialFetch, moneyBR } from "@/lib/commercial-client";

type RequestStatus = "new" | "contacted" | "closed";
type Proposal = { quantity: number; unit: string; unit_price: number; work: string };
type Incoming = {
  id: string;
  kind: "service" | "material";
  name: string;
  email: string;
  phone: string;
  subject: string;
  unit_name: string | null;
  quantity: number | null;
  quoted_unit_price: string | null;
  notes: string;
  created_at: string;
  status: RequestStatus;
  proposal: Proposal | null;
};
type Quote = {
  id: string;
  title: string;
  status: string;
  total: number | null;
  notes: string | null;
  created_at: string;
  name: string | null;
  email: string | null;
};
type Inbox = { requests: Incoming[]; quotes: Quote[] };
const statuses = { new: "Novo", contacted: "Em atendimento", closed: "Concluído" };
const quoteStatuses = {
  requested: "Solicitado",
  reviewing: "Em análise",
  visit_required: "Visita necessária",
  proposed: "Proposta enviada",
  approved: "Aprovado",
  rejected: "Recusado",
  cancelled: "Cancelado",
};

const inboxCache = new Map<string, unknown>();

export function CompanyRequests({
  kind,
  canStartProject = false,
}: {
  kind: Incoming["kind"];
  canStartProject?: boolean;
}) {
  const [inbox, setInbox] = useState<Inbox | null>(
    (inboxCache.get(kind) as Inbox | undefined) ?? null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const [quoteInfo, setQuoteInfo] = useState<
    Record<
      string,
      {
        items: {
          id: string;
          name: string;
          environment: string;
          quantity: number;
          billing_unit: string;
          notes: string;
          unit_price: string;
          professional_work: string;
        }[];
        history: { status: string; created_at: string }[];
      }
    >
  >({});
  const [message, setMessage] = useState("");
  const path = `admin/company-requests?kind=${kind}`;
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<Inbox>(path, undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        inboxCache.set(kind, data);
        setInbox(data);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [path, revision]);

  async function update(id: string, status: RequestStatus) {
    setBusy(id);
    setError("");
    try {
      await commercialFetch(path, { id, status }, undefined, "PATCH");
      setInbox(
        (current) =>
          current && {
            ...current,
            requests: current.requests.map((request) =>
              request.id === id ? { ...request, status } : request,
            ),
          },
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível atualizar.");
    } finally {
      setBusy("");
    }
  }
  async function quoteAction(
    id: string,
    action: "details" | "status" | "project",
    status?: string,
  ) {
    setBusy(id);
    setError("");
    setMessage("");
    try {
      if (action === "details") {
        const detail = await commercialFetch<(typeof quoteInfo)[string]>(`quotes/${id}`);
        setQuoteInfo((previous) => ({ ...previous, [id]: detail }));
      } else {
        if (action === "status")
          await commercialFetch(`quotes/${id}`, { status }, undefined, "PATCH");
        else await commercialFetch("projects", { quote_id: id });
        setMessage(
          action === "status" ? "Andamento atualizado." : "Serviço adicionado ao andamento.",
        );
        setRevision((previous) => previous + 1);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Operação indisponível.");
    } finally {
      setBusy("");
    }
  }
  async function saveProposal(event: FormEvent<HTMLFormElement>, entry: Incoming) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(entry.id);
    setError("");
    setMessage("");
    try {
      const saved = await commercialFetch<{ status: RequestStatus; proposal: Proposal }>(
        path,
        { id: entry.id, proposal: { ...readProposal(form), unit: String(form.get("unit")) } },
        undefined,
        "PATCH",
      );
      setInbox(
        (current) =>
          current && {
            ...current,
            requests: current.requests.map((row) =>
              row.id === entry.id ? { ...row, ...saved } : row,
            ),
          },
      );
      setMessage("Proposta salva.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar a proposta.");
    } finally {
      setBusy("");
    }
  }
  async function saveQuote(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const items = quoteInfo[id].items.map((item) => ({
      id: item.id,
      ...readProposal(form, item.id),
    }));
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await commercialFetch(`quotes/${id}`, { items }, undefined, "PATCH");
      const detail = await commercialFetch<(typeof quoteInfo)[string]>(`quotes/${id}`);
      setQuoteInfo((current) => ({ ...current, [id]: detail }));
      setRevision((current) => current + 1);
      setMessage("Proposta salva e disponível na conta do cliente.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar a proposta.");
    } finally {
      setBusy("");
    }
  }
  const requests = inbox?.requests.filter((entry) => entry.kind === kind) ?? [];
  return (
    <>
      <section className="panel">
        <h2>{kind === "service" ? "Orçamentos de serviço" : "Pedidos de material"}</h2>
        <button
          className="action"
          onClick={() => {
            setError("");
            setRevision((value) => value + 1);
          }}
        >
          Atualizar solicitações
        </button>
        {error && (
          <p className="notice error space" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice space">
            {message}
          </p>
        )}
        {!inbox && !error && <PanelSkeleton label="Carregando solicitações…" />}
        {inbox && !requests.length && !inbox.quotes.length && (
          <p className="hint space">Nenhuma solicitação recebida pelo site.</p>
        )}
        {requests.map((entry) => (
          <details key={entry.id}>
            <summary>
              {entry.subject} · {entry.name} · {statuses[entry.status]}
            </summary>
            <p>
              {new Date(entry.created_at).toLocaleString("pt-BR")} · {entry.email}
              {entry.phone && ` · ${entry.phone}`}
            </p>
            {entry.unit_name && (
              <p>
                {entry.quantity} × {entry.unit_name}
                {entry.quoted_unit_price != null &&
                  ` · ${moneyBR(Number(entry.quantity) * Number(entry.quoted_unit_price))}`}
              </p>
            )}
            {entry.notes && <p className="request-notes">{entry.notes}</p>}
            <div className="actions">
              <a
                className="action"
                href={`mailto:${encodeURIComponent(entry.email)}?subject=${encodeURIComponent("Ouro Branco — " + entry.subject)}${entry.proposal ? "&body=" + encodeURIComponent(`${entry.proposal.work}\n${entry.proposal.quantity} ${entry.proposal.unit} × ${moneyBR(entry.proposal.unit_price)}\nTotal ${moneyBR(entry.proposal.quantity * entry.proposal.unit_price)}`) : ""}`}
              >
                Responder por e-mail
              </a>
              <label>
                Andamento
                <select
                  value={entry.status}
                  disabled={!!busy}
                  onChange={(event) => void update(entry.id, event.target.value as RequestStatus)}
                >
                  {Object.entries(statuses).map(([value, name]) => (
                    <option key={value} value={value}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {kind === "service" && (
              <form className="space" onSubmit={(event) => void saveProposal(event, entry)}>
                <fieldset disabled={!!busy}>
                  <legend>Proposta de serviço</legend>
                  <label>
                    Unidade de cobrança
                    <select name="unit" defaultValue={entry.proposal?.unit ?? "m²"}>
                      {["m²", "metro linear", "unidade", "diária", "projeto"].map((unit) => (
                        <option key={unit}>{unit}</option>
                      ))}
                    </select>
                  </label>
                  <ProposalFields value={entry.proposal ?? undefined} />
                  <button className="action primary">Salvar proposta</button>
                </fieldset>
              </form>
            )}
          </details>
        ))}
        {kind === "service" && !!inbox?.quotes.length && (
          <>
            <h2 className="space">Orçamentos registrados na área do cliente</h2>
            {inbox.quotes.map((quote) => (
              <details key={quote.id}>
                <summary>
                  {quote.title} ·{" "}
                  {quoteStatuses[quote.status as keyof typeof quoteStatuses] ?? quote.status} ·{" "}
                  {Number(quote.total) > 0 ? moneyBR(quote.total) : "Sob orçamento"}
                </summary>
                <p>
                  {quote.name} · {quote.email} ·{" "}
                  {new Date(quote.created_at).toLocaleString("pt-BR")}
                </p>
                {quote.notes && <p className="request-notes">{quote.notes}</p>}
                <div className="actions">
                  <button
                    type="button"
                    className="action"
                    disabled={!!busy}
                    onClick={() => void quoteAction(quote.id, "details")}
                  >
                    Ver medidas e histórico
                  </button>
                  <label>
                    Andamento
                    <select
                      value={quote.status}
                      disabled={!!busy}
                      onChange={(event) => void quoteAction(quote.id, "status", event.target.value)}
                    >
                      {Object.entries(quoteStatuses).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {canStartProject && quote.status === "approved" && (
                    <button
                      type="button"
                      className="action"
                      disabled={!!busy}
                      onClick={() => void quoteAction(quote.id, "project")}
                    >
                      Abrir serviço
                    </button>
                  )}
                </div>
                {quoteInfo[quote.id] && (
                  <div className="space">
                    <p>
                      <strong>Serviços e medidas</strong>
                    </p>
                    {quoteInfo[quote.id].items.map((item) => (
                      <p key={item.id}>
                        {item.name} · {item.environment} · {item.quantity} {item.billing_unit}
                        {item.notes && ` · ${item.notes}`}
                        {item.professional_work &&
                          ` · ${item.professional_work} · ${moneyBR(item.unit_price)} por unidade`}
                      </p>
                    ))}
                    {["requested", "reviewing", "visit_required", "proposed"].includes(
                      quote.status,
                    ) &&
                      quoteInfo[quote.id].items.length > 0 && (
                        <form
                          className="space"
                          onSubmit={(event) => void saveQuote(event, quote.id)}
                        >
                          <fieldset disabled={!!busy}>
                            <legend>Preparar proposta</legend>
                            {quoteInfo[quote.id].items.map((item) => (
                              <div className="space" key={item.id}>
                                <strong>
                                  {item.name} · {item.environment} · {item.billing_unit}
                                </strong>
                                <ProposalFields
                                  suffix={item.id}
                                  value={{
                                    quantity: item.quantity,
                                    unit_price: Number(item.unit_price),
                                    work: item.professional_work,
                                  }}
                                />
                              </div>
                            ))}
                            <button className="action primary">Salvar proposta</button>
                          </fieldset>
                        </form>
                      )}
                    <p className="space">
                      <strong>Histórico</strong>
                    </p>
                    {quoteInfo[quote.id].history.map((item, index) => (
                      <p key={index}>
                        {new Date(item.created_at).toLocaleString("pt-BR")} ·{" "}
                        {quoteStatuses[item.status as keyof typeof quoteStatuses] ?? item.status}
                      </p>
                    ))}
                  </div>
                )}
              </details>
            ))}
          </>
        )}
      </section>
      {inbox && !requests.length && (
        <ExampleCards
          title={
            kind === "service" ? "Como chega um orçamento" : "Como chega um pedido de material"
          }
          hint={
            kind === "service"
              ? "Quando o cliente pede pelo site, o pedido aparece aqui assim. Você abre, monta os itens com o valor e envia a proposta."
              : "Quando o cliente pede material pelo site, o pedido aparece aqui assim. Você confere, separa e marca o andamento."
          }
          cards={
            kind === "service"
              ? [
                  {
                    title: "Forro no quarto",
                    tag: "Novo",
                    value: "≈ 12 m²",
                    lines: [
                      "Maria Souza · (81) 9 9999-0000",
                      "Quarto · Forro / teto · 3 fotos",
                      "Pediu visita para sábado",
                    ],
                  },
                  {
                    title: "Casa completa",
                    tag: "Visita",
                    value: "6 cômodos",
                    lines: [
                      "José Lima",
                      "Casa toda · Sanca e moldura",
                      "Valor sai depois da visita",
                    ],
                  },
                  {
                    title: "Sanca na sala",
                    tag: "Proposta enviada",
                    value: "R$ 1.080,00",
                    lines: [
                      "Ana Pereira",
                      "18 m de sanca × R$ 60,00",
                      "Aguardando o cliente aceitar",
                    ],
                  },
                ]
              : [
                  {
                    title: "Material para forro",
                    tag: "Novo",
                    value: "R$ 734,70",
                    lines: [
                      "Carlos (pedreiro)",
                      "120 placas · 4 sacos de gesso",
                      "Retira na loja amanhã",
                    ],
                  },
                  {
                    title: "Reposição de obra",
                    tag: "Separando",
                    value: "R$ 239,90",
                    lines: [
                      "Obra da Rua das Flores",
                      "10 arames · 5 colas",
                      "Entrega pelo carro da empresa",
                    ],
                  },
                  {
                    title: "Pedido entregue",
                    tag: "Concluído",
                    value: "R$ 95,96",
                    lines: ["Bigode", "4 sacos de gesso", "Pago no fiado"],
                  },
                ]
          }
        />
      )}
    </>
  );
}

function readProposal(form: FormData, suffix = "") {
  return {
    quantity: Number(form.get("quantity" + suffix)),
    unit_price: Number(form.get("price" + suffix)),
    work: String(form.get("work" + suffix) ?? "").trim(),
  };
}

function ProposalFields({
  suffix = "",
  value,
}: {
  suffix?: string;
  value?: Pick<Proposal, "quantity" | "unit_price" | "work">;
}) {
  return (
    <>
      <div className="fields">
        <label>
          Medida ou quantidade{" "}
          <input
            name={"quantity" + suffix}
            type="number"
            min="0.001"
            max="10000000"
            step="0.001"
            required
            defaultValue={value?.quantity}
          />
        </label>
        <label>
          Preço por unidade (R$){" "}
          <input
            name={"price" + suffix}
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            defaultValue={value?.unit_price}
          />
        </label>
      </div>
      <label>
        O que o profissional vai executar{" "}
        <textarea
          name={"work" + suffix}
          minLength={3}
          maxLength={1500}
          rows={3}
          required
          defaultValue={value?.work}
        />
      </label>
    </>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
import { ExampleCards } from "@/components/preciso/ExampleCards";
