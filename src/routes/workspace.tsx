import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace")({
  head: () => ({ meta: [{ title: "Workspace — Ouro Branco" }] }),
  component: () => <Outlet />,
});
