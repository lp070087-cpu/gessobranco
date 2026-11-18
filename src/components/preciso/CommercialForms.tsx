import { useState, type FormEvent, type ReactNode } from "react";
import type { CommercialState, Product } from "@/lib/commercial-client";

export type Command = (kind: string, data: Record<string, unknown>) => Promise<{ id: string }>;
export type Field = {
  name: string;
  label: string;
  type?: "number" | "date" | "checkbox" | "select" | "text";
  options?: { value: string; label: string }[];
  value?: string | number | boolean;
  required?: boolean;
  nullable?: boolean;
  hint?: string;
};

export function Fields({ fields }: { fields: Field[] }) {
  return (
    <div className="fields">
      {fields.map((field) => (
        <label key={field.name} className={field.type === "checkbox" ? "check" : undefined}>
          {field.type !== "checkbox" && <span>{field.label}</span>}
          {field.type === "select" ? (
            <select
              name={field.name}
              defaultValue={String(field.value ?? "")}
              required={field.required}
            >
              {!field.required && <option value="">Não informado</option>}
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={field.name}
              type={field.type ?? "text"}
              defaultValue={field.type === "checkbox" ? undefined : String(field.value ?? "")}
              defaultChecked={field.type === "checkbox" ? Boolean(field.value) : undefined}
              min={field.type === "number" ? 0 : undefined}
              step={field.type === "number" ? "any" : undefined}
              required={field.required}
            />
          )}
          {field.type === "checkbox" && <span>{field.label}</span>}
          {field.hint && <small>{field.hint}</small>}
        </label>
      ))}
    </div>
  );
}

export function readFields(form: HTMLFormElement, fields: Field[]) {
  const data = new FormData(form);
  return Object.fromEntries(
    fields.map((field) => {
      const value = data.get(field.name);
      if (field.type === "checkbox") return [field.name, value === "on"];
      if (value === "" && field.nullable) return [field.name, null];
      return [field.name, field.type === "number" ? Number(value) : String(value ?? "")];
    }),
  );
}

