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

export function CompanyRequests({ kind }: { kind: Incoming["kind"] }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<Inbox>("admin/company-requests", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setInbox(data);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);

  async function update(id: string, status: RequestStatus) {
    setBusy(id);
    setError("");
    try {
      await commercialFetch("admin/company-requests", { id, status }, undefined, "PATCH");
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
                {quote.title} · {quote.status} · {moneyBR(quote.total)}
              </summary>
              <p>
                {quote.name} · {quote.email} · {new Date(quote.created_at).toLocaleString("pt-BR")}
              </p>
              {quote.notes && <p className="request-notes">{quote.notes}</p>}
            </details>
          ))}
        </>
      )}
    </section>
  );
}
