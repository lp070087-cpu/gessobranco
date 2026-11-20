import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/preciso/AuthShell";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (search: Record<string, unknown>): { acesso?: "gestao" } =>
    search.acesso === "gestao" ? { acesso: "gestao" } : {},
  head: () => ({ meta: [{ title: "Recuperar senha — Ouro Branco" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const { acesso } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const parsed = z.string().trim().email().max(255).safeParse(email);
    if (!parsed.success) {
      setError("Informe um e-mail válido");
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (err) {
      toast.error("Erro ao enviar e-mail", { description: err.message });
      return;
    }
    setSent(true);
    toast.success("Enviamos um link de recuperação para seu e-mail.");
  };

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviaremos um link seguro para redefinir sua senha."
    >
      {sent ? (
        <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground animate-fade-in-up">
          Verifique sua caixa de entrada em{" "}
          <span className="text-foreground font-medium">{email}</span> e siga as instruções.
          <div className="mt-6">
            <Link to="/login" search={{ acesso }} className="text-gold hover:underline">
              Voltar para entrar
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              className="h-12 bg-surface border-border"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="h-12 w-full font-semibold disabled:opacity-80"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Enviando…
              </>
            ) : (
              "Enviar link"
            )}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" search={{ acesso }} className="text-gold hover:underline">
              Voltar para entrar
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
