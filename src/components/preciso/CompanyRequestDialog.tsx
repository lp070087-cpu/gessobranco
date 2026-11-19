import { useRef, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { commercialFetch } from "@/lib/commercial-client";

export type RequestContext = {
  kind: "service" | "material";
  subject?: string;
  product_id?: string;
  unit_name?: string;
  order_unit_id?: string;
  quantity?: number;
};

export function CompanyRequestDialog({
  context,
  close,
}: {
  context: RequestContext;
  close: () => void;
}) {
  const key = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const material = context.kind === "material";
  const orderUnit = context.order_unit_id;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const values = new FormData(event.currentTarget);
    key.current ??= crypto.randomUUID();
    setStatus("sending");
    setError("");
    try {
      if (orderUnit) {
        await commercialFetch("portal/orders", {
          request_key: key.current,
          unit_id: orderUnit,
          quantity: context.quantity,
          notes: String(values.get("notes")),
        });
      } else
        await commercialFetch("company-requests", {
          ...context,
          request_key: key.current,
          name: String(values.get("name")),
          email: String(values.get("email")),
          phone: String(values.get("phone")),
          subject: context.subject ?? String(values.get("subject")),
          notes: String(values.get("notes")),
          ...(material
            ? {
                unit_name: context.unit_name ?? String(values.get("unit_name")),
                quantity: context.quantity ?? Number(values.get("quantity")),
              }
            : {}),
        });
      setStatus("sent");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Não foi possível enviar a solicitação.",
      );
      setStatus("idle");
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && status !== "sending") close();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-surface border-border">
        <DialogHeader>
          <DialogTitle>
            {material ? "Consultar compra de material" : "Solicitar orçamento de serviço"}
          </DialogTitle>
          <DialogDescription>
            {context.subject ?? "Informe o que precisa para a equipe retornar."}
          </DialogDescription>
        </DialogHeader>
        {status === "sent" ? (
          <div>
            <p role="status">Solicitação recebida pela Ouro Branco.</p>
            <button
              type="button"
              className="editorial-button editorial-button-primary mt-4"
              onClick={close}
            >
              Fechar
            </button>
          </div>
        ) : (
          <form className="commercial request-fields" onSubmit={submit}>
            {!context.subject && (
              <label>
                {material ? "Material" : "Serviço"}
                <input name="subject" required maxLength={180} />
              </label>
            )}
            {material && !context.quantity && (
              <label>
                Quantidade
                <input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  max="1000000"
                  step="0.000001"
                  required
                />
              </label>
            )}
            {material && !context.unit_name && (
              <label>
                Unidade
                <input
                  name="unit_name"
                  placeholder="Quilo, saco, tonelada"
                  required
                  maxLength={100}
                />
              </label>
            )}
            {material && context.quantity && (
              <p className="hint">
                {context.quantity.toLocaleString("pt-BR")} × {context.unit_name}
              </p>
            )}
            {!orderUnit && (
              <>
                <label>
                  Nome
                  <input name="name" autoComplete="name" required minLength={2} maxLength={160} />
                </label>
                <label>
                  E-mail
                  <input name="email" type="email" autoComplete="email" required maxLength={254} />
                </label>
                <label>
                  Telefone
                  <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
                </label>
              </>
            )}
            <label>
              Detalhes do pedido
              <textarea name="notes" rows={3} maxLength={2000} />
            </label>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <button className="action primary" disabled={status === "sending"}>
              {status === "sending" ? "Enviando…" : "Enviar solicitação"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
