const importer = String.raw`<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://cdn.sheetjs.com; worker-src blob:; connect-src https://cdn.jsdelivr.net https://tessdata.projectnaptha.com">
<script type="module">
function reply(event, data) {
  event.source.postMessage({ kind: "ouro-document-result", id: event.data.id, ...data }, event.origin);
}
async function pdfRows(bytes, maxRows, maxPages) {
  const base = "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/legacy/build/";
  const pdf = await import(base + "pdf.min.mjs");
  pdf.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
  const task = pdf.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false, disableFontFace: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > maxPages) throw Error("Escolha um PDF com até " + maxPages + " páginas.");
    const rows = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const { items } = await page.getTextContent();
      const sorted = items.filter(item => item.str?.trim()).sort((a, b) => b.transform[5] - a.transform[5]);
      const lines = [];
      for (const item of sorted) {
        const y = item.transform[5];
        const last = lines.at(-1);
        if (last && Math.abs(last.y - y) < 3) last.items.push(item);
        else lines.push({ y, items: [item] });
      }
      for (const line of lines) {
        const cells = [];
        let right = -Infinity;
        for (const item of line.items.sort((a, b) => a.transform[4] - b.transform[4])) {
          const x = item.transform[4];
          const gap = Math.max(8, (item.height || 10) * 0.85);
          if (x - right > gap) cells.push(item.str.trim());
          else cells[cells.length - 1] += " " + item.str.trim();
          right = Math.max(right, x + item.width);
        }
        if (cells.length > 1) rows.push(cells);
      }
      if (rows.length > maxRows) throw Error("O PDF excede o limite de " + (maxRows - 1) + " linhas.");
    }
    if (rows.length < 2) throw Error("O PDF precisa conter uma tabela com texto selecionável. Para documentos escaneados, use uma planilha.");
    return rows;
  } finally {
    await task.destroy();
  }
}
async function excelRows(bytes, maxRows) {
  const { read, utils } = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const book = read(bytes, { sheets: 0, sheetRows: maxRows + 1, raw: true });
  return utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { header: 1, defval: "", blankrows: false, raw: false });
}
async function imageRows(bytes, receipt) {
  const base = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/";
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = base + "tesseract.min.js";
    script.onload = resolve;
    script.onerror = () => reject(Error("Não foi possível carregar a leitura de imagens."));
    document.head.append(script);
  });
  const worker = await globalThis.Tesseract.createWorker("por", 1, {
    workerPath: base + "worker.min.js",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0",
    langPath: "https://tessdata.projectnaptha.com/4.0.0",
    cacheMethod: "none",
  });
  try {
    const { data } = await worker.recognize(new Uint8Array(bytes), {}, { text: true, tsv: !receipt });
    if (!data.text.trim()) throw Error("Não encontrei texto legível. Tente uma foto mais nítida.");
    if (receipt) return data.text.trim().split(/\r?\n/).map(line => [line]);
    const lines = new Map();
    for (const row of data.tsv.split(/\r?\n/).slice(1)) {
      const parts = row.split("\t");
      const word = parts[11]?.trim();
      if (parts[0] !== "5" || !word) continue;
      const id = parts.slice(1, 5).join("/");
      const line = lines.get(id) || [];
      line.push({ x: Number(parts[6]), width: Number(parts[8]), height: Number(parts[9]), word });
      lines.set(id, line);
    }
    return Array.from(lines.values(), line => {
      const cells = [];
      let right = -Infinity;
      for (const word of line.sort((a, b) => a.x - b.x)) {
        if (word.x - right > Math.max(10, word.height * 0.8)) cells.push(word.word);
        else cells[cells.length - 1] += " " + word.word;
        right = word.x + word.width;
      }
      return cells;
    });
  } finally {
    await worker.terminate();
  }
}
addEventListener("message", async (event) => {
  if (event.source !== parent || event.data?.kind !== "ouro-document-read" || !(event.data.bytes instanceof ArrayBuffer)) return;
  try {
    const { bytes, format, maxRows, maxPages } = event.data;
    const rows = format === "pdf" ? await pdfRows(bytes, maxRows, maxPages) :
      format === "xls" ? await excelRows(bytes, maxRows) : await imageRows(bytes, format === "receipt");
    reply(event, { rows: rows.map(row => row.slice(0, 50).map(cell => String(cell).slice(0, 500))) });
  } catch (error) {
    reply(event, { error: error instanceof Error ? error.message : "Falha ao ler o documento." });
  }
});
</script>`;

export async function readDocument(
  file: File,
  format: "pdf" | "xls" | "image" | "receipt",
  { maxRows = 201, maxPages = 25 } = {},
): Promise<string[][]> {
  const bytes = await file.arrayBuffer();
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Leitor de documento";
  frame.sandbox.add("allow-scripts");
  frame.srcdoc = importer;
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(
      () =>
        finish(
          new Error(
            "O leitor de documentos demorou a responder. Tente novamente ou use XLSX ou CSV.",
          ),
        ),
      format === "image" || format === "receipt" ? 90000 : maxPages > 25 ? 90000 : 30000,
    );
    function finish(error?: Error, rows?: string[][]) {
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      frame.remove();
      if (error) reject(error);
      else resolve(rows ?? []);
    }
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== "null" ||
        event.data?.kind !== "ouro-document-result" ||
        event.data.id !== id
      )
        return;
      if (typeof event.data.error === "string") finish(new Error(event.data.error));
      else if (Array.isArray(event.data.rows)) finish(undefined, event.data.rows);
    }
    window.addEventListener("message", receive);
    frame.addEventListener(
      "load",
      () =>
        frame.contentWindow?.postMessage(
          { kind: "ouro-document-read", id, format, bytes, maxRows, maxPages },
          "*",
          [bytes],
        ),
      { once: true },
    );
    document.body.append(frame);
  });
}
