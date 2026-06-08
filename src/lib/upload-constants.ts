// Aturan validasi bukti — dipakai client (pra-validasi UX) & server (otoritatif).
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

// Validasi sebuah File; mengembalikan pesan error atau null bila valid.
export function validateBukti(file: File): string | null {
  if (!file || file.size === 0) return "File kosong.";
  if (!ALLOWED_MIME.includes(file.type)) return "Tipe file harus JPG, PNG, atau WebP.";
  if (file.size > MAX_UPLOAD_BYTES)
    return `Ukuran file maksimal ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`;
  return null;
}
