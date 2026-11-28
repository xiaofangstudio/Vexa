/** 描边对齐冒烟：数据、内外环带、SVG/PDF、图形样式与 .vex 清洗。 */
import { createDoc } from "../src/core/docOps";
import { addGraphicStyle, applyGraphicStyle } from "../src/core/graphicStyles";
import { exportPDF } from "../src/core/pdf";
import { strokeAlignLoops } from "../src/core/strokeAlign";
import { docToSVG } from "../src/core/svg";
import { solid, type PathNode } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const ok = (name: string, actual: boolean) => check(name, actual, true);

const path = (): PathNode => ({
  kind: "path",
  id: "r1",
  name: "对齐描边",
  subpaths: [{ closed: true, anchors: [
    { x: 20, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 220, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 220, y: 160, hIn: null, hOut: null, smooth: false },
    { x: 20, y: 160, hIn: null, hOut: null, smooth: false },
  ] }],
  fill: solid("#ffffff"),
  stroke: { kind: "solid", color: "#0f76d6", opacity: 1, width: 20, dash: [], align: "inside" },
  opacity: 1,
  visible: true,
  locked: false,
});

{
  const r = path();
  const inside = strokeAlignLoops(r)!;
  check("内侧生成双环", inside.length, 2);
  const minX = Math.min(...inside[1].map((p) => p.x));
  const maxX = Math.max(...inside[1].map((p) => p.x));
  ok("内侧不越出原路径", minX > 20 && maxX < 220);
  check("内侧偏移约一个线宽", Math.round(minX - 20), 20);

  r.stroke.align = "outside";
  const outside = strokeAlignLoops(r)!;
  const outMinX = Math.min(...outside[1].map((p) => p.x));
  ok("外侧越出原路径", outMinX < 20);
  check("外侧偏移约一个线宽", Math.round(20 - outMinX), 20);

  const thin = strokeAlignLoops(r, { ...r.stroke, width: 10, align: "inside" })!;
  check("覆盖线宽按传入描边偏移", Math.round(Math.min(...thin[1].map((p) => p.x)) - 20), 10);

  r.stroke.align = "inside";
  r.stroke.opacity = 0.5;
  const svg = docToSVG({ ...createDoc("对齐", 260, 200), nodes: { r1: r }, root: ["r1"] });
  ok("SVG 输出内外环带", svg.includes('fill-rule="evenodd"') && svg.includes('stroke="none"'));
  ok("SVG 环带使用描边色", svg.includes('fill="#0f76d6"'));
  ok("SVG 环带继承描边透明度", svg.includes('fill-opacity="0.5"'));
}

{
  const doc = createDoc("对齐 PDF", 260, 200);
  const r = path();
  r.stroke.align = "outside";
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const pdf = await exportPDF(doc, { fontLoader: () => null, images: false });
  check("PDF 无警告", pdf.warnings.length, 0);
  ok("PDF 输出", pdf.bytes.length > 500);
}

{
  const doc = createDoc("对齐渐变 PDF", 260, 200);
  const r = path();
  r.stroke = {
    ...r.stroke,
    kind: "linear",
    align: "inside",
    grad: { angle: 30, stops: [{ offset: 0, color: "#ff4d6d" }, { offset: 1, color: "#12c2a0" }] },
  };
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const pdf = await exportPDF(doc, { fontLoader: () => null, images: false });
  check("渐变对齐 PDF 无警告", pdf.warnings.length, 0);
  ok("渐变对齐 PDF 含着色", Buffer.from(pdf.bytes).toString("latin1").includes("/Shading"));
}

{
  const doc = createDoc("对齐 .vex", 260, 200);
  const r = path();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const back = parseVex(serializeVex(doc));
  check(".vex 往返保留对齐", (back.nodes.r1 as PathNode).stroke.align, "inside");

  const dirtyDoc = JSON.parse(serializeVex(doc));
  dirtyDoc.doc.nodes.r1.stroke.align = "middle";
  const dirty = parseVex(JSON.stringify(dirtyDoc));
  check("脏对齐被移除", (dirty.nodes.r1 as PathNode).stroke.align, undefined);
}

{
  const doc = createDoc("对齐样式", 260, 200);
  const r = path();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const st = addGraphicStyle(doc, r, "外侧描边");
  r.stroke.align = "outside";
  const st2 = addGraphicStyle(doc, r, "外侧描边 2");
  check("样式捕获对齐", st2.style?.stroke?.align, "outside");
  const plain = createDoc("套用", 260, 200);
  const p = path();
  p.stroke.align = "center";
  plain.nodes.r1 = p;
  plain.root = ["r1"];
  plain.styles = [st2.style!];
  applyGraphicStyle(plain, ["r1"], st2.style!.id);
  check("套用样式恢复对齐", (plain.nodes.r1 as PathNode).stroke.align, "outside");
  ok("首次样式也已创建", st.ok && !!st.style?.id);
}

{
  const open = path();
  open.subpaths[0].closed = false;
  check("开放路径回退中心", strokeAlignLoops(open), null);

  const variable = path();
  variable.stroke.widthPoints = [{ t: 0, left: 10, right: 10 }, { t: 1, left: 6, right: 6 }];
  check("宽度点回退中心", strokeAlignLoops(variable), null);

  const none = path();
  none.stroke.kind = "none";
  check("无描边不生成环带", strokeAlignLoops(none), null);
}

console.log(failed ? `fail ${failed}` : "fail 0");
process.exit(failed ? 1 : 0);
