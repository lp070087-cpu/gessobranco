import { createFileRoute } from "@tanstack/react-router";
import { AccountLayout, ManagementLinks } from "@/components/preciso/AccountMenu";
import { CompanyRequests } from "@/components/preciso/CompanyRequests";
import { CompanySession } from "@/components/preciso/CompanySession";
import { hasCompanyPermission } from "@/lib/company-permissions";

export const Route = createFileRoute("/admin/administracao")({
  head: () => ({ meta: [{ title: "Administração — Ouro Branco" }] }),
  component: Administration,
});

function Administration() {
  return (
    <CompanySession
      title="Administração"
      allowed={(user) => hasCompanyPermission(user, "service_requests")}
    >
      {(user) => (
        <AccountLayout label="Menu da administração" menu={<ManagementLinks user={user} />}>
          <CompanyRequests
            kind="service"
            canStartProject={hasCompanyPermission(user, "service_projects")}
          />
        </AccountLayout>
      )}
    </CompanySession>
  );
}
