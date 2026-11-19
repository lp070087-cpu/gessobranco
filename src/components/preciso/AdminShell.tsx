import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Building2,
  Wrench,
  FileText,
  CalendarDays,
  Wallet,
  Star,
  Bell,
  Settings,
  LifeBuoy,
  LogOut,
  Shield,
  Menu,
  X,
  HardHat,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const NAV: {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/comercial", label: "Gestão da loja", icon: Wallet },
  { to: "/admin/usuarios", label: "Usuários", icon: Users },
  { to: "/admin/empresas", label: "Empresas", icon: Building2 },
  { to: "/admin/servicos", label: "Serviços", icon: Wrench },
  { to: "/admin/orcamentos", label: "Orçamentos", icon: FileText },
  { to: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/admin/obras", label: "Obras", icon: HardHat },
  { to: "/admin/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/admin/avaliacoes", label: "Avaliações", icon: Star },
  { to: "/admin/notificacoes", label: "Notificações", icon: Bell },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminShell({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
}) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setMobileOpen(false);
  }, [path]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setAllowed(false);
      navigate({ to: "/login" });
      return;
    }
    setAllowed(null);
    setPermissionError(false);
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .abortSignal(controller.signal)
          .maybeSingle();
        if (active) {
          setPermissionError(Boolean(error));
          setAllowed(!error && Boolean(data));
        }
      } catch {
        if (active) {
          setPermissionError(true);
          setAllowed(false);
        }
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [user, loading, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (loading || allowed === null) {
    return <LoadingSkeleton sidebar />;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3 max-w-sm">
          <Shield className="size-12 text-muted-foreground mx-auto" />
          <h1 className="text-2xl font-extrabold tracking-tighter">
            {permissionError ? "Não foi possível verificar o acesso" : "Acesso restrito"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva para administradores.
          </p>
          <Link
            to="/home"
            className="inline-block px-5 py-2.5 bg-accent text-accent-foreground rounded-lg text-xs font-bold uppercase tracking-widest"
          >
            Voltar
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  const SidebarInner = (
    <div className="h-full flex flex-col bg-surface border-r border-border shadow-2xl">
      <div className="h-16 px-5 flex items-center gap-2 border-b border-border">
        <div className="size-8 bg-accent rounded-sm flex items-center justify-center">
          <div className="size-3.5 border-2 border-background rotate-45" />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold tracking-tighter text-sm uppercase">
            Ouro Branco<span className="text-accent">.</span>
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Admin Console
          </div>
        </div>
      </div>
      <nav aria-label="Administração" className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to as string}
              aria-current={active ? "page" : undefined}
              onClick={() => setMobileOpen(false)}
              className={
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all " +
                (active
                  ? "bg-accent/15 text-accent font-semibold"
                  : "text-muted-foreground hover:bg-background hover:text-foreground")
              }
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
              {active && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border space-y-0.5">
        <Link
          to="/home"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <LifeBuoy className="size-4" />
          <span>Voltar ao app</span>
        </Link>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-destructive hover:bg-destructive/10"
        >
          <LogOut className="size-4" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="preciso-admin min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-64 shrink-0 sticky top-0 h-screen">{SidebarInner}</aside>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu administrativo"
            className="relative w-72 max-w-[90vw] animate-slide-up"
          >
            <button
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 z-10 size-8 grid place-items-center rounded-lg border border-border"
            >
              <X className="size-4" />
            </button>
            {SidebarInner}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border">
          <div className="h-16 px-4 md:px-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="Abrir menu administrativo"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
                className="md:hidden size-10 rounded-lg border border-border flex items-center justify-center"
              >
                <Menu className="size-4" />
              </button>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
                  Admin
                </div>
                <h1 className="text-lg md:text-xl font-extrabold tracking-tighter truncate">
                  {title}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/admin/notificacoes"
                aria-label="Notificações"
                className="size-10 rounded-lg border border-border flex items-center justify-center hover:border-accent hover:text-accent transition-colors"
              >
                <Bell className="size-4" />
              </Link>
              <div className="hidden sm:flex items-center gap-2">
                <div className="size-9 rounded-full bg-gradient-to-br from-accent to-navy text-accent-foreground flex items-center justify-center font-extrabold text-xs">
                  {(user?.email?.[0] ?? "A").toUpperCase()}
                </div>
              </div>
            </div>
          </div>
          {subtitle && (
            <div className="px-4 md:px-8 pb-3 text-xs text-muted-foreground">{subtitle}</div>
          )}
        </header>
        <main
          id="admin-content"
          className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-8 lg:p-10 animate-fade-in-up"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "group relative bg-gradient-to-br from-surface to-background border rounded-2xl p-5 md:p-6 overflow-hidden transition-all duration-300 motion-safe:hover:-translate-y-1 hover:shadow-xl hover:border-accent/50 " +
        (accent ? "border-accent/40" : "border-border")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
            {label}
          </div>
          <div className="text-2xl md:text-3xl font-extrabold tracking-tighter font-mono">
            {value}
          </div>
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        <div
          className={
            "size-10 rounded-xl flex items-center justify-center " +
            (accent
              ? "bg-accent text-accent-foreground"
              : "bg-background text-accent border border-border")
          }
        >
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
}) {
  return (
    <div className="bg-surface border border-border border-dashed rounded-2xl p-10 text-center">
      <Icon className="size-10 mx-auto text-muted-foreground mb-3" />
      <p className="font-bold">{title}</p>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

export const inputCss =
  "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-accent transition-colors";

// re-export for unused warnings
export { X };
import { LoadingSkeleton } from "@/components/preciso/LoadingSkeleton";
