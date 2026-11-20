import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AccountLayout, ManagementMenu } from "@/components/preciso/AccountMenu";
import { CompanySession } from "@/components/preciso/CompanySession";
import { hasCompanyPermission } from "@/lib/company-permissions";
import { commercialFetch, localDay, moneyBR } from "@/lib/commercial-client";
import type { CompanyActor } from "@/lib/company-permissions";
import {
  normalizeStatementText,
  parseStatement,
  reviewTypes,
  suggestClassification,
} from "@/lib/cfo";
import { readCsv } from "@/lib/commercial-import";
import { readDocument } from "@/lib/document-import";
import { downloadSpreadsheet } from "@/lib/spreadsheet-export";
import { OwnerExpenses } from "@/components/preciso/OwnerExpenses";

const cfoSlugs = {
  importar: "Importar extrato",
  comparar: "Comparar",
  historico: "Histórico",
  despesas: "Despesas",
} as const;
type CfoSlug = keyof typeof cfoSlugs;
type CfoSection = "Visão geral" | (typeof cfoSlugs)[CfoSlug];
export const Route = createFileRoute("/admin/cfo")({
  validateSearch: (search: Record<string, unknown>): { secao?: CfoSlug } =>
    typeof search.secao === "string" && search.secao in cfoSlugs
      ? { secao: search.secao as CfoSlug }
      : {},
  head: () => ({ meta: [{ title: "CFO Financeiro — Ouro Branco" }] }),
  component: () => (
    <CompanySession
      title="CFO financeiro"
      allowed={(user) => hasCompanyPermission(user, "finance_cfo")}
    >
      {(user) => <Cfo user={user} />}
    </CompanySession>
  ),
});
type Move = {
  id: string;
  booked_on: string;
  description: string;
  account: string;
  amount_cents: number;
  has_candidate: boolean;
};
type Snapshot = {
  bank: {
    matched: number;
    review: number;
    transfers: number;
    unmatchedLedger: number;
    queue: Move[];
  };
  dre: {
    revenue: number;
    goodsCost: number | null;
    contribution: number | null;
    expenses: number;
    result: number | null;
    margin: number | null;
    pendingSales: number;
    pendingPurchases: number;
    receivedServices: number;
  };
  cash: { received: number; paid: number; net: number };
};
type Run = {
  id: string;
  source: "manual" | "cron";
  start_on: string;
  end_on: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  error: string | null;
  report: Snapshot | null;
};
type History = {
  runs: Run[];
  imports: { id: string; account: string; file_name: string; created_at: string }[];
};
const stamp = (stamp: string) =>
  new Date(stamp).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const statuses = { running: "Em processamento", succeeded: "Concluído", failed: "Falhou" };

// Indicadores guardados entre as telas, para o CFO não mostrar carregamento a cada clique.
const cfoCache: {
  live: { start: string; end: string; snapshot: Snapshot } | null;
  history: History | null;
} = { live: null, history: null };

