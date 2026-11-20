import { createFileRoute } from "@tanstack/react-router";
import {
  AccountLayout,
  ManagementMenu,
  hasManagementAccess,
} from "@/components/preciso/AccountMenu";
import { ChangePassword } from "@/components/preciso/ChangePassword";
import { CompanyRequests } from "@/components/preciso/CompanyRequests";
import { CompanySession } from "@/components/preciso/CompanySession";
import { BusinessSettingsForm } from "@/components/preciso/BusinessSettings";
import { hasCompanyPermission } from "@/lib/company-permissions";

export const Route = createFileRoute("/admin/administracao")({
  validateSearch: (search: Record<string, unknown>): { secao?: "configuracoes" | "senha" } =>
    search.secao === "configuracoes" || search.secao === "senha" ? { secao: search.secao } : {},
  head: () => ({ meta: [{ title: "Administração — Ouro Branco" }] }),
  component: Administration,
});

function Administration() {
  const { secao } = Route.useSearch();
  const settings = secao === "configuracoes";
  return (
    <CompanySession
      title="Administração"
      allowed={(user) =>
        secao === "senha"
          ? hasManagementAccess(user)
          : hasCompanyPermission(user, "service_requests")
      }
    >
      {(user) => (
        <AccountLayout label="Menu da gestão" menu={<ManagementMenu user={user} />}>
          {secao === "senha" ? (
            <ChangePassword />
          ) : settings && user.role === "admin" ? (
            <BusinessSettingsForm />
          ) : (
            <CompanyRequests
              kind="service"
              canStartProject={hasCompanyPermission(user, "service_projects")}
            />
          )}
        </AccountLayout>
      )}
    </CompanySession>
  );
}
