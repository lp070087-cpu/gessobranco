import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import bannerImg from "@/assets/banner-home.jpg";
import "./client-experience.css";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="preciso-auth relative min-h-screen overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(0.74_0.115_78/0.10),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,oklch(0.32_0.085_265/0.35),transparent_55%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />

      <div className="auth-layout relative z-10 mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 sm:px-6 py-10">
        <Link to="/" className="auth-logo flex items-center gap-2 self-start group">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface-elevated font-mono text-sm font-bold text-gold transition-transform group-hover:scale-105">
            OB
          </span>
          <span className="text-base font-semibold tracking-tight">
            Ouro Branco<span className="text-gold">.</span>
          </span>
        </Link>

        <section className="auth-story hidden relative mt-14">
          <p className="text-[10px] uppercase tracking-[0.25em] text-accent mb-5">
            Do primeiro traço à entrega
          </p>
          <h2 className="text-5xl font-medium leading-[1.05] tracking-tighter">
            Seu projeto.
            <br />
            Cada detalhe
            <br />
            <span className="text-accent">no lugar certo.</span>
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed mt-6 max-w-sm">
            Orçamentos, visitas e acompanhamento em um espaço feito para simplificar sua obra.
          </p>
          <div className="relative h-48 mt-9 rounded-2xl overflow-hidden border border-border">
            <img
              src={bannerImg}
              alt="Detalhe de acabamento em ambiente arquitetônico"
              width="700"
              height="320"
              className="size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
          </div>
        </section>
        <div className="auth-card flex flex-1 flex-col justify-center my-10 animate-fade-in-up">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </div>

        {footer && (
          <div className="auth-footer pb-2 text-center text-xs text-muted-foreground">{footer}</div>
        )}
      </div>
    </main>
  );
}
