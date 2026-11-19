import { useState, type FormEvent } from "react";
import { commercialFetch, quantityBR } from "@/lib/commercial-client";

const propertyTypes = {
  apartment: "Apartamento",
  house: "Casa",
  commercial: "Imóvel comercial",
  other: "Outro imóvel",
};

type Company = { name: string; trade_name: string };
type Worksite = {
  id: string;
  name: string;
  property_type: keyof typeof propertyTypes;
  address: string;
  unit: string;
  area_m2: string | number;
  notes: string;
};
type EligibleBusiness = {
  eligible: true;
  document: string;
  company: Company | null;
  worksites: Worksite[];
};
export type BusinessData = EligibleBusiness | { eligible: false };

const value = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

export function CustomerBusiness({ data, reload }: { data: EligibleBusiness; reload: () => void }) {
  const [company, setCompany] = useState(data.company);
  const [site, setSite] = useState<Worksite | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const cnpj = data.document.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setNotice("");
    try {
      const saved = await commercialFetch<Company>(
        "portal/business",
        { name: value(form, "name"), trade_name: value(form, "trade_name") },
        undefined,
        "PATCH",
      );
      setCompany(saved);
      setNotice("Cadastro da empresa salvo.");
      reload();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function saveSite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    setNotice("");
    try {
      await commercialFetch<Worksite>(
        site ? `portal/worksites/${site.id}` : "portal/worksites",
        {
          name: value(form, "name"),
          property_type: value(form, "property_type"),
          address: value(form, "address"),
          unit: value(form, "unit"),
          area_m2: Number(value(form, "area_m2").replace(",", ".")),
          notes: value(form, "notes"),
        },
        undefined,
        site ? "PATCH" : "POST",
      );
      setAdding(false);
      setSite(null);
      setNotice("Obra salva.");
      reload();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section className="panel">
        <h2>Minha empresa</h2>
        <p className="hint">Cadastro vinculado ao CNPJ {cnpj}.</p>
        <form onSubmit={saveCompany} className="commercial space">
          <fieldset disabled={pending} className="form-grid">
            <label>
              Razão social
              <input
                name="name"
                required
                minLength={2}
                maxLength={160}
                defaultValue={company?.name}
              />
            </label>
            <label>
              Nome fantasia <span className="hint">(opcional)</span>
              <input name="trade_name" maxLength={160} defaultValue={company?.trade_name} />
            </label>
            <div>
              <button className="action primary">Salvar empresa</button>
            </div>
          </fieldset>
        </form>
      </section>
      <section className="panel space">
        <h2>Minhas obras</h2>
        {!company ? (
          <p className="hint">Salve o cadastro da empresa para adicionar suas obras.</p>
        ) : (
          <>
            {!data.worksites.length && <p className="hint">Nenhuma obra cadastrada.</p>}
            {data.worksites.map((entry) => (
              <article key={entry.id} className="panel space">
                <h3>{entry.name}</h3>
                <p>
                  {propertyTypes[entry.property_type]} · {quantityBR(Number(entry.area_m2))} m²
                </p>
                <p>
                  {entry.address}
                  {entry.unit && ` · ${entry.unit}`}
                </p>
                {entry.notes && <p>{entry.notes}</p>}
                <button
                  type="button"
                  className="action space"
                  disabled={pending}
                  onClick={() => {
                    setSite(entry);
                    setAdding(true);
                  }}
                >
                  Editar obra
                </button>
              </article>
            ))}
            {adding ? (
              <WorksiteForm
                key={site?.id ?? "new"}
                site={site}
                pending={pending}
                save={saveSite}
                cancel={() => {
                  setAdding(false);
                  setSite(null);
                }}
              />
            ) : (
              <button
                type="button"
                className="action primary space"
                disabled={pending}
                onClick={() => setAdding(true)}
              >
                Cadastrar obra
              </button>
            )}
          </>
        )}
        {error && (
          <p className="notice error space" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice space" role="status">
            {notice}
          </p>
        )}
      </section>
    </>
  );
}

function WorksiteForm({
  site,
  pending,
  save,
  cancel,
}: {
  site: Worksite | null;
  pending: boolean;
  save: (event: FormEvent<HTMLFormElement>) => void;
  cancel: () => void;
}) {
  const [type, setType] = useState<Worksite["property_type"]>(site?.property_type ?? "apartment");
  return (
    <form onSubmit={save} className="commercial space">
      <h3>{site ? "Editar obra" : "Nova obra"}</h3>
      <fieldset disabled={pending} className="form-grid">
        <label>
          Nome da obra
          <input
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={site?.name}
            placeholder="Ex. Reforma do apartamento"
          />
        </label>
        <label>
          Tipo de imóvel
          <select
            name="property_type"
            value={type}
            onChange={(event) => setType(event.target.value as Worksite["property_type"])}
          >
            {Object.entries(propertyTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Endereço da obra
          <input
            name="address"
            required
            minLength={5}
            maxLength={300}
            defaultValue={site?.address}
            placeholder="Rua, número, bairro, cidade e UF"
          />
        </label>
        <label>
          {type === "apartment" ? "Apartamento e bloco" : "Complemento (opcional)"}
          <input
            name="unit"
            maxLength={80}
            required={type === "apartment"}
            defaultValue={site?.unit}
            placeholder={type === "apartment" ? "Ex. 302, bloco B" : undefined}
          />
        </label>
        <label>
          Área do serviço em m²
          <input
            name="area_m2"
            type="number"
            required
            min="0.01"
            max="1000000"
            step="0.01"
            defaultValue={site?.area_m2}
            placeholder="Ex. 75,50"
          />
        </label>
        <label>
          Serviço previsto (opcional)
          <textarea
            name="notes"
            maxLength={2000}
            defaultValue={site?.notes}
            placeholder="Ex. Forro de gesso na sala e nos quartos"
          />
        </label>
        <div>
          <button className="action primary">Salvar obra</button>{" "}
          <button type="button" className="action" onClick={cancel}>
            Cancelar
          </button>
        </div>
      </fieldset>
    </form>
  );
}
