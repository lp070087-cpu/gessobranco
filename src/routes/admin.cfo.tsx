import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CompanySession } from "@/components/preciso/CompanySession";
import { hasCompanyPermission } from "@/lib/company-permissions";
import { commercialFetch, moneyBR } from "@/lib/commercial-client";
import {
  normalizeStatementText,
  parseStatement,
  priorMonth,
  reviewTypes,
  suggestClassification,
} from "@/lib/cfo";
import { parseCsv } from "@/lib/commercial-import";
import { readDocument } from "@/lib/document-import";

export const Route = createFileRoute("/admin/cfo")({
  head: () => ({ meta: [{ title: "CFO Financeiro — Ouro Branco" }] }),
  component: () => (
    <CompanySession
      title="CFO financeiro"
      allowed={(user) => hasCompanyPermission(user, "finance_cfo")}
    >
      {(user) => <Cfo canStore={user.role === "admin"} />}
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

function Cfo({ canStore }: { canStore: boolean }) {
  const [range, setRange] = useState(priorMonth);
  const [history, setHistory] = useState<History | null>(null);
  const [selected, setSelected] = useState<Run | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [instruction, setInstruction] = useState("/CFO");
  const request = useRef<{ period: string; key: string } | null>(null);
  const running = useRef(false);
  const refresh = () => setRevision((value) => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<History>("cfo/history", undefined, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setHistory(data);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);
  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    if (instruction.trim().toUpperCase() !== "/CFO") {
      setError("Digite /CFO para executar.");
      return;
    }
    const period = range.start + "|" + range.end;
    if (request.current?.period !== period) request.current = { period, key: crypto.randomUUID() };
    running.current = true;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await commercialFetch<{ id: string; status: string; report?: Snapshot }>(
        "cfo/run",
        { ...range, request_key: request.current.key },
      );
      if (result.status === "running") {
        setMessage("A execução está em andamento. Confira o histórico.");
      }
      if (result.status === "succeeded" && result.report) {
        setSelected({
          id: result.id,
          source: "manual",
          start_on: range.start,
          end_on: range.end,
          status: "succeeded",
          started_at: new Date().toISOString(),
          error: null,
          report: result.report,
        });
        request.current = null;
        setMessage("Análise concluída.");
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "O processamento falhou. Consulte o histórico.",
      );
    } finally {
      running.current = false;
      setBusy(false);
      refresh();
    }
  }
  async function openRun(id: string) {
    setError("");
    try {
      setSelected(await commercialFetch<Run>("cfo/history/" + id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Relatório indisponível.");
    }
  }
  const latest = history?.runs[0];
  const report = selected ?? history?.runs.find((run) => run.report) ?? null;
  return (
    <>
      <div className="actions">
        {canStore && (
          <Link className="action" to="/admin/comercial">
            Voltar para Gestão da Loja
          </Link>
        )}
        <button className="action" onClick={refresh}>
          Atualizar histórico
        </button>
      </div>
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
      <div className="grid">
        <section className="panel">
          <h2>Executar análise</h2>
          <p className="hint">
            O fechamento automático analisa o mês anterior no dia 5, na faixa das 9h no horário de
            Brasília.
          </p>
          <form className="space" onSubmit={(event) => void execute(event)}>
            <fieldset disabled={busy}>
              <div className="fields">
                <label>
                  De
                  <input
                    type="date"
                    required
                    value={range.start}
                    onChange={(e) => setRange({ ...range, start: e.target.value })}
                  />
                </label>
                <label>
                  Até
                  <input
                    type="date"
                    required
                    value={range.end}
                    onChange={(e) => setRange({ ...range, end: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Comando
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  required
                />
              </label>
              <button className="action primary">{busy ? "Processando…" : "Executar /CFO"}</button>
            </fieldset>
          </form>
          {latest && (
            <p className="hint space">
              Última execução · {stamp(latest.started_at)} · {statuses[latest.status]}
            </p>
          )}
          {!latest && history && <p className="hint space">Nenhuma execução registrada.</p>}
        </section>
        <StatementImport finished={refresh} />
      </div>
      {report?.report && (
        <CfoResults key={report.id} run={report} snapshot={report.report} onReviewed={refresh} />
      )}
      <div className="grid space">
        <section className="panel">
          <h2>Histórico de execuções</h2>
          {!history && <p role="status">Carregando histórico…</p>}
          {history?.runs.map((run) => (
            <div className="actions" key={run.id}>
              <span>
                {run.start_on} a {run.end_on} · {run.source === "cron" ? "Automática" : "Manual"} ·{" "}
                {statuses[run.status]}
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
            <p className="space" key={file.id}>
              {file.file_name} · {file.account} · {stamp(file.created_at)}
            </p>
          ))}
        </section>
      </div>
    </>
  );
}

const columnLabels = {
  date: "Data",
  value: "Valor com sinal",
  description: "Descrição",
  reference: "ID do banco (opcional)",
};
const initial = { date: -1, value: -1, description: -1, reference: -1 };
type Columns = typeof initial;
function StatementImport({ finished }: { finished: () => void }) {
  const [file, setFile] = useState(""),
    [rows, setRows] = useState<string[][]>([]),
    [map, setMap] = useState<Columns>(initial);
  const [account, setAccount] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const ready = rows.length > 1 && map.date >= 0 && map.value >= 0 && map.description >= 0;
  const parsed = ready ? parseStatement(rows, map) : { entries: [], errors: [] };
  async function read(source?: File) {
    if (!source) return;
    setRows([]);
    setFile("");
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (source.size > 5_000_000) throw new Error("Selecione um arquivo de até 5 MB.");
      const format = source.name.split(".").pop()?.toLowerCase();
      let table: string[][];
      if (format === "csv") table = parseCsv((await source.text()).replace(/^\uFEFF/, ""));
      else if (format === "xlsx") {
        const { readSheet } = await import("read-excel-file/browser");
        table = (await readSheet(source, 1)).map((row) =>
          row.map((cell) =>
            cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? ""),
          ),
        );
      } else if (format === "xls" || format === "pdf") table = await readDocument(source, format);
      else throw new Error("Selecione CSV, XLS, XLSX ou PDF com texto selecionável.");
      table = table.filter((row) => row.some((cell) => cell.trim()));
      if (table.length < 2 || table.length > 2001)
        throw new Error("Use cabeçalho e de 1 a 2.000 linhas por arquivo.");
      const header = table[0].map(normalizeStatementText);
      setMap({
        date: header.findIndex((cell) => /^data|^date/.test(cell)),
        value: header.findIndex((cell) => /^valor|^amount/.test(cell)),
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
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || parsed.errors.length || !parsed.entries.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await commercialFetch<{ inserted: number; duplicates: number }>("cfo/import", {
        file,
        account,
        entries: parsed.entries,
        authorized: new FormData(event.currentTarget).has("authorization"),
      });
      setMessage(
        `${saved.inserted} lançamento(s) importado(s) · ${saved.duplicates} repetido(s) ignorado(s).`,
      );
      setRows([]);
      finished();
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
        Use uma conta de referência consistente. Valores positivos são créditos e negativos são
        débitos. PDF deve conter tabela com texto selecionável.
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
                disabled={!ready || !!parsed.errors.length || !parsed.entries.length}
              >
                Confirmar importação
              </button>
            </>
          )}
        </fieldset>
      </form>
      {busy && <p role="status">Processando arquivo…</p>}
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
    </section>
  );
}

function CfoResults({
  run,
  snapshot,
  onReviewed,
}: {
  run: Run;
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
    ["Caixa", "Saídas pagas", snapshot.cash.paid],
    ["Caixa", "Variação de caixa", snapshot.cash.net],
  ] as const;
  function exportCsv() {
    const content = [
      "Período;Seção;Indicador;Valor em reais",
      ...rows.map(
        ([section, label, value]) =>
          `${run.start_on} a ${run.end_on};${section};${label};${value === null ? "Em apuração" : value.toFixed(2).replace(".", ",")}`,
      ),
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `ouro-branco-cfo-${run.start_on}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel space">
      <h2>Relatório do CFO</h2>
      <p className="hint">
        {run.start_on} a {run.end_on} · Despesas da DRE comercial por vencimento. Pagamentos de
        serviços já recebidos entram em caixa.
      </p>
      <div className="actions">
        <button className="action" onClick={exportCsv}>
          Baixar relatório CSV
        </button>
      </div>
      <div className="table-scroll">
        <table>
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
