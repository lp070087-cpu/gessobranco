import { Link } from "@tanstack/react-router";
import { CalendarCheck, ArrowRight, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useEffect, useState } from "react";
import { commercialFetch } from "@/lib/commercial-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: { service?: string; area?: number; price?: number; details?: string[] };
}

export function ScheduleDialog({ open, onOpenChange, context }: Props) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void commercialFetch("auth/me", undefined, controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setConnected(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnected(false);
      });
    return () => controller.abort();
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-surface border-border rounded-3xl p-7 sm:p-9">
        <div className="size-14 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
          <CalendarCheck className="size-6" />
        </div>
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            Vamos conhecer seu projeto.
          </DialogTitle>
          <DialogDescription className="text-muted-foreground leading-relaxed">
            A visita técnica permite validar medidas, acesso, materiais e o cronograma antes da
            proposta definitiva.
          </DialogDescription>
        </DialogHeader>
        {context?.service && (
          <div className="rounded-xl border border-border bg-background p-4 text-sm">
            <p className="font-medium">{context.service}</p>
            {!!context.area && (
              <p className="mt-1 text-muted-foreground">
                Área informada: {context.area.toLocaleString("pt-BR")} m²
              </p>
            )}
            {!!context.details?.length && (
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {context.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground flex gap-3 leading-relaxed">
          <ShieldCheck className="size-5 shrink-0 text-accent" />
          {user || connected
            ? "Escolha a data e informe o endereço na sua agenda. O horário será confirmado pela equipe."
            : "Entre ou crie sua conta para solicitar uma visita e acompanhar a confirmação com segurança."}
        </p>
        <Link
          to={connected ? "/minha-conta" : user ? "/agendar" : "/login"}
          search={
            connected
              ? { secao: "agenda" }
              : user
                ? ({ service: context?.service ?? "Visita técnica" } as never)
                : undefined
          }
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground p-4 text-sm font-bold"
          onClick={() => onOpenChange(false)}
        >
          {user || connected ? "Escolher data da visita" : "Entrar e solicitar visita"}
          <ArrowRight className="size-4" />
        </Link>
        {!user && !connected && (
          <Link
            to="/signup"
            onClick={() => onOpenChange(false)}
            className="text-center text-sm text-accent hover:underline"
          >
            Ainda não tenho conta
          </Link>
        )}
      </DialogContent>
    </Dialog>
  );
}