export function CommandForm({
  title,
  kind,
  fields,
  command,
  extra,
  children,
  label = "Salvar",
}: {
  title: string;
  kind: string;
  fields: Field[];
  command: Command;
  extra?: (data: Record<string, unknown>) => Record<string, unknown>;
  children?: ReactNode;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    try {
      const data = readFields(form, fields);
      await command(kind, extra ? extra(data) : data);
      form.reset();
    } catch {
      /* The shared operation status displays the server response. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h2>{title}</h2>
      {children}
      <Fields fields={fields} />
      <button className="action primary" disabled={busy}>
        {busy ? "Salvando…" : label}
      </button>
    </form>
  );
}

export function ProductEditor({
  product,
  command,
  close,
}: {
  product?: Product;
  command: Command;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [units, setUnits] = useState(
    product?.units.map((unit) => ({
      name: unit.name,
      factor: String(unit.factor),
      price: unit.price ?? "",
    })) ?? [{ name: "", factor: "1", price: "" }],
  );
  const fields: Field[] = [
    { name: "name", label: "Nome do produto", required: true, value: product?.name },
    { name: "category", label: "Categoria", value: product?.category },
    { name: "description", label: "Descrição", value: product?.description },
    {
      name: "base_unit",
      label: "Unidade-base do estoque",
      required: true,
      value: product?.base_unit,
      hint: "Ex.: kg, metro ou unidade. Todas as conversões usam esta base.",
    },
    {
      name: "valuation_method",
      label: "Custeio do estoque",
      type: "select",
      required: true,
      options: [{ value: "fifo", label: "Primeiros lotes comprados são vendidos primeiro (FIFO)" }],
      value: "fifo",
    },
    {
      name: "minimum_stock",
      label: "Estoque mínimo na unidade-base",
      type: "number",
      required: true,
      value: product?.minimum_stock ?? 0,
    },
    {
      name: "minimum_margin",
      label: "Margem mínima desejada (%)",
      type: "number",
      required: true,
      value: product?.minimum_margin ?? 0,
    },
    {
      name: "maximum_discount",
      label: "Desconto de referência (%)",
      type: "number",
      required: true,
      value: product?.maximum_discount ?? 100,
    },
    {
      name: "image_url",
      label: "Endereço HTTPS da imagem autorizada",
      nullable: true,
      value: product?.image_url ?? "",
    },
    {
      name: "enforce_discount",
      label: "Bloquear desconto acima do limite",
      type: "checkbox",
      value: product?.enforce_discount,
    },
    {
      name: "active",
      label: "Liberar vendas deste produto",
      type: "checkbox",
      value: product?.active ?? false,
    },
    {
      name: "published",
      label: "Mostrar no catálogo público",
      type: "checkbox",
      value: product?.published,
    },
    {
      name: "public_price",
      label: "Mostrar preços padrão no site",
      type: "checkbox",
      value: product?.public_price,
    },
  ];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await command("product", {
        ...readFields(event.currentTarget, fields),
        ...(product ? { id: product.id } : {}),
        units: units.map((unit) => ({
          name: unit.name.trim(),
          factor: Number(unit.factor),
          price: unit.price === "" ? null : Number(unit.price),
        })),
      });
      close();
    } catch {
      /* Shared error status. */
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel space" onSubmit={submit}>
      <h2>{product ? "Editar produto" : "Cadastrar produto"}</h2>
      <Fields fields={fields} />
      <h3>Unidades de venda</h3>
      <p className="hint">
        Informe quanto cada unidade representa na base. Para saco e meio saco, confirme o peso com a
        empresa. Conversões com histórico são preservadas.
      </p>
      {units.map((unit, index) => (
        <div className="line" key={index}>
          <label>
            Unidade
            <input
              required
              value={unit.name}
              onChange={(e) =>
                setUnits((list) =>
                  list.map((u, i) => (i === index ? { ...u, name: e.target.value } : u)),
                )
              }
            />
          </label>
          <label>
            Quantidade na base
            <input
              required
              type="number"
              min="0.000001"
              step="0.000001"
              value={unit.factor}
              onChange={(e) =>
                setUnits((list) =>
                  list.map((u, i) => (i === index ? { ...u, factor: e.target.value } : u)),
                )
              }
            />
          </label>
          <label>
            Preço de venda
            <input
              type="number"
              min="0"
              step="0.01"
              value={unit.price}
              onChange={(e) =>
                setUnits((list) =>
                  list.map((u, i) => (i === index ? { ...u, price: e.target.value } : u)),
                )
              }
            />
          </label>
          <small>
            {unit.price === "" ? "Preço ainda não configurado" : "Preço padrão desta unidade"}
          </small>
        </div>
      ))}
      <div className="actions">
        <button
          type="button"
          className="action"
          onClick={() => setUnits((list) => [...list, { name: "", factor: "", price: "" }])}
        >
          Adicionar unidade
        </button>
        <button className="action primary" disabled={busy}>
          {busy ? "Salvando…" : "Salvar produto"}
        </button>
        <button type="button" className="action" onClick={close}>
          Fechar
        </button>
      </div>
    </form>
  );
}

export const paymentOptions = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix confirmado" },
  { value: "cartao", label: "Cartão aprovado" },
];
export const productUnits = (state: CommercialState) =>
  state.products.flatMap((product) =>
    product.units.map((unit) => ({ value: unit.id, label: `${product.name} · ${unit.name}` })),
  );
export function productForUnit(state: CommercialState, unit: unknown) {
  const product = state.products.find((item) =>
    item.units.some((itemUnit) => itemUnit.id === unit),
  );
  if (!product) throw new Error("Selecione uma unidade cadastrada.");
  return product.id;
}
