import { localDay, type Product, type Report } from "@/lib/commercial-client";

type Period = { start: string; end: string };

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
