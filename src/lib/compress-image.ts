// Kompresi gambar di sisi client sebelum unggah (hemat bandwidth & storage —
// penting untuk perangkat & jaringan lapangan). Resize ke sisi maks + re-encode JPEG.
export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.8,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) =>
      canvas.toBlob(r, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file; // pakai asli bila tak lebih kecil
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}
