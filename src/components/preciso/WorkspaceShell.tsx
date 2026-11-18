import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  Users,
  MapPin,
  Wallet,
  CreditCard,
  LogOut,
  Loader2,
  Menu,
  Sparkles,
  Building2,
  Briefcase,
  Share2,
  Image as ImageIcon,
  BarChart3,
  Palette,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};
const NAV: NavItem[] = [
  { to: "/workspace", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/workspace/divulgacao", label: "Meu link", icon: Share2 },
  { to: "/workspace/personalizar", label: "Personalizar", icon: Palette },
  { to: "/workspace/galeria", label: "Galeria", icon: ImageIcon },
  { to: "/workspace/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/workspace/produtos", label: "Produtos", icon: Package },
  { to: "/workspace/equipe", label: "Equipe", icon: Users },
  { to: "/workspace/regioes", label: "Regiões", icon: MapPin },
  { to: "/workspace/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/workspace/assinatura", label: "Assinatura", icon: CreditCard },
];

export type AccountType = "cliente" | "autonomo" | "empresa";

export function WorkspaceShell({
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
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", user.id)
        .maybeSingle();
      const t = (data?.account_type ?? "cliente") as AccountType;
      setAccountType(t);
      setAllowed(t === "autonomo" || t === "empresa");
    })();
  }, [user, loading, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (loading || allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-3 max-w-sm">
          <Briefcase className="size-12 text-muted-foreground mx-auto" />
          <h1 className="text-2xl font-extrabold tracking-tighter">Workspace exclusivo</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é para contas <b>Autônomo</b> ou <b>Empresa</b>. Atualize seu plano para
            acessar.
          </p>
          <div className="flex gap-2 justify-center">
            <Link
              to="/planos"
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              Ver planos
            </Link>
            <Link
              to="/home"
              className="px-4 py-2 border border-border rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              Voltar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? path === to : path === to || path.startsWith(to + "/");

  const Icon = accountType === "empresa" ? Building2 : Briefcase;
  const badge = accountType === "empresa" ? "Empresa" : "Autônomo";

  const Sidebar = (
    <div className="h-full flex flex-col bg-surface border-r border-border">
      <div className="h-16 px-5 flex items-center gap-2 border-b border-border">
        <div className="size-8 bg-accent rounded-sm flex items-center justify-center">
          <Sparkles className="size-4 text-accent-foreground" />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold tracking-tighter text-sm uppercase">
            Ouro Branco<span className="text-accent">.</span>
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-1">
            <Icon className="size-2.5" /> {badge}
          </div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {NAV.map((item) => {
          const I = item.icon;
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all " +
                (active
                  ? "bg-accent/15 text-accent font-semibold"
                  : "text-muted-foreground hover:bg-background hover:text-foreground")
              }
            >
              <I className="size-4 shrink-0" />
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
          <LayoutDashboard className="size-4" />
          <span>Visão cliente</span>
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
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="hidden md:flex w-64 shrink-0 sticky top-0 h-screen">{Sidebar}</aside>
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-72 animate-slide-up">{Sidebar}</div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-md border-b border-border">
          <div className="h-16 px-4 md:px-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="md:hidden size-10 rounded-lg border border-border flex items-center justify-center"
              >
                <Menu className="size-4" />
              </button>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
                  {badge}
                </div>
                <h1 className="text-lg md:text-xl font-extrabold tracking-tighter truncate">
                  {title}
                </h1>
              </div>
            </div>
            <div className="size-9 rounded-full bg-gradient-to-br from-accent to-navy text-accent-foreground flex items-center justify-center font-extrabold text-xs">
              {(user?.email?.[0] ?? "P").toUpperCase()}
            </div>
          </div>
          {subtitle && (
            <div className="px-4 md:px-8 pb-3 text-xs text-muted-foreground">{subtitle}</div>
          )}
        </header>
        <main className="flex-1 p-4 md:p-8 animate-fade-in-up">{children}</main>
      </div>
    </div>
  );
}

export const inputCss =
  "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm outline-none focus:border-accent transition-colors";

export function StatCard({
  label,
  value,
  hint,
  icon: I,
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
        "relative bg-surface border rounded-2xl p-5 overflow-hidden transition-all hover:border-accent/50 " +
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
          <I className="size-5" />
        </div>
      </div>
    </div>
  );
}
