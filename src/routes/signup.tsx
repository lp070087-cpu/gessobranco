import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AuthShell } from "@/components/preciso/AuthShell";
import { validDocument, type DocumentType } from "@/lib/customer-document";
import { commercialFetch } from "@/lib/commercial-client";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { destino?: "materiais" } =>
    search.destino === "materiais" ? { destino: "materiais" } : {},
  head: () => ({
    meta: [
      { title: "Criar conta — Ouro Branco" },
      {
        name: "description",
        content: "Cadastre-se como cliente para solicitar orçamentos e pedidos.",
      },
    ],
  }),
  component: SignupPage,
});

const baseShape = {
  email: z.string().trim().email("E-mail inválido").max(255),
  phone: z.string().trim().min(8, "Telefone inválido").max(20),
  password: z.string().min(12, "Mínimo 12 caracteres").max(128),
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Você precisa aceitar os termos" }) }),
};

const clientSchema = z
  .object({
    fullName: z.string().trim().min(2, "Informe seu nome").max(120),
    document: z.string().trim().min(1, "Informe seu documento").max(24),
    ...baseShape,
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem",
  });

function SignupPage() {
  const navigate = useNavigate();
  const { destino } = Route.useSearch();
  const [documentType, setDocumentType] = useState<DocumentType>("cpf");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: "",
    document: "",
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

    const parsed = clientSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (fe[String(i.path[0])] = i.message));
      setErrors(fe);
      return;
    }

    if (!validDocument(documentType, form.document)) {
      setErrors({ document: "Confira o " + documentType.toUpperCase() + " informado." });
      return;
    }

    setLoading(true);
    try {
      await commercialFetch("auth/register", {
        email: form.email.trim(),
        password: form.password,
        phone: form.phone,
        full_name: form.fullName,
        document_type: documentType,
        document: form.document,
        accepted_terms: form.acceptTerms,
      });
      toast.success("Conta criada com sucesso.");
      try {
        await commercialFetch("auth/login", {
          email: form.email.trim(),
          password: form.password,
          access: "client",
        });
        navigate({ to: "/minha-conta", search: destino ? { secao: destino } : {}, replace: true });
      } catch {
        navigate({ to: "/login", search: destino ? { destino } : {}, replace: true });
      }
    } catch (failure) {
      toast.error("Não foi possível criar a conta", {
        description: failure instanceof Error ? failure.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Criar conta de cliente" subtitle="Acompanhe seus pedidos e orçamentos.">
      <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in-up" noValidate>
        <Field label="Nome completo" error={errors.fullName}>
          <Input
            value={form.fullName}
            onChange={(event) => update("fullName", event.target.value)}
            placeholder="Seu nome"
            className="h-12 bg-surface border-border"
          />
        </Field>
        <label className="block space-y-2 text-sm">
          <span>Tipo de cadastro</span>
          <select
            className="h-12 w-full rounded-md border border-border bg-surface px-3"
            value={documentType}
            onChange={(event) => {
              setDocumentType(event.target.value === "cnpj" ? "cnpj" : "cpf");
              update("document", "");
              setErrors({});
            }}
          >
            <option value="cpf">Pessoa física (CPF)</option>
            <option value="cnpj">Pessoa jurídica (CNPJ)</option>
          </select>
        </label>
        <Field label={documentType.toUpperCase()} error={errors.document}>
          <Input
            value={form.document}
            maxLength={24}
            inputMode={documentType === "cpf" ? "numeric" : "text"}
            onChange={(event) => update("document", event.target.value)}
            placeholder={documentType === "cpf" ? "000.000.000-00" : "00.000.000/0000-00"}
            className="h-12 bg-surface border-border"
          />
        </Field>

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
              placeholder="Mínimo 12 caracteres"
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
          className="h-12 w-full font-semibold tracking-wide disabled:opacity-80"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Criando conta…
            </>
          ) : (
            "Criar conta"
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link
            to="/login"
            search={destino ? { destino } : {}}
            className="text-gold hover:underline"
          >
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
