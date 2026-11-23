import fs from "node:fs";
import { createDoc, rectPath } from "../src/core/docOps";
import { starPath, roundRectPath } from "../src/core/shapes";
import { exportPDF } from "../src/core/pdf";
import { linearPaint, solid, noStroke, type TextNode } from "../src/core/types";

const fonts = new Map<string, Uint8Array>();
const fontLoader = (family: string) => {
  const key = family;
  const hit = fonts.get(key);
  if (hit) return hit;
  const path = family === "宋体" ? "C:/Windows/Fonts/simsun.ttc" : "C:/Windows/Fonts/simhei.ttf";
  const bytes = new Uint8Array(fs.readFileSync(path));
  fonts.set(key, bytes);
  return bytes;
};

const doc = createDoc("PDF 冒烟", 800, 600);
const grad = rectPath("p1", "渐变矩形", 80, 90, 300, 180);
grad.fill = {
  kind: "linear",
  color: "#e5484d",
  opacity: 0.9,
  grad: {
    angle: 25,
    stops: [
      { offset: 0, color: "#e5484d", alpha: 0.8 },
      { offset: 0.45, color: "#00d0f8" },
      { offset: 1, color: "#0f2d5a", alpha: 0.35 },
    ],
  },
};
grad.stroke = { ...noStroke("#17171c"), kind: "solid", opacity: 1, width: 8, dash: [10, 6], cap: "round", join: "round", arrow: "triangle" };
doc.nodes.p1 = grad;
doc.root.push("p1");

const radial = roundRectPath("p2", "径向圆角", 450, 100, 240, 160, 28);
radial.fill = {
  kind: "radial",
  color: "#ffffff",
  opacity: 1,
  grad: { angle: 0, stops: [{ offset: 0, color: "#ffffff" }, { offset: 1, color: "#0f76d6", alpha: 0.5 }] },
};
radial.stroke = { ...noStroke("#0f76d6"), kind: "solid", width: 5 };
doc.nodes.p2 = radial;
doc.root.push("p2");

const text: TextNode = {
  kind: "text",
  id: "t1",
  name: "文字",
  x: 120,
  y: 430,
  text: "Vexa PDF 你好\n文字轮廓仍是矢量",
  size: 42,
  font: "黑体",
  bold: true,
  italic: false,
  lineHeight: 1.35,
  tracking: 1.5,
  align: "left",
  hScale: 100,
  vScale: 100,
  baseline: 0,
  fill: {
    kind: "linear",
    color: "#17171c",
    opacity: 1,
    grad: {
      angle: 0,
      stops: [
        { offset: 0, color: "#6b4ef2" },
        { offset: 0.55, color: "#0f76d6" },
        { offset: 1, color: "#00c2a8" },
      ],
    },
  },
  opacity: 1,
  visible: true,
  locked: false,
};
doc.nodes.t1 = text;
doc.root.push("t1");

const solidText: TextNode = {
  ...text,
  id: "t2",
  name: "实色文字",
  x: 470,
  y: 520,
  text: "实色文字 PDF",
  size: 28,
  bold: false,
  italic: false,
  fill: solid("#17171c"),
};
doc.nodes.t2 = solidText;
doc.root.push("t2");

doc.artboards.push({ id: "ab2", name: "第二页", x: 860, y: 0, w: 420, h: 300, bg: "#f7f8fa" });
const st = starPath("p3", "星形", 1040, 150, 80, 5, 0.48);
st.fill = solid("#f2b84b");
st.stroke = { ...noStroke("#17171c"), kind: "solid", width: 4 };
doc.nodes.p3 = st;
doc.root.push("p3");

const result = await exportPDF(doc, { fontLoader, images: false });
fs.writeFileSync("docs/shots/v17-smoke.pdf", result.bytes);
console.log("pdf bytes:", result.bytes.length, "warnings:", result.warnings.length, result.warnings.join(" | "));
console.log("header:", new TextDecoder().decode(result.bytes.subarray(0, 8)));

const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
const task = pdfjs.getDocument({ data: result.bytes, disableFontFace: true, useSystemFonts: false });
const pdf = await task.promise;
console.log("pages:", pdf.numPages);
const page = await pdf.getPage(1);
const box = page.getViewport({ scale: 1 });
console.log("page1 viewport:", Math.round(box.width), Math.round(box.height));
const ops = await page.getOperatorList();
console.log("page1 ops:", ops.fnArray.length, "constructPath:", ops.fnArray.filter((n) => n === pdfjs.OPS.constructPath).length, "fill:", ops.fnArray.filter((n) => n === pdfjs.OPS.fill || n === pdfjs.OPS.eoFill).length);
const page2 = await pdf.getPage(2);
const box2 = page2.getViewport({ scale: 1 });
console.log("page2 viewport:", Math.round(box2.width), Math.round(box2.height));

const { createCanvas } = await import("@napi-rs/canvas");
for (const [p, file, scale] of [[page, "docs/shots/v17-pdf-p1.png", 2], [page2, "docs/shots/v17-pdf-p2.png", 2]] as const) {
  const vp = p.getViewport({ scale });
  const canvas = createCanvas(Math.round(vp.width), Math.round(vp.height));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await p.render({ canvasContext: ctx as never, viewport: vp }).promise;
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  console.log("rendered:", file, canvas.width, canvas.height);
}
await task.destroy();
