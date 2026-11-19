export const photoAccept = ".jpg,.jpeg,.png,image/jpeg,image/png";

export async function preparePhoto(file: File) {
  if (!/\.(jpe?g|png)$/i.test(file.name) || file.size > 20_000_000)
    throw new Error("Selecione um JPG ou PNG de até 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem.");
    const type = /\.png$/i.test(file.name) ? "image/png" : "image/jpeg";
    for (const size of [1600, 1200, 900, 650, 450]) {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL(type, 0.86);
      if (image.length <= 1_600_000) return image;
    }
    throw new Error("Não foi possível reduzir a imagem. Escolha uma foto menor.");
  } finally {
    bitmap.close();
  }
}
