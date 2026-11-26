export type ShopQuoteInput = {
  request_key: string;
  customer_id: string;
  notes: string;
  items: { unit_id: string; quantity: number; unit_price: number }[];
};

export type ShopQuoteSummary = {
  id: string;
  created_at: string;
  customer_name: string;
  total_cents: number;
};

export type ShopQuote = ShopQuoteSummary & {
  customer_id: string;
  notes: string;
  items: (ShopQuoteInput["items"][number] & {
    product_name: string;
    unit_name: string;
    total_cents: number;
  })[];
};

export function shopQuoteLineCents(quantity: number, unitPrice: number) {
  const quantityInThousandths = Math.round(quantity * 1000);
  const unitPriceInCents = Math.round(unitPrice * 100);
  return Math.round((quantityInThousandths * unitPriceInCents) / 1000);
}

export const shopDocumentDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Recife" });
