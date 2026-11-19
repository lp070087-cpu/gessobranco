import { localDay, type Report } from "@/lib/commercial-client";

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
