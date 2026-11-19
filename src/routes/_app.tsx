import { useEffect, useState } from "react";
import { Outlet, Link, useNavigate, useRouterState, createFileRoute } from "@tanstack/react-router";
import {
  Home,
  LayoutGrid,
  FileText,
  CalendarDays,
  User,
  Menu,
  LogOut,
  History,
  HardHat,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LoadingSkeleton } from "@/components/preciso/LoadingSkeleton";
import { InstallApp } from "@/components/preciso/InstallApp";
import "@/components/preciso/client-experience.css";

export const Route = createFileRoute("/_app")({
  component: AppShell,
});

const BOTTOM_NAV = [
  { to: "/home", label: "Home", icon: Home },
  { to: "/services", label: "Serviços", icon: LayoutGrid },
  { to: "/orcamentos", label: "Orçamentos", icon: FileText },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/perfil", label: "Perfil", icon: User },
] as const;

const SIDE_MENU = [
  { to: "/home", label: "Visão geral", icon: Home },
  { to: "/calcular", label: "Novo orçamento", icon: FileText },
  { to: "/perfil", label: "Meu perfil", icon: User },
  { to: "/orcamentos", label: "Histórico", icon: History },
  { to: "/obras", label: "Minhas obras", icon: HardHat },
  { to: "/agenda", label: "Agendamentos", icon: CalendarDays },
] as const;

function AppShell() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Cliente";
  const initial = displayName.charAt(0).toUpperCase();

  if (loading || !user) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="preciso-client min-h-screen bg-background text-foreground pb-24 md:pb-28">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="size-10 rounded-full border border-border flex items-center justify-center hover:border-accent hover:text-accent transition-colors"
                  aria-label="Abrir menu"
                >
                  <Menu className="size-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="bg-background border-border p-0 w-80">
                <div className="p-6 border-b border-border flex items-center gap-3">
                  <div className="size-12 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-extrabold text-lg">
                    {initial}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
                <nav className="p-3 flex flex-col">
                  {SIDE_MENU.map((m) => (
                    <Link
                      key={m.label}
                      to={m.to}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-surface transition-colors"
                    >
                      <m.icon className="size-4 text-muted-foreground" />
                      <span>{m.label}</span>
                    </Link>
                  ))}
                  <InstallApp />
                  <button
                    onClick={handleSignOut}
                    className="mt-2 flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="size-4" />
                    <span>Sair</span>
                  </button>
                </nav>
              </SheetContent>
            </Sheet>

            <Link to="/home" className="flex items-center gap-2">
              <div className="size-8 bg-accent rounded-sm flex items-center justify-center">
                <div className="size-3.5 border-2 border-background rotate-45" />
              </div>
              <span className="font-extrabold tracking-tighter text-lg uppercase">
                Ouro Branco<span className="text-accent">.</span>
              </span>
            </Link>
          </div>

          <Link to="/perfil" className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Olá</div>
              <div className="text-sm font-bold truncate max-w-[140px]">{displayName}</div>
            </div>
            <div className="size-10 rounded-full bg-gradient-to-br from-accent to-navy text-accent-foreground flex items-center justify-center font-extrabold ring-2 ring-border">
              {initial}
            </div>
          </Link>
        </div>
      </header>

      <main className="animate-fade-in-up">
        <Outlet />
      </main>

      {/* BOTTOM NAV */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border"
      >
        <div className="max-w-2xl mx-auto px-2 py-2 grid grid-cols-5">
          {BOTTOM_NAV.map((item) => {
            const active = currentPath === item.to || currentPath.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg transition-colors group"
              >
                <div
                  className={
                    "size-10 rounded-xl flex items-center justify-center transition-all " +
                    (active
                      ? "bg-accent text-accent-foreground scale-110 shadow-lg shadow-accent/30"
                      : "text-muted-foreground group-hover:text-foreground")
                  }
                >
                  <Icon className="size-5" />
                </div>
                <span
                  className={
                    "text-[10px] font-bold uppercase tracking-wider transition-colors " +
                    (active ? "text-accent" : "text-muted-foreground")
                  }
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
