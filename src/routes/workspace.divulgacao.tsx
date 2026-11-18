import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Copy,
  Check,
  QrCode,
  Share2,
  ExternalLink,
  MessageCircle,
  Send,
  Facebook,
  Instagram,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkspaceShell } from "@/components/preciso/WorkspaceShell";

export const Route = createFileRoute("/workspace/divulgacao")({
  component: DivulgacaoPage,
});

function DivulgacaoPage() {
  const { user } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("slug, company_name, full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSlug(data?.slug ?? null);
        setName(data?.company_name ?? data?.full_name ?? "Sua marca");
      });
  }, [user]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = slug ? `${origin}/p/${slug}` : "";
  const qr = link
    ? `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(link)}&color=0d0d0d&bgcolor=ffffff`
    : "";

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const share = async (channel: string, url: string) => {
    if (user) await supabase.from("shares").insert({ owner_id: user.id, channel });
    window.open(url, "_blank");
  };

  const msg = encodeURIComponent(`Faça seu orçamento na ${name} agora: ${link}`);

  if (!slug) {
    return (
      <WorkspaceShell title="Meu link de orçamento">
        <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-3 max-w-xl mx-auto">
          <Share2 className="size-10 text-accent mx-auto" />
          <h2 className="text-xl font-extrabold tracking-tighter">Defina seu link primeiro</h2>
          <p className="text-sm text-muted-foreground">
            Vá em <b>Personalizar</b> e escolha o slug da sua marca para gerar o link público.
          </p>
          <a
            href="/workspace/personalizar"
            className="inline-flex px-5 py-2.5 bg-accent text-accent-foreground rounded-lg text-xs font-bold uppercase tracking-widest"
          >
            Personalizar agora
          </a>
        </div>
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      title="Meu link de orçamento"
      subtitle="Compartilhe e receba pedidos diretamente."
    >
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="bg-gradient-to-br from-navy/40 via-surface to-background border border-accent/30 rounded-3xl p-6 md:p-8 space-y-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-accent font-bold">
            Seu link público
          </div>
          <div className="flex items-center gap-2 bg-background border border-border rounded-xl px-4 py-3 font-mono text-sm break-all">
            <span className="flex-1">{link}</span>
            <button
              onClick={copy}
              className="size-8 rounded-md bg-accent text-accent-foreground flex items-center justify-center shrink-0"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-xs font-bold uppercase tracking-widest hover:border-accent hover:text-accent transition-colors"
            >
              <ExternalLink className="size-3.5" /> Abrir
            </a>
            <button
              onClick={() => share("whatsapp", `https://wa.me/?text=${msg}`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#25D366]/15 border border-[#25D366]/40 text-[#25D366] rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              <MessageCircle className="size-3.5" /> WhatsApp
            </button>
            <button
              onClick={() =>
                share(
                  "telegram",
                  `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${msg}`,
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-500/15 border border-sky-500/40 text-sky-400 rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              <Send className="size-3.5" /> Telegram
            </button>
            <button
              onClick={() =>
                share(
                  "facebook",
                  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`,
                )
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600/15 border border-blue-600/40 text-blue-400 rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              <Facebook className="size-3.5" /> Facebook
            </button>
            <button
              onClick={() => share("instagram", `https://www.instagram.com/`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-pink-500/15 border border-pink-500/40 text-pink-400 rounded-lg text-xs font-bold uppercase tracking-widest"
            >
              <Instagram className="size-3.5" /> Instagram
            </button>
          </div>
          <div className="pt-4 border-t border-border text-xs text-muted-foreground space-y-1">
            <p>
              <b className="text-foreground">Dica:</b> compartilhe nos seus stories e bio para
              receber orçamentos 24/7.
            </p>
            <p>
              Cada acesso é registrado no <b className="text-foreground">Analytics</b>.
            </p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-3xl p-6 flex flex-col items-center justify-center gap-4">
          <div className="text-[10px] uppercase tracking-[0.3em] text-accent font-bold flex items-center gap-2">
            <QrCode className="size-3.5" /> QR Code
          </div>
          <div className="bg-white p-3 rounded-2xl shadow-2xl">
            <img src={qr} alt="QR Code" className="size-56" />
          </div>
          <a
            href={qr}
            download={`qr-${slug}.png`}
            className="px-4 py-2 border border-border rounded-lg text-xs font-bold uppercase tracking-widest hover:border-accent hover:text-accent transition-colors"
          >
            Baixar QR
          </a>
        </div>
      </div>
    </WorkspaceShell>
  );
}
