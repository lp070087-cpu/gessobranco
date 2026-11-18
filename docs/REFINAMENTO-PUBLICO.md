# Refinamento da apresentação PRECISO. — 06/11/2026

## Escopo e direção

Mantidos React 19, TanStack Start, Vite, Tailwind, Lucide e Radix existentes. Alterações desta etapa: src/routes/index.tsx e novo src/components/preciso/public-editorial.css. Não houve push, deploy, alteração administrativa ou migração. O checkout já continha diversas alterações e arquivos não rastreados; eles foram preservados.

Direção: composição editorial de arquitetura, base clara de gesso/areia, carvão e dourado discreto da marca. Hero fotográfico, serviços com legendas fora das fotos, galeria assimétrica ampliável, processo em três etapas, calculadora existente em seção própria. Conteúdo visível antes de qualquer animação; IntersectionObserver apenas acrescenta uma animação breve. CSS para hover; sem nova biblioteca de animação. Menu fecha por escolha, Escape e mudança para desktop. Galeria usa Radix para foco, Escape e modal, controles anterior/próxima e setas de teclado.

Fotografias locais reutilizadas como ilustrações: não há comprovação de autoria ou identificação das obras. Não foram criados depoimentos, prêmios, números ou regiões. Não foi localizado telefone comercial confirmado na página principal; preservado o fluxo de solicitar visita/login, sem inventar WhatsApp.

## Referências principais

- https://html5up.net/uploads/demos/story/ — demonstração aberta e conteúdo consultado: alternância entre imagem/texto e galeria ampliável. Inspiração de composição, sem copiar código. A tentativa de acionar Get Started não encontrou o alvo; não considerar suas interações integralmente testadas.
- https://www.framer.com/marketplace/templates/categories/architecture/ — catálogo de arquitetura consultado, com Forma Interior, Datum Interior e outros. Referência de hierarquia centrada em ambientes; nenhuma licença comprada ou template exportado. Demonstrações individuais não foram verificadas.
- https://motion.dev/docs/react-accessibility — orientação de movimento reduzido, aplicada com CSS e consulta à preferência do sistema, sem instalar Motion.
- https://lucide.dev/guide/react — ícones funcionais reutilizando a dependência já existente.

A Profitize foi triada no navegador: https://profitize.com.br/build/templates e https://profitize.com.br/build/landing-pages/prumo. O detalhe de Prumo mostrou prévia visual e descrição de cinco planos de drone vinculados ao scroll. O bundle exige Pro. Não comprado, baixado nem usado como código; a demonstração completa não ficou disponível na interface consultada. Esse efeito foi descartado por exigir material específico e dominar a navegação.

## Triagem completa solicitada

Consulta textual significa leitura via ferramenta web, sem alegação de navegação/interação visual completa. Nenhuma ferramenta externa foi instalada.

