import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const input = process.argv[2];
if (!input) throw new Error("用法：tsx scripts/render-pdf.mts <file.pdf> [outPrefix] [scale]");
const scale = Number(process.argv[4] || 2);
const prefix = process.argv[3] || input.replace(/\.pdf$/i, "");
const bytes = new Uint8Array(fs.readFileSync(input));
const task = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false });
const pdf = await task.promise;
console.log("pages:", pdf.numPages);
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx as never, viewport: vp }).promise;
  const out = `${prefix}-p${i}.png`;
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log("rendered:", out, canvas.width, canvas.height);
}
await task.destroy();
