import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthShell } from "@/components/preciso/AuthShell";
import { cn } from "@/lib/utils";
import { commercialFetch } from "@/lib/commercial-client";
import { hasManagementAccess, managementHome } from "@/components/preciso/AccountMenu";
import type { CompanyActor } from "@/lib/company-permissions";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { acesso?: "gestao" } =>
    search.acesso === "gestao" ? { acesso: "gestao" } : {},
  head: () => ({
    meta: [
      { title: "Entrar — Ouro Branco" },
      {
        name: "description",
        content: "Acesse sua conta Ouro Branco para gerenciar orçamentos e agendamentos.",
      },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(255),
  password: z.string().min(6, "Senha mínima de 6 caracteres").max(128),
});

function LoginPage() {
  const navigate = useNavigate();
  const management = Route.useSearch().acesso === "gestao";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [keepConnected, setKeepConnected] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [shake, setShake] = useState(false);

  function openAccount(user: CompanyActor) {
    if (hasManagementAccess(user)) {
      void navigate({ to: managementHome(user), replace: true });
    } else {
      if (management) toast.info("Este e-mail tem acesso à área do cliente.");
      void navigate({ to: "/minha-conta", replace: true });
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      const fe: typeof errors = {};
      parsed.error.issues.forEach((i) => (fe[i.path[0] as "email" | "password"] = i.message));
      setErrors(fe);
      return;
    }

    setLoading(true);
    try {
      await commercialFetch("auth/login", {
        ...parsed.data,
        keep_connected: keepConnected,
      });
      const { user } = await commercialFetch<{ user: CompanyActor }>("auth/me");
      toast.success("Bem-vindo de volta.");
      openAccount(user);
    } catch (failure) {
      try {
        const status = (failure as { status?: number }).status;
        if (status !== 400 && status !== 401) throw failure;
        const legacy = await supabase.auth.signInWithPassword(parsed.data);
        if (legacy.error || !legacy.data.session) throw failure;
        try {
          await commercialFetch("auth/legacy-session", {
            access_token: legacy.data.session.access_token,
          });
          const { user } = await commercialFetch<{ user: CompanyActor }>("auth/me");
          openAccount(user);
        } catch {
          if (management) throw failure;
          navigate({ to: "/home", replace: true });
        }
      } catch {
        setPassword("");
        setErrors({
          password:
            failure instanceof Error && (failure as { status?: number }).status === 429
              ? failure.message
              : "Não foi possível entrar. Confira o e-mail e a senha.",
        });
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={management ? "Login da gestão da loja e da empresa" : "Login do cliente"}
      subtitle={
        management
          ? "Use o mesmo e-mail e senha para administrar a loja e os serviços."
          : "Acompanhe seus orçamentos, pedidos e agendamentos."
      }
      footer={<>© {new Date().getFullYear()} Ouro Branco Todos os direitos reservados.</>}
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
            E-mail
          </Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(
                "h-12 pl-10 bg-surface border-border",
                errors.email && "border-destructive focus-visible:ring-destructive/40",
              )}
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="password"
              className="text-xs uppercase tracking-wider text-muted-foreground"
            >
              Senha
            </Label>
            <Link to="/forgot-password" className="text-xs text-gold hover:underline">
              Esqueci minha senha
            </Link>
          </div>
          <div className={cn("relative", shake && "animate-shake")}>
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPass ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(
                "h-12 pl-10 pr-10 bg-surface border-border",
                errors.password && "border-destructive focus-visible:ring-destructive/40",
              )}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPass ? "Esconder senha" : "Mostrar senha"}
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-xs text-destructive animate-fade-in-up">{errors.password}</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox checked={keepConnected} onCheckedChange={(v) => setKeepConnected(Boolean(v))} />
          Manter conectado
        </label>

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full bg-gradient-to-r from-gold to-[oklch(0.82_0.12_85)] text-primary-foreground font-semibold tracking-wide shadow-[0_15px_40px_-15px_oklch(0.74_0.115_78/0.7)] hover:opacity-95 transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
        </Button>

        {!management && (
          <>
            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                <span className="bg-background px-3 text-muted-foreground">ou</span>
              </div>
            </div>

            <Link
              to="/signup"
              className="flex h-12 w-full items-center justify-center rounded-md border border-border bg-surface text-sm font-medium hover:bg-surface-elevated transition-colors"
            >
              Criar conta
            </Link>
          </>
        )}
        <Link
          to="/login"
          search={management ? {} : { acesso: "gestao" }}
          className="flex min-h-12 items-center justify-center text-sm text-accent"
        >
          {management ? "Login do cliente" : "Login da gestão da loja e da empresa"}
        </Link>
      </form>
    </AuthShell>
  );
}
