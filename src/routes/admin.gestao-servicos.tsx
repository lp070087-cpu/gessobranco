import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CompanySession } from "@/components/preciso/CompanySession";
import { CompanyRequests } from "@/components/preciso/CompanyRequests";
import { SERVICES } from "@/components/preciso/services";
import { commercialFetch, moneyBR } from "@/lib/commercial-client";
import {
  hasCompanyPermission,
  type CompanyActor,
  type CompanyPermission,
} from "@/lib/company-permissions";

const sections = [
  ["Orçamentos e clientes", "service_requests"],
  ["Catálogo e cálculo", "service_catalogue"],
  ["Agendamentos", "service_agenda"],
  ["Serviços em andamento", "service_projects"],
] as const;
const canEnter = (user: CompanyActor) =>
  sections.some(([, permission]) => hasCompanyPermission(user, permission));
export const Route = createFileRoute("/admin/gestao-servicos")({
  head: () => ({ meta: [{ title: "Gestão de Serviços — Ouro Branco" }] }),
  component: () => (
    <CompanySession title="Gestão de Serviços" allowed={canEnter}>
      {(user) => <ServiceArea user={user} />}
    </CompanySession>
  ),
});

function ServiceArea({ user }: { user: CompanyActor }) {
  const visible = sections.filter(([, permission]) => hasCompanyPermission(user, permission));
  const [selected, setSelected] = useState<CompanyPermission>(visible[0][1]);
  const [mobile, setMobile] = useState(false);
  return (
    <div className="company-layout">
      <aside className="company-menu">
        <button
          type="button"
          className="action company-menu-toggle"
          aria-expanded={mobile}
          aria-controls="service-menu"
          onClick={() => setMobile(!mobile)}
        >
          Menu de serviços
        </button>
        <nav
          id="service-menu"
          className={mobile ? "is-open" : undefined}
          aria-label="Gestão de Serviços"
        >
          {visible.map(([label, permission]) => (
            <button
              key={permission}
              aria-current={selected === permission ? "page" : undefined}
              onClick={() => {
                setSelected(permission);
                setMobile(false);
              }}
            >
              {label}
            </button>
          ))}
          {user.role === "admin" && (
            <Link to="/admin/comercial" className="action">
              Ir para Gestão da Loja
            </Link>
          )}
          {hasCompanyPermission(user, "finance_cfo") && (
            <Link to="/admin/cfo" className="action">
              CFO financeiro
            </Link>
          )}
        </nav>
      </aside>
      <div className="company-content">
        {selected === "service_requests" && (
          <CompanyRequests
            kind="service"
            canStartProject={hasCompanyPermission(user, "service_projects")}
          />
        )}
        {selected === "service_catalogue" && <Catalogue />}
        {selected === "service_agenda" && <Agenda />}
        {selected === "service_projects" && <Projects />}
      </div>
    </div>
  );
}

type Service = {
  id?: string;
  key: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  pricePerM2: string | number;
  billingUnit: string;
  imageUrl: string | null;
  isActive: boolean;
  available: boolean;
  availabilityNotes: string;
  sortOrder: number;
};
const units = {
  m2: "Metro quadrado",
  linear: "Metro linear",
  unit: "Unidade",
  day: "Diária",
  project: "Projeto",
  quote: "Sob orçamento",
};
const blank: Service = {
  key: "",
  name: "",
  shortName: "",
  category: "",
  description: "",
  pricePerM2: 0,
  billingUnit: "quote",
  imageUrl: null,
  isActive: true,
  available: true,
  availabilityNotes: "",
  sortOrder: 0,
};

function useRows<T>(path: string) {
  const [rows, setRows] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<T>(path, undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setRows(value);
          setError("");
        }
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { rows, error, refresh: () => setRevision((value) => value + 1) };
}

function OperationForm({
  children,
  submit,
  label,
}: {
  children: ReactNode;
  submit: (data: FormData) => Promise<unknown>;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await submit(data);
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="space" onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy}>
        {children}
        <button className="action primary">{busy ? "Salvando…" : label}</button>
      </fieldset>
      {error && (
        <p className="notice error space" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="hint" role="status">
          Alteração salva.
        </p>
      )}
    </form>
  );
}
const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

