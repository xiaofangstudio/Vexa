/** 渐变描边冒烟：数据、画布采样、SVG 往返、PDF、图形样式与 .vex 清洗。 */
import { createDoc } from "../src/core/docOps";
import { addGraphicStyle, applyGraphicStyle } from "../src/core/graphicStyles";
import { strokePaint, strokeStops } from "../src/core/paint";
import { exportPDF } from "../src/core/pdf";
import { docToSVG, svgToPathNodes } from "../src/core/svg";
import { solid, type PathNode } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";
import { DOMParser } from "@xmldom/xmldom";

(globalThis as { DOMParser?: unknown }).DOMParser = DOMParser;

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const ok = (name: string, actual: boolean) => check(name, actual, true);

const rect = (): PathNode => ({
  kind: "path",
  id: "r1",
  name: "渐变描边",
  subpaths: [{ closed: true, anchors: [
    { x: 24, y: 24, hIn: null, hOut: null, smooth: false },
    { x: 260, y: 24, hIn: null, hOut: null, smooth: false },
    { x: 260, y: 170, hIn: null, hOut: null, smooth: false },
    { x: 24, y: 170, hIn: null, hOut: null, smooth: false },
  ] }],
  fill: solid("#ffffff"),
  stroke: {
    kind: "linear",
    color: "#e5484d",
    opacity: 1,
    width: 12,
    dash: [],
    grad: { angle: 45, stops: [
      { offset: 0, color: "#e5484d" },
      { offset: 1, color: "#f5b301", alpha: 0.8 },
    ] },
  },
  opacity: 1,
  visible: true,
  locked: false,
});

{
  const doc = createDoc("渐变描边", 320, 220);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const p = strokePaint(r.stroke);
  check("描边转渐变填充 kind", p.kind, "linear");
  check("描边色标数量", strokeStops(r.stroke).length, 2);
  check("描边首色标", strokeStops(r.stroke)[0].color, "#e5484d");

  const svg = docToSVG(doc);
  ok("SVG 描边引用渐变", svg.includes('stroke="url(#sg'));
  ok("SVG 输出渐变定义", svg.includes("<linearGradient"));
  ok("SVG 渐变含描边透明度", svg.includes('stroke-opacity="1"') && svg.includes('stop-color="#f5b301"'));

  const back = svgToPathNodes(svg, 0, "回读");
  const rb = back.nodes.find((n): n is PathNode => n.kind === "path" && (n.stroke.kind === "linear" || n.stroke.kind === "radial")) as PathNode;
  check("SVG 回读为渐变描边", rb.stroke.kind, "linear");
  check("SVG 回读色标", rb.stroke.grad?.stops.map((s) => [s.color, s.alpha ?? 1]), [["#e5484d", 1], ["#f5b301", 0.8]]);
  check("SVG 回读宽度", rb.stroke.width, 12);
}

{
  const doc = createDoc("径向渐变描边", 260, 180);
  const r = rect();
  r.stroke.kind = "radial";
  r.stroke.width = 20;
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const svg = docToSVG(doc);
  ok("径向渐变描边定义", svg.includes("<radialGradient"));
  ok("径向渐变描边引用", svg.includes('stroke="url(#sg'));
}

{
  const doc = createDoc("渐变描边 PDF", 320, 220);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const pdf = await exportPDF(doc, { fontLoader: () => null, images: false });
  check("PDF 无警告", pdf.warnings.length, 0);
  const raw = Buffer.from(pdf.bytes).toString("latin1");
  ok("PDF 生成渐变着色", raw.includes("/Shading"));
  ok("PDF 着色资源可用", raw.includes("/Sh") && pdf.bytes.length > 1000);
}

{
  const doc = createDoc("渐变描边样式", 260, 180);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const st = addGraphicStyle(doc, r, "渐变描边样式");
  ok("图形样式创建成功", st.ok === true && !!st.style?.id);
  check("样式捕获渐变描边", st.style?.stroke?.grad?.stops.length, 2);
  const plain = createDoc("套用", 260, 180);
  const p = rect();
  p.stroke = { kind: "solid", color: "#111319", opacity: 1, width: 4, dash: [] };
  plain.nodes.r1 = p;
  plain.root = ["r1"];
  plain.styles = [st.style!];
  applyGraphicStyle(plain, ["r1"], st.style!.id);
  check("套用样式后为渐变描边", (plain.nodes.r1 as PathNode).stroke.kind, "linear");
  check("套用样式后色标", (plain.nodes.r1 as PathNode).stroke.grad?.stops.length, 2);
}

{
  const doc = createDoc("渐变描边 .vex", 260, 180);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const back = parseVex(serializeVex(doc));
  const rb = back.nodes.r1 as PathNode;
  check(".vex 往返保留描边渐变", rb.stroke.grad?.stops.map((s) => s.color), ["#e5484d", "#f5b301"]);
  check(".vex 往返保留角度", rb.stroke.grad?.angle, 45);

  const dirtyDoc = JSON.parse(serializeVex(doc));
  const dirtyNode = dirtyDoc.doc.nodes.r1;
  dirtyNode.stroke = { kind: "linear", color: "#000000", opacity: 1, width: 8, dash: [], grad: { angle: "x", stops: [{ offset: 4, color: "#abcdef" }] } };
  const dirty = parseVex(JSON.stringify(dirtyDoc));
  const rd = dirty.nodes.r1 as PathNode;
  check("脏数据角度回落 0", rd.stroke.grad?.angle, 0);
  check("脏数据补齐双色标", rd.stroke.grad?.stops.length, 2);
  check("脏数据单色标归零", rd.stroke.grad?.stops[0].offset, 0);
}

console.log(failed ? `fail ${failed}` : "fail 0");
process.exit(failed ? 1 : 0);
