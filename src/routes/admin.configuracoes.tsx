import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Save, Settings, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AccountLayout, ManagementLinks } from "@/components/preciso/AccountMenu";
import { CompanySession } from "@/components/preciso/CompanySession";
import { commercialFetch } from "@/lib/commercial-client";
import { defaultBusinessSettings, type BusinessSettings } from "@/lib/business-settings";

export const Route = createFileRoute("/admin/configuracoes")({
  component: () => (
    <CompanySession title="Configurações" allowed={(user) => user.role === "admin"}>
      {(user) => (
        <AccountLayout label="Menu da administração" menu={<ManagementLinks user={user} />}>
          <Page />
        </AccountLayout>
      )}
    </CompanySession>
  ),
});
function Page() {
  const [form, setForm] = useState<BusinessSettings>(defaultBusinessSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setForm(await commercialFetch<BusinessSettings>("admin/business-settings"));
    } catch {
      setError(
        "Não foi possível consultar as configurações. Verifique a conexão e as migrations do banco.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      setForm(
        await commercialFetch<BusinessSettings>(
          "admin/business-settings",
          Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
          undefined,
          "PATCH",
        ),
      );
      toast.success("Configurações salvas.");
    } catch {
      toast.error("As configurações não foram salvas. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };
  const fields: { key: keyof BusinessSettings; label: string; type?: string; max: number }[] = [
    { key: "business_name", label: "Nome comercial", max: 120 },
    { key: "contact_email", label: "E-mail comercial", type: "email", max: 254 },
    { key: "contact_phone", label: "Telefone comercial", type: "tel", max: 30 },
    { key: "service_area", label: "Região de atendimento", max: 300 },
  ];
  return (
    <section className="panel space-y-6">
      <h2>Dados da empresa</h2>
      <div className="actions">
        <Link to="/admin/gestao-servicos" search={{ secao: "catalogo" }} className="action">
          Catálogo e regras de orçamento
        </Link>
        <Link to="/admin/comercial" search={{ secao: "clientes" }} className="action">
          Acessos da equipe
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <span className="p-3 rounded-xl bg-accent/10 text-accent">
          <Settings className="size-5" />
        </span>
        <p className="text-sm text-muted-foreground">
          Somente administradores podem alterar estas informações. Não informe senhas ou chaves de
          acesso.
        </p>
      </div>
      {loading ? (
        <div
          role="status"
          aria-label="Carregando configurações"
          className="h-72 rounded-2xl bg-surface animate-pulse"
        />
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-destructive/40 p-6 space-y-4">
          <p>{error}</p>
          <button
            onClick={() => void load()}
            className="inline-flex gap-2 text-accent items-center"
          >
            <RefreshCw className="size-4" />
            Tentar novamente
          </button>
        </div>
      ) : (
        <form
          onSubmit={save}
          className="preciso-card rounded-2xl border border-border p-5 md:p-8 space-y-5"
        >
          <div className="grid sm:grid-cols-2 gap-5">
            {fields.map(({ key, label, type, max }) => (
              <div key={key} className="space-y-2">
                <label htmlFor={key} className="text-sm">
                  {label}
                </label>
                <input
                  id={key}
                  type={type ?? "text"}
                  required={key === "business_name"}
                  maxLength={max}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full min-w-0 rounded-xl border border-border bg-background p-3 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <label htmlFor="estimate_disclaimer" className="text-sm">
              Orientação sobre a estimativa preliminar
            </label>
            <textarea
              id="estimate_disclaimer"
              maxLength={1500}
              rows={4}
              value={form.estimate_disclaimer}
              onChange={(e) => setForm({ ...form, estimate_disclaimer: e.target.value })}
              className="w-full rounded-xl border border-border bg-background p-3 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Projetos complexos exigem proposta técnica após levantamento de medidas, acesso,
              materiais e cronograma.
            </p>
          </div>
          <button
            disabled={saving}
            aria-busy={saving}
            className="preciso-button flex items-center gap-2 rounded-xl bg-accent text-accent-foreground px-5 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar configurações
          </button>
        </form>
      )}
    </section>
  );
}
