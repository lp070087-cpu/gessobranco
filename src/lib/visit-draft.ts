/** Pedido de visita montado no simulador e levado até a agenda do cliente. */
export type VisitDraft = { summary: string; photos: string[] };

const KEY = "ouro-visit-draft";
export const MAX_PHOTOS = 6;

export function saveVisitDraft(draft: VisitDraft) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ ...draft, photos: [] }));
    } catch {
      /* navegador sem armazenamento: o resumo segue só na tela */
    }
  }
}

export function readVisitDraft(): VisitDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as VisitDraft;
    return typeof value.summary === "string" && Array.isArray(value.photos) ? value : null;
  } catch {
    return null;
  }
}

export function clearVisitDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nada a limpar */
  }
}

/** Reduz a foto (inclusive do iPhone) para JPEG leve antes de enviar. */
export async function shrinkPhoto(file: File, max = 1400, quality = 0.74): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Foto não reconhecida."));
      element.src = url;
    });
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Foto não reconhecida.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", quality);
    if (data.length > 1_500_000) data = canvas.toDataURL("image/jpeg", 0.55);
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}