function Cfo({ user }: { user: CompanyActor }) {
  const requested = Route.useSearch().secao;
  const navigate = useNavigate();
  const section: CfoSection =
    requested && (requested !== "despesas" || user.role === "admin")
      ? cfoSlugs[requested]
      : "Visão geral";
  const setSection = (next: CfoSection) => {
    const slug = (Object.keys(cfoSlugs) as CfoSlug[]).find((key) => cfoSlugs[key] === next);
    void navigate({ to: "/admin/cfo", search: slug ? { secao: slug } : {} });
  };
  const [range, setRange] = useState(() => {
    const end = localDay();
    return { start: end.slice(0, 7) + "-01", end };
  });
  const [live, setLive] = useState<{ start: string; end: string; snapshot: Snapshot } | null>(
    cfoCache.live,
  );
  const [liveError, setLiveError] = useState("");
  const [history, setHistory] = useState<History | null>(cfoCache.history);
  const [selected, setSelected] = useState<Run | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [jumpToReport, setJumpToReport] = useState(false);
  const reportAnchor = useRef<HTMLDivElement>(null);
  const request = useRef<{ period: string; key: string } | null>(null);
  const running = useRef(false);
  const refresh = () => setRevision((value) => value + 1);
  const { start, end } = range;
  useEffect(() => {
    if (section !== "Visão geral" || !jumpToReport || !reportAnchor.current) return;
    reportAnchor.current.scrollIntoView({ block: "start" });
    reportAnchor.current.focus({ preventScroll: true });
    setJumpToReport(false);
  }, [section, jumpToReport]);
  useEffect(() => {
    if ((section !== "Visão geral" && section !== "Comparar") || !start || !end || start > end)
      return;
    const controller = new AbortController();
    const query = new URLSearchParams({ start, end });
    setLiveError("");
    void commercialFetch<Snapshot>("cfo/overview?" + query, undefined, controller.signal)
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        cfoCache.live = { start, end, snapshot };
        setLive(cfoCache.live);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setLiveError(failure.message);
      });
    return () => controller.abort();
  }, [start, end, revision, section]);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<History>("cfo/history", undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        cfoCache.history = data;
        setHistory(data);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);
  async function execute(periodRange: typeof range) {
    if (running.current) throw new Error("Uma análise já está em andamento.");
    const period = periodRange.start + "|" + periodRange.end;
    if (request.current?.period !== period) request.current = { period, key: crypto.randomUUID() };
    running.current = true;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await commercialFetch<{ id: string; status: string; report?: Snapshot }>(
        "cfo/run",
        { ...periodRange, request_key: request.current.key },
      );
      if (result.status === "running") {
        setMessage("A execução está em andamento. Confira o histórico.");
        return false;
      }
      if (result.status === "succeeded" && result.report) {
        setSelected({
          id: result.id,
          source: "manual",
          start_on: periodRange.start,
          end_on: periodRange.end,
          status: "succeeded",
          started_at: new Date().toISOString(),
          error: null,
          report: result.report,
        });
        request.current = null;
        setMessage("Análise concluída.");
        setRange(periodRange);
        return true;
      }
    } catch (failure) {
      const problem =
        failure instanceof Error
          ? failure
          : new Error("O processamento falhou. Consulte o histórico.");
      setError(problem.message);
      if ((problem as Error & { status?: number }).status === 500) request.current = null;
      throw problem;
    } finally {
      running.current = false;
      setBusy(false);
      refresh();
    }
    return false;
  }
  async function openRun(id: string) {
    setError("");
    try {
      setSelected(await commercialFetch<Run>("cfo/history/" + id));
      setSection("Visão geral");
      setJumpToReport(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Relatório indisponível.");
    }
  }
  const latest = history?.runs[0];
  const snapshot = live?.start === start && live.end === end ? live.snapshot : null;
  const report = selected?.report;
  return (
    <AccountLayout label="Menu do CFO" menu={<ManagementMenu user={user} />}>
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
      {section === "Visão geral" && (
        <>
          <section className="panel">
            <h2>Visão financeira da Loja e dos Serviços</h2>
            <p className="hint">
              Fechamento automático todo dia às 23h (horário de Brasília): o dia, no sábado também a
              semana de segunda a sábado e, no dia 5, o mês anterior. Também dá para executar
              manualmente aqui quando quiser.
            </p>
            <form
              className="space"
              onSubmit={(event) => {
                event.preventDefault();
                void execute(range).catch(() => {});
              }}
            >
              <fieldset disabled={busy}>
                <div className="fields">
                  <label>
                    De
                    <input
                      type="date"
                      required
                      value={range.start}
                      onChange={(e) => {
                        setSelected(null);
                        setRange({ ...range, start: e.target.value });
                      }}
                    />
                  </label>
                  <label>
                    Até
                    <input
                      type="date"
                      required
                      value={range.end}
                      onChange={(e) => {
                        setSelected(null);
                        setRange({ ...range, end: e.target.value });
                      }}
                    />
                  </label>
                </div>
                <label>
                  Comando
                  <input value="/CFO" readOnly />
                </label>
                <button className="action primary">
                  {busy ? "Processando…" : "Executar /CFO"}
                </button>
              </fieldset>
            </form>
            {latest && (
              <p className="hint space">
                Última execução · {stamp(latest.started_at)} · {statuses[latest.status]}
              </p>
            )}
            {!latest && history && <p className="hint space">Nenhuma execução registrada.</p>}
          </section>
          {liveError && (
            <p className="notice error space" role="alert">
              {liveError}
            </p>
          )}
          {!snapshot &&
            !liveError &&
            !report &&
            (start && end && start <= end ? (
              <PanelSkeleton label="Carregando indicadores do período…" />
            ) : (
              <p className="notice space" role="status">
                Informe um período válido.
              </p>
            ))}
          {report && (
            <button type="button" className="action space" onClick={() => setSelected(null)}>
              Voltar aos indicadores atuais
            </button>
          )}
          {(report || snapshot) && (
            <div ref={reportAnchor} tabIndex={-1} className="ouro-report-anchor">
              <CfoResults
                key={selected?.id ?? start + end}
                start={selected?.start_on ?? start}
                end={selected?.end_on ?? end}
                snapshot={(report ?? snapshot)!}
                onReviewed={refresh}
              />
            </div>
          )}
          <CfoCalculator />
          <CfoGuide />
        </>
      )}
      {section === "Importar extrato" && (
        <StatementImport
          busyAnalysis={busy}
          manualRange={range}
          analyze={execute}
          view={() => {
            setSection("Visão geral");
            setJumpToReport(true);
          }}
          finished={refresh}
        />
      )}
      {section === "Comparar" && (
        <CfoComparison
          range={range}
          snapshot={snapshot}
          onRange={setRange}
          currentError={liveError}
          isAdmin={user.role === "admin"}
        />
      )}
      {section === "Despesas" && user.role === "admin" && <OwnerExpenses saved={refresh} />}
      {section === "Histórico" && (
        <>
          <button type="button" className="action" onClick={refresh}>
            Atualizar histórico
          </button>
          <div className="grid space">
            <section className="panel">
              <h2>Histórico de execuções</h2>
              {!history && !error && <PanelSkeleton label="Carregando histórico…" />}
              {history?.runs.length === 0 && <p className="hint">Nenhuma execução registrada.</p>}
              {history?.runs.map((run) => (
                <div className="actions" key={run.id}>
                  <span>
                    {run.start_on} a {run.end_on} ·{" "}
                    {run.source === "cron" ? "Automática" : "Manual"} · {statuses[run.status]}
                  </span>
                  {run.status === "succeeded" && (
                    <button className="action" onClick={() => void openRun(run.id)}>
                      Abrir relatório
                    </button>
                  )}
                  {run.error && <small>{run.error}</small>}
                </div>
              ))}
            </section>
            <section className="panel">
              <h2>Arquivos importados</h2>
              {history?.imports.length === 0 && <p className="hint">Nenhum arquivo importado.</p>}
              {history?.imports.map((file) => (
                <div className="actions space" key={file.id}>
                  <span>
                    {file.file_name} · {file.account} · {stamp(file.created_at)}
                  </span>
                  <DownloadStatement id={file.id} />
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </AccountLayout>
  );
}

const columnLabels = {
  date: "Data",
  value: "Valor com sinal",
  credit: "Créditos (separados)",
  debit: "Débitos (separados)",
  description: "Descrição",
  reference: "ID do banco (opcional)",
};
const comparisonMetrics = (snapshot: Snapshot) =>
  [
    ["Receita comercial", snapshot.dre.revenue],
    ["Recebimentos de serviços", snapshot.dre.receivedServices],
    ["Entradas em caixa", snapshot.cash.received],
    ["Saídas de caixa", snapshot.cash.paid],
    ["Variação de caixa", snapshot.cash.net],
    ["Resultado comercial estimado", snapshot.dre.result],
  ] as const;

type ExpenseSummary = {
  category: string;
  vehicle_id: string | null;
  project_id: string | null;
  total: string;
  count: number;
}[];
const lowerIsBetter = new Set(["Saídas de caixa"]);
function change(amount: number | null, baseline: number | null) {
  if (amount == null || baseline == null) return null;
  const diff = amount - baseline;
  const percent = baseline !== 0 ? (100 * diff) / Math.abs(baseline) : null;
  return { diff, percent };
}
function changeText(result: ReturnType<typeof change>) {
  if (!result) return "Em apuração";
  if (result.diff === 0) return "Igual ao anterior";
  const sign = result.diff > 0 ? "+" : "−";
  const percent =
    result.percent == null
      ? ""
      : ` (${sign}${Math.abs(result.percent).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%)`;
  return `${sign}${moneyBR(Math.abs(result.diff))}${percent}`;
}
const brDate = (day: string) => day.split("-").reverse().join("/");

function CfoComparison({
  range,
  snapshot,
  onRange,
  currentError,
  isAdmin,
}: {
  range: { start: string; end: string };
  snapshot: Snapshot | null;
  onRange: (value: { start: string; end: string }) => void;
  currentError: string;
  isAdmin: boolean;
}) {
  const [previous, setPrevious] = useState<{ key: string; snapshot: Snapshot } | null>(null);
  const [error, setError] = useState("");
  const [spend, setSpend] = useState<{
    key: string;
    now: ExpenseSummary;
    before: ExpenseSummary;
  } | null>(null);
  const [spendRevision, setSpendRevision] = useState(0);
  const { setup, refresh: refreshSetup } = useExpenseSetup();
  const duration = Date.parse(range.end) - Date.parse(range.start);
  const valid = duration >= 0 && duration <= 366 * 86400000;
  const start = valid
    ? new Date(Date.parse(range.start) - duration - 86400000).toISOString().slice(0, 10)
    : "";
  const end = valid ? new Date(Date.parse(range.start) - 86400000).toISOString().slice(0, 10) : "";
  const key = start + end;
  const spendKey = range.start + range.end + key;
  useEffect(() => {
    if (!start || !end) return;
    const controller = new AbortController();
    setError("");
    void commercialFetch<Snapshot>(
      `cfo/overview?start=${start}&end=${end}`,
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) setPrevious({ key, snapshot: value });
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [start, end, key]);
  useEffect(() => {
    if (!isAdmin || !start || !end) return;
    const controller = new AbortController();
    void Promise.all([
      commercialFetch<ExpenseSummary>(
        `admin/owner-expenses/summary?start=${range.start}&end=${range.end}`,
        undefined,
        controller.signal,
      ),
      commercialFetch<ExpenseSummary>(
        `admin/owner-expenses/summary?start=${start}&end=${end}`,
        undefined,
        controller.signal,
      ),
    ])
      .then(([now, before]) => {
        if (!controller.signal.aborted) setSpend({ key: spendKey, now, before });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isAdmin, range.start, range.end, start, end, spendKey, spendRevision]);
  const earlier = previous?.key === key ? previous.snapshot : null;
  const spending = spend?.key === spendKey ? spend : null;
  const sumBy = (rows: ExpenseSummary, pick: (row: ExpenseSummary[number]) => string | null) => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const name = pick(row);
      if (name) totals.set(name, (totals.get(name) ?? 0) + Number(row.total));
    }
    return totals;
  };
  const categoryNow = spending ? sumBy(spending.now, (row) => row.category) : new Map();
  const categoryBefore = spending ? sumBy(spending.before, (row) => row.category) : new Map();
  const categoryNames = [
    ...new Set([...(setup?.categories ?? []), ...categoryNow.keys(), ...categoryBefore.keys()]),
  ].filter((name) => categoryNow.has(name) || categoryBefore.has(name));
  const vehicleNow = spending ? sumBy(spending.now, (row) => row.vehicle_id) : new Map();
  const vehicleBefore = spending ? sumBy(spending.before, (row) => row.vehicle_id) : new Map();
  return (
    <>
      <section className="panel">
        <h2>Comparar períodos</h2>
        <div className="fields">
          <label>
            De{" "}
            <input
              type="date"
              value={range.start}
              onChange={(event) => onRange({ ...range, start: event.target.value })}
            />
          </label>
          <label>
            Até{" "}
            <input
              type="date"
              value={range.end}
              onChange={(event) => onRange({ ...range, end: event.target.value })}
            />
          </label>
        </div>
        {valid ? (
          <p className="hint">
            Comparando com o período anterior do mesmo tamanho: {brDate(start)} a {brDate(end)}.
          </p>
        ) : (
          <p className="hint">Escolha um intervalo de até um ano.</p>
        )}
        {(error || currentError) && (
          <p className="notice error" role="alert">
            {error || currentError}
          </p>
        )}
        {valid && !error && !currentError && !(snapshot && earlier) && (
          <PanelSkeleton label="Carregando comparação…" />
        )}
        {snapshot && earlier && (
          <div className="compare-cards">
            {comparisonMetrics(snapshot).map(([label, amount], index) => {
              const baseline = comparisonMetrics(earlier)[index][1];
              const result = change(amount, baseline);
              const better =
                result && result.diff !== 0
                  ? lowerIsBetter.has(label)
                    ? result.diff < 0
                    : result.diff > 0
                  : null;
              return (
                <div key={label} className="compare-card">
                  <span>{label}</span>
                  <b>{moneyBR(amount)}</b>
                  <small>Antes: {moneyBR(baseline)}</small>
                  <small className={better == null ? undefined : better ? "good-up" : "bad-down"}>
                    {changeText(result)}
                  </small>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {isAdmin && (
        <section className="panel space">
          <div className="panel-title-row">
            <h2>Gastos por categoria</h2>
            <CategoryAdder
              added={() => {
                refreshSetup();
                setSpendRevision((value) => value + 1);
              }}
            />
          </div>
          <p className="hint">
            Soma das despesas lançadas em “Despesas e Pix”, separadas pela categoria. Vermelho é
            gasto que subiu; verde é gasto que caiu.
          </p>
          {!spending && <PanelSkeleton label="Carregando gastos…" />}
          {spending && categoryNames.length === 0 && (
            <p className="hint space">
              Nenhum gasto lançado nesses dois períodos. Lance em CFO → Despesas e Pix.
            </p>
          )}
          {categoryNames.length > 0 && (
            <div className="compare-cards">
              {categoryNames.map((name) => {
                const now = categoryNow.get(name) ?? 0;
                const before = categoryBefore.get(name) ?? 0;
                const result = change(now, before);
                return (
                  <div key={name} className="compare-card">
                    <span>{name}</span>
                    <b>{moneyBR(now)}</b>
                    <small>Antes: {moneyBR(before)}</small>
                    <small
                      className={
                        !result || result.diff === 0 ? undefined : result.diff > 0 ? "up" : "down"
                      }
                    >
                      {changeText(result)}
                    </small>
                  </div>
                );
              })}
            </div>
          )}
          {(setup?.vehicles.length ?? 0) > 0 && spending && (
            <>
              <h3 className="space">Por carro da empresa</h3>
              <div className="compare-cards">
                {setup!.vehicles.map((vehicle) => {
                  const now = vehicleNow.get(vehicle.id) ?? 0;
                  const before = vehicleBefore.get(vehicle.id) ?? 0;
                  const result = change(now, before);
                  return (
                    <div key={vehicle.id} className="compare-card">
                      <span>{vehicleLabel(vehicle)}</span>
                      <b>{moneyBR(now)}</b>
                      <small>Antes: {moneyBR(before)}</small>
                      <small
                        className={
                          !result || result.diff === 0 ? undefined : result.diff > 0 ? "up" : "down"
                        }
                      >
                        {changeText(result)}
                      </small>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
      <HowItWorks
        title="Como funciona a comparação"
        steps={[
          "Escolha o período em “De” e “Até” (ex.: 01/11 a 20/11).",
          "O sistema pega sozinho o período anterior com a mesma quantidade de dias (ex.: 12/10 a 31/10).",
          "Cada cartão mostra o valor de agora, o de antes e quanto mudou em reais e em %.",
          "Verde é bom (vendeu mais ou gastou menos). Vermelho pede atenção.",
          "Para separar gastos, lance a despesa com a categoria certa, o carro e o serviço. Use “Nova categoria” se faltar alguma.",
        ]}
      />
    </>
  );
}

function AnimatedMoney({ value }: { value: number | null }) {
  const [display, setDisplay] = useState(value);
  const shown = useRef(value);
  useEffect(() => {
    const from = shown.current;
    shown.current = value;
    if (from === value) return;
    if (
      value == null ||
      value === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    let frame: number;
    const tick = (time: number) => {
      const progress = Math.min((time - start) / 480, 1);
      const base = from ?? 0;
      setDisplay(base + (value - base) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      <span className="sr-only">{moneyBR(value)}</span>
      <span aria-hidden="true">{moneyBR(display)}</span>
    </>
  );
}

function CfoCalculator() {
  const inputs = [
    ["revenue", "Receita"],
    ["cost", "Custo direto"],
    ["fees", "Frete e taxas"],
    ["expenses", "Despesas operacionais"],
  ] as const;
  const [amounts, setAmounts] = useState({ revenue: 0, cost: 0, fees: 0, expenses: 0 });
  const contribution = amounts.revenue - amounts.cost - amounts.fees;
  return (
    <section className="panel space">
      <h2>Calculadora de resultado</h2>
      <p className="hint">
        Simule um cenário e veja os valores calculados enquanto preenche. Os lançamentos do sistema
        são consultados no relatório acima.
      </p>
      <div className="fields">
        {inputs.map(([key, label]) => (
          <label key={key}>
            {label} (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              onChange={(event) =>
                setAmounts({ ...amounts, [key]: Math.max(0, event.target.valueAsNumber || 0) })
              }
            />
          </label>
        ))}
      </div>
      <div className="cfo-simulation">
        <div>
          <small>Contribuição</small>
          <strong>{moneyBR(contribution)}</strong>
        </div>
        <div>
          <small>Resultado estimado</small>
          <strong>{moneyBR(contribution - amounts.expenses)}</strong>
        </div>
        <div>
          <small>Margem de contribuição</small>
          <strong>
            {amounts.revenue > 0
              ? ((100 * contribution) / amounts.revenue).toLocaleString("pt-BR", {
                  maximumFractionDigits: 2,
                }) + "%"
              : "—"}
          </strong>
        </div>
      </div>
    </section>
  );
}

function CfoGuide() {
  return (
    <details className="panel space">
      <summary>Como o CFO calcula e o que revisar</summary>
      <ul className="ouro-guide">
        <li>
          <strong>Resultado comercial</strong> usa as vendas do período, os custos associados e as
          despesas. Custos ausentes aparecem como pendência. A visão gerencial usa os vencimentos
          das despesas como referência.
        </li>
        <li>
          <strong>Fluxo de caixa</strong> usa pagamentos e recebimentos efetivos. Recebimentos de
          serviços aparecem separadamente e entram nas entradas de caixa.
        </li>
        <li>
          <strong>Conciliação bancária</strong> cruza data e valor quando há um par único. Confirme
          itens ambíguos e identifique transferências internas antes de fechar.
        </li>
        <li>
          <strong>Fechamento</strong> revise custos pendentes e débitos sem par, compare períodos
          equivalentes e exporte a planilha para conferência contábil.
        </li>
      </ul>
      <a
        className="action"
        href="https://meuatendimento.sebrae.com.br/sites/PortalSebrae/artigos/como-fazer-a-gestao-financeira-do-pequeno-negocio,d999a442d2e5a410VgnVCM1000003b74010aRCRD"
        target="_blank"
        rel="noreferrer"
      >
        Referência de gestão financeira · Sebrae
      </a>
    </details>
  );
}

function DownloadStatement({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      type Entry = {
        day: string;
        description: string;
        cents: number;
        classification: string | null;
      };
      const entries: Entry[] = [];
      let next: string | null = null;
      do {
        const page: { rows: Entry[]; next: string | null } = await commercialFetch(
          `cfo/imports/${id}${next ? "?after=" + next : ""}`,
        );
        entries.push(...page.rows);
        next = page.next;
      } while (next);
      entries.sort((a, b) => a.day.localeCompare(b.day));
      downloadSpreadsheet("extrato-ouro-branco", {
        name: "Lançamentos",
        rows: [
          ["Data", "Descrição", "Valor", "Classificação"],
          ...entries.map((item) => [
            item.day,
            item.description,
            Number(item.cents) / 100,
            item.classification
              ? (reviewTypes[item.classification as keyof typeof reviewTypes] ??
                item.classification)
              : "",
          ]),
        ],
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível exportar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" className="action" disabled={busy} onClick={() => void download()}>
        {busy ? "Exportando…" : "Baixar extrato Excel"}
      </button>
      {error && (
        <p role="alert" className="hint">
          {error}
        </p>
      )}
    </div>
  );
}
const initial = { date: -1, value: -1, credit: -1, debit: -1, description: -1, reference: -1 };
type Columns = typeof initial;
function StatementImport({
  finished,
  analyze,
  view,
  busyAnalysis,
  manualRange,
}: {
  finished: () => void;
  analyze: (range: { start: string; end: string }) => Promise<boolean>;
  view: () => void;
  busyAnalysis: boolean;
  manualRange: { start: string; end: string };
}) {
  const [file, setFile] = useState(""),
    [rows, setRows] = useState<string[][]>([]),
    [map, setMap] = useState<Columns>(initial);
  const [account, setAccount] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [savedRange, setSavedRange] = useState<typeof manualRange | null>(null);
  const [complete, setComplete] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const ready =
    rows.length > 1 &&
    map.date >= 0 &&
    (map.value >= 0 || map.credit >= 0 || map.debit >= 0) &&
    map.description >= 0;
  const parsed = ready ? parseStatement(rows, map) : { entries: [], errors: [] };
  async function read(source?: File) {
    if (!source) return;
    setRows([]);
    setFile("");
    setError("");
    setMessage("");
    setSavedRange(null);
    setComplete(false);
    setBusy(true);
    try {
      if (source.size > 40_000_000)
        throw new Error("O arquivo ultrapassa 40 MB. Exporte um período menor.");
      const format = source.name.split(".").pop()?.toLowerCase();
      let table: string[][];
      if (format === "csv") table = await readCsv(source);
      else if (format === "xlsx") {
        const { readSheet } = await import("read-excel-file/browser");
        table = (await readSheet(source, 1)).map((row) =>
          row.map((cell) =>
            cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? ""),
          ),
        );
      } else if (format === "xls" || format === "pdf")
        table = await readDocument(source, format, { maxRows: 8001, maxPages: 120 });
      else throw new Error("Selecione CSV, XLS, XLSX ou PDF com texto selecionável.");
      table = table.filter((row) => row.some((cell) => cell.trim()));
      if (table.length < 2 || table.length > 8001)
        throw new Error("Use cabeçalho e até 8.000 lançamentos por arquivo.");
      const knownHeader = table.slice(0, 25).findIndex((row) => {
        const cells = row.map(normalizeStatementText);
        return (
          cells.some((cell) => /^(data|date)\b/.test(cell)) &&
          cells.some((cell) => /^(valor|amount|credito|debito|entrada|saida)\b/.test(cell)) &&
          cells.some((cell) => /^descri|^histor|^lancamento/.test(cell))
        );
      });
      if (knownHeader > 0) table = table.slice(knownHeader);
      const header = table[0].map(normalizeStatementText);
      table = table.filter(
        (row, index) =>
          index === 0 || row.map(normalizeStatementText).join("\u0000") !== header.join("\u0000"),
      );
      setMap({
        date: header.findIndex((cell) => /^data|^date/.test(cell)),
        value: header.findIndex((cell) => /^valor|^amount/.test(cell)),
        credit: header.findIndex((cell) => /^credito|^entrada/.test(cell)),
        debit: header.findIndex((cell) => /^debito|^saida/.test(cell)),
        description: header.findIndex((cell) => /^descri|^histor|^lancamento/.test(cell)),
        reference: header.findIndex((cell) => /^(id|referencia|documento)$/.test(cell)),
      });
      setRows(table);
      setFile(source.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível ler o arquivo.");
    } finally {
      setBusy(false);
    }
  }
  async function runAnalysis(range: typeof manualRange) {
    setAnalyzing(true);
    setError("");
    try {
      setComplete(await analyze(range));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Não foi possível analisar. O extrato foi salvo.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || parsed.errors.length || !parsed.entries.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        file,
        account,
        entries: parsed.entries,
        authorized: new FormData(event.currentTarget).has("authorization"),
      };
      if (new Blob([JSON.stringify(payload)]).size > 4_000_000)
        throw new Error("A prévia contém muito texto. Divida a planilha em períodos menores.");
      const saved = await commercialFetch<{ inserted: number; duplicates: number }>(
        "cfo/import",
        payload,
      );
      setMessage(
        `${saved.inserted} lançamento(s) importado(s) · ${saved.duplicates} repetido(s) ignorado(s).`,
      );
      setRows([]);
      finished();
      const days = parsed.entries.map((item) => item.day).sort();
      const period = { start: days[0], end: days[days.length - 1] };
      const range =
        Date.parse(period.end) - Date.parse(period.start) > 366 * 86400000 ? manualRange : period;
      setSavedRange(range);
      await runAnalysis(range);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Importação indisponível.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Importar extratos e planilhas</h2>
      <p className="hint">
        Use o mesmo apelido em arquivos da mesma conta. Valores positivos são créditos e negativos
        são débitos. Aceita CSV, Excel e PDF com texto selecionável, até 40 MB e 8.000 lançamentos.
      </p>
      <form className="space" onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <label>
            Conta de referência (apelido, sem senha)
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex. Banco principal – Loja"
            />
          </label>
          <label>
            Arquivo
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.pdf"
              onChange={(e) => void read(e.target.files?.[0])}
            />
          </label>
          {!!rows.length && (
            <>
              <div className="fields">
                {Object.entries(columnLabels).map(([key, label]) => {
                  const column = key as keyof Columns;
                  return (
                    <label key={column}>
                      {label}
                      <select
                        value={map[column]}
                        onChange={(e) => setMap({ ...map, [column]: Number(e.target.value) })}
                      >
                        <option value={-1}>Escolha a coluna</option>
                        {rows[0].map((header, index) => (
                          <option key={index} value={index}>
                            {header || `Coluna ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
              {!!parsed.errors.length && (
                <p className="notice error">
                  Confira as linhas {parsed.errors.slice(0, 10).join(", ")} antes de importar.
                </p>
              )}
              {!!parsed.entries.length && (
                <ul>
                  {parsed.entries.slice(0, 4).map((item, index) => (
                    <li key={index}>
                      {item.day} · {item.description} · {moneyBR(item.cents / 100)}
                    </li>
                  ))}
                </ul>
              )}
              <label className="check">
                <input type="checkbox" name="authorization" required />
                Tenho autorização para processar este arquivo.
              </label>
              <button
                className="action primary"
                disabled={
                  !ready || !!parsed.errors.length || !parsed.entries.length || busyAnalysis
                }
              >
                Salvar e analisar
              </button>
              {ready && !parsed.errors.length && !!parsed.entries.length && (
                <button
                  type="button"
                  className="action"
                  onClick={() =>
                    downloadSpreadsheet("previa-extrato", {
                      name: "Extrato",
                      rows: [
                        ["Data", "Descrição", "Valor", "Referência"],
                        ...parsed.entries.map((item) => [
                          item.day,
                          item.description,
                          item.cents / 100,
                          item.reference ?? "",
                        ]),
                      ],
                    })
                  }
                >
                  Baixar prévia em Excel
                </button>
              )}
            </>
          )}
        </fieldset>
      </form>
      {busy && !analyzing && <p role="status">Processando arquivo…</p>}
      {analyzing && (
        <p className="notice" role="status">
          Extrato salvo. Analisando lançamentos…
        </p>
      )}
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
      {complete && (
        <button type="button" className="action primary space" onClick={view}>
          Ver resultado
        </button>
      )}
      {!complete && !analyzing && savedRange && (
        <button type="button" className="action space" onClick={() => void runAnalysis(savedRange)}>
          Analisar extrato salvo
        </button>
      )}
    </section>
  );
}

function CfoResults({
  start,
  end,
  snapshot,
  onReviewed,
}: {
  start: string;
  end: string;
  snapshot: Snapshot;
  onReviewed: () => void;
}) {
  const [reviewed, setReviewed] = useState<string[]>([]);
  const rows = [
    ["DRE", "Receita de vendas e receitas externas revisadas", snapshot.dre.revenue],
    ["DRE", "Custo das mercadorias e custos externos", snapshot.dre.goodsCost],
    ["DRE", "Contribuição após custos e taxas", snapshot.dre.contribution],
    ["DRE", "Despesas operacionais", snapshot.dre.expenses],
    ["DRE", "Resultado estimado", snapshot.dre.result],
    ["Caixa", "Entradas líquidas de estornos", snapshot.cash.received],
    ["Caixa", "Recebimentos de serviços", snapshot.dre.receivedServices],
    ["Caixa", "Saídas pagas", snapshot.cash.paid],
    ["Caixa", "Variação de caixa", snapshot.cash.net],
  ] as const;
  function exportCsv() {
    const content = [
      "Período;Seção;Indicador;Valor em reais",
      ...rows.map(
        ([section, label, value]) =>
          `${start} a ${end};${section};${label};${value === null ? "Em apuração" : value.toFixed(2).replace(".", ",")}`,
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ouro-branco-cfo-${start}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel space">
      <h2>Relatório do CFO</h2>
      <p className="hint">
        {start} a {end} · Despesas da DRE comercial por vencimento. Pagamentos de serviços já
        recebidos entram em caixa.
      </p>
      <div className="stats space">
        {(
          [
            ["Receita comercial", snapshot.dre.revenue],
            ["Recebimentos de serviços", snapshot.dre.receivedServices],
            ["Saldo de caixa no período", snapshot.cash.net],
            ["Resultado comercial estimado", snapshot.dre.result],
          ] as const
        ).map(([label, amount]) => (
          <div className="panel" key={label}>
            <small>{label}</small>
            <strong>
              <AnimatedMoney value={amount} />
            </strong>
          </div>
        ))}
      </div>
      <div className="actions">
        <button
          type="button"
          className="action primary"
          onClick={() =>
            downloadSpreadsheet(
              `ouro-branco-cfo-${start}`,
              {
                name: "Relatório",
                rows: [
                  ["De", "Até", "Seção", "Indicador", "Valor (R$)"],
                  ...rows.map(([section, label, value]) => [start, end, section, label, value]),
                ],
              },
              {
                name: "Revisão bancária",
                rows: [
                  ["Data", "Descrição", "Conta", "Valor (R$)"],
                  ...snapshot.bank.queue.map((item) => [
                    item.booked_on,
                    item.description,
                    item.account,
                    item.amount_cents / 100,
                  ]),
                ],
              },
            )
          }
        >
          Baixar relatório Excel
        </button>
        <button className="action" onClick={exportCsv}>
          Baixar relatório CSV
        </button>
      </div>
      <div className="table-scroll">
        <table className="wrap-table">
          <tbody>
            {rows.map(([section, label, value]) => (
              <tr key={label}>
                <td>{section}</td>
                <th scope="row">{label}</th>
                <td>{moneyBR(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="space">
        Margem de contribuição ·{" "}
        {snapshot.dre.margin === null
          ? "Em apuração"
          : `${snapshot.dre.margin.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}
      </p>
      <p className="hint">
        {snapshot.dre.pendingSales} venda(s) e {snapshot.dre.pendingPurchases} compra(s) com custos
        pendentes.
      </p>
      <h2 className="space">Conciliação e revisão</h2>
      <p>
        {snapshot.bank.matched} conciliado(s) · {snapshot.bank.review} para revisão ·{" "}
        {snapshot.bank.transfers} transferência(s) · {snapshot.bank.unmatchedLedger} lançamento(s)
        do sistema sem par.
      </p>
      <p className="hint">
        A conciliação automática exige data e valor iguais e um único par possível. A revisão fica
        auditada. Execute /CFO novamente para atualizar o relatório.
      </p>
      {snapshot.bank.queue
        .filter((item) => !reviewed.includes(item.id))
        .map((item) => (
          <ReviewMove
            key={item.id}
            move={item}
            done={() => {
              setReviewed((previous) => [...previous, item.id]);
              onReviewed();
            }}
          />
        ))}
    </section>
  );
}
function ReviewMove({ move, done }: { move: Move; done: () => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const payload = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await commercialFetch(
        "cfo/review",
        {
          id: move.id,
          classification: String(payload.get("type")),
          reason: String(payload.get("reason")),
        },
        undefined,
        "PATCH",
      );
      done();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível classificar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>
        {move.booked_on} · {move.description} · {moneyBR(move.amount_cents / 100)}
      </summary>
      <p className="hint">
        {move.account} ·{" "}
        {move.has_candidate
          ? "Movimentação com mais de um encaixe possível."
          : suggestClassification(move.description, move.amount_cents)}
      </p>
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <label>
            Classificação
            <select name="type" required defaultValue="">
              <option value="">Selecione</option>
              {Object.entries(reviewTypes)
                .filter(
                  ([key]) =>
                    key === "transfer" ||
                    (!move.has_candidate &&
                      (move.amount_cents > 0
                        ? key === "external_revenue"
                        : key !== "external_revenue")),
                )
                .map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Motivo
            <input name="reason" minLength={4} maxLength={500} required />
          </label>
          <button className="action">Salvar revisão</button>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
      </form>
    </details>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
import { HowItWorks } from "@/components/preciso/ExampleCards";
import { CategoryAdder, useExpenseSetup, vehicleLabel } from "@/components/preciso/ExpenseSetup";
