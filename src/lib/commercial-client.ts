export type SaleUnit = {
  id: string;
  product_id: string;
  name: string;
  factor: string;
  price: string | null;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  base_unit: string;
  valuation_method: "fifo";
  minimum_stock: string;
  minimum_margin: string;
  maximum_discount: string;
  enforce_discount: boolean;
  active: boolean;
  published: boolean;
  public_price: boolean;
  image_url: string | null;
  example: boolean;
  balance: string;
  stock_cost: string | null;
  purchase_reference?: { cost: number; quantity: number } | null;
  units: SaleUnit[];
};
export type Customer = {
  id: string;
  name: string;
  contact: string;
  profile: string;
  allow_credit: boolean;
};
export type Supplier = { id: string; name: string; contact: string };
export type PriceRule = {
  active: boolean;
  id: string;
  unit_id: string;
  customer_id: string | null;
  profile: string | null;
  minimum_quantity: string;
  price: string;
  valid_from: string | null;
  valid_until: string | null;
};
export type SaleItem = {
  id: string;
  product_id: string;
  unit_id: string;
  product_name: string;
  unit_name: string;
  factor: string;
  quantity: string;
  returned: string;
  price: string;
  revenue: string;
  cost: string | null;
  warnings: string[];
};
export type Payment = {
  id: string;
  amount: string;
  method: string;
  reference: string;
  created_at: string;
};
export type Sale = {
  id: string;
  customer_id: string | null;
  created_at: string;
  status: string;
  delivery: string;
  revenue: string;
  returned_revenue: string;
  goods_cost: string | null;
  contribution: string | null;
  received: string;
  receivable: string;
  partial: boolean;
  items: SaleItem[];
  payments: Payment[];
  freight: string | null;
  fees: string | null;
  taxes: string | null;
  other_costs: string | null;
};
export type Cash = {
  id: string;
  opening: string;
  opened_at: string;
  closed_at: string | null;
  counted: string | null;
  expected: string | null;
};
export type Purchase = {
  id: string;
  delivery_id?: string | null;
  input_quantity?: string | null;
  unit_name?: string | null;
  product_id: string;
  supplier_id: string | null;
  reference: string;
  quantity: string;
  total: string | null;
  goods_total: string | null;
  freight: string | null;
  other_costs: string | null;
  paid: string;
  due_on: string | null;
  purchased_at: string;
};
export type Expense = {
  id: string;
  description: string;
  amount: string;
  due_on: string;
  paid_on: string | null;
  method: string | null;
};
export type Movement = {
  id: string;
  product_id: string;
  lot_id: string;
  quantity: string;
  kind: string;
  reason: string;
  actor_id: string;
  created_at: string;
};
export type CommercialState = {
  products: Product[];
  product_categories?: string[];
  customers: Customer[];
  suppliers: Supplier[];
  rules: PriceRule[];
  sales: Sale[];
  cash: Cash | null;
  cash_history: Cash[];
  purchases: Purchase[];
  expenses: Expense[];
  movements: Movement[];
  lots: { id: string; product_id: string; remaining: string; unit_cost: string | null }[];
};
export type Report = {
  daily: { day: string; good: number; medium: number; bad: number; pending: number }[];
  pending_purchase_costs: number;
  by_customer: {
    name: string;
    revenue: number;
    contribution: number | null;
    partial_sales: number;
  }[];
  revenue: number;
  goods_cost: number | null;
  contribution: number | null;
  received: number;
  receivable: number;
  refund_due: number;
  payable: number;
  operating_expenses: number;
  cash_out: number;
  partial_sales: number;
  by_product: { product_name: string; revenue: number; goods_cost: number | null }[];
};

export function estimatedResult(report: Report) {
  if (Number(report.partial_sales) > 0) return null;
  return Number(report.contribution ?? 0) - Number(report.operating_expenses);
}

export const moneyBR = (value: string | number | null | undefined) =>
  value == null
    ? "Custo pendente"
    : Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const quantityBR = (value: string | number) =>
  Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
export const localDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Recife",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export function applicablePrice(
  unit: SaleUnit,
  customer: Customer | undefined,
  quantity: number,
  rules: PriceRule[],
  day = localDay(),
) {
  const matching = rules.filter(
    (rule) =>
      rule.active !== false &&
      rule.unit_id === unit.id &&
      Number(rule.minimum_quantity) <= quantity &&
      (!rule.valid_from || rule.valid_from <= day) &&
      (!rule.valid_until || rule.valid_until >= day) &&
      (rule.customer_id === customer?.id ||
        (!rule.customer_id && (!rule.profile || rule.profile === customer?.profile))),
  );
  matching.sort(
    (a, b) =>
      Number(Boolean(b.customer_id)) - Number(Boolean(a.customer_id)) ||
      Number(Boolean(b.profile)) - Number(Boolean(a.profile)) ||
      Number(b.minimum_quantity) - Number(a.minimum_quantity) ||
      a.id.localeCompare(b.id),
  );
  return matching.length
    ? Number(matching[0].price)
    : unit.price === null
      ? null
      : Number(unit.price);
}

export async function commercialFetch<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`/api/neon/${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(20000),
  }).catch((failure: unknown) => {
    if (signal?.aborted) throw failure;
    throw new Error("Não foi possível conectar. Confira sua conexão e tente novamente.");
  });
  const data = await response
    .json()
    .catch(() => ({ error: "O servidor retornou uma resposta inesperada." }));
  if (!response.ok) {
    const error = new Error(
      data.error || "Não foi possível concluir. Tente novamente.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}
