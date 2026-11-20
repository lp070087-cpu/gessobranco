import { useState } from "react";
import { KeyRound } from "lucide-react";
import { commercialFetch } from "@/lib/commercial-client";

/** Trocar a própria senha, para o dono e a equipe. */
export function ChangePassword() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <form
      className="panel"
      style={{ maxWidth: 520 }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const next = String(data.get("next"));
        setError("");
        setDone(false);
        if (next !== String(data.get("again")))
          return setError("A nova senha e a confirmação estão diferentes.");
        if (next.length < 10) return setError("Use pelo menos 10 caracteres na nova senha.");
        setBusy(true);
        try {
          await commercialFetch("auth/password", { current: String(data.get("current")), next });
          form.reset();
          setDone(true);
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Não foi possível trocar a senha.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>
        <KeyRound size={18} aria-hidden="true" /> Trocar senha
      </h2>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="notice" role="status">
          Senha trocada. Use a nova senha no próximo login.
        </p>
      )}
      <label>
        Senha atual
        <input type="password" name="current" autoComplete="current-password" required />
      </label>
      <label>
        Nova senha (pelo menos 10 caracteres)
        <input type="password" name="next" autoComplete="new-password" required minLength={10} />
      </label>
      <label>
        Repita a nova senha
        <input type="password" name="again" autoComplete="new-password" required minLength={10} />
      </label>
      <button className="action primary" disabled={busy}>
        {busy ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
