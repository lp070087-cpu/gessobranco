import { useState, type FormEvent, type ReactNode } from "react";
import { moneyBR, type CommercialState, type Product } from "@/lib/commercial-client";

export type Command = (kind: string, data: Record<string, unknown>) => Promise<{ id: string }>;
export type Field = {
  name: string;
  label: string;
  type?: "number" | "date" | "checkbox" | "select" | "text";
  options?: { value: string; label: string }[];
  list?: string;
  maxLength?: number;
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
              list={field.list}
              maxLength={field.maxLength}
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
  categories,
  command,
  close,
}: {
  product?: Product;
  categories: string[];
  command: Command;
  close: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [baseUnit, setBaseUnit] = useState(product?.base_unit ?? "");
  const [cost, setCost] = useState(String(product?.purchase_reference?.cost ?? ""));
  const [costQuantity, setCostQuantity] = useState(
    String(product?.purchase_reference?.quantity ?? 1),
  );
  const baseSaleUnit =
    product?.units.find((unit) => unit.name === product.base_unit && Number(unit.factor) === 1) ??
    product?.units.find((unit) => Number(unit.factor) === 1);
  const [units, setUnits] = useState<
    { id: string | null; name: string; factor: string; price: string }[]
  >(
    product?.units
      .filter((unit) => unit.id !== baseSaleUnit?.id)
      .map((unit) => ({
        id: unit.id,
        name: unit.name,
        factor: String(unit.factor),
        price: unit.price ?? "",
      })) ?? [],
  );
  const stockUnit = baseUnit.trim();
  const referencePerUnit =
    cost !== "" && Number(costQuantity) > 0 ? Number(cost) / Number(costQuantity) : null;
  const fields: Field[] = [
    {
      name: "name",
      label: "Nome do produto",
      required: true,
      value: product?.name,
      maxLength: 160,
    },
    {
      name: "category",
      label: "Categoria do produto",
      value: product?.category,
      list: "product-categories",
    },
    { name: "description", label: "Descrição", value: product?.description },
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
    if (busy) return;
    setError("");
    const data = new FormData(event.currentTarget);
    const rawPrice = String(data.get("base_price") ?? "");
    const saleUnits = [
      {
        name: baseSaleUnit?.name ?? stockUnit,
        factor: 1,
        price: rawPrice === "" ? null : Number(rawPrice),
      },
      ...units.map((unit) => ({
        name: unit.name.trim(),
        factor: Number(unit.factor),
        price: unit.price === "" ? null : Number(unit.price),
      })),
    ];
    if (stockUnit.length === 0 || String(data.get("name") ?? "").trim().length < 2) {
      setError("Informe o nome do produto e a unidade do estoque.");
      return;
    }
    if (
      saleUnits.some((unit) => !unit.name) ||
      new Set(saleUnits.map((unit) => unit.name)).size !== saleUnits.length
    ) {
      setError("Preencha os nomes das unidades de venda e use um nome diferente em cada uma.");
      return;
    }
    setBusy(true);
    try {
      await command("product", {
        ...readFields(event.currentTarget, fields),
        ...(product ? { id: product.id } : {}),
        base_unit: stockUnit,
        units: saleUnits,
        purchase_reference:
          cost === "" ? null : { cost: Number(cost), quantity: Number(costQuantity) },
      });
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar o produto.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel space" onSubmit={submit}>
      <h2>{product ? "Editar produto" : "Cadastrar produto"}</h2>
      <Fields fields={fields.slice(0, 3)} />
      <datalist id="product-categories">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <div className="fields">
        <label>
          Unidade do estoque
          <input
            name="base_unit"
            list="stock-units"
            required
            maxLength={40}
            value={baseUnit}
            onChange={(event) => setBaseUnit(event.target.value)}
            placeholder="kg ou unidade"
          />
          <datalist id="stock-units">
            <option value="kg" />
            <option value="unidade" />
            <option value="metro" />
          </datalist>
          <small>Use kg para gesso em pó e unidade para placas.</small>
        </label>
        <label>
          Preço de venda por {stockUnit || "unidade do estoque"} (R$)
          <input
            name="base_price"
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            required={!product}
            defaultValue={baseSaleUnit?.price ?? ""}
          />
        </label>
        <label>
          Valor pago na compra (R$)
          <input
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
          <small>Opcional. Informe quanto paga na quantidade ao lado.</small>
        </label>
        <label>
          Quantidade comprada em {stockUnit || "unidades do estoque"}
          <input
            type="number"
            min="0.000001"
            max="10000000"
            step="0.000001"
            required={cost !== ""}
            value={costQuantity}
            onChange={(event) => setCostQuantity(event.target.value)}
          />
        </label>
      </div>
      {referencePerUnit !== null && Number.isFinite(referencePerUnit) && (
        <p className="hint">
          Custo de referência por {stockUnit || "unidade"}:{" "}
          <strong>{moneyBR(referencePerUnit)}</strong>.
        </p>
      )}
      <p className="hint">
        O custo de referência ajuda a definir preços. Registre a entrada e o custo real em Compras
        para atualizar o estoque.
      </p>
      <h3>Outras formas de venda</h3>
      <p className="hint">
        Para vender um saco de 40 kg, adicione “Saco” com quantidade 40 e informe o preço do saco.
        Todas as unidades usam o mesmo saldo.
      </p>
      {units.map((unit, index) => (
        <div className="line" key={index}>
          <label>
            Unidade
            <input
              required
              maxLength={40}
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
              max="10000000"
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
              max="1000000000"
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
          {!unit.id && (
            <button
              type="button"
              className="action"
              onClick={() => setUnits((list) => list.filter((_, i) => i !== index))}
            >
              Remover unidade
            </button>
          )}
        </div>
      ))}
      <div className="space">
        <Fields fields={fields.slice(3)} />
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          type="button"
          className="action"
          disabled={units.length >= 19}
          onClick={() =>
            setUnits((list) => [...list, { id: null, name: "", factor: "", price: "" }])
          }
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
