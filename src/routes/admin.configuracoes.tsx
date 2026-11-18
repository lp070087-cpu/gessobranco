import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2, Save, Settings, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/configuracoes")({ component: Page });
type SettingsData = {
  business_name: string;
  contact_email: string;
  contact_phone: string;
  service_area: string;
  estimate_disclaimer: string;
};
const INITIAL: SettingsData = {
  business_name: "",
  contact_email: "",
  contact_phone: "",
  service_area: "",
  estimate_disclaimer: "",
};
const db = supabase as SupabaseClient;
function Page() {
  const [form, setForm] = useState<SettingsData>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await db
        .from("platform_settings")
        .select("business_name,contact_email,contact_phone,service_area,estimate_disclaimer")
        .eq("id", true)
        .maybeSingle();
      if (result.error) throw result.error;
      setForm(result.data ?? INITIAL);
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
      const result = await db
        .from("platform_settings")
        .upsert({
          id: true,
          ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
        })
        .select("id")
        .single();
      if (result.error || !result.data) throw result.error;
      toast.success("Configurações salvas.");
    } catch {
      toast.error("As configurações não foram salvas. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };
  const fields: { key: keyof SettingsData; label: string; type?: string; max: number }[] = [
    { key: "business_name", label: "Nome comercial", max: 120 },
    { key: "contact_email", label: "E-mail comercial", type: "email", max: 254 },
    { key: "contact_phone", label: "Telefone comercial", type: "tel", max: 30 },
    { key: "service_area", label: "Região de atendimento", max: 300 },
  ];
  return (
    <AdminShell
      title="Configurações"
      subtitle="Informações comerciais e orientação para estimativas."
    >
      <div className="max-w-3xl space-y-6">
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
      </div>
    </AdminShell>
  );
}
