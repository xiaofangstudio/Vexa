import { createDoc } from "../src/core/docOps";
import { MAX_APPEARANCE, addAppearance, appearanceOf, normalizeAppearance, updateAppearance } from "../src/core/appearance";
import { addGraphicStyle, applyGraphicStyle, captureGraphicStyle, updateGraphicStyle } from "../src/core/graphicStyles";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type PathNode, type TextNode, type VexaDoc } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";
import { readFileSync } from "node:fs";

const fontCache = new Map<string, Uint8Array>();

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const ok = (name: string, actual: boolean) => check(name, actual, true);

const textNode = (): TextNode => ({
  kind: "text",
  id: "t1",
  name: "文字外观",
  x: 40,
  y: 80,
  text: "Vexa",
  size: 56,
  font: "黑体",
  fill: solid("#0f76d6"),
  opacity: 1,
  visible: true,
  locked: false,
});

const rect = (): PathNode => ({
  kind: "path",
  id: "r1",
  name: "样式源",
  subpaths: [{ closed: true, anchors: [
    { x: 20, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 120, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 120, y: 80, hIn: null, hOut: null, smooth: false },
    { x: 20, y: 80, hIn: null, hOut: null, smooth: false },
  ] }],
  fill: solid("#0f76d6"),
  stroke: { kind: "solid", color: "#111319", opacity: 1, width: 6, dash: [] },
  opacity: 1,
  visible: true,
  locked: false,
});

const makeDoc = (): { doc: VexaDoc; t: TextNode } => {
  const doc = createDoc("文字外观", 300, 200);
  const t = textNode();
  doc.nodes[t.id] = t;
  doc.root = [t.id];
  return { doc, t };
};

{
  const { t } = makeDoc();
  const s = addAppearance(t, "stroke");
  ok("文字可加叠加描边", s.ok);
  check("文字叠加描边默认宽", s.item?.stroke?.width, 2);
  check("文字叠加描边无画笔", s.item?.stroke?.brushId, undefined);
  const f = addAppearance(t, "fill");
  check("文字叠加填充克隆字色", f.item?.fill?.color, "#0f76d6");
  check("文字叠两层", appearanceOf(t).length, 2);
}

{
  const { t } = makeDoc();
  for (let i = 0; i < MAX_APPEARANCE; i++) addAppearance(t, i % 2 ? "stroke" : "fill");
  check("文字叠满八层", appearanceOf(t).length, MAX_APPEARANCE);
  check("文字第九层被拒", addAppearance(t, "fill").ok, false);
}

{
  const { doc, t } = makeDoc();
  t.stroke = { kind: "solid", color: "#f5b301", opacity: 1, width: 4, dash: [] };
  const f = addAppearance(t, "fill");
  updateAppearance(t, f.item!.id, { fill: { ...solid("#e5484d"), opacity: 0.7 }, opacity: 0.45 });
  const s = addAppearance(t, "stroke");
  updateAppearance(t, s.item!.id, { stroke: { ...t.stroke, color: "#ffffff", width: 10 }, opacity: 0.8 });
  const svg = docToSVG(doc);
  ok("SVG 文字底层填充", svg.includes('fill="#0f76d6"'));
  ok("SVG 文字底层描边", svg.includes('stroke="#f5b301"') && svg.includes('stroke-width="4"'));
  ok("SVG 文字叠加填充", svg.includes('fill="#e5484d"') && svg.includes('opacity="0.45"'));
  ok("SVG 文字叠加描边", svg.includes('stroke="#ffffff"') && svg.includes('stroke-width="10"'));
  check("SVG 文字层数", (svg.match(/<text/g) ?? []).length, 3);
}

{
  const { doc, t } = makeDoc();
  t.stroke = { kind: "solid", color: "#f5b301", opacity: 1, width: 4, dash: [] };
  addAppearance(t, "fill");
  addAppearance(t, "stroke");
  const pdf = await exportPDF(doc, {
    fontLoader: (family: string) => {
      const hit = fontCache.get(family);
      if (hit) return hit;
      const path = family === "宋体" ? "C:/Windows/Fonts/simsun.ttc" : "C:/Windows/Fonts/simhei.ttf";
      const bytes = readFileSync(path);
      fontCache.set(family, bytes);
      return bytes;
    },
    images: false,
  });
  check("文字外观 PDF 无警告", pdf.warnings.length, 0);
  ok("文字外观 PDF 有内容", pdf.bytes.length > 900);
}

