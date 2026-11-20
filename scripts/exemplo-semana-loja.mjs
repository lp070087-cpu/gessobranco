/**
 * Monta a semana de 09 a 14/11/2026 da Loja de Prazeres a partir das folhas de papel do dono:
 * produtos e estoque (folha de 16/11), vendas de cada dia, caixa, retiradas, gastos, fiados,
 * débitos da empresa e um pedido de exemplo para conferir entrega.
 *
 * Uso local (PGlite):  node scripts/exemplo-semana-loja.mjs --dir .exemplo-pglite [--dump saida.sql]
 * Aplicar no Neon (depois do npm run db:migrate, com DATABASE_URL no ambiente):
 *   node scripts/exemplo-semana-loja.mjs --dir .exemplo-pglite --apply
 * O --apply só grava se o banco ainda não tiver vendas, tudo numa transação.
 * Itens marcados como exemplo (valores que o dono não confirmou) ficam com "example = true".
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const dir = option("--dir");
const dumpFile = option("--dump");
const apply = args.includes("--apply");
if (!dir) throw new Error("Informe --dir com uma pasta nova para o banco local.");
let target;
let targetAdmin;
if (apply) {
  if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL para usar --apply.");
  const { neon } = await import("@neondatabase/serverless");
  target = neon(process.env.DATABASE_URL);
  const email = option("--admin-email") ?? "lp070087@gmail.com";
  const [admin] = await target.query(
    "SELECT id FROM preciso.users WHERE email=$1 AND role='admin'",
    [email],
  );
  if (!admin) throw new Error("Administrador não encontrado no banco: " + email);
  const [sales] = await target.query("SELECT count(*)::int AS n FROM preciso.commercial_sales");
  if (sales.n) throw new Error("O banco já tem vendas. Nada foi gravado.");
  const [ready] = await target.query(
    "SELECT to_regclass('preciso.commercial_closings') IS NOT NULL AS ok",
  );
  if (!ready.ok) throw new Error("Rode antes: npm run db:migrate");
  targetAdmin = admin.id;
}
const ADMIN_ID = targetAdmin ?? option("--admin-id") ?? "7c2a5548-165f-4972-90fa-a657a8fe360b";
const ADMIN_EMAIL = option("--admin-email") ?? "lp070087@gmail.com";
const LOCAL_PASSWORD = "Ouro-Branco-local-2026";

const migrations = [
  "0000_preciso",
  "0001_commercial",
  "0002_company_requests",
  "0003_company_operations",
  "0004_cfo",
  "0005_service_proposals",
  "0006_purchase_deliveries",
  "0007_customer_documents",
  "0008_customer_worksites",
  "0009_folhas_da_loja",
];

// ---------------------------------------------------------------- Produtos (folha de estoque)
// [chave, nome, categoria, unidade-base, unidades [nome, fator, preço], custo, estoque em 16/11]
const products = [
  ["gesso", "Gesso revestimento 40kg", "Gesso", "saco", [["Saco", 1, 24.99]], 22, 275],
  ["kg", "Gesso no quilo", "Gesso", "kg", [["Kg", 1, 2]], 2, 30],
  ["meio", "Meio saco de gesso", "Gesso", "meio saco", [["Meio saco", 1, 15]], 15, 10],
  ["placa", "Placa de gesso 65x65", "Gesso", "placa", [["Placa", 1, 5.19]], 4.8, 75],
  ["bloco", "Bloco divisório de gesso", "Gesso", "bloco", [["Bloco", 1, 13.99]], 10.5, 475],
  ["hidro", "Bloco hidro", "Gesso", "bloco", [["Bloco", 1, 24.99]], 23, 0],
  ["cola", "Gesso cola 5kg", "Materiais", "saco", [["Saco", 1, 14.99]], 12, 23],
  [
    "sizal",
    "Sizal",
    "Materiais",
    "un",
    [
      ["Unidade", 1, 15],
      ["Meio", 0.5, 8],
    ],
    11,
    120,
  ],
  ["arame", "Arame 1kg", "Materiais", "rolo", [["Rolo", 1, 34.99]], 28, 117],
  [
    "pitao",
    "Pitão com bucha 6mm",
    "Ferragens",
    "pacote",
    [
      ["Pacote com 100", 1, 30],
      ["Milheiro", 10, 250],
    ],
    30,
    0,
  ],
  ["arribite50", "Rebite (pacote 50)", "Ferragens", "pacote", [["Pacote com 50", 1, null]], 15, 8],
  [
    "arribite100",
    "Rebite de alumínio 4mm",
    "Ferragens",
    "pacote",
    [
      ["Pacote com 100", 1, 29.99],
      ["Milheiro", 10, 234.99],
    ],
    30,
    4,
  ],
  ["broca", "Broca", "Ferramentas", "un", [["Unidade", 1, null]], 12, 40],
  ["serrote", "Serrote para gesso", "Ferramentas", "un", [["Unidade", 1, 34.99]], 30, 5],
  ["espatula", "Espátula", "Ferramentas", "un", [["Unidade", 1, 34.99]], 30, 12],
  ["carrinho", "Carrilho para gesso", "Ferramentas", "un", [["Unidade", 1, 34.99]], 30, 3],
  ["trena", "Trena 5 metros", "Ferramentas", "un", [["Unidade", 1, 14.99]], 15, 4],
  [
    "nivel",
    "Nível a laser 2 linhas (verde)",
    "Ferramentas",
    "un",
    [["Unidade", 1, 239.99]],
    240,
    4,
  ],
  ["j3x1", "Junta 3x1", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 42],
  ["j3x3", "Junta 3x3", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 40],
  ["j5x5", "Junta 5x5", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 150],
  ["bozerry", "Bozerry", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 25],
  ["ju3x3", "Junta U 3x3", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 30],
  ["ju2x2", "Junta U 2x2", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 60],
  ["baguete5", "Baguete 5", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.8, 20],
  ["baguete6", "Baguete 6", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 150],
  ["baguete7", "Baguete 7", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 50],
  ["escadinha8", "Escadinha 8", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 29],
  ["escadinha10", "Escadinha 10", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 84],
  ["escadinha2", "Escadinha 2", "Juntas e acabamentos", "un", [["Unidade", 1, null]], 2.5, 0],
  // Vendidos por metro nas folhas. O dono não passou o custo: valores de EXEMPLO.
  ["junta", "Junta (metro)", "Vendido por metro", "m", [["Metro", 1, 2]], 1, 0],
  ["moldura", "Moldura (metro)", "Vendido por metro", "m", [["Metro", 1, 2]], 1, 0],
  ["baguete", "Baguete (metro)", "Vendido por metro", "m", [["Metro", 1, 2]], 1, 0],
  ["prancha", "Prancha (metro)", "Vendido por metro", "m", [["Metro", 1, 45]], 30, 0],
];
// Informações tiradas das artes de oferta da loja (só o texto, não as imagens).
const details = {
  placa: "Placa de gesso 65x65.",
  bloco: "Bloco divisório de gesso. Acabamento perfeito.",
  gesso: "Gesso revestimento, saco de 40kg.",
  hidro: "Bloco hidro: resistente à umidade, mais leve e prático.",
  cola: "Gesso cola, saco de 5kg.",
  arame: "Arame de 1kg.",
  pitao: "Pitão com bucha 6mm. Somente embalagem fechada (100 unidades ou milheiro).",
  arribite100:
    "Rebite de alumínio 4mm (padrão). Somente embalagem fechada (100 unidades ou milheiro).",
  espatula: "Espátula com cabo de madeira.",
  carrinho: "Carrilho para gesso, amarelo dourado.",
  serrote: "Serrote para gesso.",
  trena: "Trena de 5 metros.",
  nivel:
    "Nível a laser com 2 linhas verdes (vertical e horizontal). Acompanha pilhas, suporte em L, parafuso de conversão e bolsa. Preço cheio R$ 299,99.",
};
// Preço de atacado: [produto, a partir de quantas unidades, preço, ou perfil do cliente].
const wholesale = [
  ["placa", 100, 4.89],
  ["gesso", 30, 23.99],
  ["hidro", 20, 22.99],
  ["cola", 10, 11.99],
  ["arame", 10, 29.99],
  ["bloco", 1, 11.99, "atacado"],
];
// Itens com unidade diferente da principal.
const alias = { meiosizal: ["sizal", "Meio"] };

// ---------------------------------------------------------------- Vendas (folhas de 09 a 14/11)
// [hora, forma ou [[forma, valor]...], [[quantidade, produto, valor]...]]
const week = {
  "2026-11-09": {
    opening: 6,
    counted: 10,
    withdrawals: [["retirada", "Ítalo", "Retirada do Ítalo", 105]],
    expenses: [["Produtos e sacos", 35, "variavel", "pix"]],
    sales: [
      ["07:40", "pix", [[2, "gesso", 50]]],
      ["08:05", "dinheiro", [[2, "kg", 2]]],
      [
        "08:08",
        "pix",
        [
          [60, "placa", 300],
          [2, "gesso", 50],
          [2, "sizal", 24],
          [1, "cola", 15],
          [1, "arame", 30],
          [30, "junta", 45],
          [12, "baguete", 24],
        ],
      ],
      ["08:43", "cartao", [[1, "meio", 15]]],
      ["09:34", "dinheiro", [[1, "arame", 35]]],
      [
        "10:24",
        "dinheiro",
        [
          [3, "cola", 45],
          [1, "gesso", 25],
        ],
      ],
      [
        "11:00",
        "pix",
        [
          [3, "placa", 15],
          [1, "meiosizal", 5],
        ],
      ],
      ["11:11", "cartao", [[1, "gesso", 25]]],
      [
        "11:33",
        "cartao",
        [
          [15, "bloco", 195],
          [1, "gesso", 25],
          [1, "sizal", 15],
        ],
      ],
      ["11:39", "pix", [[1, "gesso", 25]]],
      [
        "14:10",
        "pix",
        [
          [1, "bloco", 13],
          [1, "cola", 12],
          [3, "moldura", 6],
        ],
      ],
      [
        "14:15",
        "pix",
        [
          [15, "bloco", 210],
          [1, "meio", 15],
          [1, "cola", 15],
          [1, "meiosizal", 10],
        ],
      ],
      ["15:23", "pix", [[3, "bloco", 39]]],
      ["16:11", "dinheiro", [[1, "kg", 2]]],
      ["16:14", "pix", [[1, "placa", 6]]],
      ["16:29", "pix", [[5, "moldura", 12]]],
      ["16:58", "pix", [[12, "placa", 60]]],
    ],
  },
  "2026-11-10": {
    opening: 10,
    counted: 41,
    withdrawals: [],
    expenses: [
      ["Olho", 36, "fixo", "dinheiro"],
      ["Água", 7, "fixo", "dinheiro"],
    ],
    sales: [
      ["07:05", "dinheiro", [[1, "meio", 15]]],
      ["07:45", "dinheiro", [[1, "placa", 6]]],
      ["08:19", "cartao", [[1, "gesso", 25]]],
      [
        "09:04",
        "pix",
        [
          [15, "placa", 90],
          [2, "gesso", 50],
        ],
      ],
      [
        "09:47",
        "cartao",
        [
          [10, "junta", 30],
          [1, "gesso", 25],
          [1, "sizal", 12],
        ],
      ],
      ["10:05", "pix", [[1, "meio", 15]]],
      ["10:53", "cartao", [[3, "gesso", 75]]],
      ["11:06", "cartao", [[5, "gesso", 130]]],
      ["11:59", "pix", [[1, "gesso", 25]]],
      ["13:49", "pix", [[3, "bloco", 39]]],
      [
        "14:11",
        "cartao",
        [
          [1, "gesso", 25],
          [1, "placa", 5],
        ],
      ],
      ["15:17", "dinheiro", [[1, "gesso", 25]]],
      ["16:07", "dinheiro", [[1, "sizal", 15]]],
      ["16:20", "pix", [[10, "placa", 50]]],
      ["16:30", "dinheiro", [[1, "bloco", 13]]],
    ],
  },
  "2026-11-11": {
    opening: 41,
    counted: 166,
    withdrawals: [],
    expenses: [
      ["Fita", 6, "fixo", "dinheiro"],
      ["Net", 50, "fixo", "pix"],
      ["Diária", 120, "variavel", "pix"],
    ],
    sales: [
      ["07:02", "cartao", [[10, "junta", 20]]],
      ["08:23", "pix", [[1, "gesso", 25]]],
      ["08:35", "cartao", [[1, "meio", 15]]],
      ["08:55", "pix", [[1, "gesso", 25]]],
      [
        "09:47",
        "cartao",
        [
          [1, "meiosizal", 4],
          [4, "baguete", 8],
        ],
      ],
      [
        "09:56",
        [
          ["dinheiro", 50],
          ["pix", 70],
        ],
        [
          [30, "junta", 50],
          [50, "junta", 70],
        ],
      ],
      ["10:14", "pix", [[40, "junta", 100]]],
      [
        "10:31",
        "dinheiro",
        [
          [2, "bloco", 24],
          [2, "kg", 3],
        ],
      ],
      ["11:25", "dinheiro", [[2, "gesso", 46]]],
      ["11:26", "cartao", [[1, "meio", 15]]],
      [
        "13:45",
        "dinheiro",
        [
          [1, "placa", 6],
          [1, "kg", 2],
        ],
      ],
      ["15:22", "pix", [[1, "arame", 35]]],
      ["15:35", "cartao", [[2, "gesso", 50]]],
      ["15:36", "cartao", [[1, "gesso", 25]]],
      ["15:49", "pix", [[1, "gesso", 25]]],
      [
        "16:11",
        "pix",
        [
          [1, "meio", 15],
          [1, "baguete", 2],
        ],
      ],
      ["16:42", "pix", [[1, "gesso", 25]]],
    ],
  },
  "2026-11-12": {
    opening: 166,
    counted: 286,
    withdrawals: [["retirada", "Ítalo", "Retirada do Ítalo", 100]],
    expenses: [],
    sales: [
      ["07:20", "pix", [[1, "serrote", 35]]],
      ["08:00", "dinheiro", [[1, "gesso", 25]]],
      ["08:05", "dinheiro", [[30, "moldura", 70]]],
      ["08:19", "dinheiro", [[1, "meio", 15]]],
      [
        "08:56",
        "pix",
        [
          [2, "prancha", 90],
          [1, "cola", 12],
          [5, "baguete", 10],
        ],
      ],
      ["10:02", "dinheiro", [[5, "gesso", 100]]],
      [
        "12:01",
        "pix",
        [
          [14, "bloco", 183],
          [1, "sizal", 15],
        ],
      ],
      ["13:52", "dinheiro", [[5, "kg", 10]]],
      ["15:23", "pix", [[3, "kg", 6]]],
      ["16:17", "pix", [[1, "gesso", 25]]],
    ],
  },
  "2026-11-13": {
    opening: 286,
    counted: 1,
    notes: "Na folha fechou com R$ 1,00. Pela conta deveria ter R$ 91,00.",
    withdrawals: [
      ["retirada", "Ítalo", "Retirada do Ítalo", 100],
      ["vale", "STE", "Vale STE (confirmar se faz parte dos R$ 400)", 150],
    ],
    expenses: [["Ramom", 5000, "fixo", "pix"]],
    sales: [
      ["07:41", "dinheiro", [[1, "meio", 15]]],
      ["08:13", "dinheiro", [[1, "meio", 15]]],
      ["08:20", "dinheiro", [[1, "gesso", 25]]],
      ["08:50", "pix", [[10, "gesso", 240]]],
      ["09:22", "pix", [[1, "meio", 15]]],
      ["10:43", "pix", [[1, "gesso", 25]]],
      ["16:10", "cartao", [[1, "gesso", 25]]],
    ],
  },
  "2026-11-14": {
    opening: 1,
    counted: 13,
    withdrawals: [["retirada", "Ítalo", "Retirada do Ítalo", 100]],
    expenses: [
      ["STE", 400, "fixo", "pix"],
      ["Sr. Dema", 500, "fixo", "pix"],
    ],
    sales: [
      ["07:32", "dinheiro", [[1, "meiosizal", 7]]],
      [
        "08:13",
        "dinheiro",
        [
          [15, "placa", 75],
          [1, "meio", 10],
          [1, "meiosizal", 5],
        ],
      ],
      [
        "09:53",
        "cartao",
        [
          [1, "bloco", 13],
          [1, "meio", 15],
        ],
      ],
      ["10:00", "dinheiro", [[1, "meio", 15]]],
      ["10:16", "cartao", [[2, "gesso", 50]]],
      [
        "10:48",
        "pix",
        [
          [1, "meiosizal", 8],
          [1, "meio", 15],
        ],
      ],
      [
        "11:33",
        "cartao",
        [
          [3, "placa", 18],
          [1, "cola", 15],
          [1, "meiosizal", 8],
        ],
      ],
    ],
  },
};

const fiados = [
  ["Marcony", 15],
  ["Bigode", 25],
  ["Moisés", 900],
  ["Flávio", 35],
  ["Aguenelo", 150],
  ["Allf", 848],
  ["Careca", 18.5],
  ["Junior", 135],
  ["Mino", 28],
];
// [tipo, pessoa, descrição, valor, data, exemplo, observação]
const debts = [
  ["boleto", "", "Boleto", 502.25, "2026-11-25", false, ""],
  ["boleto", "", "Boleto", 137, "2026-11-27", false, ""],
  ["boleto", "", "Boleto", 502.25, "2026-12-26", false, ""],
  [
    "divida",
    "João",
    "Parcela",
    5000,
    "2026-11-14",
    false,
    "Em 13/11 foram pagos R$ 5.000 ao Ramom. Confirmar qual parcela foi paga.",
  ],
  ["divida", "João", "Parcela", 5000, "2026-11-28", false, ""],
  ["divida", "Ramom", "Parcela", 5000, "2026-12-05", false, ""],
  ["divida", "João", "Parcela", 5000, "2026-12-12", false, ""],
  ["divida", "João", "Parcela", 5000, "2026-12-26", false, ""],
  ["divida", "João", "Parcela", 5000, "2027-01-09", false, ""],
  ["divida", "João", "Parcela", 5000, "2027-01-23", false, ""],
  [
    "credito",
    "João",
    "Crédito",
    6300,
    "2026-08-08",
    true,
    "Confirmar com o dono o que significa este crédito.",
  ],
  [
    "credito",
    "Ramom",
    "Crédito",
    9557,
    "2026-08-14",
    true,
    "Confirmar com o dono o que significa este crédito.",
  ],
  [
    "aluguel",
    "Sr. Dema",
    "Aluguel",
    null,
    "2026-09-26",
    true,
    "Valor do aluguel em branco: o dono preenche.",
  ],
  ["outro", "Leonardo", "Campo em branco na folha", null, null, true, "Preencher com o dono."],
  ["outro", "Caminhão", "Campo em branco na folha", null, null, true, "Preencher com o dono."],
];

// ---------------------------------------------------------------- Execução
const db = new PGlite(dir);
const ran = await db.query("SELECT to_regclass('preciso.schema_migrations') IS NOT NULL AS ready");
if (!ran.rows[0].ready) {
  await db.exec("CREATE SCHEMA IF NOT EXISTS preciso");
  for (const name of migrations)
    await db.exec(await readFile(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
  await db.exec(
    "CREATE TABLE preciso.schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
}
if ((await db.query("SELECT count(*)::int AS n FROM preciso.commercial_sales")).rows[0].n) {
  console.log("A base já tem vendas. Use uma pasta nova.");
  process.exit(1);
}

globalThis.__ouroTestDatabase = drizzle(db);
process.env.DATABASE_URL = "postgres://local-example.invalid/db";
process.env.APP_URL = "http://ouro.local";
const bundled = await build({
  stdin: {
    contents:
      "export {handleNeonRequest} from './src/server/neon/api'; export {automaticClosings} from './src/server/neon/store'; export {hashPassword} from './src/server/neon/passwords';",
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  plugins: [
    {
      name: "local-database",
      setup(plugin) {
        plugin.onResolve({ filter: /^\.\/db$/ }, () => ({ path: "db", namespace: "local" }));
        plugin.onLoad({ filter: /.*/, namespace: "local" }, () => ({
          contents: "export function database(){ return globalThis.__ouroTestDatabase; }",
          loader: "js",
        }));
      },
    },
  ],
});
const { handleNeonRequest, automaticClosings, hashPassword } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

