/**
 * 生成 Vexa 应用图标：从 assets/brand/vexa-icon.png 派生 Tauri 所需尺寸，
 * 并打包多尺寸 Windows ICO（16/32/48/64/128/256）。
 * 只依赖项目已有的 @napi-rs/canvas。
 */
import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "assets", "brand", "vexa-icon.png");
const OUT = path.join(ROOT, "src-tauri", "icons");
fs.mkdirSync(OUT, { recursive: true });

const master = await loadImage(SRC);

function render(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(master, 0, 0, size, size);
  return canvas.toBuffer("image/png");
}

function makeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

fs.copyFileSync(SRC, path.join(OUT, "icon.png"));

const png256 = render(256);
fs.writeFileSync(path.join(OUT, "128x128@2x.png"), png256);
fs.writeFileSync(path.join(OUT, "128x128.png"), render(128));
fs.writeFileSync(path.join(OUT, "32x32.png"), render(32));

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map((size) => ({ size, png: render(size) }));
fs.writeFileSync(path.join(OUT, "icon.ico"), makeIco(icoImages));

console.log("icons written to", OUT, `(${icoSizes.join("/")} ICO)`);
