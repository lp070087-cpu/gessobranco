import { useEffect, useState, type FormEvent } from "react";
import { Car, Plus, Trash2 } from "lucide-react";
import { commercialFetch } from "@/lib/commercial-client";

export type Vehicle = { id: string; plate: string; model: string; year: number };
export type ExpenseSetupData = {
  categories: string[];
  vehicles: Vehicle[];
  projects: { id: string; title: string; status: string }[];
};

let setupCache: ExpenseSetupData | null = null;

/** Categorias de gasto, carros da empresa e serviços abertos, guardados entre as telas. */
export function useExpenseSetup() {
  const [setup, setSetup] = useState<ExpenseSetupData | null>(setupCache);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<ExpenseSetupData>("admin/expense-setup", undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setupCache = value;
        setSetup(value);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [revision]);
  return { setup, error, refresh: () => setRevision((value) => value + 1) };
}

export const plateText = (plate: string) =>
  /^[A-Z]{3}[0-9]{4}$/.test(plate) ? plate.slice(0, 3) + "-" + plate.slice(3) : plate;
export const vehicleLabel = (vehicle: Vehicle) =>
  `${vehicle.model} ${vehicle.year} · ${plateText(vehicle.plate)}`;
/** Categorias em que faz sentido escolher o carro. */
export const usesVehicle = (category: string) =>
  /combust|gasolina|carro|ve[ií]culo|manuten|ped[aá]gio|estacion|oficina|pneu/i.test(category);

/** Botão + formulário curto para criar mais uma categoria de gasto. */
export function CategoryAdder({ added }: { added: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (busy || name.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const result = await commercialFetch<{ name: string }>("admin/expense-categories", {
        name: name.trim(),
      });
      setName("");
      setOpen(false);
      added(result.name);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button type="button" className="action" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" /> Nova categoria
      </button>
    );
  return (
    <div className="inline-adder">
      <input
        autoFocus
        placeholder="Ex.: Manutenção do carro"
        maxLength={60}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        aria-label="Nome da nova categoria"
      />
      <button
        type="button"
        className="action primary"
        disabled={busy || name.trim().length < 2}
        onClick={() => void save()}
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
      <button type="button" className="action" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Cadastro dos carros da empresa: placa, modelo e ano. */
export function VehicleManager({
  vehicles,
  changed,
}: {
  vehicles: Vehicle[];
  changed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await commercialFetch("admin/vehicles", {
        plate: String(data.get("plate") ?? ""),
        model: String(data.get("model") ?? ""),
        year: Number(data.get("year")),
      });
      form.reset();
      changed();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar o carro.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await commercialFetch("admin/vehicles/remove", { id });
      changed();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível remover.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space">
      <h2>Carros da empresa</h2>
      <p className="hint">
        Cadastre o carro uma vez. Depois, ao lançar gasolina ou manutenção, é só escolher qual carro
        foi.
      </p>
      {vehicles.length > 0 && (
        <div className="vehicle-cards">
          {vehicles.map((vehicle) => (
            <div key={vehicle.id} className="vehicle-card">
              <Car className="size-5" aria-hidden="true" />
              <span>
                <strong>{vehicle.model}</strong>
                <small>
                  {vehicle.year} · {plateText(vehicle.plate)}
                </small>
              </span>
              <button
                type="button"
                className="icon-action"
                aria-label={`Remover ${vehicle.model}`}
                disabled={busy}
                onClick={() => void remove(vehicle.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={(event) => void add(event)} className="space">
        <fieldset disabled={busy}>
          <div className="fields vehicle-fields">
            <label>
              Placa{" "}
              <input
                name="plate"
                required
                maxLength={8}
                placeholder="ABC1D23"
                autoCapitalize="characters"
              />
            </label>
            <label>
              Modelo{" "}
              <input name="model" required minLength={2} maxLength={80} placeholder="Fiat Strada" />
            </label>
            <label>
              Ano{" "}
              <input
                name="year"
                type="number"
                inputMode="numeric"
                required
                min={1950}
                max={new Date().getFullYear() + 1}
                placeholder="2020"
              />
            </label>
          </div>
          <button className="action primary">Cadastrar carro</button>
        </fieldset>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
