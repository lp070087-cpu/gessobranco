import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Ruler,
  PaintBucket,
  MessageCircle,
  ImagePlus,
  X,
  Loader2,
  ShieldCheck,
  Clock,
  Wrench,
  ArrowRight,
  Image as ImageIcon,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { analyzePhotos } from "@/lib/ai-analysis.functions";

type Profile = {
  id: string;
  slug: string;
  company_name: string | null;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  brand_color: string | null;
};
type Svc = {
  id: string;
  key: string;
  name: string;
  short_name: string;
  description: string;
  price_per_m2: number;
  image_url: string | null;
};
type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  image_url: string | null;
};
type Gallery = { id: string; title: string; before_url: string | null; after_url: string | null };

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const { data: profile } = await supabase
      // Transitional cast until generated Supabase types include the safe view.
      .from("public_brand_profiles" as "profiles")
      .select("id,slug,company_name,tagline,description,logo_url,brand_color")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!profile) throw notFound();
    return { profile: profile as Profile };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.profile.company_name ?? "PRECISO";
    const desc =
      loaderData?.profile.tagline ??
      loaderData?.profile.description ??
      `Solicite seu orçamento com ${name}.`;
    return {
      meta: [
        { title: `${name} — Orçamento online` },
        { name: "description", content: desc },
        { property: "og:title", content: `${name} — Orçamento online` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        ...(loaderData?.profile.logo_url
          ? [{ property: "og:image", content: loaderData.profile.logo_url }]
          : []),
      ],
    };
  },
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background text-center px-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tighter">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground mt-2">Verifique o link e tente novamente.</p>
      </div>
    </div>
  ),
  component: PublicPage,
});

const CONDITIONS = [
  "Parede desalinhada / torta",
  "Infiltração ou umidade",
  "Rachaduras visíveis",
  "Vai derrubar parede",
  "Vai construir parede",
  "Pintura antiga descascando",
];

