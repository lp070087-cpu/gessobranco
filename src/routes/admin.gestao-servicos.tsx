import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AccountLayout, ManagementMenu } from "@/components/preciso/AccountMenu";
import { CompanySession } from "@/components/preciso/CompanySession";
import { CompanyRequests } from "@/components/preciso/CompanyRequests";
import { SERVICES } from "@/components/preciso/services";
import { commercialFetch, moneyBR } from "@/lib/commercial-client";
import { photoAccept, preparePhoto } from "@/lib/photo-upload";
import {
  hasCompanyPermission,
  type CompanyActor,
  type CompanyPermission,
} from "@/lib/company-permissions";

const sections = [
  ["Orçamentos e clientes", "service_requests", undefined],
  ["Catálogo e cálculo", "service_catalogue", "catalogo"],
  ["Agendamentos", "service_agenda", "agenda"],
  ["Serviços em andamento", "service_projects", "andamento"],
] as const;
type ServiceSlug = "catalogo" | "agenda" | "andamento";
const canEnter = (user: CompanyActor) =>
  sections.some(([, permission]) => hasCompanyPermission(user, permission));
export const Route = createFileRoute("/admin/gestao-servicos")({
  validateSearch: (search: Record<string, unknown>): { secao?: ServiceSlug } =>
    search.secao === "catalogo" || search.secao === "agenda" || search.secao === "andamento"
      ? { secao: search.secao }
      : {},
  head: () => ({ meta: [{ title: "Gestão de Serviços — Ouro Branco" }] }),
  component: () => (
    <CompanySession title="Gestão de Serviços" allowed={canEnter}>
      {(user) => <ServiceArea user={user} />}
    </CompanySession>
  ),
});

