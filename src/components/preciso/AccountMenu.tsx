import { useId, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, ChartNoAxesCombined, ClipboardList, Menu, Settings, Store } from "lucide-react";
import { hasCompanyPermission, type CompanyActor } from "@/lib/company-permissions";

export const hasServiceAccess = (user: CompanyActor) =>
  user.role === "admin" || user.permissions.some((permission) => permission.startsWith("service_"));

export const hasManagementAccess = (user: CompanyActor) =>
  hasServiceAccess(user) || hasCompanyPermission(user, "finance_cfo");

export function managementHome(user: CompanyActor) {
  if (user.role === "admin") return "/admin/administracao";
  if (hasCompanyPermission(user, "service_requests")) return "/admin/administracao";
  return hasServiceAccess(user) ? "/admin/gestao-servicos" : "/admin/cfo";
}

const managementLinks = [
  {
    to: "/admin/administracao",
    label: "Solicitações de orçamento",
    icon: ClipboardList,
    allow: (user: CompanyActor) => hasCompanyPermission(user, "service_requests"),
  },
  {
    to: "/admin/comercial",
    label: "Gestão da Loja",
    icon: Store,
    allow: (user: CompanyActor) => user.role === "admin",
  },
  {
    to: "/admin/gestao-servicos",
    label: "Gestão de Serviços",
    icon: Building2,
    allow: hasServiceAccess,
  },
  {
    to: "/admin/cfo",
    label: "CFO",
    icon: ChartNoAxesCombined,
    allow: (user: CompanyActor) => hasCompanyPermission(user, "finance_cfo"),
  },
  {
    to: "/admin/configuracoes",
    label: "Configurações",
    icon: Settings,
    allow: (user: CompanyActor) => user.role === "admin",
  },
] as const;

export function ManagementLinks({ user }: { user: CompanyActor }) {
  return managementLinks
    .filter(({ allow }) => allow(user))
    .map(({ to, label, icon: Icon }) => (
      <Link
        key={to}
        to={to}
        className="account-menu-item"
        activeOptions={{ exact: true, includeSearch: false }}
      >
        <Icon size={17} aria-hidden="true" />
        {label}
      </Link>
    ));
}

export function AccountLayout({
  label,
  menu,
  children,
}: {
  label: string;
  menu: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="company-layout account-layout">
      <aside className="company-menu account-menu">
        <button
          type="button"
          className="action company-menu-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          <Menu size={18} aria-hidden="true" /> {open ? "Fechar menu" : label}
        </button>
        <nav id={id} aria-label={label} className={open ? "is-open" : undefined}>
          {menu}
        </nav>
      </aside>
      <div className="company-content">{children}</div>
    </div>
  );
}
