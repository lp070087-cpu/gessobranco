import { useState, type FormEvent } from "react";
import { companyPermissions, type CompanyPermission } from "@/lib/company-permissions";
import { commercialFetch, type Customer } from "@/lib/commercial-client";

type RecordView = {
  email: string;
  full_name: string;
  permissions: CompanyPermission[];
  customer_id: string | null;
};
const labels: Record<CompanyPermission, string> = {
  service_requests: "Orçamentos e clientes",
  service_catalogue: "Catálogo e regras de cálculo",
  service_agenda: "Agendamentos e visitas",
  service_projects: "Serviços em andamento",
  finance_cfo: "CFO financeiro",
  store_closing: "Folha do dia, caixa e fechamento (secretária)",
};
export function CompanyAccess({ customers }: { customers: Customer[] }) {
  const [email, setEmail] = useState(""),
    [account, setAccount] = useState<RecordView | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function apply(
    event: FormEvent<HTMLFormElement>,
    action: "lookup" | "permissions" | "customer",
  ) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const body =
        action === "lookup"
          ? { email }
          : action === "permissions"
            ? { email: account?.email, permissions: form.getAll("permissions") }
            : { email: account?.email, customer_id: String(form.get("customer") ?? "") || null };
      const saved = await commercialFetch<RecordView>("admin/permissions", body);
      setAccount(saved);
      if (action !== "lookup") setMessage("Alteração salva.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel space">
      <details>
        <summary>Acessos da equipe e vínculos de clientes</summary>
        <p className="hint">
          Localize uma conta já cadastrada pelo e-mail. Confira com a pessoa antes de conceder
          acesso ou vincular preços comerciais.
        </p>
        <form className="space" onSubmit={(event) => void apply(event, "lookup")}>
          <label>
            E-mail da conta
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setAccount(null);
              }}
              required
              maxLength={254}
            />
          </label>
          <button className="action" disabled={busy}>
            Buscar conta
          </button>
        </form>
        {error && (
          <p className="notice error space" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="hint" role="status">
            {message}
          </p>
        )}
        {account && (
          <>
            <h2 className="space">{account.full_name}</h2>
            <form
              key={account.email + account.permissions.join()}
              onSubmit={(event) => void apply(event, "permissions")}
            >
              <fieldset disabled={busy}>
                {companyPermissions.map((permission) => (
                  <label className="check" key={permission}>
                    <input
                      type="checkbox"
                      name="permissions"
                      value={permission}
                      defaultChecked={account.permissions.includes(permission)}
                    />
                    {labels[permission]}
                  </label>
                ))}
                <button className="action">Salvar permissões</button>
              </fieldset>
            </form>
            <form
              key={account.email + account.customer_id}
              className="space"
              onSubmit={(event) => void apply(event, "customer")}
            >
              <label>
                Cliente comercial vinculado
                <select name="customer" defaultValue={account.customer_id ?? ""}>
                  <option value="">Sem vínculo</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="action" disabled={busy}>
                Salvar vínculo comercial
              </button>
            </form>
          </>
        )}
      </details>
    </section>
  );
}