function ServiceArea({ user }: { user: CompanyActor }) {
  const visible = sections.filter(([, permission]) => hasCompanyPermission(user, permission));
  const requested = Route.useSearch().secao;
  const navigate = useNavigate();
  const match = visible.find(([, , slug]) => slug === requested);
  const selected: CompanyPermission = (match ?? visible[0])[1];
  useEffect(() => {
    if (requested && !match) void navigate({ to: "/admin/gestao-servicos", search: {} });
  }, [requested, match, navigate]);
  return (
    <AccountLayout label="Menu de serviços" menu={<ManagementMenu user={user} />}>
      {selected === "service_requests" && (
        <CompanyRequests
          kind="service"
          canStartProject={hasCompanyPermission(user, "service_projects")}
        />
      )}
      {selected === "service_catalogue" && <Catalogue />}
      {selected === "service_agenda" && <Agenda />}
      {selected === "service_projects" && <Projects />}
    </AccountLayout>
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
const unitShort = {
  m2: "m²",
  linear: "metro",
  unit: "unidade",
  day: "diária",
  project: "projeto",
  quote: "orçamento",
};
const serviceExamples: (Partial<Service> & { name: string; hint: string })[] = [
  {
    name: "Forro de gesso liso",
    category: "Forro",
    billingUnit: "m2",
    pricePerM2: 45,
    hint: "Cobrado pela área do teto",
  },
  {
    name: "Sanca aberta com luz",
    category: "Sanca",
    billingUnit: "linear",
    pricePerM2: 60,
    hint: "Cobrado por metro de sanca",
  },
  {
    name: "Parede de drywall",
    category: "Parede e divisória",
    billingUnit: "m2",
    pricePerM2: 95,
    hint: "Cobrado pela área da parede",
  },
  {
    name: "Moldura e roda-teto",
    category: "Acabamento",
    billingUnit: "linear",
    pricePerM2: 25,
    hint: "Cobrado por metro de moldura",
  },
];
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

// Listas guardadas entre as telas, para a troca de aba não mostrar carregamento.
const rowsCache = new Map<string, unknown>();
function useRows<T>(path: string) {
  const [rows, setRows] = useState<T | null>((rowsCache.get(path) as T | undefined) ?? null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void commercialFetch<T>(path, undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          rowsCache.set(path, value);
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

function ServiceEditor({
  edit,
  categories,
  close,
  saved,
}: {
  edit: Service;
  categories: string[];
  close: () => void;
  saved: () => void;
}) {
  const [photo, setPhoto] = useState("");
  const [keepImage, setKeepImage] = useState(true);
  const [photoError, setPhotoError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [unit, setUnit] = useState(edit.billingUnit);
  async function choose(file?: File) {
    if (!file) return;
    setPreparing(true);
    setPhotoError("");
    try {
      setPhoto(await preparePhoto(file));
    } catch (failure) {
      setPhotoError(failure instanceof Error ? failure.message : "Não foi possível abrir a foto.");
    } finally {
      setPreparing(false);
    }
  }
  return (
    <section className="panel space" id="editor-servico">
      <h2>{edit.id ? "Editar serviço" : "Cadastrar serviço"}</h2>
      <OperationForm
        label="Salvar serviço"
        submit={async (form) => {
          if (preparing || photoError) throw new Error("Confira a imagem antes de salvar.");
          const name = value(form, "name");
          const slug = name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80)
            .replace(/-$/, "");
          await commercialFetch(
            edit.id ? `services/${edit.id}` : "services",
            {
              key: value(form, "key") || slug || crypto.randomUUID(),
              name,
              short_name: value(form, "short") || name.slice(0, 80),
              category: value(form, "category"),
              description: value(form, "description"),
              price_per_m2:
                unit === "quote" ? Number(edit.pricePerM2) : Number(value(form, "price")),
              billing_unit: unit,
              image_url: photo ? null : value(form, "image") || null,
              ...(photo ? { image_upload: photo } : {}),
              keep_image: keepImage && !value(form, "image"),
              is_active: form.has("active"),
              available: form.has("available"),
              availability_notes: value(form, "notes"),
              sort_order: Number(value(form, "order")),
            },
            undefined,
            edit.id ? "PATCH" : "POST",
          );
          saved();
        }}
      >
        <div className="ouro-form-group">
          <h3>Informações do serviço</h3>
          <div className="fields">
            <label>
              Nome{" "}
              <input
                name="name"
                required
                minLength={2}
                maxLength={160}
                defaultValue={edit.name}
                placeholder="Ex. Forro de gesso"
              />
            </label>
            <label>
              Categoria{" "}
              <select name="category" required defaultValue={edit.category}>
                <option value="">Selecione uma categoria</option>
                {categories.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="full">
              Descrição no site{" "}
              <textarea
                name="description"
                rows={3}
                maxLength={10000}
                defaultValue={edit.description}
              />
            </label>
          </div>
        </div>
        <div className="ouro-form-group">
          <h3>Cobrança e atendimento</h3>
          <div className="fields">
            <label>
              Unidade de cobrança{" "}
              <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                {Object.entries(units).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {unit !== "quote" && (
              <label>
                Preço por unidade (R$){" "}
                <input
                  name="price"
                  type="number"
                  min="0"
                  max="100000000"
                  step="0.01"
                  required
                  defaultValue={edit.pricePerM2}
                />
              </label>
            )}
            <label className="full">
              Condições ou observações{" "}
              <textarea name="notes" maxLength={2000} defaultValue={edit.availabilityNotes} />
            </label>
          </div>
        </div>
        <div className="ouro-form-group">
          <h3>Foto no site</h3>
          {(photo || (keepImage && edit.imageUrl)) && (
            <img
              className="ouro-upload-preview"
              src={photo || edit.imageUrl || ""}
              alt="Prévia da foto do serviço"
            />
          )}
          <label>
            Selecionar imagem JPG ou PNG{" "}
            <input
              type="file"
              accept={photoAccept}
              disabled={preparing}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {(photo || edit.imageUrl || photoError) && (
            <button
              type="button"
              className="action"
              onClick={() => {
                setPhoto("");
                setPhotoError("");
                setKeepImage(false);
              }}
              disabled={preparing}
            >
              Limpar imagem
            </button>
          )}
          {preparing && (
            <p role="status" className="hint">
              Preparando imagem…
            </p>
          )}
          {photoError && (
            <p role="alert" className="notice error">
              {photoError}
            </p>
          )}
        </div>
        <details className="ouro-form-group">
          <summary>Opções avançadas de exibição</summary>
          <div className="fields">
            <label>
              Identificador{" "}
              <input
                name="key"
                pattern="[a-z0-9-]{2,80}"
                maxLength={80}
                defaultValue={edit.key}
                placeholder="Gerado a partir do nome"
              />
            </label>
            <label>
              Nome curto <input name="short" maxLength={80} defaultValue={edit.shortName} />
            </label>
            <label>
              Ordem{" "}
              <input
                name="order"
                type="number"
                min="0"
                max="2147483647"
                step="1"
                required
                defaultValue={edit.sortOrder}
              />
            </label>
            <label>
              Link HTTPS da foto <input name="image" type="url" placeholder="Opcional" />
            </label>
          </div>
        </details>
        <div className="actions">
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={edit.isActive} /> Exibir no site
          </label>
          <label className="check">
            <input type="checkbox" name="available" defaultChecked={edit.available} /> Disponível
            para orçamento
          </label>
          <button type="button" className="action" onClick={close}>
            Cancelar
          </button>
        </div>
      </OperationForm>
    </section>
  );
}

function Catalogue() {
  const { rows, error, refresh } = useRows<Service[]>("admin/services");
  const rules = useRows<{ visit_quantity: number }>("admin/service-rules");
  const [edit, setEdit] = useState<Service | null>(null);
  const categories = useRows<string[]>("admin/service-categories");
  const [newCategories, setNewCategories] = useState<string[]>([]);
  const names = [
    ...new Set([
      ...(categories.rows ?? []),
      ...newCategories,
      ...SERVICES.map((service) => service.category),
      ...(edit?.category ? [edit.category] : []),
    ]),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return (
    <>
      <section className="panel">
        <h2>Catálogo de serviços</h2>
        <div className="actions">
          <button
            type="button"
            className="action primary"
            onClick={() => {
              setEdit(blank);
              requestAnimationFrame(() =>
                document.getElementById("editor-servico")?.scrollIntoView({ block: "start" }),
              );
            }}
          >
            Cadastrar serviço
          </button>
          <a className="action" href="#categorias-servicos">
            Gerenciar categorias
          </a>
        </div>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {!rows && !error && <PanelSkeleton label="Carregando catálogo…" />}
        {rows && rows.length > 0 && (
          <div className="service-cards">
            {rows.map((service) => (
              <article className="service-card" key={service.id}>
                <strong>{service.name}</strong>
                <small>{service.category || "Sem categoria"}</small>
                <span className="price">
                  {service.billingUnit === "quote"
                    ? "Sob orçamento"
                    : `${moneyBR(service.pricePerM2)} / ${unitShort[service.billingUnit as keyof typeof unitShort] ?? service.billingUnit}`}
                </span>
                <small className={service.isActive && service.available ? undefined : "status-off"}>
                  {service.isActive && service.available
                    ? "Aparece no orçamento"
                    : "Escondido do site"}
                </small>
                <button type="button" className="action" onClick={() => setEdit(service)}>
                  Editar
                </button>
              </article>
            ))}
          </div>
        )}
        {rows?.length === 0 && (
          <p className="hint space">
            Nenhum serviço cadastrado ainda. Use um dos exemplos abaixo para começar.
          </p>
        )}
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
        <ServiceEditor
          key={edit.id ?? edit.key}
          edit={edit}
          categories={names}
          close={() => setEdit(null)}
          saved={() => {
            setEdit(null);
            refresh();
            categories.refresh();
          }}
        />
      )}
      <ExampleCards
        title="Exemplos de serviço"
        hint="Valores só de exemplo. Toque em “Usar este exemplo” para abrir o cadastro já preenchido e ajustar o preço da loja."
        cards={serviceExamples.map((example) => ({
          title: example.name,
          tag: example.category,
          value: `${moneyBR(Number(example.pricePerM2))} / ${unitShort[example.billingUnit as keyof typeof unitShort]}`,
          lines: [example.hint, "Aparece no orçamento do site"],
          action: {
            label: "Usar este exemplo",
            run: () => {
              setEdit({ ...blank, ...example, shortName: example.name });
              requestAnimationFrame(() =>
                document.getElementById("editor-servico")?.scrollIntoView({ block: "start" }),
              );
            },
          },
        }))}
      />
      <HowItWorks
        title="Como cadastrar"
        steps={[
          "Crie as categorias (ex.: Forro, Sanca, Parede) no quadro de categorias.",
          "Toque em “Cadastrar serviço”, dê um nome e escolha a categoria.",
          "Escolha como cobra: por m², por metro, por unidade ou sob orçamento.",
          "Coloque o valor. Esse valor aparece na estimativa do site.",
          "Marque “Exibir no site” e “Disponível para orçamento” e salve.",
        ]}
      />
      <section id="categorias-servicos" className="panel space">
        <h2>Categorias de serviço</h2>
        <p className="hint">
          Cadastre a categoria uma vez e selecione-a ao cadastrar ou editar um serviço.
        </p>
        {categories.error && (
          <p className="notice error" role="alert">
            {categories.error}
          </p>
        )}
        <OperationForm
          label="Cadastrar categoria"
          submit={async (form) => {
            const item = await commercialFetch<{ name: string }>("admin/service-categories", {
              name: value(form, "name"),
            });
            setNewCategories((current) => [...current, item.name]);
            categories.refresh();
          }}
        >
          <label>
            Nome da categoria{" "}
            <input
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Ex. Acabamento"
            />
          </label>
        </OperationForm>
        {names.length > 0 && (
          <ul className="ouro-chips" aria-label="Categorias cadastradas">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
      </section>
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
      photos?: number;
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
      {!rows && !error && <PanelSkeleton label="Carregando agenda…" />}
      {rows?.length === 0 && (
        <>
          <p className="hint">Nenhum agendamento recebido ainda.</p>
          <ExampleCards
            inline
            title="Como aparece uma visita"
            hint="Quando o cliente pede a visita pelo orçamento do site, ela chega aqui assim, com o resumo e as fotos. Você confirma o horário e muda o status."
            cards={[
              {
                title: "Maria Souza",
                tag: "Solicitado",
                value: "Sáb, 28/11 · 09:00",
                lines: [
                  "Rua das Flores, 120 · Recife",
                  "Quarto · Forro / teto",
                  "3 fotos do local",
                ],
              },
              {
                title: "José Lima",
                tag: "Confirmado",
                value: "Seg, 30/11 · 14:00",
                lines: ["Casa completa · 6 cômodos", "Sanca e moldura", "Sem fotos (vê na visita)"],
              },
              {
                title: "Loja Bela Vista",
                tag: "Concluído",
                value: "Ter, 24/11 · 10:30",
                lines: ["Loja · 2 ambientes", "Forro e luz embutida", "Proposta enviada depois"],
              },
            ]}
          />
        </>
      )}
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
          {!!item.photos && (
            <div className="visit-photos">
              <p>Fotos que o cliente mandou ({item.photos})</p>
              <div>
                {Array.from({ length: Math.min(6, Number(item.photos)) }, (_, index) => (
                  <a
                    key={index}
                    href={`/api/neon/appointments/${item.id}/photos/${index}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img
                      loading="lazy"
                      src={`/api/neon/appointments/${item.id}/photos/${index}`}
                      alt={`Foto ${index + 1} do cliente`}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
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
      {!rows && !error && <PanelSkeleton label="Carregando serviços…" />}
      {rows?.length === 0 && (
        <>
          <p className="hint">
            Nenhum serviço em andamento. Abra uma obra a partir de um orçamento aprovado.
          </p>
          <ExampleCards
            inline
            title="Como aparece uma obra"
            hint="Cada serviço aprovado vira um cartão assim. Você atualiza o andamento em % e as datas, e o cliente acompanha pela área dele."
            cards={[
              {
                title: "Forro do quarto · Maria",
                tag: "Em andamento",
                value: "60%",
                lines: [
                  "Início 25/11 · Fim 27/11",
                  "Equipe: João e Ramom",
                  "Falta acabamento e pintura",
                ],
              },
              {
                title: "Casa completa · José",
                tag: "Planejado",
                value: "0%",
                lines: ["Começa 02/12", "Material já separado", "Previsão de 8 dias"],
              },
              {
                title: "Loja Bela Vista",
                tag: "Concluído",
                value: "100%",
                lines: ["Entregue em 20/11", "Cliente aprovou", "Pagamento recebido"],
              },
            ]}
          />
        </>
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
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
import { ExampleCards, HowItWorks } from "@/components/preciso/ExampleCards";
