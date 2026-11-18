export type ServiceKey =
  | "pintura"
  | "gesso"
  | "parede3d"
  | "drywall"
  | "massa"
  | "textura"
  | "forro"
  | "reparos"
  | "reforma";

export interface Service {
  key: ServiceKey;
  name: string;
  short: string;
  pricePerM2: number;
  description: string;
  image: string;
  benefits: string[];
  category: "acabamento" | "estrutura" | "manutencao";
}

import paintImg from "@/assets/service-paint.jpg";
import gessoImg from "@/assets/service-gesso.jpg";
import threeDImg from "@/assets/service-3d.jpg";
import drywallImg from "@/assets/service-drywall.jpg";
import massaImg from "@/assets/service-massa.jpg";
import textureImg from "@/assets/service-texture.jpg";
import forroImg from "@/assets/service-forro.jpg";
import reparosImg from "@/assets/service-reparos.jpg";

export const SERVICES: Service[] = [
  {
    key: "pintura",
    name: "Pintura Elite",
    short: "Pintura",
    pricePerM2: 45,
    category: "acabamento",
    description:
      "Tinta premium com dois demãos e acabamento impecável. Transforme ambientes com cores duradouras e proteção superior.",
    image: paintImg,
    benefits: [
      "Tintas premium não-tóxicas",
      "Dois demãos garantidos",
      "Limpeza pós-obra incluída",
      "Garantia de 3 anos",
    ],
  },
  {
    key: "gesso",
    name: "Gesso Liso",
    short: "Gesso",
    pricePerM2: 55,
    category: "acabamento",
    description:
      "Aplicação técnica de gesso para superfícies perfeitamente planas, prontas para receber qualquer acabamento.",
    image: gessoImg,
    benefits: [
      "Superfície 100% plana",
      "Acabamento liso premium",
      "Secagem rápida",
      "Pronto para pintura",
    ],
  },
  {
    key: "parede3d",
    name: "Parede 3D",
    short: "3D",
    pricePerM2: 120,
    category: "acabamento",
    description:
      "Transforme ambientes com acabamento moderno e sofisticado. Painéis decorativos com geometria e profundidade.",
    image: threeDImg,
    benefits: [
      "Visual sofisticado",
      "Múltiplos padrões geométricos",
      "Instalação rápida",
      "Alta durabilidade",
    ],
  },
  {
    key: "drywall",
    name: "Drywall",
    short: "Drywall",
    pricePerM2: 95,
    category: "estrutura",
    description:
      "Divisórias rápidas com isolamento acústico e térmico. Ideal para reorganizar ambientes sem quebra-quebra.",
    image: drywallImg,
    benefits: ["Obra limpa e seca", "Isolamento acústico", "Instalação em dias", "Estrutura leve"],
  },
  {
    key: "massa",
    name: "Massa Corrida",
    short: "Massa",
    pricePerM2: 28,
    category: "acabamento",
    description: "Preparação e nivelamento de superfícies para um acabamento final perfeito.",
    image: massaImg,
    benefits: [
      "Nivelamento total",
      "Base ideal para pintura",
      "Material premium",
      "Aplicação profissional",
    ],
  },
  {
    key: "textura",
    name: "Textura Premium",
    short: "Textura",
    pricePerM2: 65,
    category: "acabamento",
    description:
      "Marmorato, cimento queimado e acabamentos artísticos para ambientes com personalidade.",
    image: textureImg,
    benefits: [
      "Mais de 20 padrões",
      "Aspecto exclusivo",
      "Resistente à umidade",
      "Acabamento artesanal",
    ],
  },
  {
    key: "forro",
    name: "Forro Moderno",
    short: "Forro",
    pricePerM2: 110,
    category: "estrutura",
    description:
      "Forros em drywall e PVC com iluminação embutida, sancas e acabamento arquitetônico.",
    image: forroImg,
    benefits: ["Iluminação integrada", "Sancas e rebaixos", "Acabamento limpo", "Diversos modelos"],
  },
  {
    key: "reparos",
    name: "Reparos Express",
    short: "Reparos",
    pricePerM2: 35,
    category: "manutencao",
    description:
      "Reparos rápidos em paredes, trincas, infiltrações e pequenos defeitos. Atendimento ágil.",
    image: reparosImg,
    benefits: [
      "Atendimento em 48h",
      "Diagnóstico técnico",
      "Garantia do serviço",
      "Sem dor de cabeça",
    ],
  },
  {
    key: "reforma",
    name: "Reforma Geral",
    short: "Reforma",
    pricePerM2: 180,
    category: "estrutura",
    description: "Projetos completos com gestão de obra, do planejamento à entrega final.",
    image: paintImg,
    benefits: [
      "Gestão completa",
      "Equipe multidisciplinar",
      "Cronograma garantido",
      "Acompanhamento diário",
    ],
  },
];
