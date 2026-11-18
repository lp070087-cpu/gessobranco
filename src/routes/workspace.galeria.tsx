import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkspaceShell, inputCss } from "@/components/preciso/WorkspaceShell";

export const Route = createFileRoute("/workspace/galeria")({
  component: GaleriaPage,
});

type Item = {
  id: string;
  title: string;
  description: string;
  before_url: string | null;
  after_url: string | null;
  video_url: string | null;
};

function GaleriaPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", description: "" });
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("gallery_items")
      .select("id,title,description,before_url,after_url,video_url")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Item[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [user]);

  const upload = async (file: File): Promise<string> => {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user!.id}/gallery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file);
    if (error) throw error;
    return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
  };

  const create = async () => {
    if (!user) return;
    if (!form.title.trim()) return toast.error("Informe um título");
    setSaving(true);
    try {
      const before_url = beforeFile ? await upload(beforeFile) : null;
      const after_url = afterFile ? await upload(afterFile) : null;
      const { error } = await supabase.from("gallery_items").insert({
        owner_id: user.id,
        title: form.title,
        description: form.description,
        before_url,
        after_url,
      });
      if (error) throw error;
      toast.success("Adicionado à galeria");
      setForm({ title: "", description: "" });
      setBeforeFile(null);
      setAfterFile(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este item?")) return;
    await supabase.from("gallery_items").delete().eq("id", id);
    setItems((arr) => arr.filter((i) => i.id !== id));
  };

  return (
    <WorkspaceShell
      title="Galeria de obras"
      subtitle="Mostre trabalhos antes/depois na sua página pública."
    >
      <div className="grid lg:grid-cols-[360px_1fr] gap-6">
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit">
          <div className="text-sm font-bold flex items-center gap-2">
            <Plus className="size-4 text-accent" /> Novo trabalho
          </div>
          <input
            className={inputCss}
            placeholder="Título"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className={inputCss + " min-h-20 resize-none"}
            placeholder="Descrição (opcional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <FileBox label="Antes" file={beforeFile} onChange={setBeforeFile} />
            <FileBox label="Depois" file={afterFile} onChange={setAfterFile} />
          </div>
          <button
            onClick={create}
            disabled={saving}
            className="w-full px-4 py-2.5 bg-accent text-accent-foreground rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{" "}
            Adicionar
          </button>
        </div>

        <div>
          {loading ? (
            <div className="grid sm:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-48 bg-surface rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-surface border border-dashed border-border rounded-2xl p-12 text-center text-muted-foreground">
              <ImageIcon className="size-10 mx-auto mb-3 text-accent" />
              Nenhum trabalho cadastrado ainda.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="bg-surface border border-border rounded-2xl overflow-hidden group"
                >
                  <div className="grid grid-cols-2">
                    <Half src={it.before_url} label="Antes" />
                    <Half src={it.after_url} label="Depois" />
                  </div>
                  <div className="p-4 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{it.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {it.description}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(it.id)}
                      className="size-8 rounded-md border border-border text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}

function FileBox({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <label className="aspect-square border border-dashed border-border rounded-lg flex items-center justify-center text-center text-[10px] uppercase tracking-widest text-muted-foreground cursor-pointer hover:border-accent hover:text-accent transition-colors overflow-hidden relative">
      {file ? (
        <img
          src={URL.createObjectURL(file)}
          alt={label}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span>
          {label}
          <br />+ foto
        </span>
      )}
      <input
        type="file"
        hidden
        accept="image/*"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function Half({ src, label }: { src: string | null; label: string }) {
  return (
    <div className="relative aspect-square bg-background">
      {src ? (
        <img src={src} alt={label} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {label}
        </div>
      )}
      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[10px] uppercase tracking-widest rounded">
        {label}
      </div>
    </div>
  );
}
