import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Menu, Plus, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { Calculator } from "@/components/preciso/Calculator";
import { PublicProducts } from "@/components/preciso/PublicProducts";
import { BusinessMap } from "@/components/preciso/BusinessMap";
import { useServiceCatalog } from "@/components/preciso/use-service-catalog";
import { CompanyRequestDialog } from "@/components/preciso/CompanyRequestDialog";
import { SERVICES } from "@/components/preciso/services";
import "@/components/preciso/client-experience.css";
import "@/components/preciso/public-editorial.css";
import bannerImg from "@/assets/banner-home.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OURO BRANCO | Gesso, drywall e acabamentos" },
      {
        name: "description",
        content:
          "Gesso, forros, drywall e pintura. Conheça as especialidades da OURO BRANCO, simule seu projeto e solicite uma visita técnica.",
      },
    ],
  }),
  component: Index,
});
const NAV = [
  { href: "#produtos", label: "Materiais" },
  { href: "#servicos", label: "Especialidades" },
  { href: "#ambientes", label: "Ambientes" },
  { href: "#processo", label: "Como trabalhamos" },
  { href: "#planejar", label: "Orçamento" },
];
const DETAILS: Record<string, string> = {
  gesso: "Superfícies lisas e detalhes que acompanham a arquitetura do ambiente.",
  forro:
    "Forro de gesso simples ou decorado, com opções de rebaixo, sancas e integração com a iluminação.",
  drywall: "Paredes divisórias em drywall para organizar ambientes residenciais e comerciais.",
  pintura: "Preparação de superfícies e pintura para renovar paredes e tetos.",
  textura: "Texturas e acabamentos decorativos para dar expressão às paredes.",
  massa: "Nivelamento e preparação da base antes da pintura.",
  parede3d: "Revestimentos com relevo para destacar uma parede.",
  reparos: "Avaliação e correção de pequenos defeitos nas superfícies.",
  reforma: "Planejamento e acabamentos para renovar casas, escritórios e lojas.",
};
const FEATURED = ["gesso", "forro", "drywall", "pintura"].map((key) =>
  SERVICES.find((s) => s.key === key)!,
);
const GALLERY = [
  {
    image: bannerImg,
    title: "Luz que desenha o ambiente",
    detail: "Forros e iluminação",
    alt: "Ambiente ilustrativo com sanca iluminada e teto rebaixado",
  },
  {
    image: SERVICES.find((s) => s.key === "textura")!.image,
    title: "A textura como detalhe",
    detail: "Acabamentos de parede",
    alt: "Referência ilustrativa de textura em parede",
  },
  {
    image: SERVICES.find((s) => s.key === "gesso")!.image,
    title: "Continuidade nas superfícies",
    detail: "Gesso e composição",
    alt: "Referência ilustrativa de acabamento em gesso",
  },
];
const PROCESS = [
  [
    "Conte o que precisa",
    "Informe o serviço e as medidas que já tem. Para obras maiores, comece pela avaliação técnica.",
  ],
  [
    "Alinhamos os detalhes",
    "Na visita, são conferidos superfícies, medidas, materiais, acesso e etapas do trabalho.",
  ],
  [
    "Acompanhe seu projeto",
    "Consulte a proposta, os agendamentos e o andamento da obra na sua área do cliente.",
  ],
];
function Index() {
  const { services } = useServiceCatalog();
  const configured = new Map(services.map((service) => [service.key, service]));
  const showcase = [
    ...FEATURED.map((service) => configured.get(service.key) ?? service),
    ...services.filter((service) => !FEATURED.some((base) => base.key === service.key)),
  ];
  const [menu, setMenu] = useState(false);
  const [requestService, setRequestService] = useState(false);
  const [gallery, setGallery] = useState<number | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const galleryButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 900px)");
    const close = () => {
      if (breakpoint.matches) setMenu(false);
    };
    breakpoint.addEventListener("change", close);
    return () => breakpoint.removeEventListener("change", close);
  }, []);
  const closeMenu = () => setMenu(false);
  const changeImage = (step: number) =>
    setGallery((current) =>
      current === null ? null : (current + step + GALLERY.length) % GALLERY.length,
    );
  return (
    <div className="preciso-public editorial-site">
      <a className="editorial-skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header
        className="editorial-header"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menu) {
            closeMenu();
            menuButton.current?.focus();
          }
        }}
      >
        <div className="editorial-container editorial-nav">
          <a
            href="#top"
            className="editorial-logo"
            aria-label="OURO BRANCO — início"
            onClick={closeMenu}
          >
            OURO BRANCO<span>.</span>
            <small>SOLUÇÕES EM GESSO</small>
          </a>
          <nav aria-label="Navegação principal" className="editorial-desktop-nav">
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="editorial-nav-actions">
            <Link to="/minha-conta" className="editorial-client-link">
              Área do cliente <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            <button
              ref={menuButton}
              type="button"
              className="editorial-menu-toggle"
              aria-expanded={menu}
              aria-controls="mobile-site-menu"
              aria-label={menu ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        {menu && (
          <nav id="mobile-site-menu" className="editorial-mobile-nav" aria-label="Menu móvel">
            {NAV.map((item, i) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                <span>0{i + 1}</span>
                {item.label}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ))}
            <Link to="/minha-conta" onClick={closeMenu}>
              Área do cliente <ArrowUpRight size={18} aria-hidden="true" />
            </Link>
          </nav>
        )}
      </header>
      <main id="conteudo">
        <section className="editorial-entry" aria-labelledby="entry-title">
          <img src={bannerImg} alt="" width="1600" height="1000" fetchPriority="high" />
          <div className="editorial-container editorial-entry-content">
            <p className="editorial-kicker">SOLUÇÕES EM GESSO</p>
            <h1 id="entry-title">OURO BRANCO</h1>
            <div className="editorial-entry-actions">
              <a className="editorial-button" href="#planejar">
                Solicitar orçamento de serviços <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a className="editorial-button" href="#produtos">
                Comprar materiais <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
        <section id="top" className="editorial-container editorial-hero">
          <div className="editorial-hero-copy" data-reveal>
            <p className="editorial-kicker">
              <span /> OURO BRANCO / SOLUÇÕES EM GESSO
            </p>
            <h1>
              O cuidado está
              <br />
              no <em>acabamento.</em>
            </h1>
            <p className="editorial-intro">
              Gesso, drywall e pintura. Da preparação da superfície ao último detalhe, cada escolha
              faz parte do seu espaço.
            </p>
            <div className="editorial-actions">
              <a href="#planejar" className="editorial-button">
                Planejar meu projeto <ArrowUpRight size={18} aria-hidden="true" />
              </a>
              <a href="#servicos" className="editorial-text-link">
                Explorar serviços <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="editorial-hero-note">
              Medidas, materiais e etapas.
              <br />
              Uma proposta pensada para a sua obra.
            </p>
          </div>
          <figure className="editorial-hero-photo" data-reveal>
            <img
              src={bannerImg}
              alt="Referência de sala com teto em gesso e iluminação indireta"
              width="1600"
              height="1024"
              fetchPriority="high"
            />
            <figcaption>
              <span>FORMA. LUZ. MATÉRIA.</span>
              <span>Imagem ilustrativa</span>
            </figcaption>
            <span className="editorial-image-mark" aria-hidden="true">
              OB
            </span>
          </figure>
        </section>
        <div
          className="editorial-container editorial-material-line"
          aria-label="Especialidades em destaque"
        >
          <span>Gesso</span>
          <span>Forros</span>
          <span>Drywall</span>
          <span>Pintura</span>
          <a href="#servicos" aria-label="Conhecer todas as especialidades">
            <ArrowDown size={20} />
          </a>
        </div>
        <section id="servicos" className="editorial-container editorial-section">
          <div className="editorial-section-heading" data-reveal>
            <div>
              <p className="editorial-kicker">01 / ESPECIALIDADES</p>
              <h2>
                Uma boa base.
                <br />
                <em>Um novo ambiente.</em>
              </h2>
            </div>
            <p>
              Forros, divisórias, pintura e acabamentos para construir ou reformar casas,
              escritórios e lojas.
            </p>
          </div>
          <div className="editorial-services">
            {showcase.map((service, i) => (
              <article key={service.key} data-reveal>
                <a
                  className="editorial-service-photo"
                  href="#planejar"
                  aria-label={`Planejar projeto de ${service.short}`}
                >
                  {service.image ? (
                    <img
                      src={service.image}
                      alt={`Imagem ilustrativa de ${service.short.toLowerCase()}`}
                      width="600"
                      height="750"
                      loading="lazy"
                    />
                  ) : (
                    <span className="ouro-service-no-photo">{service.short}</span>
                  )}
                  <span className="editorial-photo-action">
                    <ArrowUpRight size={20} aria-hidden="true" />
                  </span>
                </a>
                <div className="editorial-service-title">
                  <span>0{i + 1}</span>
                  <h3>{service.short}</h3>
                </div>
                <p>{configured.get(service.key)?.description || DETAILS[service.key]}</p>
              </article>
            ))}
          </div>
          <details className="editorial-more-services">
            <summary>
              Outras especialidades <Plus size={20} aria-hidden="true" />
            </summary>
            <div>
              {SERVICES.filter((s) => !FEATURED.includes(s) && !configured.has(s.key)).map(
                (service) => (
                  <a key={service.key} href="#planejar">
                    <strong>{service.name}</strong>
                    <span>{DETAILS[service.key]}</span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </a>
                ),
              )}
            </div>
          </details>
          <p className="editorial-caption">Imagens ilustrativas dos tipos de acabamento.</p>
          <div className="editorial-service-notes" data-reveal>
            <div className="editorial-service-note">
              <h3>Forro mineral e elétrica</h3>
              <p>
                Inclua a instalação de forro mineral ou os serviços elétricos no orçamento da sua
                reforma, junto com os acabamentos.
              </p>
            </div>
            <div className="editorial-service-note">
              <h3>Reparos e umidade</h3>
              <p>
                Informe se há goteiras, manchas no teto, mofo, reboco solto ou rachaduras. A equipe
                avalia a causa antes de recomendar reparos ou indicar gesso impermeável.
              </p>
            </div>
            <button
              type="button"
              className="editorial-button"
              onClick={() => setRequestService(true)}
            >
              Solicitar orçamento de serviços <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          </div>
        </section>
        <PublicProducts />
        <section id="ambientes" className="editorial-gallery-section">
          <div className="editorial-container editorial-section">
            <div className="editorial-section-heading" data-reveal>
              <div>
                <p className="editorial-kicker">02 / POSSIBILIDADES</p>
                <h2>
                  Detalhes que dão
                  <br />
                  <em>forma ao espaço.</em>
                </h2>
              </div>
              <p>
                Explore referências de luz, volume e textura para conversar sobre o seu projeto.
                Imagens ilustrativas, não um portfólio de obras executadas.
              </p>
            </div>
            <div className="editorial-gallery">
              {GALLERY.map((item, i) => (
                <button
                  key={item.title}
                  type="button"
                  className="editorial-gallery-item"
                  onClick={(event) => {
                    galleryButton.current = event.currentTarget;
                    setGallery(i);
                  }}
                  aria-label={`Ampliar: ${item.title}`}
                  data-reveal
                >
                  <div className="editorial-gallery-photo">
                    <img src={item.image} alt={item.alt} loading="lazy" width="1000" height="800" />
                    <span className="editorial-photo-action">
                      <Plus size={20} aria-hidden="true" />
                    </span>
                  </div>
                  <span className="editorial-gallery-caption">
                    <span>
                      <small>{item.detail}</small>
                      <strong>{item.title}</strong>
                    </span>
                    <span>0{i + 1}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <section id="processo" className="editorial-container editorial-section">
          <div className="editorial-section-heading" data-reveal>
            <div>
              <p className="editorial-kicker">03 / DO PLANO À OBRA</p>
              <h2>
                Clareza em
                <br />
                <em>cada etapa.</em>
              </h2>
            </div>
            <p>
              Um ambiente ou uma reforma completa: o ponto de partida é entender o que precisa ser
              feito.
            </p>
          </div>
          <div className="editorial-process">
            {PROCESS.map(([title, text], i) => (
              <article key={title} data-reveal>
                <span>0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="planejar" className="editorial-quote-section">
          <div className="editorial-container editorial-quote-grid">
            <div data-reveal>
              <p className="editorial-kicker">04 / SEU PRÓXIMO PROJETO</p>
              <h2>
                Comece pelas ideias.
                <br />
                <em>Vamos às medidas.</em>
              </h2>
              <p className="editorial-intro">
                Use a calculadora para uma referência inicial ou solicite uma visita para avaliar o
                serviço no local.
              </p>
              <div className="editorial-quote-note">
                <span>ANTES DE COMEÇAR</span>
                <p>
                  Tenha em mãos as medidas aproximadas e o tipo de acabamento. A proposta final
                  considera as condições do ambiente e o escopo da obra.
                </p>
              </div>
              <Link to="/minha-conta" className="editorial-text-link">
                Já tem um projeto? Acesse sua conta <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
            <div>
              <Calculator />
              <button
                type="button"
                className="editorial-text-link mt-6"
                onClick={() => setRequestService(true)}
              >
                Solicitar orçamento de serviço <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
        <div className="editorial-container">
          <BusinessMap />
        </div>
      </main>
      {requestService && (
        <CompanyRequestDialog
          context={{ kind: "service" }}
          close={() => setRequestService(false)}
        />
      )}
      <footer className="editorial-footer">
        <div className="editorial-container">
          <div className="editorial-footer-top">
            <a href="#top" className="editorial-logo">
              OURO BRANCO<span>.</span>
              <small>SOLUÇÕES EM GESSO</small>
            </a>
            <p>
              Do primeiro plano
              <br />
              ao acabamento.
            </p>
            <a href="#planejar" className="editorial-text-link">
              Vamos falar do seu projeto <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
          <div className="editorial-footer-bottom">
            <span>© {new Date().getFullYear()} OURO BRANCO</span>
            <Link to="/minha-conta">Área do cliente</Link>
            <a href="#top">Voltar ao início ↑</a>
          </div>
        </div>
      </footer>
      <Dialog.Root
        open={gallery !== null}
        onOpenChange={(open) => {
          if (!open) setGallery(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="editorial-lightbox-overlay" />
          <Dialog.Content
            className="editorial-lightbox"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              galleryButton.current?.focus();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") changeImage(1);
              if (event.key === "ArrowLeft") changeImage(-1);
            }}
          >
            <Dialog.Close className="editorial-lightbox-close" aria-label="Fechar galeria">
              <X size={24} />
            </Dialog.Close>
            {gallery !== null && (
              <>
                <img
                  key={gallery}
                  src={GALLERY[gallery].image}
                  alt={GALLERY[gallery].alt}
                  className="editorial-lightbox-image"
                />
                <div className="editorial-lightbox-bottom">
                  <div>
                    <Dialog.Title>{GALLERY[gallery].title}</Dialog.Title>
                    <Dialog.Description>
                      Imagem ilustrativa · {gallery + 1} de {GALLERY.length}
                    </Dialog.Description>
                  </div>
                  <div className="editorial-lightbox-controls">
                    <button
                      type="button"
                      onClick={() => changeImage(-1)}
                      aria-label="Imagem anterior"
                    >
                      <ArrowLeft />
                    </button>
                    <button
                      type="button"
                      onClick={() => changeImage(1)}
                      aria-label="Próxima imagem"
                    >
                      <ArrowRight />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