{
  const { doc, t } = makeDoc();
  t.stroke = { kind: "solid", color: "#f5b301", opacity: 1, width: 4, dash: [] };
  addAppearance(t, "fill");
  updateAppearance(t, "ap1", { opacity: 0.35 });
  const round = parseVex(serializeVex(doc));
  const r = round.nodes[t.id] as TextNode;
  check(".vex 保留文字描边色", r.stroke?.color, "#f5b301");
  check(".vex 保留文字描边宽", r.stroke?.width, 4);
  check(".vex 保留文字叠加层", appearanceOf(r).length, 1);
  check(".vex 保留文字叠加透明度", appearanceOf(r)[0].opacity, 0.35);
}

{
  const { doc, t } = makeDoc();
  (t as unknown as { appearance: unknown }).appearance = [
    { id: "bad", kind: "fill", fill: solid("#fff"), opacity: 1, visible: true },
    { id: "ap1", kind: "stroke", opacity: 1, visible: true },
    { id: "ap2", kind: "fill", fill: solid("#e5484d"), opacity: 2, visible: "no" },
  ];
  normalizeAppearance(doc);
  check("文字外观清洗坏项", appearanceOf(t).map((i) => i.id), ["ap2"]);
  ok("文字外观清洗后导出", docToSVG(doc).includes('fill="#e5484d"'));
}

{
  const doc = createDoc("样式文字", 300, 200);
  const r = rect();
  addAppearance(r, "fill");
  addAppearance(r, "stroke");
  updateAppearance(r, "ap1", { fill: { ...solid("#e5484d"), opacity: 0.6 }, opacity: 0.4 });
  updateAppearance(r, "ap2", { stroke: { ...r.stroke, width: 14, color: "#f5b301" }, opacity: 0.5 });
  doc.nodes[r.id] = r;
  doc.root = [r.id];
  const t = textNode();
  doc.nodes[t.id] = t;
  doc.root.push(t.id);

  const cap = captureGraphicStyle(r);
  check("捕获包含外观栈", cap?.appearance?.length, 2);
  check("捕获包含底层描边", cap?.stroke?.width, 6);
  const added = addGraphicStyle(doc, r, "双描边");
  ok("样式创建成功", added.ok);
  check("样式保存外观栈", added.style?.appearance?.length, 2);
  check("套用到文字", applyGraphicStyle(doc, [t.id], added.style!.id), 1);
  check("文字获得外观栈", t.appearance?.length, 2);
  check("文字获得底层描边", t.stroke?.width, 6);
  check("文字保留样式链接", t.graphicStyle, added.style!.id);
  applyGraphicStyle(doc, [r.id], added.style!.id);

  updateAppearance(t, "ap1", { fill: { ...solid("#0f9d8a"), opacity: 0.7 }, opacity: 0.25 });
  const synced = updateGraphicStyle(doc, added.style!.id, t.id);
  check("样式从文字更新并同步", synced, 2);
  check("样式外观色更新", added.style?.appearance?.[0].fill?.color, "#0f9d8a");
  check("路径同步到新外观", appearanceOf(r)[0].fill?.color, "#0f9d8a");
}

{
  const { doc, t } = makeDoc();
  t.textMode = "area";
  t.boxW = 180;
  t.boxH = 120;
  t.text = "区域文字外观\n自动换行";
  t.stroke = { kind: "solid", color: "#f5b301", opacity: 1, width: 3, dash: [] };
  addAppearance(t, "fill");
  addAppearance(t, "stroke");
  const svg = docToSVG(doc);
  ok("SVG 区域文字带裁切", svg.includes('<clipPath id="tc') && svg.includes('clip-path="url(#tc'));
  check("SVG 区域文字三层", (svg.match(/<text/g) ?? []).length, 3);
  ok("SVG 区域文字底层描边", svg.includes('stroke="#f5b301"'));
}

{
  const { doc, t } = makeDoc();
  t.textDirection = "vertical";
  t.text = "直排";
  addAppearance(t, "stroke");
  updateAppearance(t, "ap1", { stroke: { kind: "solid", color: "#e5484d", opacity: 1, width: 5, dash: [] } });
  const svg = docToSVG(doc);
  check("SVG 直排文字两层", (svg.match(/<text/g) ?? []).length, 4);
  ok("SVG 直排叠加描边", svg.includes('stroke="#e5484d"'));
}

console.log(failed ? `文字外观 smoke 有 ${failed} 项失败` : "文字外观 smoke 全部通过");
if (failed) process.exit(1);
