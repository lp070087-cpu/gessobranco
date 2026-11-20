import type { ReactNode } from "react";

export type ExampleCard = {
  title: string;
  tag?: string;
  lines: string[];
  value?: string;
  action?: { label: string; run: () => void };
};

/** Cartões de exemplo: mostram como a aba fica quando estiver preenchida. */
export function ExampleCards({
  title = "Exemplo de como fica",
  hint,
  cards,
  children,
  inline = false,
}: {
  inline?: boolean;
  title?: string;
  hint?: string;
  cards: ExampleCard[];
  children?: ReactNode;
}) {
  return (
    <section
      className={inline ? "example-zone example-inline" : "panel space example-zone"}
      aria-label={title}
    >
      <div className="example-head">
        {inline ? <h3>{title}</h3> : <h2>{title}</h2>}
        <span className="example-badge">Exemplo</span>
      </div>
      {hint && <p className="hint">{hint}</p>}
      <div className="example-grid">
        {cards.map((card) => (
          <article key={card.title} className="example-card">
            <div className="example-card-top">
              <strong>{card.title}</strong>
              {card.tag && <span>{card.tag}</span>}
            </div>
            {card.value && <p className="example-value">{card.value}</p>}
            <ul>
              {card.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {card.action && (
              <button type="button" className="action" onClick={card.action.run}>
                {card.action.label}
              </button>
            )}
          </article>
        ))}
      </div>
      {children}
    </section>
  );
}

/** Passo a passo curto de como uma aba funciona. */
export function HowItWorks({
  title = "Como funciona",
  steps,
}: {
  title?: string;
  steps: string[];
}) {
  return (
    <section className="panel space how-it-works">
      <h2>{title}</h2>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}
