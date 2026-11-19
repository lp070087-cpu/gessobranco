import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/configuracoes")({
  component: () => (
    <Navigate to="/admin/administracao" search={{ secao: "configuracoes" }} replace />
  ),
});
