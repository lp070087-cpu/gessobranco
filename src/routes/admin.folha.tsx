import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AccountLayout,
  ManagementMenu,
  hasStoreSheetAccess,
} from "@/components/preciso/AccountMenu";
import { CompanySession } from "@/components/preciso/CompanySession";
import {
  Closings,
  CompanyDebts,
  DaySheet,
  Fiados,
  WeekSheet,
} from "@/components/preciso/StoreSheets";
import { Deliveries } from "@/components/preciso/StoreDeliveries";
import type { CompanyActor } from "@/lib/company-permissions";

const slugs = ["semana", "fechamentos", "fiados", "debitos", "entregas"] as const;
type Slug = (typeof slugs)[number];
const adminOnly: Slug[] = ["fiados", "debitos", "entregas"];

export const Route = createFileRoute("/admin/folha")({
  validateSearch: (search: Record<string, unknown>): { secao?: Slug; dia?: string } => ({
    ...(slugs.includes(search.secao as Slug) ? { secao: search.secao as Slug } : {}),
    ...(typeof search.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.dia)
      ? { dia: search.dia }
      : {}),
  }),
  head: () => ({ meta: [{ title: "Folhas da loja — Ouro Branco" }] }),
  component: () => (
    <CompanySession title="Folhas da loja" allowed={hasStoreSheetAccess}>
      {(user) => <StoreArea user={user} />}
    </CompanySession>
  ),
});

function StoreArea({ user }: { user: CompanyActor }) {
  const { secao: requested, dia } = Route.useSearch();
  const navigate = useNavigate();
  const secao =
    requested && adminOnly.includes(requested) && user.role !== "admin" ? undefined : requested;
  const openDay = (day: string) => void navigate({ to: "/admin/folha", search: { dia: day } });
  return (
    <AccountLayout label="Menu da gestão" menu={<ManagementMenu user={user} />}>
      {!secao && <DaySheet key={dia ?? "hoje"} user={user} initialDay={dia} />}
      {secao === "semana" && <WeekSheet openDay={openDay} />}
      {secao === "fechamentos" && <Closings openDay={openDay} />}
      {secao === "fiados" && <Fiados />}
      {secao === "debitos" && <CompanyDebts />}
      {secao === "entregas" && <Deliveries />}
    </AccountLayout>
  );
}
