import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, User, Heart, Settings, LifeBuoy, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({ meta: [{ title: "Perfil — Ouro Branco" }] }),
  component: PerfilPage,
});

const ITEMS = [
  { label: "Editar perfil", icon: User },
  { label: "Favoritos", icon: Heart },
  { label: "Configurações", icon: Settings },
  { label: "Suporte", icon: LifeBuoy },
];

function PerfilPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    user?.email?.split("@")[0] ||
    "Cliente";
  const initial = displayName.charAt(0).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-6 animate-fade-in-up">
      <header className="bg-surface border border-border rounded-3xl p-6 md:p-8 flex items-center gap-5">
        <div className="size-16 md:size-20 rounded-2xl bg-gradient-to-br from-accent to-navy text-accent-foreground flex items-center justify-center font-extrabold text-2xl md:text-3xl">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.25em] text-accent font-bold">
            Bem-vindo
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tighter truncate">
            {displayName}
          </h1>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
      </header>

      <nav className="bg-surface border border-border rounded-3xl overflow-hidden">
        {ITEMS.map((item, i) => (
          <button
            key={item.label}
            type="button"
            className={
              "w-full flex items-center gap-4 px-5 py-4 hover:bg-background transition-colors text-left " +
              (i > 0 ? "border-t border-border" : "")
            }
          >
            <div className="size-9 rounded-lg bg-background border border-border flex items-center justify-center text-accent">
              <item.icon className="size-4" />
            </div>
            <span className="flex-1 text-sm font-medium">{item.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </nav>

      <button
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-destructive/10 text-destructive font-bold uppercase tracking-tighter text-sm rounded-2xl border border-destructive/30 hover:bg-destructive/20 transition-colors"
      >
        <LogOut className="size-4" /> Sair da conta
      </button>
    </div>
  );
}
