import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES } from "@/lib/upload-constants";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Simpan bukti (foto terima / bukti bayar) ke folder public/uploads (PRD §7).
// Validasi tipe & ukuran di server (otoritatif). Mengembalikan URL relatif.
export async function saveUpload(file: File, prefix: string): Promise<string> {
  if (!file || file.size === 0) throw new Error("File kosong.");
  if (!ALLOWED_MIME.includes(file.type))
    throw new Error("Tipe file harus JPG, PNG, atau WebP.");
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error(`Ukuran file maksimal ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB.`);

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = EXT_BY_MIME[file.type] ?? "jpg";
  const name = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, name), buf);
  return `/uploads/${name}`;
}
