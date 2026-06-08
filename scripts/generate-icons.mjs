// Generator ikon PWA (PNG valid) tanpa dependency gambar.
// Brand hijau tua + motif kotak putih (kesan "package/box" FMCG).
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const GREEN = [31, 122, 82];
const WHITE = [255, 255, 255];

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size, pixel) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size);
      const o = rowStart + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Motif: kotak putih dengan bingkai (frame) hijau di dalam -> kesan paket.
function pixel(x, y, size) {
  const f = (v) => v / size; // 0..1
  const fx = f(x), fy = f(y);
  const inOuter = fx >= 0.3 && fx <= 0.7 && fy >= 0.3 && fy <= 0.7;
  const inInner = fx >= 0.42 && fx <= 0.58 && fy >= 0.42 && fy <= 0.58;
  if (inOuter && !inInner) return WHITE;
  return GREEN;
}

const dir = path.join(process.cwd(), "public", "icons");
mkdirSync(dir, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(path.join(dir, `icon-${size}.png`), makePng(size, pixel));
}
// Maskable = sama (latar solid mengisi seluruh mask).
writeFileSync(path.join(dir, "icon-maskable-512.png"), makePng(512, pixel));
console.log("Icons generated in public/icons/");
