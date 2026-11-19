import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { commercialFetch } from "@/lib/commercial-client";
import type { CompanyActor } from "@/lib/company-permissions";
import "./commercial.css";
import { PanelSkeleton } from "@/components/preciso/LoadingSkeleton";

export function CompanySession({
  title,
  management,
  allowed,
  children,
}: {
  title: string;
  management?: boolean;
  allowed?: (user: CompanyActor) => boolean;
  children: (user: CompanyActor) => ReactNode;
}) {
  const [user, setUser] = useState<CompanyActor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    async function currentSession() {
      try {
        return await commercialFetch<{ user: CompanyActor }>(
          "auth/me",
          undefined,
          controller.signal,
        );
      } catch (failure) {
        if (
          (failure as { status?: number }).status !== 401 ||
          !import.meta.env.VITE_SUPABASE_URL ||
          !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
        )
          throw failure;
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.auth.getSession();
        if (!data.session || controller.signal.aborted) throw failure;
        await commercialFetch(
          "auth/legacy-session",
          { access_token: data.session.access_token },
          controller.signal,
        );
        return commercialFetch<{ user: CompanyActor }>("auth/me", undefined, controller.signal);
      }
    }
    void currentSession()
      .then(({ user }) => {
        if (!controller.signal.aborted) setUser(user);
      })
      .catch((failure: Error & { status?: number }) => {
        if (!controller.signal.aborted && failure.status !== 401) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  async function signOut() {
    try {
      await commercialFetch("auth/logout", {});
      if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
        const { supabase } = await import("@/integrations/supabase/client");
        await supabase.auth.signOut({ scope: "local" });
      }
      await navigate({ to: "/login" });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível sair.");
    }
  }
  const granted = user && (!allowed || allowed(user));
  return (
    <main className="commercial preciso-client">
      <header className="commercial-header">
        <div>
          <h1>OURO BRANCO</h1>
          <small>
            {title}
            {granted ? " · " + user.full_name : ""}
          </small>
        </div>
        <div className="actions">
          <Link to="/" className="action">
            Ver site
          </Link>
          {user && (
            <button type="button" className="action" onClick={() => void signOut()}>
              Sair
            </button>
          )}
        </div>
      </header>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <PanelSkeleton label={`Carregando ${title}…`} />
      ) : granted ? (
        children(user)
      ) : (
        <section className="panel">
          <h2>{user ? "Acesso restrito" : "Entre para continuar"}</h2>
          {user ? (
            <Link to="/minha-conta" className="action">
              Minha conta
            </Link>
          ) : (
            <Link
              to="/login"
              search={management || allowed ? { acesso: "gestao" } : {}}
              className="action primary"
            >
              {management || allowed
                ? "Entrar na gestão da loja e da empresa"
                : "Entrar como cliente"}
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
