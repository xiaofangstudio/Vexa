import { createDoc } from "../src/core/docOps";
import { addAppearance, cloneAppearanceItem, normalizeAppearanceList, updateAppearance } from "../src/core/appearance";
import { expandAppearance } from "../src/core/expandAppearance";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type GroupNode, type PathNode, type TextNode, type VexaDoc } from "../src/core/types";
import { parseVex, serializeVex } from "../src/core/vex";

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
  name: "混合外观",
  subpaths: [{ closed: true, anchors: [
    { x: 20, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 140, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 140, y: 90, hIn: null, hOut: null, smooth: false },
    { x: 20, y: 90, hIn: null, hOut: null, smooth: false },
  ] }],
  fill: solid("#0f76d6"),
  stroke: { kind: "solid", color: "#111319", opacity: 1, width: 6, dash: [] },
  opacity: 1,
  visible: true,
  locked: false,
});

{
  const doc = createDoc("混合外观", 300, 200);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const f = addAppearance(r, "fill");
  const s = addAppearance(r, "stroke");
  ok("设置叠加填充混合", updateAppearance(r, f.item!.id, { blend: "multiply" }));
  ok("设置叠加描边混合", updateAppearance(r, s.item!.id, { blend: "screen" }));
  check("填充混合落到文档", f.item!.blend, "multiply");
  check("描边混合落到文档", s.item!.blend, "screen");
  check("克隆保留混合", cloneAppearanceItem(f.item!).blend, "multiply");
  updateAppearance(r, f.item!.id, { blend: "normal" });
  check("改回正常移除字段", f.item!.blend, undefined);
  updateAppearance(r, f.item!.id, { blend: "multiply" });
  const svg = docToSVG(doc);
  ok("路径叠加填充 SVG 混合", svg.includes('fill="#0f76d6"') && svg.includes("mix-blend-mode:multiply"));
  ok("路径叠加描边 SVG 混合", svg.includes("mix-blend-mode:screen"));
  const bad = normalizeAppearanceList([
    { id: "ap1", kind: "fill", fill: solid("#ffffff"), opacity: 1, visible: true, blend: "multiply" },
    { id: "ap2", kind: "stroke", stroke: r.stroke, opacity: 1, visible: true, blend: "bogus" },
    { id: "ap3", kind: "fill", fill: solid("#000000"), opacity: 1, visible: true, blend: "normal" },
  ]);
  check("清洗保留合法混合", bad[0].blend, "multiply");
  check("清洗丢弃非法混合", bad[1].blend, undefined);
  check("清洗不保留 normal", bad[2].blend, undefined);
  const back = parseVex(serializeVex(doc));
  const rb = back.nodes.r1 as PathNode;
  check(".vex 往返保留混合", rb.appearance?.map((a) => a.blend), ["multiply", "screen"]);
}

{
  const doc = createDoc("文字混合", 320, 200);
  const t: TextNode = {
    kind: "text", id: "t1", name: "混合文字", x: 40, y: 80, text: "VEXA", size: 64, font: "黑体",
    fill: solid("#0f76d6"), opacity: 1, visible: true, locked: false,
  };
  doc.nodes.t1 = t;
  doc.root = ["t1"];
  const f = addAppearance(t, "fill");
  updateAppearance(t, f.item!.id, { blend: "overlay", opacity: 0.6 });
  const svg = docToSVG(doc);
  ok("文字叠加填充 SVG 混合", svg.includes("mix-blend-mode:overlay"));
  ok("文字混合与透明度共存", svg.includes('opacity="0.6"') && svg.includes("mix-blend-mode:overlay"));
}

{
  const doc = createDoc("描边混合 PDF", 300, 200);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const s = addAppearance(r, "stroke");
  updateAppearance(r, s.item!.id, { blend: "multiply" });
  const pdf = await exportPDF(doc, { fontLoader: () => null, images: false });
  check("PDF 无警告", pdf.warnings.length, 0);
  const raw = Buffer.from(pdf.bytes).toString("latin1");
  ok("PDF 输出 Multiply 混合", raw.includes("/BM /Multiply"));
}

{
  const doc = createDoc("扩展混合", 300, 200);
  const r = rect();
  doc.nodes.r1 = r;
  doc.root = ["r1"];
  const f = addAppearance(r, "fill");
  updateAppearance(r, f.item!.id, { blend: "color-burn" });
  const res = expandAppearance(doc, ["r1"]);
  const g = doc.nodes[res.groups[0]] as GroupNode;
  const layers = g.children.map((id) => doc.nodes[id] as PathNode);
  check("扩展后叠加层承接混合", layers[2].blend, "color-burn");
  check("扩展后底层无混合", layers[0].blend, undefined);
}

console.log(failed ? `fail ${failed}` : "fail 0");
process.exit(failed ? 1 : 0);
