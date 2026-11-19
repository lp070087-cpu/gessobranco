import { useEffect, useState } from "react";
import { commercialFetch, moneyBR } from "@/lib/commercial-client";

type RequestStatus = "new" | "contacted" | "closed";
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

export function CompanyRequests({
  kind,
  canStartProject = false,
}: {
  kind: Incoming["kind"];
  canStartProject?: boolean;
}) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
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
        if (!controller.signal.aborted) setInbox(data);
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
  const requests = inbox?.requests.filter((entry) => entry.kind === kind) ?? [];
  return (
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
      {!inbox && !error && (
        <p role="status" className="space">
          Carregando solicitações…
        </p>
      )}
      {inbox && !requests.length && (
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
              href={`mailto:${encodeURIComponent(entry.email)}?subject=${encodeURIComponent("Ouro Branco — " + entry.subject)}`}
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
                {quote.name} · {quote.email} · {new Date(quote.created_at).toLocaleString("pt-BR")}
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
                    </p>
                  ))}
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
  );
}
