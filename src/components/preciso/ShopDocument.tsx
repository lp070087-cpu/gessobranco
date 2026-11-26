import type { ReactNode, Ref } from "react";
import { moneyBR, quantityBR } from "@/lib/commercial-client";
import { shopDocumentDate } from "@/lib/shop-quote";

type DocumentRow = {
  id: string;
  name: string;
  unit: string;
  quantity: number | string;
  price: number | string;
  total: number;
  returned?: number | string;
};

export function ShopDocument({
  title,
  code,
  date,
  customer,
  items,
  total,
  totalLabel,
  printLabel,
  documentRef,
  children,
}: {
  title: string;
  code: string;
  date: string;
  customer: string;
  items: DocumentRow[];
  total: number;
  totalLabel: string;
  printLabel: string;
  documentRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}) {
  return (
    <div ref={documentRef} className="receipt">
      <h3>OURO BRANCO — SOLUÇÕES EM GESSO</h3>
      <p>
        {title} · {code.slice(0, 8)}
      </p>
      <p>Data {shopDocumentDate(date)}</p>
      <p>Cliente {customer}</p>
      <table>
        <thead>
          <tr>
            <th>Material</th>
            <th>Quantidade</th>
            <th>Preço unitário</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>
                {quantityBR(item.quantity)} {item.unit}
                {Number(item.returned ?? 0) > 0 && (
                  <p>
                    Devolvido {quantityBR(item.returned ?? 0)} {item.unit}
                  </p>
                )}
              </td>
              <td>{moneyBR(item.price)}</td>
              <td>{moneyBR(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>{totalLabel}</strong> {moneyBR(total)}
      </p>
      {children}
      <small>Documento sem valor fiscal.</small>
      <div>
        <button type="button" className="action" onClick={() => window.print()}>
          {printLabel}
        </button>
      </div>
    </div>
  );
}
