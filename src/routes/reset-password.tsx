import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/preciso/AuthShell";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nova senha — Ouro Branco" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const parsed = z
      .object({ password: z.string().min(6).max(128), confirm: z.string() })
      .refine((d) => d.password === d.confirm, { message: "As senhas não coincidem" })
      .safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      toast.error("Não foi possível atualizar a senha", { description: err.message });
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    navigate({ to: "/login", replace: true });
  };

  return (
    <AuthShell title="Nova senha" subtitle="Defina uma senha forte para sua conta.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Nova senha
          </Label>
          <div className="relative">
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 bg-surface border-border pr-10"
              placeholder="Mínimo 6 caracteres"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Confirmar
          </Label>
          <Input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-12 bg-surface border-border"
            placeholder="Repita a senha"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full bg-gradient-to-r from-gold to-[oklch(0.82_0.12_85)] text-primary-foreground font-semibold"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar senha"}
        </Button>
      </form>
    </AuthShell>
  );
}
