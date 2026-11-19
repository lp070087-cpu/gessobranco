import { useEffect, useState, type FormEvent } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { commercialFetch, moneyBR, type Report } from "@/lib/commercial-client";
import {
  qualityAxis,
  qualityLabel,
  type QualityThresholds,
  type SalesQuality,
} from "@/lib/sales-quality";

const levels = [
  { key: "good", label: "Bom", color: "var(--chart-good)" },
  { key: "medium", label: "Médio", color: "var(--chart-medium)" },
  { key: "bad", label: "Ruim", color: "var(--chart-bad)" },
] as const;
const axisCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function SalesQualityChart({
  period,
  report,
}: {
  period: { start: string; end: string };
  report: Report | null;
}) {
  const [loaded, setLoaded] = useState<{ route: string; chart: SalesQuality } | null>(null);
  const [settings, setSettings] = useState<QualityThresholds | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [animate, setAnimate] = useState(false);
  const route = `commercial/quality?start=${period.start}&end=${period.end}`;
  const chart = loaded?.route === route ? loaded.chart : null;
  const granularity = chart?.granularity ?? "day";
  const emptyDays = [...new Set([period.start, period.end])];
  const points =
    chart?.points ?? emptyDays.map((day) => ({ day, good: null, medium: null, bad: null }));
  const ticks = qualityAxis(points);
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAnimate(!reduced.matches);
    update();
    reduced.addEventListener("change", update);
    return () => reduced.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<SalesQuality>(route, undefined, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) {
          setLoaded({ route, chart: next });
          setError("");
        }
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [route, report, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || saving) return;
    if (settings.good <= settings.medium) {
      setError("O limite de Bom deve ser maior que o de Médio.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await commercialFetch("commercial/quality", settings);
      setSettings(null);
      refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar os limites.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel space sales-quality" aria-label="Resultado das vendas por dia">
      <h2>Resultado das vendas por dia</h2>
      <p className="hint">
        Cada linha soma a contribuição das vendas da faixa em reais, após mercadorias, frete, taxas
        e outros custos atribuídos.
      </p>
      <div className="actions">
        <ul className="quality-legend" aria-label="Legenda">
          {levels.map(({ key, label, color }) => (
            <li key={key}>
              <span style={{ backgroundColor: color }} />
              {label}
            </li>
          ))}
        </ul>
        {chart && (
          <button
            type="button"
            className="action"
            onClick={() => setSettings(settings ? null : { ...chart.thresholds })}
          >
            {settings ? "Fechar ajustes" : "Configurar margens"}
          </button>
        )}
      </div>
      {chart && (
        <p className="hint">
          Bom a partir de {chart.thresholds.good}%. Médio de {chart.thresholds.medium}% até abaixo
          de {chart.thresholds.good}%. Ruim abaixo de {chart.thresholds.medium}% ou com prejuízo.
        </p>
      )}
      {settings && (
        <form onSubmit={save} className="space">
          <div className="fields">
            <label>
              Margem mínima para Bom (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={settings.good}
                onChange={(event) => setSettings({ ...settings, good: event.target.valueAsNumber })}
              />
            </label>
            <label>
              Margem mínima para Médio (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                required
                value={settings.medium}
                onChange={(event) =>
                  setSettings({ ...settings, medium: event.target.valueAsNumber })
                }
              />
            </label>
          </div>
          <button className="action primary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar limites"}
          </button>
        </form>
      )}
      {error && (
        <div className="notice error space" role="alert">
          {error}{" "}
          <button type="button" onClick={refresh}>
            Tentar novamente
          </button>
        </div>
      )}
      <div className="quality-chart" aria-label="Contribuição em reais por período e margem">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: 4, right: 12, top: 12, bottom: 5 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              minTickGap={14}
              tick={{ fontSize: 11 }}
              tickFormatter={(day: string) => qualityLabel(day, granularity)}
            />
            <YAxis
              type="number"
              ticks={ticks}
              domain={[ticks[0], ticks[ticks.length - 1]]}
              width={92}
              tick={{ fontSize: 11 }}
              tickFormatter={(value: number) => axisCurrency.format(value)}
            />
            {ticks[0] < 0 && <ReferenceLine y={0} stroke="var(--muted-foreground)" />}
            <Tooltip
              formatter={(value) => moneyBR(Number(value))}
              labelFormatter={(label) => qualityLabel(String(label), granularity, true)}
            />
            {levels.map((level) => (
              <Line
                key={level.key}
                type="linear"
                dataKey={level.key}
                name={level.label}
                stroke={level.color}
                strokeWidth={2.5}
                connectNulls
                activeDot={{ r: 5 }}
                dot={
                  points.length <= 14 ||
                  points.filter((point) => point[level.key] !== null).length === 1
                }
                isAnimationActive={animate}
                animationDuration={500}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {!chart && !error && (
        <p className="hint" role="status">
          Carregando gráfico…
        </p>
      )}
      {chart?.sales === 0 && (
        <p className="hint">Ainda não há vendas com custo completo neste período.</p>
      )}
      {!!chart?.pending && (
        <p className="hint">{chart.pending} venda(s) com custo pendente ficaram fora das linhas.</p>
      )}
    </section>
  );
}
