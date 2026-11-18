import { useState } from "react";
import { importColumns, parseCsv, previewProductImport } from "@/lib/commercial-import";
import { moneyBR, type CommercialState } from "@/lib/commercial-client";
import type { Command } from "./CommercialForms";

const labels: Record<string, string> = {
  name: "Nome",
  category: "Categoria",
  base_unit: "Unidade-base",
  unit_name: "Unidade de venda",
  factor: "Conversão para unidade-base",
  price: "Preço padrão",
};

export function CommercialImport({ state, command }: { state: CommercialState; command: Command }) {
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [simulated, setSimulated] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = previewProductImport(
    rows.slice(1),
    mapping,
    state.products.map((product) => product.name),
  );

  async function read(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSimulated(false);
    setRows([]);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Selecione um arquivo de até 5 MB.");
      let parsed: string[][];
      if (/\.csv$/i.test(file.name)) parsed = parseCsv(await file.text());
      else if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const sheet = await readSheet(file, 1);
        parsed = sheet.map((row) => row.map((cell) => (cell === null ? "" : String(cell))));
      } else throw new Error("Use um arquivo XLSX ou CSV.");
      if (parsed.length < 2 || parsed.length > 201)
        throw new Error("O arquivo deve conter o cabeçalho e até 200 linhas de produtos.");
      setRows(parsed);
      setMapping({});
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não foi possível abrir a planilha.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (
      !simulated ||
      preview.issues.length ||
      !preview.products.length ||
      !window.confirm(`Importar ${preview.products.length} produtos como rascunhos inativos?`)
    )
      return;
    setBusy(true);
    try {
      await command("import_products", { rows: preview.products });
      setRows([]);
      setSimulated(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Importação não confirmada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Importar cadastro de produtos</h2>
      <p className="hint">
        Use os valores de cadastro da planilha. Escolha as colunas antes de confirmar. Produtos
        entram inativos, sem saldo de estoque. Compras e inventário precisam registrar os lotes e os
        custos correspondentes. A estrutura dos relatórios reais da empresa será mapeada quando os
        arquivos forem fornecidos. No XLSX, será lida a primeira aba; a primeira linha deve conter
        os títulos das colunas.
      </p>
      <label className="space">
        Planilha XLSX ou CSV
        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={busy}
          onChange={(event) => void read(event.target.files?.[0])}
        />
      </label>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!!rows.length && (
        <>
          <div className="fields">
            {importColumns.map((column) => (
              <label key={column}>
                {labels[column]}
                <select
                  value={mapping[column] ?? ""}
                  onChange={(event) => {
                    setMapping((current) => ({
                      ...current,
                      [column]: event.target.value === "" ? -1 : Number(event.target.value),
                    }));
                    setSimulated(false);
                  }}
                >
                  <option value="">Escolha uma coluna</option>
                  {rows[0].map((header, index) => (
                    <option key={index} value={index}>
                      {header || `Coluna ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {rows[0].map((header, index) => (
                    <th key={index}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1, 6).map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="actions">
            <button
              className="action"
              disabled={
                busy ||
                ["name", "base_unit", "unit_name", "factor"].some(
                  (column) => mapping[column] === undefined || mapping[column] < 0,
                )
              }
              onClick={() => setSimulated(true)}
            >
              Simular importação
            </button>
            <button
              className="action primary"
              disabled={busy || !simulated || !!preview.issues.length || !preview.products.length}
              onClick={() => void confirm()}
            >
              Confirmar importação
            </button>
          </div>
          {simulated && (
            <>
              <p>
                {preview.products.length} produto(s) válido(s) · {preview.issues.length}{" "}
                inconsistência(s).
              </p>
              {preview.issues.map((issue) => (
                <p className="hint warning" key={issue}>
                  {issue}
                </p>
              ))}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Unidade-base</th>
                      <th>Conversão</th>
                      <th>Preço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.products.map((product) => (
                      <tr key={product.name}>
                        <td>{product.name}</td>
                        <td>{product.base_unit}</td>
                        <td>
                          {product.unit_name} = {product.factor} {product.base_unit}
                        </td>
                        <td>{moneyBR(product.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