| Fonte consultada | Tipo e decisão |
| --- | --- |
| https://profitize.com.br/build/templates | Catálogo de prompts/bundles; navegador acessível, ferramenta textual indisponível. Prumo inspecionado, bundle Pro. |
| https://www.shadcnblocks.com/templates | Templates de código Next/Astro; consulta textual, não migrar stack. |
| https://vercel.com/templates | Templates de código; consulta textual, sem substituir aplicação. |
| https://www.framer.com/marketplace/templates/ | Plataforma Framer; aprofundado catálogo Architecture, inspiração apenas. |
| https://webflow.com/templates | Plataforma Webflow; consulta textual, não exportado. |
| https://themeforest.net/ | Marketplace comercial; consulta textual, nada comprado. |
| https://html5up.net/ | Templates HTML/CSS; Story aprofundado, inspiração apenas. |
| https://21st.dev/ | Componentes; consulta textual, descartado efeito tecnológico. |
| https://ui.shadcn.com/blocks | Componentes React; consulta textual, manter Radix/shadcn existente. |
| https://www.shadcnblocks.com/ | Blocos React; consulta textual, sem importação. |
| https://tailark.com/ | Blocos de marketing; consulta textual, sem importação. |
| https://www.untitledui.com/react | Biblioteca React; consulta textual, evitar duplicação. |
| https://www.relume.ai/ | Planejamento/construção de sites; consulta textual, desnecessário. |
| https://magicui.design/ | Efeitos React; consulta textual, dispensado. |
| https://ui.aceternity.com/ | Componentes animados; consulta textual, dispensado. |
| https://www.reactbits.dev/ | Componentes animados; consulta textual, dispensado. |
| https://lucide.dev/ | Ícones; consulta textual e guia React aprofundado, dependência reutilizada. |
| https://tympanus.net/codrops/hub/tutorials/ | Bloqueado: HTTP 403. Sem análise de conteúdo. |
| https://lenis.dev/ | Scroll; consulta textual, rolagem natural preservada. |
| https://gsap.com/docs/v3/Plugins/ScrollTrigger/ | Animação; consulta textual, dispensada dependência. |
| https://motion.dev/ | Animação; consulta textual, aprofundado guia de acessibilidade. |
| https://scroll-driven-animations.style/ | Demonstrações CSS; consulta textual, não depender de suporte parcial. |
| https://barba.js.org/ | Transições; consulta textual, não interferir no roteador TanStack. |
| https://animejs.com/ | Animação; consulta textual, dispensado. |
| https://gsap.com/showcase/ | Inspiração; consulta textual, sem avaliação de movimento real. |
| https://unseen.co/ | Inspiração; conteúdo textual acessível, experiência imersiva não testada. |
| https://landonorris.com/ | Inspiração; consulta textual, estética esportiva não adotada. |
| https://www.itsoffbrand.com/ | Inspiração; consulta textual, estética de agência não adotada. |
| https://makerkit.dev/ | Base SaaS; consulta textual, fora do objetivo da apresentação. |
| https://github.com/anthropics/skills | Orientações para agentes; repositório consultado, não instalado. |
| https://github.com/vercel-labs/agent-skills | Orientações para agentes; repositório consultado, não instalado. |
| https://skills.sh/ | Diretório de skills; consultado, não instalado. |
| https://agentskills.io/home | Especificação de skills; consultada, sem alteração de skills. |
| https://www.lapa.ninja/ | Inspiração visual; consulta textual do catálogo. |
| https://mobbin.com/ | Inspiração UX; página pública consultada, sem sessão autenticada ou exploração de fluxos. |

## Verificação

- node --test tests/estimate.test.mjs: 6/6 aprovados.
- npx tsc --noEmit: falhou em arquivos fora da alteração desta etapa: _app.orcamentos.tsx (cancelado ausente no tipo), _app.services.$key.tsx (loader inferido como never) e src/server/neon/* (drizzle-orm e @neondatabase/serverless ausentes). Nenhum erro reportado nos arquivos desta etapa. Não ocultados nem corrigidos com casts genéricos.
- Servidor Vite iniciou e anunciou http://127.0.0.1:3000/.
- Requisição HTTP local via PowerShell: acesso ao socket proibido pelo ambiente.
- Navegador integrado: ERR_CONNECTION_TIMED_OUT na prévia local. A tentativa adicional de abertura no painel também falhou.
- Portanto: não foi possível validar visualmente desktop, larguras 360/390/430/768/1440, Safari/WebKit, console, menu, galeria ou formulário em execução. Os breakpoints e movimento reduzido foram implementados, mas não devem ser descritos como testes de navegador aprovados.
- Nenhum formulário, mensagem ou gravação real foi enviado.

### Resultado final do build

O build de cliente compilou 2.744 módulos e produziu os assets, incluindo a apresentação nova. O build SSR falhou ao resolver drizzle-orm, importado pelo código Neon preexistente. Tentativa autorizada de instalar drizzle-orm e @neondatabase/serverless falhou com ENOTFOUND registry.npmjs.org; package.json permaneceu sem alterações. A compilação completa continua bloqueada. git diff --check na página passou. A última alteração de CSS apenas explicitou variáveis locais para compatibilidade com os estilos compartilhados.
