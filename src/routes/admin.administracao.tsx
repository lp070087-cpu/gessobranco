import { createFileRoute } from "@tanstack/react-router";
import { AccountLayout, ManagementMenu } from "@/components/preciso/AccountMenu";
import { CompanyRequests } from "@/components/preciso/CompanyRequests";
import { CompanySession } from "@/components/preciso/CompanySession";
import { BusinessSettingsForm } from "@/components/preciso/BusinessSettings";
import { hasCompanyPermission } from "@/lib/company-permissions";

export const Route = createFileRoute("/admin/administracao")({
  validateSearch: (search: Record<string, unknown>): { secao?: "configuracoes" } =>
    search.secao === "configuracoes" ? { secao: "configuracoes" } : {},
  head: () => ({ meta: [{ title: "Administração — Ouro Branco" }] }),
  component: Administration,
});

function Administration() {
  const settings = Route.useSearch().secao === "configuracoes";
  return (
    <CompanySession
      title="Administração"
      allowed={(user) => hasCompanyPermission(user, "service_requests")}
    >
      {(user) => (
        <AccountLayout label="Menu da gestão" menu={<ManagementMenu user={user} />}>
          {settings && user.role === "admin" ? (
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
