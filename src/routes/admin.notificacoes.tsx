import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, Loader2, Check, Send, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, EmptyState } from "@/components/preciso/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/notificacoes")({ component: Page });
type Notice = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  kind: string;
  read: boolean;
  created_at: string;
};
type Recipient = { id: string; full_name: string | null; email: string | null };
const db = supabase as SupabaseClient;
function Page() {
  const [list, setList] = useState<Notice[]>([]);
  const [people, setPeople] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [recipient, setRecipient] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [notices, profiles] = await Promise.all([
        db.from("notifications").select("*").order("created_at", { ascending: false }).limit(200),
        db.from("profiles").select("id,full_name,email").order("full_name").limit(1000),
      ]);
      if (notices.error || profiles.error) throw notices.error ?? profiles.error;
      setList(notices.data ?? []);
      setPeople(profiles.data ?? []);
    } catch {
      setError("Não foi possível carregar o centro de notificações.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const markRead = async (id: string) => {
    setBusy(id);
    try {
      const result = await db
        .from("notifications")
        .update({ read: true })
        .eq("id", id)
        .select("id")
        .single();
      if (result.error || !result.data) throw result.error;
      setList((current) => current.map((n) => (n.id === id ? { ...n, read: true } : n)));
      toast.success("Notificação marcada como lida.");
    } catch {
      toast.error("Não foi possível atualizar a notificação.");
    } finally {
      setBusy("");
    }
  };
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recipient || !title.trim() || !message.trim()) return;
    setBusy("send");
    try {
      const result = await db
        .from("notifications")
        .insert({
          user_id: recipient,
          title: title.trim(),
          message: message.trim(),
          kind: "info",
          read: false,
        })
        .select("*")
        .single();
      if (result.error || !result.data) throw result.error;
      setList((current) => [result.data, ...current].slice(0, 200));
      setTitle("");
      setMessage("");
      toast.success("Notificação criada na conta do destinatário.");
    } catch {
      toast.error("A notificação não foi enviada.");
    } finally {
      setBusy("");
    }
  };
  return (
    <AdminShell
      title="Notificações"
      subtitle="Avisos internos, com confirmação de gravação no banco."
    >
      {error ? (
        <div role="alert" className="p-5 rounded-xl border border-destructive/40">
          <p>{error}</p>
          <button onClick={() => void load()} className="mt-3 flex gap-2 text-accent">
            <RefreshCw className="size-4" />
            Tentar novamente
          </button>
        </div>
      ) : (
        <div className="grid xl:grid-cols-[1fr_360px] gap-6">
          <section aria-label="Notificações recentes">
            {loading ? (
              <div
                role="status"
                aria-label="Carregando notificações"
                className="h-64 animate-pulse bg-surface rounded-2xl"
              />
            ) : !list.length ? (
              <EmptyState
                icon={Bell}
                title="Nenhum aviso cadastrado"
                hint="Crie uma notificação para um cliente ou empresa."
              />
            ) : (
              <div className="space-y-3">
                {list.map((n) => (
                  <article
                    key={n.id}
                    className={
                      "preciso-card border rounded-2xl p-5 flex gap-3 " +
                      (n.read ? "border-border" : "border-accent/40")
                    }
                  >
                    <Bell className="size-5 text-accent shrink-0" />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-sm break-words">{n.title}</h2>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words mt-1">
                        {n.message}
                      </p>
                      <p className="text-xs text-muted-foreground mt-3">
                        {people.find((p) => p.id === n.user_id)?.full_name ?? "Destinatário"} ·{" "}
                        {new Date(n.created_at).toLocaleString("pt-BR")} ·{" "}
                        {n.read ? "Lida" : "Não lida"}
                      </p>
                    </div>
                    {!n.read && (
                      <button
                        aria-label="Marcar como lida"
                        disabled={!!busy}
                        onClick={() => void markRead(n.id)}
                        className="size-9 shrink-0 flex items-center justify-center rounded-lg border border-border hover:border-accent disabled:opacity-40"
                      >
                        {busy === n.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
          <form
            onSubmit={send}
            className="preciso-card rounded-2xl border border-border p-5 space-y-4 h-fit"
          >
            <h2 className="text-lg font-semibold">Novo aviso</h2>
            <p className="text-xs text-muted-foreground">
              Envio para a conta do usuário dentro da plataforma.
            </p>
            <div>
              <label htmlFor="notice-recipient" className="text-xs">
                Destinatário
              </label>
              <select
                id="notice-recipient"
                required
                disabled={loading}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="mt-2 w-full min-w-0 rounded-xl border border-border bg-background p-3 text-sm"
              >
                <option value="">Selecione um usuário</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="notice-title" className="text-xs">
                Título
              </label>
              <input
                id="notice-title"
                required
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm"
              />
            </div>
            <div>
              <label htmlFor="notice-message" className="text-xs">
                Mensagem
              </label>
              <textarea
                id="notice-message"
                required
                maxLength={3000}
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm"
              />
            </div>
            <button
              disabled={loading || !!busy || !recipient}
              className="preciso-button w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-xl p-3 text-sm font-semibold disabled:opacity-40"
            >
              {busy === "send" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Criar notificação
            </button>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