function PublicPage() {
  const { profile } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const brand = profile.brand_color || "#c9a84c";
  const name = profile.company_name || "Profissional PRECISO";

  const [services, setServices] = useState<Svc[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [gallery, setGallery] = useState<Gallery[]>([]);

  const [altura, setAltura] = useState("3");
  const [largura, setLargura] = useState("3");
  const [svcId, setSvcId] = useState<string | null>(null);
  const [conds, setConds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [analyzing, setAnalyzing] = useState(false);
  type AI = {
    difficulty: string;
    multiplier: number;
    estimated_hours: number;
    detected_issues: string[];
    suggested_materials: string[];
    summary: string;
  };
  const [ai, setAi] = useState<AI | null>(null);

  const analyzeFn = useServerFn(analyzePhotos);

  // Track visit once
  useEffect(() => {
    supabase.from("page_visits").insert({
      owner_id: profile.id,
      slug: profile.slug,
      referrer: typeof document !== "undefined" ? document.referrer.slice(0, 200) : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null,
    });
  }, [profile.id, profile.slug]);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: p }, { data: g }] = await Promise.all([
        supabase
          .from("services")
          .select("id,key,name,short_name,description,price_per_m2,image_url")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("products")
          .select("id,name,category,price,image_url")
          .eq("owner_id", profile.id)
          .eq("is_active", true)
          .limit(6),
        supabase
          .from("gallery_items")
          .select("id,title,before_url,after_url")
          .eq("owner_id", profile.id)
          .eq("is_active", true)
          .limit(8),
      ]);
      setServices((s ?? []) as Svc[]);
      setProducts((p ?? []) as Product[]);
      setGallery((g ?? []) as Gallery[]);
      if (s && s.length && !svcId) setSvcId((s[0] as Svc).id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  const area = useMemo(() => {
    const a = parseFloat(altura) || 0;
    const l = parseFloat(largura) || 0;
    return Math.max(0, a * l);
  }, [altura, largura]);
  const svc = services.find((s) => s.id === svcId) ?? null;
  const base = svc ? area * Number(svc.price_per_m2) : 0;
  const total = base * (ai?.multiplier ?? 1);

  const toggleCond = (c: string) =>
    setConds((arr) => (arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c]));

  const onPhotos = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 4 - photos.length);
    setPhotos((p) => [...p, ...arr].slice(0, 4));
  };

  const runAI = async () => {
    if (!svc) return toast.error("Escolha um serviço.");
    if (!user) {
      toast.error("Faça login para usar a análise por IA.");
      navigate({ to: "/login" });
      return;
    }
    setAnalyzing(true);
    try {
      const paths: string[] = [];
      for (const f of photos) {
        const ext = f.name.split(".").pop() || "jpg";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage.from("quote-photos").upload(path, f);
        if (!error) paths.push(path);
      }
      const result = await analyzeFn({
        data: {
          photoPaths: paths,
          serviceName: svc.name,
          area,
          notes,
          conditions: conds,
        },
      });
      setAi(result);
      await supabase.from("ai_analyses").insert({
        user_id: user.id,
        photo_urls: paths,
        difficulty: result.difficulty,
        detected_issues: result.detected_issues,
        suggested_materials: result.suggested_materials,
        estimated_hours: result.estimated_hours,
        multiplier: result.multiplier,
        summary: result.summary,
      });
      toast.success("Análise concluída pela IA");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise");
    } finally {
      setAnalyzing(false);
    }
  };

  const saveQuote = async () => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!svc) return;
    const { error } = await supabase.from("quotes").insert({
      user_id: user.id,
      service_id: svc.id,
      service_name: svc.name,
      height: parseFloat(altura) || 0,
      width: parseFloat(largura) || 0,
      area,
      price_per_m2: Number(svc.price_per_m2),
      estimated_total: total,
      notes: [notes, conds.join(" · ")].filter(Boolean).join("\n"),
      status: "estimado",
    });
    if (error) return toast.error(error.message);
    toast.success("Orçamento salvo no seu histórico");
    navigate({ to: "/orcamentos" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* HERO */}
      <header
        className="relative overflow-hidden"
        style={{
          background: `radial-gradient(120% 80% at 0% 0%, ${brand}33, transparent 60%), radial-gradient(80% 60% at 100% 0%, ${brand}22, transparent 50%)`,
        }}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-10 md:py-16 flex items-center gap-5 md:gap-7">
          <div className="size-20 md:size-28 rounded-3xl bg-surface border border-border shadow-2xl overflow-hidden flex items-center justify-center shrink-0">
            {profile.logo_url ? (
              <img src={profile.logo_url} alt={name} className="size-full object-cover" />
            ) : (
              <span className="font-extrabold text-4xl tracking-tighter" style={{ color: brand }}>
                {name[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div
              className="text-[10px] uppercase tracking-[0.3em] font-bold"
              style={{ color: brand }}
            >
              Orçamento online
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter mt-1">{name}</h1>
            <p className="text-sm md:text-base text-muted-foreground mt-1 max-w-xl">
              {profile.tagline || "Solicite uma estimativa em segundos."}
            </p>
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span>Atendimento técnico</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="size-3.5" /> Cadastro aprovado
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12">
        {/* CALCULATOR */}
        <section
          id="orcamento"
          className="bg-surface border border-border rounded-3xl p-6 md:p-10 shadow-2xl shadow-black/40 space-y-6 animate-fade-in-up"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div
                className="text-[10px] uppercase tracking-[0.3em] font-bold"
                style={{ color: brand }}
              >
                Calculadora inteligente
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tighter mt-1">
                Faça seu orçamento agora
              </h2>
            </div>
            <Sparkles className="size-7 hidden md:block" style={{ color: brand }} />
          </div>

          {/* Measures */}
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Altura (m)" icon={Ruler}>
              <input
                type="number"
                min={0}
                step={0.1}
                value={altura}
                onChange={(e) => setAltura(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-4 py-4 font-mono text-xl outline-none focus:border-accent"
              />
            </Field>
            <Field label="Largura (m)" icon={Ruler}>
              <input
                type="number"
                min={0}
                step={0.1}
                value={largura}
                onChange={(e) => setLargura(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-4 py-4 font-mono text-xl outline-none focus:border-accent"
              />
            </Field>
          </div>

          {/* Service picker */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2 flex items-center gap-2">
              <PaintBucket className="size-3.5" /> Serviço
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {services.map((s) => {
                const active = s.id === svcId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSvcId(s.id)}
                    className={
                      "text-left rounded-xl border p-3 transition-all " +
                      (active
                        ? "border-accent bg-accent/10"
                        : "border-border hover:border-muted-foreground")
                    }
                  >
                    <div className="text-xs font-bold truncate">{s.short_name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      R$ {Number(s.price_per_m2).toFixed(0)}/m²
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground mb-2">
              Detalhes do local
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {CONDITIONS.map((c) => {
                const on = conds.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleCond(c)}
                    className={
                      "text-left text-xs px-3 py-2 rounded-lg border transition-colors " +
                      (on
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:border-muted-foreground")
                    }
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Photos + AI */}
          <div className="rounded-2xl border border-dashed border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-bold inline-flex items-center gap-2">
                  <Sparkles className="size-4 text-accent" /> Análise por IA
                </div>
                <div className="text-xs text-muted-foreground">
                  Envie até 4 fotos do local. Nossa IA detecta defeitos e ajusta a estimativa.
                </div>
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 border border-border rounded-lg text-xs font-bold uppercase tracking-widest hover:border-accent hover:text-accent inline-flex items-center gap-2"
              >
                <ImagePlus className="size-4" /> Adicionar fotos
              </button>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onPhotos(e.target.files)}
              />
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img
                      src={URL.createObjectURL(f)}
                      alt={`foto ${i + 1}`}
                      className="size-16 rounded-md object-cover border border-border"
                    />
                    <button
                      onClick={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                      className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Observações adicionais (opcional)"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-accent resize-none"
              maxLength={400}
            />
            <button
              onClick={runAI}
              disabled={analyzing}
              className="w-full px-5 py-3 rounded-xl font-bold uppercase tracking-tighter text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: brand, color: "#0d0d0d" }}
            >
              {analyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {analyzing ? "Analisando..." : "Analisar com IA"}
            </button>
          </div>

          {/* AI result + total */}
          {ai && (
            <div className="grid sm:grid-cols-3 gap-3 animate-fade-in">
              <Metric
                icon={Wrench}
                label="Dificuldade"
                value={ai.difficulty.toUpperCase()}
                brand={brand}
              />
              <Metric
                icon={Clock}
                label="Tempo estimado"
                value={`${ai.estimated_hours}h`}
                brand={brand}
              />
              <Metric
                icon={Sparkles}
                label="Ajuste IA"
                value={`x${ai.multiplier.toFixed(2)}`}
                brand={brand}
              />
              {ai.detected_issues.length > 0 && (
                <div className="sm:col-span-3 bg-background border border-border rounded-xl p-4">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                    Detectado pela IA
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ai.detected_issues.map((i, k) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 text-xs rounded-full bg-accent/15 text-accent"
                      >
                        {i}
                      </span>
                    ))}
                  </div>
                  {ai.summary && <p className="text-xs text-muted-foreground mt-2">{ai.summary}</p>}
                </div>
              )}
            </div>
          )}

          <div
            className="rounded-2xl p-6 border"
            style={{
              background: `linear-gradient(135deg, ${brand}22, transparent)`,
              borderColor: `${brand}66`,
            }}
          >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div
                  className="text-[10px] uppercase tracking-[0.3em] font-bold"
                  style={{ color: brand }}
                >
                  Estimativa de investimento
                </div>
                <div className="font-mono text-4xl md:text-6xl font-extrabold tracking-tighter mt-2">
                  R${" "}
                  {total.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  O valor pode variar após visita técnica devido às condições do local.
                </p>
              </div>
              <button
                onClick={saveQuote}
                className="px-6 py-4 rounded-xl font-bold uppercase tracking-tighter text-sm inline-flex items-center gap-2"
                style={{ background: brand, color: "#0d0d0d" }}
              >
                {user ? "Salvar orçamento" : "Entrar e salvar"} <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
        </section>

        {/* About */}
        {profile.description && (
          <section className="bg-surface border border-border rounded-3xl p-6 md:p-10">
            <div
              className="text-[10px] uppercase tracking-[0.3em] font-bold"
              style={{ color: brand }}
            >
              Sobre
            </div>
            <p className="text-base md:text-lg text-muted-foreground mt-2 max-w-3xl whitespace-pre-line">
              {profile.description}
            </p>
          </section>
        )}

        {/* Gallery */}
        {gallery.length > 0 && (
          <section>
            <div
              className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3"
              style={{ color: brand }}
            >
              Galeria de obras
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {gallery.map((g) => (
                <div
                  key={g.id}
                  className="rounded-2xl overflow-hidden bg-surface border border-border group"
                >
                  <div className="aspect-square grid grid-cols-2">
                    <Cell src={g.before_url} label="Antes" />
                    <Cell src={g.after_url} label="Depois" />
                  </div>
                  <div className="p-3 text-xs font-bold truncate">{g.title}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Products */}
        {products.length > 0 && (
          <section>
            <div
              className="text-[10px] uppercase tracking-[0.3em] font-bold mb-3"
              style={{ color: brand }}
            >
              Produtos
            </div>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl overflow-hidden bg-surface border border-border"
                >
                  <div className="aspect-[4/3] bg-background">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="size-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center size-full text-muted-foreground">
                        <ImageIcon className="size-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.category}
                    </div>
                    <div className="font-bold truncate">{p.name}</div>
                    <div className="text-sm font-mono mt-1" style={{ color: brand }}>
                      R$ {Number(p.price).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Contact */}
        <section className="bg-gradient-to-br from-surface to-background border border-border rounded-3xl p-6 md:p-10 text-center space-y-3">
          <h3 className="text-2xl md:text-3xl font-extrabold tracking-tighter">Fale com {name}</h3>
          <p className="text-sm text-muted-foreground">
            Tire dúvidas ou agende uma visita técnica.
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
            <button
              onClick={() => navigate({ to: user ? "/agendar" : "/login" })}
              className="px-5 py-3 border border-border rounded-xl text-xs font-bold uppercase tracking-widest hover:border-accent hover:text-accent inline-flex items-center gap-2"
            >
              <MessageCircle className="size-4" /> Solicitar visita técnica
            </button>
          </div>
        </section>

        <footer className="text-center text-xs text-muted-foreground py-6">
          Powered by{" "}
          <span className="font-extrabold tracking-tighter text-foreground">
            Ouro Branco<span style={{ color: brand }}>.</span>
          </span>
        </footer>
      </main>
    </div>
  );
}

function Field({
  label,
  icon: I,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground inline-flex items-center gap-2">
        <I className="size-3.5" /> {label}
      </div>
      {children}
    </div>
  );
}

function Metric({
  icon: I,
  label,
  value,
  brand,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  brand: string;
}) {
  return (
    <div className="bg-background border border-border rounded-xl p-4 flex items-center gap-3">
      <div
        className="size-10 rounded-lg flex items-center justify-center"
        style={{ background: `${brand}22`, color: brand }}
      >
        <I className="size-5" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {label}
        </div>
        <div className="font-mono text-lg font-extrabold">{value}</div>
      </div>
    </div>
  );
}

function Cell({ src, label }: { src: string | null; label: string }) {
  return (
    <div className="relative bg-background">
      {src ? (
        <img src={src} alt={label} className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          {label}
        </div>
      )}
      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 text-white text-[9px] uppercase tracking-widest rounded">
        {label}
      </div>
    </div>
  );
}