function Catalogue() {
  const { rows, error, refresh } = useRows<Service[]>("admin/services");
  const rules = useRows<{ visit_quantity: number }>("admin/service-rules");
  const [edit, setEdit] = useState<Service | null>(null);
  return (
    <>
      <section className="panel">
        <h2>Catálogo de serviços</h2>
        <button type="button" className="action primary" onClick={() => setEdit(blank)}>
          Cadastrar serviço
        </button>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!rows && !error && <p role="status">Carregando catálogo…</p>}
        {rows?.map((service) => (
          <div className="actions" key={service.id}>
            <span>
              {service.name} ·{" "}
              {service.billingUnit === "quote" ? "Sob orçamento" : moneyBR(service.pricePerM2)} ·{" "}
              {service.isActive && service.available ? "Disponível" : "Indisponível"}
            </span>
            <button type="button" className="action" onClick={() => setEdit(service)}>
              Editar
            </button>
          </div>
        ))}
        {rows && (
          <details>
            <summary>Serviços já apresentados no site</summary>
            {SERVICES.filter(
              (reference) => !rows.some((service) => service.key === reference.key),
            ).map((reference) => (
              <div className="actions" key={reference.key}>
                <span>{reference.name}</span>
                <button
                  type="button"
                  className="action"
                  onClick={() =>
                    setEdit({
                      ...blank,
                      key: reference.key,
                      name: reference.name,
                      shortName: reference.short,
                      description: reference.description,
                      category: reference.category,
                    })
                  }
                >
                  Cadastrar no catálogo
                </button>
              </div>
            ))}
          </details>
        )}
      </section>
      {edit && (
        <section className="panel space">
          <h2>{edit.id ? "Editar serviço" : "Cadastrar serviço"}</h2>
          <OperationForm
            key={edit.id ?? edit.key}
            label="Salvar serviço"
            submit={async (form) => {
              await commercialFetch(
                edit.id ? `services/${edit.id}` : "services",
                {
                  key: value(form, "key"),
                  name: value(form, "name"),
                  short_name: value(form, "short"),
                  category: value(form, "category"),
                  description: value(form, "description"),
                  price_per_m2: Number(value(form, "price")),
                  billing_unit: value(form, "unit"),
                  image_url: value(form, "image") || null,
                  is_active: form.has("active"),
                  available: form.has("available"),
                  availability_notes: value(form, "notes"),
                  sort_order: Number(value(form, "order")),
                },
                undefined,
                edit.id ? "PATCH" : "POST",
              );
              setEdit(null);
              refresh();
            }}
          >
            <div className="fields">
              <label>
                Nome
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={160}
                  defaultValue={edit.name}
                />
              </label>
              <label>
                Identificador (letras minúsculas, números e hífen)
                <input name="key" required minLength={2} maxLength={80} defaultValue={edit.key} />
              </label>
              <label>
                Nome curto
                <input name="short" maxLength={80} defaultValue={edit.shortName} />
              </label>
              <label>
                Categoria
                <input name="category" maxLength={100} defaultValue={edit.category} />
              </label>
              <label>
                Unidade de medida
                <select name="unit" defaultValue={edit.billingUnit}>
                  {Object.entries(units).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Preço por unidade
                <input
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={edit.pricePerM2}
                />
              </label>
              <label>
                Ordem
                <input
                  name="order"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={edit.sortOrder}
                />
              </label>
              <label>
                Imagem (HTTPS)
                <input name="image" type="url" defaultValue={edit.imageUrl ?? ""} />
              </label>
              <label className="full">
                Descrição
                <textarea
                  name="description"
                  rows={3}
                  maxLength={10000}
                  defaultValue={edit.description}
                />
              </label>
              <label className="full">
                Condições, medidas ou observações
                <textarea name="notes" maxLength={2000} defaultValue={edit.availabilityNotes} />
              </label>
              <label className="check">
                <input type="checkbox" name="active" defaultChecked={edit.isActive} />
                Ativo
              </label>
              <label className="check">
                <input type="checkbox" name="available" defaultChecked={edit.available} />
                Disponível
              </label>
            </div>
          </OperationForm>
          <button type="button" className="action space" onClick={() => setEdit(null)}>
            Fechar edição
          </button>
        </section>
      )}
      <section className="panel space">
        <h2>Regras do orçamento</h2>
        <p className="hint">
          O cálculo usa o preço e a unidade de cada serviço. Projetos fora do escopo residencial ou
          com itens sob orçamento continuam sujeitos a visita.
        </p>
        {rules.error && (
          <p className="notice error" role="alert">
            {rules.error}
          </p>
        )}
        {rules.rows && (
          <OperationForm
            key={rules.rows.visit_quantity}
            label="Salvar regra"
            submit={async (form) => {
              await commercialFetch(
                "admin/service-rules",
                { visit_quantity: Number(value(form, "quantity")) },
                undefined,
                "PATCH",
              );
              rules.refresh();
            }}
          >
            <label>
              Acima de qual quantidade total solicitar visita?
              <input
                name="quantity"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={rules.rows.visit_quantity}
              />
            </label>
          </OperationForm>
        )}
      </section>
    </>
  );
}

