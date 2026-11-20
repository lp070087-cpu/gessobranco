import { useEffect, useId, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  BookOpenCheck,
  Boxes,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GitCompareArrows,
  HandCoins,
  KeyRound,
  History,
  Landmark,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Receipt,
  Ruler,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Upload,
  Users,
  Wallet,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { hasCompanyPermission, type CompanyActor } from "@/lib/company-permissions";
import { InstallApp } from "./InstallApp";

export const hasServiceAccess = (user: CompanyActor) =>
  user.role === "admin" || user.permissions.some((permission) => permission.startsWith("service_"));

export const hasStoreSheetAccess = (user: Pick<CompanyActor, "role" | "permissions">) =>
  user.role === "admin" || hasCompanyPermission(user, "store_closing");

export const hasManagementAccess = (user: CompanyActor) =>
  hasServiceAccess(user) || hasCompanyPermission(user, "finance_cfo") || hasStoreSheetAccess(user);

export function managementHome(user: CompanyActor) {
  if (user.role === "admin") return "/admin/administracao";
  if (hasCompanyPermission(user, "service_requests")) return "/admin/administracao";
  if (hasServiceAccess(user)) return "/admin/gestao-servicos";
  if (hasStoreSheetAccess(user)) return "/admin/folha";
  return "/admin/cfo";
}

type Item = {
  to: string;
  secao?: string;
  label: string;
  icon: LucideIcon;
  allow: (user: CompanyActor) => boolean;
};
type Group = { title: string; items: Item[] };
const admin = (user: CompanyActor) => user.role === "admin";
const permission = (name: Parameters<typeof hasCompanyPermission>[1]) => (user: CompanyActor) =>
  hasCompanyPermission(user, name);

/** Um só menu lateral para toda a gestão: administração, loja, serviços e CFO. */
export const managementGroups: Group[] = [
  {
    title: "Administração",
    items: [
      {
        to: "/admin/administracao",
        label: "Orçamentos recebidos",
        icon: ClipboardList,
        allow: permission("service_requests"),
      },
      {
        to: "/admin/gestao-servicos",
        secao: "catalogo",
        label: "Valores por metro",
        icon: Ruler,
        allow: permission("service_catalogue"),
      },
      {
        to: "/admin/administracao",
        secao: "configuracoes",
        label: "Configurações",
        icon: Settings,
        allow: admin,
      },
      {
        to: "/admin/administracao",
        secao: "senha",
        label: "Trocar senha",
        icon: KeyRound,
        allow: hasManagementAccess,
      },
    ],
  },
  {
    title: "Loja",
    items: [
      { to: "/admin/comercial", label: "Visão geral", icon: LayoutDashboard, allow: admin },
      {
        to: "/admin/comercial",
        secao: "vender",
        label: "Vender",
        icon: ShoppingCart,
        allow: admin,
      },
      {
        to: "/admin/folha",
        label: "Folha do dia",
        icon: Receipt,
        allow: hasStoreSheetAccess,
      },
      {
        to: "/admin/folha",
        secao: "semana",
        label: "Folha da semana",
        icon: CalendarRange,
        allow: hasStoreSheetAccess,
      },
      {
        to: "/admin/folha",
        secao: "fechamentos",
        label: "Fechamentos",
        icon: BookOpenCheck,
        allow: hasStoreSheetAccess,
      },
      { to: "/admin/folha", secao: "fiados", label: "Fiados", icon: HandCoins, allow: admin },
      {
        to: "/admin/folha",
        secao: "debitos",
        label: "Débitos da empresa",
        icon: Landmark,
        allow: admin,
      },
      {
        to: "/admin/folha",
        secao: "entregas",
        label: "Conferir entregas",
        icon: PackageCheck,
        allow: admin,
      },
      { to: "/admin/comercial", secao: "estoque", label: "Estoque", icon: Boxes, allow: admin },
      { to: "/admin/comercial", secao: "produtos", label: "Produtos", icon: Store, allow: admin },
      { to: "/admin/comercial", secao: "clientes", label: "Clientes", icon: Users, allow: admin },
      { to: "/admin/comercial", secao: "compras", label: "Compras", icon: Truck, allow: admin },
      {
        to: "/admin/comercial",
        secao: "materiais",
        label: "Pedidos de material",
        icon: ClipboardCheck,
        allow: admin,
      },
      {
        to: "/admin/comercial",
        secao: "financeiro",
        label: "Financeiro",
        icon: Wallet,
        allow: admin,
      },
      {
        to: "/admin/comercial",
        secao: "importar",
        label: "Importar planilha",
        icon: Upload,
        allow: admin,
      },
    ],
  },
  {
    title: "Serviços",
    items: [
      {
        to: "/admin/gestao-servicos",
        label: "Orçamentos e clientes",
        icon: ClipboardList,
        allow: permission("service_requests"),
      },
      {
        to: "/admin/gestao-servicos",
        secao: "agenda",
        label: "Agendamentos",
        icon: CalendarDays,
        allow: permission("service_agenda"),
      },
      {
        to: "/admin/gestao-servicos",
        secao: "andamento",
        label: "Serviços em andamento",
        icon: Wrench,
        allow: permission("service_projects"),
      },
    ],
  },
  {
    title: "CFO",
    items: [
      {
        to: "/admin/cfo",
        label: "Visão financeira",
        icon: ChartNoAxesCombined,
        allow: permission("finance_cfo"),
      },
      {
        to: "/admin/cfo",
        secao: "importar",
        label: "Importar extrato",
        icon: FileSpreadsheet,
        allow: permission("finance_cfo"),
      },
      {
        to: "/admin/cfo",
        secao: "comparar",
        label: "Comparar períodos",
        icon: GitCompareArrows,
        allow: permission("finance_cfo"),
      },
      {
        to: "/admin/cfo",
        secao: "historico",
        label: "Histórico",
        icon: History,
        allow: permission("finance_cfo"),
      },
      {
        to: "/admin/cfo",
        secao: "despesas",
        label: "Despesas e Pix",
        icon: BadgeDollarSign,
        allow: admin,
      },
    ],
  },
];

export function ManagementMenu({ user }: { user: CompanyActor }) {
  const location = useRouterState({ select: (state) => state.location });
  const current = (location.search as { secao?: string }).secao;
  return (
    <>
      {managementGroups.map((group) => {
        const items = group.items.filter((item) => item.allow(user));
        if (!items.length) return null;
        return (
          <div className="menu-group" key={group.title}>
            <p className="menu-group-title">{group.title}</p>
            {items.map(({ to, secao, label, icon: Icon }) => {
              const active = location.pathname === to && current === secao;
              return (
                <Link
                  key={label}
                  to={to}
                  search={(secao ? { secao } : {}) as never}
                  className="account-menu-item"
                  aria-current={active ? "page" : undefined}
                  activeOptions={{ exact: true, includeSearch: true }}
                  activeProps={{ "aria-current": active ? "page" : undefined }}
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

/** Mantido para telas antigas: o menu completo da gestão. */
export const ManagementLinks = ManagementMenu;

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
  const location = useRouterState({ select: (state) => state.location.href });
  useEffect(() => setOpen(false), [location]);
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
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          {open ? "Fechar menu" : label}
        </button>
        <nav id={id} aria-label={label} className={open ? "is-open" : undefined}>
          {menu}
          <InstallApp />
        </nav>
      </aside>
      <div className="company-content">{children}</div>
    </div>
  );
}
