import { useEffect, useState } from "react";
import { commercialFetch } from "@/lib/commercial-client";
import { PanelSkeleton } from "./LoadingSkeleton";

type ReferenceTable = {
  title: string;
  columns: string[];
  rows: string[][];
  notes: string[];
};

type Reference = {
  title: string;
  description: string;
  metrics: { label: string; value: string }[];
  sections: { title: string; tables: ReferenceTable[] }[];
};

export function StoreReference() {
  const [data, setData] = useState<Reference | null>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<Reference | null>("commercial/reference", undefined, controller.signal)
      .then((reference) => {
        if (!controller.signal.aborted) setData(reference);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Não foi possível carregar a referência.");
      });
    return () => controller.abort();
  }, [attempt]);

  if (error) {
    return (
      <section className="panel">
        <p className="notice error" role="alert">
          {error}
        </p>
        <button
          type="button"
          className="action"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Tentar novamente
        </button>
      </section>
    );
  }
  if (data === undefined) return <PanelSkeleton label="Carregando a referência de Prazeres…" />;
  if (!data) return <p className="notice">Ainda não há uma referência cadastrada.</p>;

  return (
    <section aria-labelledby="store-reference-title">
      <header className="panel">
        <h2 id="store-reference-title">{data.title}</h2>
        <p>{data.description}</p>
      </header>
      <div className="stats space" aria-label="Resumo das folhas">
        {data.metrics.map(({ label, value }) => (
          <div className="panel" key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {data.sections.map(({ title, tables }) => (
        <details className="panel space" key={title}>
          <summary>{title}</summary>
          {tables.map((table) => (
            <section className="space" key={table.title}>
              <h3>{table.title}</h3>
              <div className="table-scroll">
                <table aria-label={table.title}>
                  <thead>
                    <tr>
                      {table.columns.map((column) => (
                        <th scope="col" key={column}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, index) => (
                      <tr key={index}>
                        {row.map((value, column) => (
                          <td key={table.columns[column]}>{value}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {table.notes.map((note) => (
                <p className="hint space" key={note}>
                  {note}
                </p>
              ))}
            </section>
          ))}
        </details>
      ))}
    </section>
  );
}
