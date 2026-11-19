import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Ban, CheckCircle2, Trash2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, EmptyState } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/usuarios")({
  component: AdminUsuarios,
});

type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  account_type: "cliente" | "empresa";
  blocked: boolean;
  created_at: string;
};

function AdminUsuarios() {
  const [list, setList] = useState<Profile[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("account_type", "cliente")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Não foi possível carregar clientes");
      setLoading(false);
      return;
    }
    const profiles = (data ?? []) as unknown as Profile[];
    setList(profiles);
    const { data: qs } = await supabase.from("quotes").select("user_id");
    const c: Record<string, number> = {};
    (qs ?? []).forEach((q: { user_id: string }) => {
      c[q.user_id] = (c[q.user_id] ?? 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  };

  const toggleBlock = async (p: Profile) => {
    setBusyId(p.id);
    const { error } = await supabase
      .from("profiles")
      .update({ blocked: !p.blocked })
      .eq("id", p.id);
    setBusyId(null);
    if (error) return toast.error("Erro", { description: error.message });
    setList((arr) => arr.map((x) => (x.id === p.id ? { ...x, blocked: !p.blocked } : x)));
    toast.success(p.blocked ? "Desbloqueado" : "Bloqueado");
  };

  const remove = async (p: Profile) => {
    if (!confirm(`Bloquear ${p.full_name || p.email}? Os dados e o histórico serão preservados.`))
      return;
    const { error } = await supabase.from("profiles").update({ blocked: true }).eq("id", p.id);
    if (error) return toast.error("Erro", { description: error.message });
    setList((arr) => arr.map((x) => (x.id === p.id ? { ...x, blocked: true } : x)));
    toast.success("Cliente bloqueado; dados preservados");
  };

  const filtered = list.filter((p) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.full_name ?? "").toLowerCase().includes(s) || (p.email ?? "").toLowerCase().includes(s)
    );
  });

  return (
    <AdminShell title="Usuários" subtitle={`${list.length} clientes cadastrados.`}>
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome ou email…"
            className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm focus:border-accent outline-none"
          />
        </div>

        {loading ? (
          <PanelSkeleton label="Carregando usuários…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UserIcon}
            title="Nenhum usuário"
            hint="Aguardando primeiros cadastros."
          />
        ) : (
          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="hidden md:grid grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              <div>Nome</div>
              <div>Contato</div>
              <div>Orçamentos</div>
              <div>Status</div>
              <div>Cadastro</div>
              <div className="text-right">Ações</div>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto_auto] gap-3 md:gap-4 px-5 py-4 items-center hover:bg-background/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-9 rounded-full bg-gradient-to-br from-accent to-navy text-accent-foreground flex items-center justify-center text-xs font-extrabold shrink-0">
                      {(p.full_name ?? p.email ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{p.full_name || "Sem nome"}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">{p.phone || "—"}</div>
                  <div className="font-mono text-sm font-bold">{counts[p.id] ?? 0}</div>
                  <div>
                    <span
                      className={
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full " +
                        (p.blocked
                          ? "bg-destructive/15 text-destructive"
                          : "bg-emerald-500/15 text-emerald-400")
                      }
                    >
                      {p.blocked ? "Bloqueado" : "Ativo"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => toggleBlock(p)}
                      disabled={busyId === p.id}
                      className="size-9 rounded-lg border border-border flex items-center justify-center hover:border-accent hover:text-accent transition-colors"
                      title={p.blocked ? "Desbloquear" : "Bloquear"}
                    >
                      {p.blocked ? <CheckCircle2 className="size-4" /> : <Ban className="size-4" />}
                    </button>
                    <button
                      aria-label="Bloquear cliente preservando o histórico"
                      disabled={p.blocked || busyId === p.id}
                      onClick={() => remove(p)}
                      className="size-9 rounded-lg border border-border text-destructive flex items-center justify-center hover:bg-destructive/10 disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";
