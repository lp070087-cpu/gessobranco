import { commercialFetch } from "@/lib/commercial-client";

export type SheetSale = {
  id: string;
  time: string;
  total: number;
  fiado: number;
  customer: string | null;
  items: { product: string; unit: string; quantity: number; price: number; value: number }[];
  methods: ("pix" | "dinheiro" | "cartao")[];
};
export type SheetCash = {
  id: string;
  opening: number;
  opened_at: string;
  closed_at: string | null;
  counted: number | null;
  notes: string;
  cash_sales: number;
  cash_expenses: number;
  purchase_cash: number;
  expected: number;
  withdrawals: {
    id: string;
    category: "retirada" | "vale";
    person: string;
    description: string;
    amount: number;
  }[];
};
export type SheetExpense = {
  id: string;
  day?: string;
  description: string;
  amount: number;
  type: "fixo" | "variavel";
  person: string;
  paid: boolean;
  method?: string | null;
};
export type SheetDay = {
  day: string;
  sales: SheetSale[];
  totals: {
    sales: number;
    pix: number;
    dinheiro: number;
    cartao: number;
    fiado: number;
    expenses: number;
  };
  expenses: SheetExpense[];
  cash: SheetCash[];
};
export type Debt = {
  id: string;
  kind: "boleto" | "divida" | "credito" | "aluguel" | "outro" | "fiado";
  person: string;
  description: string;
  amount: number | null;
  due_on: string | null;
  paid_on: string | null;
  example: boolean;
  notes: string;
};
export type Sheet = {
  start: string;
  end: string;
  days: SheetDay[];
  week: {
    products: { product: string; unit: string; quantity: number; value: number }[];
    sales: number;
    pix: number;
    dinheiro: number;
    cartao: number;
    fiado: number;
    expense_total: number;
    expenses: SheetExpense[];
    withdrawals: {
      id: string;
      day: string;
      category: string;
      person: string;
      description: string;
      amount: number;
    }[];
  };
  fiados: { name: string; amount: number; since: string }[];
  debts: Debt[];
  stock: {
    id: string;
    name: string;
    base_unit: string;
    balance: number;
    value: number | null;
    unit_cost: number | null;
    price: number | null;
  }[];
  open_cash: { id: string; opening: number; opened_at: string } | null;
};
export type ClosingSummary = {
  sales: number;
  pix: number;
  dinheiro: number;
  cartao: number;
  fiado: number;
  expenses: number;
  result: number;
  open_cash: boolean;
  cash_difference: number;
  days: ({ day: string } & SheetDay["totals"])[];
};
export type Closing = {
  id: string;
  period: "dia" | "semana";
  start_on: string;
  end_on: string;
  source: "automatico" | "manual";
  notes: string;
  created_at: string;
  actor: string | null;
  snapshot: { summary?: ClosingSummary };
};
export type OrderItem = {
  product_id: string;
  unit_id: string;
  quantity: number;
  goods_total: number;
  product: string | null;
  unit: string | null;
};
export type SupplierOrder = {
  id: string;
  reference: string;
  ordered_on: string;
  expected_on: string | null;
  due_on: string | null;
  freight: number;
  other_costs: number;
  status: "aguardando" | "chegou" | "conferido";
  arrived_at: string | null;
  checked_at: string | null;
  notes: string;
  supplier: string | null;
  items: OrderItem[];
  check_result: {
    notes: string;
    items: {
      ordered: number;
      ok: number;
      broken: number;
      damaged: number;
      missing: number;
      note: string;
    }[];
  } | null;
};

export const sendStore = <T = { id: string }>(kind: string, body: Record<string, unknown>) =>
  commercialFetch<T>("store/" + kind, { request_key: crypto.randomUUID(), ...body });

export const brl = (value: number | string | null | undefined, blank = "Em branco") =>
  value === null || value === undefined || value === ""
    ? blank
    : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const qty = (value: number | string) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export const addDays = (day: string, amount: number) =>
  new Date(Date.parse(day + "T12:00:00Z") + amount * 86_400_000).toISOString().slice(0, 10);

/** A semana da loja vai de segunda a sábado. */
export const mondayOf = (day: string) => {
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  return addDays(day, weekday === 0 ? -6 : 1 - weekday);
};

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const dayLabel = (day: string, short = false) => {
  const date = new Date(day + "T12:00:00Z");
  const name = weekdays[date.getUTCDay()];
  const dm = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  return short ? `${name.slice(0, 3)} ${dm}` : `${name} ${dm}/${day.slice(2, 4)}`;
};
export const shortDate = (day: string | null) =>
  day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(2, 4)}` : "Sem data";

export const methodLabel: Record<string, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
};
export const debtKinds: Record<Debt["kind"], string> = {
  boleto: "Boletos",
  divida: "Dívidas da empresa",
  credito: "Créditos",
  aluguel: "Aluguel",
  outro: "Outros (Leonardo, caminhão...)",
  fiado: "Fiado anterior",
};
