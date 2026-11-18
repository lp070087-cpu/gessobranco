import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    // An unavailable identity provider must not leave a protected screen spinning forever.
    const timeout = setTimeout(() => {
      if (active) {
        setError("O serviço de autenticação não respondeu. Tente novamente.");
        setLoading(false);
      }
    }, 15000);
    try {
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, next) => {
        if (!active) return;
        setSession(next);
        setUser(next?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
      void supabase.auth
        .getSession()
        .then(({ data, error: authError }) => {
          if (!active) return;
          if (authError) setError("Não foi possível verificar sua sessão.");
          setSession(authError ? null : data.session);
          setUser(authError ? null : (data.session?.user ?? null));
        })
        .catch(() => {
          if (active) setError("Não foi possível conectar ao serviço de autenticação.");
        })
        .finally(() => {
          clearTimeout(timeout);
          if (active) setLoading(false);
        });
    } catch {
      clearTimeout(timeout);
      setError("Autenticação indisponível. Tente novamente em instantes.");
      setLoading(false);
    }
    return () => {
      active = false;
      clearTimeout(timeout);
      unsubscribe?.();
    };
  }, []);

  return { session, user, loading, error };
}