await db.query(
  `INSERT INTO preciso.users(id,email,full_name,password_hash,role) VALUES ($1,$2,'Administrador Ouro Branco',$3,'admin')
   ON CONFLICT (email) DO NOTHING`,
  [ADMIN_ID, ADMIN_EMAIL, await hashPassword(LOCAL_PASSWORD)],
);
const login = await handleNeonRequest(
  new Request("http://ouro.local/api/neon/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://ouro.local" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: LOCAL_PASSWORD }),
  }),
);
const token = login.headers.get("set-cookie")?.match(/preciso_session=([a-f0-9]+)/)?.[1];
if (!token) throw new Error("Não foi possível entrar com o administrador local.");

async function call(path, body) {
  const response = await handleNeonRequest(
    new Request(`http://ouro.local/api/neon/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: `preciso_session=${token}`,
        ...(body ? { "Content-Type": "application/json", Origin: "http://ouro.local" } : {}),
      },
      ...(body ? { body: JSON.stringify({ request_key: randomUUID(), ...body }) } : {}),
    }),
  );
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(data)} ${JSON.stringify(body)}`);
  return data;
}
const stamp = (day, time) => `${day}T${time}:00-03:00`;

// Produtos
const ids = {};
for (const [key, name, category, base, units] of products) {
  const { id } = await call("commercial/product", {
    name,
    description:
      category === "Vendido por metro"
        ? "Custo por metro de EXEMPLO. Confirmar com o dono e quanto tem em estoque."
        : (details[key] ?? ""),
    category,
    base_unit: base,
    valuation_method: "fifo",
    minimum_stock: 0,
    minimum_margin: 0,
    maximum_discount: 100,
    enforce_discount: false,
    active: true,
    published: false,
    public_price: false,
    image_url: null,
    units: units.map(([unit, factor, price]) => ({ name: unit, factor, price })),
  });
  ids[key] = id;
}
const state = await call("commercial/state");
for (const [key, minimum, price, profile] of wholesale) {
  const product = state.products.find((item) => item.id === ids[key]);
  await call("commercial/price_rule", {
    unit_id: product.units.find((unit) => Number(unit.factor) === 1).id,
    customer_id: null,
    profile: profile ?? null,
    minimum_quantity: minimum,
    price,
    valid_from: null,
    valid_until: null,
  });
}
const unitOf = (key) => {
  const [productKey, unitName] = alias[key] ?? [key, null];
  const product = state.products.find((item) => item.id === ids[productKey]);
  const unit = unitName
    ? product.units.find((u) => u.name === unitName)
    : product.units.find((u) => Number(u.factor) === 1);
  return { product, unit, productKey };
};

// Estoque inicial = estoque de 16/11 + o que foi vendido na semana.
const sold = {};
for (const { sales } of Object.values(week))
  for (const [, , lines] of sales)
    for (const [quantity, key] of lines) {
      const { unit, productKey } = unitOf(key);
      sold[productKey] = (sold[productKey] ?? 0) + quantity * Number(unit.factor);
    }
for (const [key, , , , , cost, stock] of products) {
  const quantity = Math.round(((sold[key] ?? 0) + stock) * 1e6) / 1e6;
  if (!quantity) continue;
  const { product, unit } = unitOf(key);
  await call("commercial/adjustment", {
    product_id: product.id,
    unit_id: unit.id,
    quantity,
    mode: "in",
    base_unit_cost: cost,
    reference: "Estoque inicial",
    reason: "Estoque da folha de 16/11 somado às vendas de 09 a 14/11",
  });
}
await db.exec(`UPDATE preciso.commercial_lots SET received_at='${stamp("2026-11-08", "18:00")}';
  UPDATE preciso.commercial_movements SET created_at='${stamp("2026-11-08", "18:00")}';`);

// Preço com duas casas: se a divisão não fecha, separa uma unidade com o centavo que sobra.
function lines(items) {
  const result = [];
  for (const [quantity, key, value] of items) {
    const { unit } = unitOf(key);
    const exact = Math.round((value / quantity) * 100) / 100;
    const push = (q, price) =>
      result.push({
        unit_id: unit.id,
        quantity: q,
        price,
        reason: "Preço da folha do dono",
      });
    if (Math.abs(exact * quantity - value) < 0.001) push(quantity, exact);
    else {
      const base = Math.floor((value / quantity) * 100) / 100;
      push(quantity - 1, base);
      push(1, Math.round((value - base * (quantity - 1)) * 100) / 100);
    }
  }
  return result;
}

for (const [day, sheet] of Object.entries(week)) {
  const cash = await call("store/cash_open", { opening: sheet.opening });
  await db.query("UPDATE preciso.commercial_cash_sessions SET opened_at=$1 WHERE id=$2", [
    stamp(day, "07:00"),
    cash.id,
  ]);
  for (const [time, method, items] of sheet.sales) {
    const total = items.reduce((sum, [, , value]) => sum + value, 0);
    const payments = (Array.isArray(method) ? method : [[method, total]]).map(([m, amount]) => ({
      method: m,
      amount,
      reference: "",
      confirmed: true,
    }));
    const sale = await call("commercial/sale", {
      customer_id: null,
      items: lines(items),
      payments,
      freight: 0,
      fees: 0,
      taxes: 0,
      other_costs: 0,
    });
    await db.query("UPDATE preciso.commercial_sales SET created_at=$1 WHERE id=$2", [
      stamp(day, time),
      sale.id,
    ]);
    await db.query("UPDATE preciso.commercial_payments SET created_at=$1 WHERE sale_id=$2", [
      stamp(day, time),
      sale.id,
    ]);
    await db.query("UPDATE preciso.commercial_movements SET created_at=$1 WHERE sale_id=$2", [
      stamp(day, time),
      sale.id,
    ]);
  }
  for (const [category, person, description, amount] of sheet.withdrawals) {
    const { id } = await call("store/withdrawal", { category, person, description, amount });
    await db.query("UPDATE preciso.commercial_expenses SET due_on=$1,paid_on=$1 WHERE id=$2", [
      day,
      id,
    ]);
  }
  for (const [description, amount, type, method] of sheet.expenses)
    await call("store/expense", {
      description,
      amount,
      expense_type: type,
      person: "",
      due_on: day,
      paid_on: day,
      method,
    });
  await call("store/cash_close", { counted: sheet.counted, notes: sheet.notes ?? "" });
  await db.query("UPDATE preciso.commercial_cash_sessions SET closed_at=$1 WHERE id=$2", [
    stamp(day, "17:30"),
    cash.id,
  ]);
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  await automaticClosings(day, weekday);
  await db.query(
    "UPDATE preciso.commercial_closings SET created_at=$1 WHERE source='automatico' AND end_on=$2",
    [stamp(day, "23:00"), day],
  );
}

for (const [person, amount] of fiados)
  await call("store/debt", {
    kind: "fiado",
    person,
    description: "Fiado anterior (folha 09 a 14/11)",
    amount,
    due_on: "2026-11-14",
    paid_on: null,
    example: false,
    notes: "",
  });
for (const [kind, person, description, amount, due_on, example, notes] of debts)
  await call("store/debt", {
    kind,
    person,
    description,
    amount,
    due_on,
    paid_on: null,
    example,
    notes,
  });

// Fiado de exemplo lançado pelo sistema: cliente autorizado compra a prazo e paga uma parte.
const bigode = await call("commercial/customer", {
  name: "Bigode",
  contact: "",
  profile: "recorrente",
  allow_credit: true,
});
const fiadoCash = await call("store/cash_open", { opening: 13 });
await db.query("UPDATE preciso.commercial_cash_sessions SET opened_at=$1 WHERE id=$2", [
  stamp("2026-11-18", "07:00"),
  fiadoCash.id,
]);
const fiadoSale = await call("commercial/sale", {
  customer_id: bigode.id,
  items: lines([
    [4, "gesso", 99.96],
    [10, "placa", 51.9],
  ]),
  payments: [{ method: "dinheiro", amount: 50, reference: "Entrada", confirmed: true }],
  freight: 0,
  fees: 0,
  taxes: 0,
  other_costs: 0,
});
for (const table of ["commercial_sales", "commercial_payments", "commercial_movements"])
  await db.query(
    `UPDATE preciso.${table} SET created_at=$1 WHERE ${table === "commercial_sales" ? "id" : "sale_id"}=$2`,
    [stamp("2026-11-18", "09:40"), fiadoSale.id],
  );
await call("store/cash_close", { counted: 63, notes: "" });
await db.query("UPDATE preciso.commercial_cash_sessions SET closed_at=$1 WHERE id=$2", [
  stamp("2026-11-18", "17:30"),
  fiadoCash.id,
]);

const supplier = await call("commercial/supplier", {
  name: "Fornecedor de gesso (exemplo)",
  contact: "",
});
await call("store/order", {
  supplier_id: supplier.id,
  reference: "EXEMPLO · pedido de placas, blocos e gesso",
  ordered_on: "2026-11-18",
  expected_on: "2026-11-23",
  due_on: null,
  freight: 0,
  other_costs: 0,
  notes: "Pedido de exemplo para mostrar a conferência de entrega.",
  items: [
    { product_id: ids.placa, unit_id: unitOf("placa").unit.id, quantity: 100, goods_total: 480 },
    { product_id: ids.bloco, unit_id: unitOf("bloco").unit.id, quantity: 50, goods_total: 525 },
    { product_id: ids.gesso, unit_id: unitOf("gesso").unit.id, quantity: 40, goods_total: 880 },
  ],
});

const check = await db.query(`SELECT
  (SELECT sum(revenue-returned_revenue) FROM preciso.commercial_results) AS vendas,
  (SELECT sum(amount) FROM preciso.commercial_expenses WHERE category='despesa') AS gastos,
  (SELECT jsonb_object_agg(day,counted-expected) FROM (SELECT (opened_at AT TIME ZONE 'America/Recife')::date AS day,counted,expected FROM preciso.commercial_cash_sessions) c) AS caixa`);
console.log("Semana montada:", JSON.stringify(check.rows[0]));

if (dumpFile || apply) {
  const tables = [
    "commercial_products",
    "commercial_units",
    "commercial_price_rules",
    "commercial_customers",
    "commercial_suppliers",
    "commercial_cash_sessions",
    "commercial_purchases",
    "commercial_lots",
    "commercial_sales",
    "commercial_sale_items",
    "commercial_allocations",
    "commercial_movements",
    "commercial_payments",
    "commercial_expenses",
    "commercial_company_debts",
    "commercial_closings",
    "commercial_supplier_orders",
  ];
  const statements = [];
  for (const table of tables) {
    const where =
      table === "commercial_products"
        ? " WHERE NOT example"
        : table === "commercial_units"
          ? " WHERE product_id IN (SELECT id FROM preciso.commercial_products WHERE NOT example)"
          : "";
    const rows = await db.query(
      `SELECT COALESCE(json_agg(t),'[]') AS data FROM preciso.${table} t${where}`,
    );
    const json = JSON.stringify(rows.rows[0].data).replaceAll("'", "''");
    statements.push(
      `INSERT INTO preciso.${table} SELECT * FROM json_populate_recordset(NULL::preciso.${table}, '${json}')`,
    );
  }
  if (dumpFile) {
    await writeFile(dumpFile, statements.join(";\n") + ";\n");
    console.log("SQL gerado em", dumpFile);
  }
  if (apply) {
    await target.transaction(statements.map((statement) => target.query(statement)));
    console.log("Semana de exemplo gravada no banco.");
  }
}
await db.close();
