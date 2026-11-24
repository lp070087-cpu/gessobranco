import { useState } from "react";
import { KeyRound } from "lucide-react";
import { commercialFetch } from "@/lib/commercial-client";

/** Trocar a própria senha, para o dono e a equipe. */
export function ChangePassword() {
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  return (
    <form
      className="panel"
      style={{ maxWidth: 520 }}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const current = String(data.get("current"));
        const next = String(data.get("next"));
        setError("");
        setDone(false);
        if (next !== String(data.get("again")))
          return setError("A nova senha e a confirmação estão diferentes.");
        if (next.length < 12 || next.length > 128)
          return setError("A nova senha deve ter de 12 a 128 caracteres.");
        if (current === next) return setError("Escolha uma senha diferente da atual.");
        setBusy(true);
        try {
          await commercialFetch("auth/password", { current, next });
          form.reset();
          setShow(false);
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
      <p className="hint">As outras sessões da sua conta serão encerradas ao confirmar a troca.</p>
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
        <input
          name="current"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          maxLength={200}
        />
      </label>
      <label>
        Nova senha (pelo menos 12 caracteres)
        <input
          name="next"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <label>
        Repita a nova senha
        <input
          name="again"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
        <span>Mostrar senhas</span>
      </label>
      <button className="action primary" disabled={busy}>
        {busy ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
