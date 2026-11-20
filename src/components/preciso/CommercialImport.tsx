import { ExampleCards } from "@/components/preciso/ExampleCards";
import { useState } from "react";
import { importColumns, readCsv, previewProductImport } from "@/lib/commercial-import";
import { moneyBR, type CommercialState } from "@/lib/commercial-client";
import type { Command } from "./CommercialForms";
import { readDocument } from "@/lib/document-import";
import { photoAccept } from "@/lib/photo-upload";
import { downloadSpreadsheet } from "@/lib/spreadsheet-export";

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
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[]>([]);
  const [sheet, setSheet] = useState(0);
  const [fromPhoto, setFromPhoto] = useState(false);
  const [rawPhoto, setRawPhoto] = useState("");
  const [sameUnit, setSameUnit] = useState(false);
  const preview = previewProductImport(
    rows.slice(1),
    mapping,
    state.products.map((product) => product.name),
    sameUnit,
  );

  function configure(parsed: string[][]) {
    const visible = parsed.filter((line) => line.some((value) => value.trim()));
    if (visible.length < 2 || visible.length > 201) {
      setRows([]);
      throw new Error("Use uma linha de cabeçalho e de 1 a 200 produtos por aba.");
    }
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    const headers = visible[0].map(normalize);
    const aliases = {
      name: /^(nome|produto|descricao|item|name)\b/,
      category: /^(categoria|grupo|category)\b/,
      base_unit: /^(unidade[-_ ]?base|base_unit|estoque)\b/,
      unit_name: /^(unidade( de venda)?|unidade comercial|embalagem|unit_name)$/,
      factor: /^(conversao|fator|factor)\b/,
      price: /^(preco|valor( unitario)?|price)\b/,
    };
    setRows(visible);
    setMapping(
      Object.fromEntries(
        importColumns
          .map((key) => [key, headers.findIndex((header) => aliases[key].test(header))])
          .filter(([, index]) => Number(index) >= 0),
      ),
    );
    setSimulated(false);
  }

  async function read(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSimulated(false);
    setRows([]);
    setSheets([]);
    setSheet(0);
    setFromPhoto(false);
    setSameUnit(false);
    setRawPhoto("");
    try {
      if (file.size > 20_000_000) throw new Error("Selecione um arquivo de até 20 MB.");
      let parsed: string[][];
      if (/\.csv$/i.test(file.name)) parsed = await readCsv(file);
      else if (/\.xlsx$/i.test(file.name)) {
        const { default: readWorkbook } = await import("read-excel-file/browser");
        const workbook = (await readWorkbook(file)).map(({ sheet, data }) => ({
          name: sheet,
          rows: data.map((row) => row.map((cell) => (cell === null ? "" : String(cell)))),
        }));
        setSheets(workbook);
        parsed = workbook[0]?.rows ?? [];
      } else if (/\.pdf$/i.test(file.name)) parsed = await readDocument(file, "pdf");
      else if (/\.xls$/i.test(file.name)) parsed = await readDocument(file, "xls");
      else if (/\.(jpe?g|png)$/i.test(file.name)) {
        parsed = await readDocument(file, "image");
        setFromPhoto(true);
        setRawPhoto(parsed.map((row) => row.join(";")).join("\n"));
      } else throw new Error("Use PDF, Excel, CSV, JPG ou PNG.");
      configure(parsed);
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
        Selecione o arquivo, confira as colunas na prévia e simule antes de importar. Os produtos
        entram como rascunhos, sem saldo inicial.
      </p>
      <details>
        <summary>Formatos e exemplo de colunas</summary>
        <p className="hint">
          Excel, CSV, PDF com tabela de texto, JPG ou PNG. Use o cabeçalho Nome, Categoria,
          Unidade-base, Unidade de venda, Conversão e Preço. Em fotos, revise o texto reconhecido.
        </p>
        <p className="hint">Exemplo: Gesso · Acabamento · kg · saco · 40 · 32,50</p>
      </details>
      <button
        type="button"
        className="action"
        onClick={() =>
          downloadSpreadsheet("modelo-cadastro-produtos", {
            name: "Produtos",
            rows: [
              ["Nome", "Categoria", "Unidade-base", "Unidade de venda", "Conversão", "Preço"],
              ["Gesso exemplo", "Acabamento", "kg", "saco", 40, 32.5],
            ],
          })
        }
      >
        Baixar modelo Excel
      </button>
      <label className="space">
        Arquivo Excel, CSV, PDF, JPG ou PNG
        <input
          type="file"
          accept={".pdf,.xls,.xlsx,.csv," + photoAccept}
          disabled={busy}
          onChange={(event) => void read(event.target.files?.[0])}
        />
      </label>
      {busy && (
        <p className="hint" role="status">
          Processando arquivo…
        </p>
      )}
      {sheets.length > 1 && (
        <label>
          Aba da planilha{" "}
          <select
            value={sheet}
            onChange={(event) => {
              const index = Number(event.target.value);
              setSheet(index);
              setError("");
              try {
                configure(sheets[index].rows);
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Aba indisponível.");
              }
            }}
          >
            {sheets.map(({ name }, index) => (
              <option key={index} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
      )}
      {fromPhoto && (
        <details className="space" open>
          <summary>Revisar texto reconhecido</summary>
          <label>
            Uma linha por produto, campos separados por ponto e vírgula
            <textarea
              rows={8}
              value={rawPhoto}
              onChange={(event) => setRawPhoto(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="action"
            onClick={() => {
              setError("");
              try {
                configure(rawPhoto.split(/\r?\n/).map((line) => line.split(";")));
              } catch (failure) {
                setError(failure instanceof Error ? failure.message : "Confira o texto.");
              }
            }}
          >
            Atualizar prévia
          </button>
        </details>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!!rows.length && (
        <>
          <label className="check space">
            <input
              type="checkbox"
              checked={sameUnit}
              onChange={(event) => {
                setSameUnit(event.target.checked);
                setSimulated(false);
              }}
            />{" "}
            Usar a mesma unidade para venda e estoque (conversão 1)
          </label>
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
                (mapping.name ?? -1) < 0 ||
                (sameUnit
                  ? (mapping.base_unit ?? -1) < 0 && (mapping.unit_name ?? -1) < 0
                  : ["base_unit", "unit_name", "factor"].some(
                      (column) => (mapping[column] ?? -1) < 0,
                    ))
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
      {!rows.length && (
        <ExampleCards
          inline
          title="Como fica a planilha"
          hint="Cada linha é um produto. Depois de enviar, o sistema mostra a prévia, você confere e só então importa."
          cards={[
            {
              title: "Placa de gesso 65x65",
              tag: "Linha 2",
              value: "R$ 5,19",
              lines: ["Categoria: Gesso", "Unidade: placa", "Conversão: 1"],
            },
            {
              title: "Bloco divisório de gesso",
              tag: "Linha 3",
              value: "R$ 13,99",
              lines: ["Categoria: Gesso", "Unidade: bloco", "Conversão: 1"],
            },
            {
              title: "Gesso cola 5kg",
              tag: "Linha 4",
              value: "R$ 14,99",
              lines: ["Categoria: Materiais", "Unidade: saco", "Conversão: 1"],
            },
          ]}
        />
      )}
    </section>
  );
}
