import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2, User2, Building2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthShell } from "@/components/preciso/AuthShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Criar conta — Ouro Branco" },
      {
        name: "description",
        content: "Cadastre-se como cliente ou empresa e comece a orçar em minutos.",
      },
    ],
  }),
  component: SignupPage,
});

type AccountType = "cliente" | "empresa";

const baseShape = {
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  password: z.string().min(6, "Mínimo 6 caracteres").max(128),
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Você precisa aceitar os termos" }) }),
};

const clientSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe seu nome").max(120),
    ...baseShape,
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem",
  });

const companySchema = z
  .object({
    companyName: z.string().trim().min(2, "Informe o nome da empresa").max(120),
    responsibleName: z.string().trim().min(2, "Informe o responsável").max(120),
    cnpj: z.string().trim().max(20).optional().or(z.literal("")),
    ...baseShape,
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem",
  });

function SignupPage() {
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>("cliente");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    responsibleName: "",
    cnpj: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const schema = accountType === "cliente" ? clientSchema : companySchema;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (fe[String(i.path[0])] = i.message));
      setErrors(fe);
      return;
    }

    setLoading(true);
    const meta =
      accountType === "cliente"
        ? {
            account_type: "cliente",
            full_name: form.fullName,
            phone: form.phone,
          }
        : {
            account_type: "empresa",
            company_name: form.companyName,
            responsible_name: form.responsibleName,
            full_name: form.responsibleName,
            phone: form.phone,
            cnpj: form.cnpj || null,
          };

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: meta,
      },
    });
    setLoading(false);

    if (error) {
      toast.error("Não foi possível criar a conta", { description: error.message });
      return;
    }
    toast.success("Conta criada com sucesso.");
    navigate({ to: "/home", replace: true });
  };

  return (
    <AuthShell title="Criar conta" subtitle="Comece a orçar em minutos.">
      <div className="mb-6 grid grid-cols-2 gap-3">
        <TypeCard
          active={accountType === "cliente"}
          onClick={() => setAccountType("cliente")}
          icon={<User2 className="h-5 w-5" />}
          label="Cliente"
          desc="Quero orçar"
        />
        <TypeCard
          active={accountType === "empresa"}
          onClick={() => setAccountType("empresa")}
          icon={<Building2 className="h-5 w-5" />}
          label="Empresa"
          desc="Sou profissional"
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 animate-fade-in-up"
        noValidate
        key={accountType}
      >
        {accountType === "cliente" ? (
          <Field label="Nome completo" error={errors.fullName}>
            <Input
              value={form.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Seu nome"
              className="h-12 bg-surface border-border"
            />
          </Field>
        ) : (
          <>
            <Field label="Nome da empresa" error={errors.companyName}>
              <Input
                value={form.companyName}
                onChange={(e) => update("companyName", e.target.value)}
                placeholder="Razão social ou nome fantasia"
                className="h-12 bg-surface border-border"
              />
            </Field>
            <Field label="Responsável" error={errors.responsibleName}>
              <Input
                value={form.responsibleName}
                onChange={(e) => update("responsibleName", e.target.value)}
                placeholder="Nome do responsável"
                className="h-12 bg-surface border-border"
              />
            </Field>
            <Field label="CNPJ (opcional)" error={errors.cnpj}>
              <Input
                value={form.cnpj}
                onChange={(e) => update("cnpj", e.target.value)}
                placeholder="00.000.000/0000-00"
                className="h-12 bg-surface border-border font-mono"
              />
            </Field>
          </>
        )}

        <Field label="E-mail" error={errors.email}>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="voce@email.com"
            className="h-12 bg-surface border-border"
          />
        </Field>

        <Field label="Telefone" error={errors.phone}>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="(00) 00000-0000"
            className="h-12 bg-surface border-border font-mono"
          />
        </Field>

        <Field label="Senha" error={errors.password}>
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="h-12 bg-surface border-border pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Alternar senha"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <Field label="Confirmar senha" error={errors.confirmPassword}>
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
              placeholder="Repita a senha"
              className="h-12 bg-surface border-border pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Alternar confirmação"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer pt-1">
          <Checkbox
            checked={form.acceptTerms}
            onCheckedChange={(v) => update("acceptTerms", Boolean(v))}
            className="mt-0.5"
          />
          <span>
            Li e aceito os{" "}
            <span className="text-foreground underline-offset-4 hover:underline">
              Termos de Uso
            </span>{" "}
            e a{" "}
            <span className="text-foreground underline-offset-4 hover:underline">
              Política de Privacidade
            </span>
            .
          </span>
        </label>
        {errors.acceptTerms && <p className="text-xs text-destructive">{errors.acceptTerms}</p>}

        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full bg-gradient-to-r from-gold to-[oklch(0.82_0.12_85)] text-primary-foreground font-semibold tracking-wide shadow-[0_15px_40px_-15px_oklch(0.74_0.115_78/0.7)] hover:opacity-95 transition-all"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="text-gold hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TypeCard({
  active,
  onClick,
  icon,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-2xl border p-4 text-left transition-all",
        active
          ? "border-gold bg-gold-soft shadow-[0_15px_40px_-20px_oklch(0.74_0.115_78/0.5)]"
          : "border-border bg-surface hover:bg-surface-elevated",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
          active ? "bg-gold text-primary-foreground" : "bg-surface-elevated text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </button>
  );
}