const appointments = {
  requested: "Solicitado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const projectStatuses = {
  planned: "Planejado",
  in_progress: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const time = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
function Agenda() {
  const { rows, error, refresh } = useRows<
    {
      id: string;
      full_name: string;
      email: string;
      kind: string;
      address: string;
      notes: string;
      status: string;
      scheduled_at: string;
    }[]
  >("appointments");
  return (
    <section className="panel">
      <h2>Agendamentos e visitas</h2>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Carregando agenda…</p>}
      {rows?.length === 0 && <p className="hint">Nenhum agendamento recebido.</p>}
      {rows?.map((item) => (
        <details key={item.id}>
          <summary>
            {item.full_name} · {time.format(new Date(item.scheduled_at))} ·{" "}
            {appointments[item.status as keyof typeof appointments]}
          </summary>
          <p>
            {item.email} · {item.address}
          </p>
          {item.notes && <p className="request-notes">{item.notes}</p>}
          <OperationForm
            label="Salvar agendamento"
            submit={async (form) => {
              const datetime = value(form, "date");
              await commercialFetch(
                `appointments/${item.id}`,
                {
                  status: value(form, "status"),
                  ...(datetime ? { scheduled_at: datetime + "-03:00" } : {}),
                },
                undefined,
                "PATCH",
              );
              refresh();
            }}
          >
            <label>
              Status
              <select name="status" defaultValue={item.status}>
                {Object.entries(appointments).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Novo horário, se necessário (Brasília)
              <input name="date" type="datetime-local" />
            </label>
          </OperationForm>
        </details>
      ))}
    </section>
  );
}
function Projects() {
  const { rows, error, refresh } = useRows<
    {
      id: string;
      title: string;
      status: string;
      progress: number;
      responsibleId: string | null;
      startsOn?: string;
      endsOn?: string;
    }[]
  >("projects");
  return (
    <section className="panel">
      <h2>Serviços em andamento</h2>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!rows && !error && <p role="status">Carregando serviços…</p>}
      {rows?.length === 0 && (
        <p className="hint">
          Nenhum serviço em andamento. Abra uma obra a partir de um orçamento aprovado.
        </p>
      )}
      {rows?.map((item) => (
        <details key={item.id}>
          <summary>
            {item.title} · {item.progress}%
          </summary>
          <OperationForm
            label="Salvar andamento"
            submit={async (form) => {
              await commercialFetch(
                `projects/${item.id}`,
                {
                  status: value(form, "status"),
                  progress: Number(value(form, "progress")),
                  responsible_id: item.responsibleId,
                  starts_on: value(form, "start") || null,
                  ends_on: value(form, "end") || null,
                },
                undefined,
                "PATCH",
              );
              refresh();
            }}
          >
            <label>
              Status
              <select name="status" defaultValue={item.status}>
                {Object.entries(projectStatuses).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Progresso (%)
              <input
                name="progress"
                type="number"
                min={0}
                max={100}
                required
                defaultValue={item.progress}
              />
            </label>
            <label>
              Início
              <input name="start" type="date" defaultValue={item.startsOn} />
            </label>
            <label>
              Fim
              <input name="end" type="date" defaultValue={item.endsOn} />
            </label>
          </OperationForm>
        </details>
      ))}
    </section>
  );
}
