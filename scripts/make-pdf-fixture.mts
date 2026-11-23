import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { createDoc, rectPath } from "../src/core/docOps";
import { roundRectPath, starPath } from "../src/core/shapes";
import { serializeVex } from "../src/core/vex";
import { solid, noStroke, type TextNode, type ImageNode, type PathNode } from "../src/core/types";

function pngDataUrl(): string {
  const c = createCanvas(180, 120);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 180, 120);
  grad.addColorStop(0, "rgba(229,72,77,0.82)");
  grad.addColorStop(0.5, "rgba(0,208,248,0.58)");
  grad.addColorStop(1, "rgba(15,45,90,0.38)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(90, 60, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "bold 15px sans-serif";
  g.fillText("ALPHA", 67, 65);
  return c.toDataURL("image/png");
}

function text(id: string, x: number, y: number, body: string, size: number, fill: TextNode["fill"]): TextNode {
  return {
    kind: "text", id, name: body.split("\n")[0], x, y, text: body, size,
    font: "黑体", bold: true, italic: false, lineHeight: 1.4, tracking: 1.2,
    align: "left", hScale: 100, vScale: 100, baseline: 0,
    fill, opacity: 1, visible: true, locked: false,
  };
}

const doc = createDoc("PDF 实机验收", 900, 640);
doc.artboards[0].bg = "#ffffff";

const gradRect = rectPath("pdf1", "渐变矩形", 60, 60, 420, 220);
gradRect.fill = {
  kind: "linear", color: "#e5484d", opacity: 0.94,
  grad: { angle: 20, stops: [
    { offset: 0, color: "#e5484d", alpha: 0.82 },
    { offset: 0.46, color: "#00d0f8" },
    { offset: 1, color: "#0f2d5a", alpha: 0.34 },
  ] },
};
gradRect.stroke = { ...noStroke("#17171c"), kind: "solid", width: 8, dash: [12, 7], cap: "round", join: "round", arrow: "triangle" };
doc.nodes.pdf1 = gradRect;

const radial = roundRectPath("pdf2", "径向圆角", 510, 60, 330, 220, 36);
radial.fill = {
  kind: "radial", color: "#ffffff", opacity: 1,
  grad: { angle: 0, stops: [{ offset: 0, color: "#ffffff" }, { offset: 1, color: "#0f76d6", alpha: 0.5 }] },
};
radial.stroke = { ...noStroke("#0f76d6"), kind: "solid", width: 5, cap: "round", join: "round" };
doc.nodes.pdf2 = radial;

doc.nodes.pdf3 = text("pdf3", 100, 410, "Vexa PDF 导出\n文字轮廓保持矢量", 44, {
  kind: "linear", color: "#6b4ef2", opacity: 1,
  grad: { angle: 0, stops: [
    { offset: 0, color: "#6b4ef2" },
    { offset: 0.55, color: "#0f76d6" },
    { offset: 1, color: "#00c2a8" },
  ] },
});
doc.nodes.pdf4 = text("pdf4", 100, 548, "实色文字 · 零联网 · 本地导出", 26, solid("#17171c"));

const img: ImageNode = {
  kind: "image", id: "pdf5", name: "透明位图", src: pngDataUrl(),
  x: 520, y: 410, w: 280, h: 170, opacity: 0.9, visible: true, locked: false,
};
doc.nodes.pdf5 = img;
doc.root.push("pdf1", "pdf2", "pdf3", "pdf4", "pdf5");

doc.artboards.push({ id: "ab2", name: "第二页", x: 940, y: 0, w: 520, h: 360, bg: "#f7f8fa" });
const star = starPath("pdf6", "星形", 1200, 180, 92, 5, 0.48) as PathNode;
star.fill = solid("#f2b84b");
star.stroke = { ...noStroke("#17171c"), kind: "solid", width: 5 };
doc.nodes.pdf6 = star;
doc.root.push("pdf6");

fs.writeFileSync("scripts/fixtures/pdf-export.vex", serializeVex(doc));
console.log("written scripts/fixtures/pdf-export.vex", fs.statSync("scripts/fixtures/pdf-export.vex").size, "bytes", "nodes", Object.keys(doc.nodes).length, "boards", doc.artboards.length);
