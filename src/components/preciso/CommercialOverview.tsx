import { useEffect, useState } from "react";
import {
  commercialFetch,
  estimatedResult,
  moneyBR,
  quantityBR,
  type CommercialState,
  type Report,
} from "@/lib/commercial-client";
import { SalesQualityChart } from "./SalesQualityChart";

type Period = { start: string; end: string };
type RecentRequest = { id: string; subject: string; status: string; created_at: string };
type Overview = {
  materials: number;
  quotes: number;
  recent_materials: RecentRequest[];
  recent_quotes: RecentRequest[];
  overdue_expenses: number;
  overdue_purchases: number;
};
const statuses: Record<string, string> = {
  new: "Novo",
  contacted: "Em atendimento",
  closed: "Concluído",
  pending: "Pendente",
  draft: "Rascunho",
  preliminary: "Preliminar",
  approved: "Aprovado",
  rejected: "Recusado",
  awaiting_visit: "Aguardando visita",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const formatDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Recife",
  day: "2-digit",
  month: "2-digit",
});
const localDate = (day: string) => formatDate.format(new Date(day + "T12:00:00Z"));

const overviewCache: { result: { endpoint: string; overview: Overview } | null } = {
  result: null,
};

export function CommercialOverview({
  state,
  report,
  period,
  sell,
  createProduct,
  openMaterials,
  openQuotes,
  openFinance,
}: {
  state: CommercialState;
  report: Report | null;
  period: Period;
  sell: () => void;
  createProduct: () => void;
  openMaterials: () => void;
  openQuotes: () => void;
  openFinance: () => void;
}) {
  const { start, end } = period;
  const endpoint = `commercial/overview?start=${start}&end=${end}`;
  const [result, setResult] = useState<{ endpoint: string; overview: Overview } | null>(
    overviewCache.result,
  );
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const overview = result?.endpoint === endpoint ? result.overview : null;
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<Overview>(endpoint, undefined, controller.signal)
      .then((overview) => {
        if (!controller.signal.aborted) {
          overviewCache.result = { endpoint, overview };
          setResult(overviewCache.result);
          setError("");
        }
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [endpoint, revision, state]);

  const stock = state.products.filter(
    (product) => product.active && Number(product.balance) <= Number(product.minimum_stock),
  );
  const profit = report ? estimatedResult(report) : null;
  const cards = [
    ["Vendas", report ? moneyBR(report.revenue) : "—", "Após devoluções"],
    [
      "Lucro estimado",
      !report ? "—" : profit === null ? "Em apuração" : moneyBR(profit),
      profit === null && report
        ? "Há vendas com custos pendentes."
        : "Contribuição menos despesas do período.",
    ],
    ["Pedidos recebidos", overview?.materials ?? "—", "Pedidos de material"],
    ["Novos orçamentos", overview?.quotes ?? "—", "Solicitações e orçamentos de serviço"],
  ] as const;
  return (
    <>
      <h2>Visão Geral</h2>
      <p className="hint">
        Período de {localDate(start)} a {localDate(end)} ·{" "}
        <button type="button" className="overview-text-action" onClick={openFinance}>
          Alterar no Financeiro
        </button>
      </p>
      <div className="actions">
        <button className="action primary" type="button" onClick={sell}>
          Registrar venda
        </button>
        <button className="action" type="button" onClick={createProduct}>
          Cadastrar produto
        </button>
        <button className="action" type="button" onClick={openQuotes}>
          Consultar orçamentos
        </button>
      </div>
      {!overview && !error && (
        <p className="hint" role="status">
          Carregando pedidos e orçamentos…
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}{" "}
          <button
            className="overview-text-action"
            type="button"
            onClick={() => {
              setError("");
              setRevision((value) => value + 1);
            }}
          >
            Tentar novamente
          </button>
        </p>
      )}
      <div className="stats overview-stats">
        {cards.map(([label, value, hint]) => (
          <div className="panel" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
            <small>{hint}</small>
          </div>
        ))}
      </div>
      <SalesQualityChart period={period} report={report} />
      <div className="grid overview-recent space">
        <RecentList
          title="Últimos pedidos de materiais"
          entries={overview?.recent_materials}
          open={openMaterials}
        />
        <RecentList
          title="Solicitações de orçamento de serviços"
          entries={overview?.recent_quotes}
          open={openQuotes}
        />
      </div>
      <section className="panel space">
        <h2>Alertas</h2>
        {stock.length > 0 ? (
          <>
            <p>Produtos para repor</p>
            <ul className="overview-alerts">
              {stock.slice(0, 4).map((product) => (
                <li key={product.id}>
                  {product.name} · {quantityBR(product.balance)} {product.base_unit}
                </li>
              ))}
            </ul>
            {stock.length > 4 && (
              <p className="hint">Mais {stock.length - 4} produto(s) no estoque.</p>
            )}
          </>
        ) : (
          <p className="hint">Nenhum produto ativo está abaixo do estoque mínimo.</p>
        )}
        {!!overview?.overdue_purchases && (
          <p>{overview.overdue_purchases} compra(s) com pagamento vencido.</p>
        )}
        {!!overview?.overdue_expenses && (
          <p>{overview.overdue_expenses} despesa(s) operacional(is) vencida(s).</p>
        )}
        {!!report?.refund_due && <p>Estornos pendentes · {moneyBR(report.refund_due)}</p>}
        {overview &&
          !overview.overdue_purchases &&
          !overview.overdue_expenses &&
          !report?.refund_due && (
            <p className="hint">Nenhum pagamento vencido ou estorno pendente.</p>
          )}
      </section>
    </>
  );
}

function RecentList({
  title,
  entries,
  open,
}: {
  title: string;
  entries?: RecentRequest[];
  open: () => void;
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      {entries &&
        (entries.length ? (
          <ul className="overview-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <span>{entry.subject}</span>
                <small>
                  {formatDate.format(new Date(entry.created_at))} ·{" "}
                  {statuses[entry.status] ?? entry.status}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Nenhuma solicitação recebida.</p>
        ))}
      <button className="action space" type="button" onClick={open}>
        Ver todos
      </button>
    </section>
  );
}

export function CommercialIncomeStatement({ report }: { report: Report }) {
  const contribution = report.partial_sales ? null : Number(report.contribution ?? 0);
  const costs = report.partial_sales ? null : Number(report.goods_cost ?? 0);
  const allocated =
    contribution === null || costs === null ? null : Number(report.revenue) - costs - contribution;
  return (
    <section className="panel space">
      <h2>DRE gerencial</h2>
      <p className="hint">
        Vendas pela data da venda. Despesas operacionais pela data de vencimento.
      </p>
      <div className="table-scroll">
        <table>
          <tbody>
            {[
              ["Vendas após devoluções", report.revenue],
              ["Custo dos produtos vendidos", costs],
              ["Frete, taxas e demais custos da venda", allocated],
              ["Contribuição das vendas", contribution],
              ["Despesas operacionais", report.operating_expenses],
              ["Resultado estimado", estimatedResult(report)],
            ].map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{moneyBR(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!report.partial_sales && (
        <p className="hint space">
          Há vendas com custos pendentes. As linhas afetadas ficam em apuração.
        </p>
      )}
    </section>
  );
}
