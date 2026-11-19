import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { localDay, type Product, type Report } from "@/lib/commercial-client";

type Period = { start: string; end: string };
const levels = [
  { key: "good", label: "Bom", color: "var(--foreground)" },
  { key: "medium", label: "Médio", color: "var(--accent)" },
  { key: "bad", label: "Ruim", color: "var(--destructive)" },
] as const;

export function SalesQualityChart({ report }: { report: Report }) {
  const days = report.daily ?? [];
  const pending = days.reduce((total, day) => total + Number(day.pending), 0);
  return (
    <section className="panel space" aria-label="Resultado das vendas por dia">
      <h2>Resultado das vendas por dia</h2>
      <p className="hint">
        Bom: contribuição positiva. Médio: contribuição zero. Ruim: contribuição negativa.{" "}
        {pending > 0 && `${pending} venda(s) com custo pendente ficaram fora das linhas.`}
      </p>
      <div className="actions" aria-label="Legenda">
        <span className="quality-good">● Bom</span>
        <span className="quality-medium">● Médio</span>
        <span className="quality-bad">● Ruim</span>
      </div>
      {days.some((day) => day.good || day.medium || day.bad) ? (
        <div className="quality-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={days} margin={{ left: 0, right: 12, top: 12, bottom: 5 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="day"
                minTickGap={22}
                tickFormatter={(date: string) => date.slice(5).split("-").reverse().join("/")}
              />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip />
              {levels.map((level) => (
                <Line
                  key={level.key}
                  dataKey={level.key}
                  name={level.label}
                  stroke={level.color}
                  strokeWidth={2}
                  dot={days.length <= 7}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="hint">Ainda não há vendas com custo completo neste período.</p>
      )}
    </section>
  );
}

export function CommercialReportTools({
  report,
  period,
  onPeriod,
}: {
  report: Report | null;
  period: Period;
  onPeriod: (start: string, end: string) => void;
}) {
  function select(range: "day" | "week" | "month") {
    const today = localDay();
    const date = new Date(today + "T12:00:00Z");
    if (range === "week") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    if (range === "month") date.setUTCDate(1);
    onPeriod(date.toISOString().slice(0, 10), today);
  }
  const url = `/api/neon/commercial/report?start=${period.start}&end=${period.end}`;
  return (
    <div className="actions">
      <button type="button" className="action" onClick={() => select("day")}>
        Dia
      </button>
      <button type="button" className="action" onClick={() => select("week")}>
        Semana
      </button>
      <button type="button" className="action" onClick={() => select("month")}>
        Mês
      </button>
      {report && (
        <>
          <a className="action" href={`${url}&format=pdf`} download>
            Baixar PDF
          </a>
          <a className="action" href={`${url}&format=xlsx`} download>
            Baixar Excel
          </a>
          <a
            className="action"
            href={`mailto:?subject=${encodeURIComponent("Ouro Branco — Relatório comercial")}&body=${encodeURIComponent(`Olá,\n\nSegue o relatório da Ouro Branco referente ao período de ${period.start} a ${period.end}.\n\nAtenciosamente,\nOuro Branco`)}`}
          >
            Preparar e-mail
          </a>
          <small>Para enviar, anexe o arquivo baixado ao e-mail.</small>
        </>
      )}
    </div>
  );
}

export function PurchaseExamples({ products }: { products: Product[] }) {
  return (
    <div>
      <p className="hint">
        Entradas grandes: 5 t = 5.000 kg, 10 t = 10.000 kg e 20 t = 20.000 kg. Informe o valor total
        do material e o frete em campos separados. Use zero para custos que não ocorreram.
      </p>
      <div className="actions">
        {[5, 10, 20].map((tons) => (
          <button
            key={tons}
            type="button"
            className="action"
            onClick={(event) => {
              const form = event.currentTarget.form;
              const unit = form?.elements.namedItem("unit_id");
              const quantity = form?.elements.namedItem("quantity");
              if (!(unit instanceof HTMLSelectElement) || !(quantity instanceof HTMLInputElement))
                return;
              const kgProduct =
                products.find(
                  (product) =>
                    product.active &&
                    /^kg$/i.test(product.base_unit.trim()) &&
                    product.units.some((entry) => entry.id === unit.value),
                ) ??
                products.find(
                  (product) =>
                    product.active &&
                    /^kg$/i.test(product.base_unit.trim()) &&
                    product.units.some((entry) => Number(entry.factor) === 1),
                );
              const kg = kgProduct?.units.find((entry) => Number(entry.factor) === 1);
              const current = kgProduct?.units.find((entry) => entry.id === unit.value);
              const entry = kg ?? current;
              if (!entry) {
                unit.focus();
                return;
              }
              unit.value = entry.id;
              quantity.value = String(Number(((tons * 1000) / Number(entry.factor)).toFixed(6)));
              quantity.focus();
            }}
          >
            {tons} toneladas
          </button>
        ))}
      </div>
    </div>
  );
}
