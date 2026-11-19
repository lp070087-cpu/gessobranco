import { useEffect, useRef, useState, type FormEvent } from "react";
import { commercialFetch, localDay, moneyBR } from "@/lib/commercial-client";
import { readDocument } from "@/lib/document-import";
import { photoAccept, preparePhoto } from "@/lib/photo-upload";

const labels = ["Combustível", "Materiais", "Frete", "Serviços", "Outras despesas"];
type Expense = {
  id: string;
  description: string;
  amount: string;
  due_on: string;
  paid_on: string | null;
  category: string;
  receipt: boolean;
};

export function OwnerExpenses({ saved }: { saved: () => void }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [revision, setRevision] = useState(0);
  const [photo, setPhoto] = useState("");
  const [ocr, setOcr] = useState("");
  const [note, setNote] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDay);
  const [category, setCategory] = useState(labels[4]);
  const [paid, setPaid] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const retry = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<Expense[]>("admin/owner-expenses", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRows(value);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);

  function suggest(text: string) {
    const source = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const selected = /gasolina|combustivel|diesel|etanol|abastec/i.test(source)
      ? labels[0]
      : /frete|transport/.test(source)
        ? labels[2]
        : /material|gesso/.test(source)
          ? labels[1]
          : labels[4];
    setCategory(selected);
    if (note.trim() || selected !== labels[4] || /\bpix\b/.test(source)) {
      setDescription(note.trim() || (selected === labels[4] ? "Despesa via Pix" : selected));
    }
    const matches = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)]
      .map((match) => match[1])
      .filter((value, index, values) => values.indexOf(value) === index);
    const labeled =
      /(?:valor (?:pago|transferido|do pix|da transa[çc][ãa]o)|total pago)\s*:?\s*(?:R\$\s*)?([\d.]+,\d{2})/i.exec(
        text,
      )?.[1];
    const foundAmount = labeled ?? (matches.length === 1 ? matches[0] : "");
    if (foundAmount) setAmount(foundAmount.replace(/\./g, "").replace(",", "."));
    const dates = [
      ...new Set(
        [...text.matchAll(/\b(\d{2})[/-](\d{2})[/-](20\d{2})\b/g)].map(
          (match) => `${match[3]}-${match[2]}-${match[1]}`,
        ),
      ),
    ];
    if (
      dates.length === 1 &&
      Number.isFinite(Date.parse(dates[0])) &&
      new Date(dates[0]).toISOString().slice(0, 10) === dates[0]
    )
      setDate(dates[0]);
  }

  async function read(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    setPhoto("");
    setOcr("");
    setReading(true);
    try {
      setPhoto(await preparePhoto(file));
      const text = (await readDocument(file, "receipt")).map((row) => row[0]).join("\n");
      setOcr(text);
      suggest(note + "\n" + text);
      setMessage("Leitura concluída. Confira os campos antes de salvar.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message + " Você pode preencher os campos manualmente."
          : "Não foi possível ler a imagem.",
      );
    } finally {
      setReading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || reading) return;
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    setMessage("");
    const input = {
      description,
      amount: Number(amount),
      day: date,
      category,
      paid,
      ...(photo ? { photo } : {}),
    };
    const payload = JSON.stringify(input);
    if (retry.current?.payload !== payload) retry.current = { payload, id: crypto.randomUUID() };
    try {
      await commercialFetch("admin/owner-expenses", { ...input, request_id: retry.current.id });
      setPhoto("");
      setNote("");
      setOcr("");
      setDescription("");
      setAmount("");
      setPaid(false);
      setCategory(labels[4]);
      setDate(localDay());
      form.reset();
      retry.current = null;
      setRevision((value) => value + 1);
      setMessage("Despesa salva no financeiro da loja e incluída nos cálculos do CFO.");
      saved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar a despesa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Despesas do proprietário</h2>
        <p className="hint">
          Anexe a foto do comprovante ou descreva o gasto. Confira o valor, a data e a categoria
          para registrar.
        </p>
        <form onSubmit={(event) => void save(event)} className="space">
          <fieldset disabled={saving || reading}>
            <div className="fields">
              <label>
                Comprovante JPG ou PNG{" "}
                <input
                  type="file"
                  accept={photoAccept}
                  onChange={(event) => void read(event.target.files?.[0])}
                />
              </label>
              <label>
                Mensagem (opcional){" "}
                <input
                  maxLength={200}
                  placeholder="Ex. Pix, gasolina"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
            {photo && (
              <img className="ouro-upload-preview" src={photo} alt="Prévia do comprovante" />
            )}
            <div className="actions">
              <button
                type="button"
                className="action"
                onClick={() => suggest(note + "\n" + ocr)}
                disabled={!note.trim() && !ocr}
              >
                Sugerir preenchimento
              </button>
              {photo && (
                <button
                  type="button"
                  className="action"
                  onClick={() => {
                    setPhoto("");
                    setOcr("");
                  }}
                >
                  Remover comprovante
                </button>
              )}
            </div>
            <div className="fields">
              <label>
                Descrição{" "}
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  required
                  minLength={3}
                  maxLength={180}
                />
              </label>
              <label>
                Categoria{" "}
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {labels.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Valor (R$){" "}
                <input
                  type="number"
                  min="0.01"
                  max="100000000"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Data{" "}
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={paid}
                onChange={(event) => setPaid(event.target.checked)}
              />{" "}
              Pagamento via Pix confirmado
            </label>
            <button type="submit" className="action primary">
              Salvar despesa
            </button>
          </fieldset>
        </form>
        {reading && (
          <p role="status" className="hint">
            Lendo o comprovante…
          </p>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </section>
      <section className="panel space">
        <h2>Despesas registradas aqui</h2>
        {!rows.length && <p className="hint">Nenhum lançamento neste painel.</p>}
        {rows.map((item) => (
          <div key={item.id} className="actions space">
            <span>
              {item.description} · {item.category} · {moneyBR(item.amount)} ·{" "}
              {item.paid_on ? "Pago" : "Em aberto"}
            </span>
            {item.receipt && (
              <a
                className="action"
                href={`/api/neon/admin/owner-expenses/${item.id}/receipt`}
                target="_blank"
                rel="noreferrer"
              >
                Ver comprovante
              </a>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
