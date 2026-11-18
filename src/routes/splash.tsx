import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/splash")({
  head: () => ({ meta: [{ title: "Ouro Branco — Carregando" }] }),
  component: SplashPage,
});

function SplashPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      navigate({ to: data.session ? "/home" : "/login", replace: true });
    }, 2400);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,oklch(0.74_0.115_78/0.12),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_90%,oklch(0.32_0.085_265/0.35),transparent_55%)]" />

      <div className="relative z-10 flex flex-col items-center text-center px-6 animate-splash-in">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-border bg-surface-elevated shadow-[0_30px_80px_-30px_oklch(0.74_0.115_78/0.5)]">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[oklch(0.74_0.115_78/0.25)] to-transparent" />
          <span className="relative font-mono text-4xl font-bold tracking-tighter text-gold">
            P.
          </span>
        </div>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight text-foreground">
          Preciso<span className="text-gold">.</span>
        </h1>
        <p className="mt-3 max-w-xs text-sm text-muted-foreground">
          Seu orçamento de reforma em minutos.
        </p>

        <div className="mt-12 flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full bg-gold animate-loading-dot"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-gold animate-loading-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="h-1.5 w-1.5 rounded-full bg-gold animate-loading-dot"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </div>
    </main>
  );
}
