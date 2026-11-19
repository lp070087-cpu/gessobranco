import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Palette, Save, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkspaceShell, inputCss } from "@/components/preciso/WorkspaceShell";

export const Route = createFileRoute("/workspace/personalizar")({
  component: PersonalizarPage,
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);

const RESERVED = new Set([
  "p",
  "login",
  "signup",
  "admin",
  "workspace",
  "planos",
  "splash",
  "forgot-password",
  "reset-password",
  "home",
  "calcular",
  "agendar",
  "agenda",
  "orcamentos",
  "perfil",
  "services",
  "api",
]);

function PersonalizarPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    company_name: "",
    tagline: "",
    description: "",
    brand_color: "#c9a84c",
    logo_url: "" as string | null,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("slug, company_name, tagline, description, brand_color, logo_url, full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm({
            slug: data.slug ?? "",
            company_name: data.company_name ?? data.full_name ?? "",
            tagline: data.tagline ?? "",
            description: data.description ?? "",
            brand_color: data.brand_color ?? "#c9a84c",
            logo_url: data.logo_url,
          });
        }
        setLoading(false);
      });
  }, [user]);

  const onName = (v: string) => {
    setForm((f) => ({ ...f, company_name: v, slug: f.slug || slugify(v) }));
  };

  const save = async () => {
    if (!user) return;
    const slug = slugify(form.slug);
    if (!slug || slug.length < 3) return toast.error("Slug muito curto.");
    if (RESERVED.has(slug)) return toast.error("Slug reservado pelo sistema.");
    setSaving(true);
    try {
      let logo_url = form.logo_url;
      if (logoFile) {
        const ext = logoFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-images")
          .upload(path, logoFile, { upsert: true });
        if (upErr) throw upErr;
        logo_url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          slug,
          company_name: form.company_name,
          tagline: form.tagline,
          description: form.description,
          brand_color: form.brand_color,
          logo_url,
        })
        .eq("id", user.id);
      if (error) throw error;
      setForm((f) => ({ ...f, slug, logo_url }));
      setLogoFile(null);
      toast.success("Personalização salva!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg.includes("duplicate") ? "Esse slug já está em uso." : msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <WorkspaceShell title="Personalizar marca">
        <PanelSkeleton label="Carregando personalização…" />
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title="Personalizar marca"
      subtitle="Defina como sua página pública aparece para os clientes."
    >
      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-5 bg-surface border border-border rounded-2xl p-6">
          <Field label="Nome fantasia">
            <input
              className={inputCss}
              value={form.company_name}
              onChange={(e) => onName(e.target.value)}
              placeholder="Gesso Art Premium"
            />
          </Field>

          <Field label="Slug do seu link" hint={`Seu link será /p/${slugify(form.slug) || "..."}`}>
            <div className="flex items-center bg-background border border-border rounded-lg overflow-hidden">
              <span className="px-3 py-2.5 text-xs text-muted-foreground border-r border-border">
                /p/
              </span>
              <input
                className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="gesso-art-premium"
              />
            </div>
          </Field>

          <Field label="Frase de impacto">
            <input
              className={inputCss}
              value={form.tagline}
              onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
              placeholder="Acabamento premium para sua reforma"
              maxLength={80}
            />
          </Field>

          <Field label="Descrição">
            <textarea
              className={inputCss + " min-h-24 resize-none"}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Conte um pouco sobre sua empresa, especialidades e diferenciais."
              maxLength={400}
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Cor da marca">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.brand_color}
                  onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                  className="size-10 rounded-md border border-border bg-transparent"
                />
                <input
                  className={inputCss}
                  value={form.brand_color}
                  onChange={(e) => setForm((f) => ({ ...f, brand_color: e.target.value }))}
                />
              </div>
            </Field>
            <Field label="Logo">
              <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-border rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer hover:border-accent hover:text-accent transition-colors">
                <ImagePlus className="size-4" />
                {logoFile
                  ? logoFile.name.slice(0, 24)
                  : form.logo_url
                    ? "Trocar logo"
                    : "Enviar logo"}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Field>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-accent-foreground font-bold uppercase tracking-tighter rounded-xl hover:scale-[1.02] transition-transform disabled:opacity-60"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}{" "}
            Salvar
          </button>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-24 self-start">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground font-bold mb-2 flex items-center gap-2">
            <Palette className="size-3.5" /> Pré-visualização
          </div>
          <div className="rounded-3xl overflow-hidden border border-border shadow-2xl">
            <div
              className="h-32"
              style={{ background: `linear-gradient(135deg, ${form.brand_color}, #0d0d0d)` }}
            />
            <div className="bg-background p-5 -mt-12 relative">
              <div className="size-20 rounded-2xl bg-surface border-4 border-background shadow-xl flex items-center justify-center overflow-hidden">
                {form.logo_url || logoFile ? (
                  <img
                    src={logoFile ? URL.createObjectURL(logoFile) : form.logo_url!}
                    alt="logo"
                    className="size-full object-cover"
                  />
                ) : (
                  <span
                    className="font-extrabold text-2xl tracking-tighter"
                    style={{ color: form.brand_color }}
                  >
                    {(form.company_name[0] ?? "P").toUpperCase()}
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="font-extrabold tracking-tighter text-lg">
                  {form.company_name || "Sua marca"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {form.tagline || "Frase de impacto aqui"}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3 line-clamp-3">
                {form.description ||
                  "Descrição da sua empresa aparecerá aqui na sua página pública."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
      {children}
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
