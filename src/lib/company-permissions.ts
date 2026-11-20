export const companyPermissions = [
  "service_requests",
  "service_catalogue",
  "service_agenda",
  "service_projects",
  "finance_cfo",
  "store_closing",
] as const;
export type CompanyPermission = (typeof companyPermissions)[number];
export type CompanyActor = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  permissions: CompanyPermission[];
};
export const hasCompanyPermission = (
  actor: Pick<CompanyActor, "role" | "permissions">,
  permission: CompanyPermission,
) => actor.role === "admin" || actor.permissions.includes(permission);
