import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Save, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, inputCss } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { adminDb, BILLING_UNITS } from "@/components/preciso/admin-data";

export const Route = createFileRoute("/admin/servicos")({
  component: AdminServicos,
});

type Service = {
  id: string;
  key: string;
  name: string;
  short_name: string;
  description: string;
  category: string;
  price_per_m2: number;
  is_active: boolean;
  sort_order: number;
  billing_unit?: keyof typeof BILLING_UNITS;
  image_url?: string | null;
  availability_notes?: string | null;
};

function AdminServicos() {
  const [services, setServices] = useState<Service[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [supportsUnits, setSupportsUnits] = useState(false);

  useEffect(() => {
    reload();
  }, []);

  const reload = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("services").select("*").order("sort_order");
    setLoading(false);
    setLoadError(Boolean(error));
    if (error) {
      toast.error("Não foi possível carregar o catálogo");
      return;
    }
    setSupportsUnits(Boolean(data?.length && "billing_unit" in data[0]));
    setServices((data ?? []) as unknown as Service[]);
  };

  const update = <K extends keyof Service>(id: string, f: K, v: Service[K]) =>
    setServices((p) => p.map((s) => (s.id === id ? { ...s, [f]: v } : s)));

  const save = async (s: Service) => {
    if (!s.name.trim() || !Number.isFinite(Number(s.price_per_m2)) || Number(s.price_per_m2) < 0)
      return toast.error("Informe nome e preço válido, maior ou igual a zero.");
    if (s.image_url && !/^https:\/\//i.test(s.image_url))
      return toast.error("A imagem precisa de uma URL HTTPS.");
    setSavingId(s.id);
    const { error } = await adminDb
      .from("services")
      .update({
        name: s.name,
        short_name: s.short_name,
        description: s.description,
        price_per_m2: Number(s.price_per_m2),
        is_active: s.is_active,
        sort_order: Number(s.sort_order),
        category: s.category,
        ...(supportsUnits
          ? {
              billing_unit: s.billing_unit ?? "m2",
              image_url: s.image_url || null,
              availability_notes: s.availability_notes || null,
            }
          : {}),
      })
      .eq("id", s.id);
    setSavingId(null);
    if (error) toast.error("Erro", { description: error.message });
    else toast.success(`${s.name} salvo`);
  };

  const remove = async (s: Service) => {
    if (!confirm(`Desativar ${s.name}? O histórico será preservado.`)) return;
    const { error } = await supabase.from("services").update({ is_active: false }).eq("id", s.id);
    if (error) return toast.error("Erro", { description: error.message });
    setServices((p) => p.map((x) => (x.id === s.id ? { ...x, is_active: false } : x)));
    toast.success("Serviço desativado; histórico preservado");
  };

  const add = async () => {
    const { data, error } = await supabase
      .from("services")
      .insert({
        key: `servico-${Date.now()}`,
        name: "Novo serviço",
        short_name: "Novo",
        description: "",
        category: "acabamento",
        price_per_m2: 0,
        is_active: false,
        sort_order: services.length + 1,
      })
      .select("*")
      .single();
    if (error) return toast.error("Erro", { description: error.message });
    setServices((p) => [...p, data as unknown as Service]);
  };

  return (
    <AdminShell title="Serviços" subtitle="Catálogo gerenciável de especialidades.">
      <div className="space-y-4">
        {!supportsUnits && !loading && (
          <p
            role="status"
            className="p-4 rounded-xl border border-accent/30 text-sm text-muted-foreground"
          >
            O catálogo atual cobra por m². Unidades, imagens e disponibilidade serão habilitadas
            após aplicar a migração operacional.
          </p>
        )}
        {loading && (
          <div role="status" className="py-12 flex justify-center">
            <Loader2 className="size-6 animate-spin text-accent" />
            <span className="sr-only">Carregando serviços</span>
          </div>
        )}
        {loadError && (
          <button onClick={reload} className="text-accent underline">
            Tentar carregar novamente
          </button>
        )}
        <div className="flex justify-end">
          <button
            disabled={loading || loadError}
            onClick={add}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform disabled:opacity-50"
          >
            <Plus className="size-4" /> Novo
          </button>
        </div>
        <div className="space-y-3">
          {services.map((s) => (
            <article
              key={s.id}
              className="bg-surface border border-border rounded-2xl p-5 space-y-4"
            >
              {supportsUnits && (
                <div className="grid md:grid-cols-3 gap-3">
                  <F label="Unidade de cobrança">
                    <select
                      className={inputCss}
                      value={s.billing_unit ?? "m2"}
                      onChange={(e) =>
                        update(s.id, "billing_unit", e.target.value as Service["billing_unit"])
                      }
                    >
                      {Object.entries(BILLING_UNITS).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label="Imagem (URL HTTPS)">
                    <input
                      type="url"
                      className={inputCss}
                      value={s.image_url ?? ""}
                      onChange={(e) => update(s.id, "image_url", e.target.value)}
                    />
                  </F>
                  <F label="Disponibilidade">
                    <input
                      className={inputCss}
                      value={s.availability_notes ?? ""}
                      onChange={(e) => update(s.id, "availability_notes", e.target.value)}
                      placeholder="Prazo, região ou condições"
                    />
                  </F>
                </div>
              )}
              <div className="grid md:grid-cols-12 gap-3">
                <F label="Nome" cn="md:col-span-4">
                  <input
                    className={inputCss}
                    value={s.name}
                    onChange={(e) => update(s.id, "name", e.target.value)}
                  />
                </F>
                <F label="Curto" cn="md:col-span-2">
                  <input
                    className={inputCss}
                    value={s.short_name}
                    onChange={(e) => update(s.id, "short_name", e.target.value)}
                  />
                </F>
                <F label="Categoria" cn="md:col-span-2">
                  <select
                    className={inputCss}
                    value={s.category}
                    onChange={(e) => update(s.id, "category", e.target.value)}
                  >
                    <option value="acabamento">Acabamento</option>
                    <option value="estrutura">Estrutura</option>
                    <option value="manutencao">Manutenção</option>
                  </select>
                </F>
                <F label="R$ / m²" cn="md:col-span-2">
                  <input
                    type="number"
                    step={0.01}
                    className={inputCss + " font-mono"}
                    value={s.price_per_m2}
                    onChange={(e) => update(s.id, "price_per_m2", Number(e.target.value))}
                  />
                </F>
                <F label="Ordem" cn="md:col-span-1">
                  <input
                    type="number"
                    className={inputCss + " font-mono"}
                    value={s.sort_order}
                    onChange={(e) => update(s.id, "sort_order", Number(e.target.value))}
                  />
                </F>
                <F label="Status" cn="md:col-span-1">
                  <label className="flex items-center gap-2 h-11 px-3 bg-background border border-border rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={s.is_active}
                      onChange={(e) => update(s.id, "is_active", e.target.checked)}
                      className="accent-accent"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-widest">
                      {s.is_active ? "On" : "Off"}
                    </span>
                  </label>
                </F>
              </div>
              <F label="Descrição">
                <textarea
                  rows={2}
                  className={inputCss + " resize-none"}
                  value={s.description}
                  onChange={(e) => update(s.id, "description", e.target.value)}
                />
              </F>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => remove(s)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-border text-destructive rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-destructive/10"
                >
                  <Trash2 className="size-3.5" /> Desativar
                </button>
                <button
                  onClick={() => save(s)}
                  disabled={savingId === s.id}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-accent-foreground font-bold uppercase tracking-tighter text-xs rounded-lg hover:scale-[1.02] transition-transform disabled:opacity-60"
                >
                  {savingId === s.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  Salvar
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

function F({
  label,
  children,
  cn = "",
}: {
  label: string;
  children: React.ReactNode;
  cn?: string;
}) {
  return (
    <div className={"space-y-1.5 " + cn}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
