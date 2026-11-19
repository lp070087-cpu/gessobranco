import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "iphone" | "android" | "mac" | "desktop";

function devicePlatform(): Platform {
  const agent = navigator.userAgent;
  if (
    /iPhone|iPad|iPod/.test(agent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  )
    return "iphone";
  if (/Android/i.test(agent)) return "android";
  if (/Macintosh/.test(agent) && /Safari/.test(agent) && !/Chrome|Chromium|Edg/.test(agent))
    return "mac";
  return "desktop";
}

const installHelp: Record<Platform, string> = {
  iphone:
    "Abra o Ouro Branco no Safari. Toque em Compartilhar, depois em Adicionar à Tela de Início. Se aparecer Abrir como App da Web, ative essa opção e toque em Adicionar.",
  android:
    "Abra o Ouro Branco no Chrome. No menu ⋮, escolha Instalar app ou Adicionar à tela inicial e confirme.",
  mac: "Abra o Ouro Branco no Safari. No menu Arquivo, escolha Adicionar ao Dock. No Chrome ou Edge, use o ícone de instalação na barra de endereço.",
  desktop:
    "Abra o Ouro Branco no Chrome ou no Edge. Use o ícone Instalar na barra de endereço ou procure a instalação do site no menu do navegador.",
};

export function InstallApp() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const readDisplayMode = () =>
      setInstalled(
        standalone.matches ||
          Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      );
    const capture = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPrompt);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
      setOpen(false);
    };
    setPlatform(devicePlatform());
    readDisplayMode();
    standalone.addEventListener("change", readDisplayMode);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", onInstalled);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/service-worker.js").catch(() => {
        // Installation guidance remains available in browsers that manage it directly.
      });
    }
    return () => {
      standalone.removeEventListener("change", readDisplayMode);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!platform || installed) return null;

  async function showInstall(nextOpen: boolean) {
    if (!nextOpen || !deferred) {
      setOpen(nextOpen);
      return;
    }
    const prompt = deferred;
    setDeferred(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setOpen(false);
    } catch {
      setOpen(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => void showInstall(nextOpen)}>
      <DialogTrigger asChild>
        <button type="button" className="ouro-install-action">
          <Download size={16} aria-hidden="true" /> Instalar app
        </button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-border bg-background text-foreground">
        <DialogHeader>
          <DialogTitle>Instalar Ouro Branco</DialogTitle>
          <DialogDescription>{installHelp[platform]}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
