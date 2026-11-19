import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Package, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkspaceShell, inputCss } from "@/components/preciso/WorkspaceShell";

export const Route = createFileRoute("/workspace/produtos")({
  component: ProductsPage,
});

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  image_url: string | null;
};
const CATEGORIES = ["tinta", "massa", "placa 3D", "gesso", "iluminação", "acabamento"];

function ProductsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "tinta",
    price: "",
    stock: "0",
    description: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("products")
      .select("id,name,category,price,stock,description,image_url")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as unknown as Product[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("product-images").upload(path, file);
        if (upErr) throw upErr;
        imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("products").insert({
        owner_id: user.id,
        name: form.name.trim(),
        category: form.category,
        price: Number(form.price) || 0,
        stock: Number(form.stock) || 0,
        description: form.description.trim(),
        image_url: imageUrl,
      });
      if (error) throw error;
      toast.success("Produto adicionado");
      setForm({ name: "", category: "tinta", price: "", stock: "0", description: "" });
      setFile(null);
      load();
    } catch (e) {
      toast.error("Erro ao salvar", { description: e instanceof Error ? e.message : "" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    setItems((it) => it.filter((p) => p.id !== id));
  };

  return (
    <WorkspaceShell title="Produtos" subtitle="Catálogo de materiais">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3 h-fit">
          <div className="text-[10px] font-bold uppercase tracking-widest text-accent">
            Novo produto
          </div>
          <input
            className={inputCss}
            placeholder="Nome"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className={inputCss}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputCss}
              type="number"
              placeholder="Preço"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
            <input
              className={inputCss}
              type="number"
              placeholder="Estoque"
              value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </div>
          <textarea
            className={inputCss + " resize-none"}
            rows={3}
            maxLength={300}
            placeholder="Descrição"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-border rounded-lg text-xs font-bold uppercase tracking-widest cursor-pointer hover:border-accent">
            <ImagePlus className="size-4" />
            <span className="truncate">{file ? file.name : "Imagem (opcional)"}</span>
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-3 bg-accent text-accent-foreground rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{" "}
            Adicionar
          </button>
        </div>
        <div className="md:col-span-2 space-y-3">
          {loading ? (
            <PanelSkeleton label="Carregando produtos…" />
          ) : items.length === 0 ? (
            <div className="bg-surface border border-dashed border-border rounded-2xl p-10 text-center">
              <Package className="size-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-bold">Nenhum produto ainda</p>
            </div>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-4"
              >
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="size-16 rounded-lg object-cover" />
                ) : (
                  <div className="size-16 rounded-lg bg-background border border-border flex items-center justify-center text-muted-foreground">
                    <Package className="size-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {p.category} · estoque {p.stock}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-extrabold text-accent">
                    R$ {Number(p.price).toFixed(2)}
                  </div>
                  <button
                    onClick={() => remove(p.id)}
                    className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive inline-flex items-center gap-1 mt-1"
                  >
                    <Trash2 className="size-3" /> Remover
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
