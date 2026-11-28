import { createDoc } from "../src/core/docOps";
import { MAX_APPEARANCE, addAppearance, appearanceOf, moveAppearance, normalizeAppearance, removeAppearance, updateAppearance } from "../src/core/appearance";
import { exportPDF } from "../src/core/pdf";
import { docToSVG } from "../src/core/svg";
import { solid, type PathNode, type VexaDoc } from "../src/core/types";
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
  name: "外观测试",
  subpaths: [{ closed: true, anchors: [
    { x: 20, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 220, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 220, y: 140, hIn: null, hOut: null, smooth: false },
    { x: 20, y: 140, hIn: null, hOut: null, smooth: false },
  ] }],
  fill: solid("#0f76d6"),
  stroke: { kind: "solid", color: "#111319", opacity: 1, width: 6, dash: [] },
  opacity: 1,
  visible: true,
  locked: false,
});

const makeDoc = (): { doc: VexaDoc; p: PathNode } => {
  const doc = createDoc("外观", 300, 200);
  const p = rect();
  doc.nodes[p.id] = p;
  doc.root = [p.id];
  return { doc, p };
};

{
  const { p } = makeDoc();
  const f = addAppearance(p, "fill");
  ok("新增填充成功", f.ok);
  check("填充 id", f.item?.id, "ap1");
  check("填充克隆底层颜色", f.item?.fill?.color, "#0f76d6");
  check("新增一项", appearanceOf(p).length, 1);
  ok("改填充颜色", updateAppearance(p, "ap1", { fill: { ...solid("#e5484d"), opacity: 0.8 } }));
  check("填充色已改", appearanceOf(p)[0].fill?.color, "#e5484d");
  ok("调叠加透明度", updateAppearance(p, "ap1", { opacity: 0.36 }));
  check("透明度夹取", appearanceOf(p)[0].opacity, 0.36);
  ok("隐藏叠加项", updateAppearance(p, "ap1", { visible: false }));
  check("显隐记录", appearanceOf(p)[0].visible, false);
}

{
  const { p } = makeDoc();
  p.stroke.brushId = "br1";
  const s = addAppearance(p, "stroke");
  ok("新增描边成功", s.ok);
  check("描边 id", s.item?.id, "ap1");
  check("叠加描边不带画笔", s.item?.stroke?.brushId, undefined);
  check("描边沿用底层宽度", s.item?.stroke?.width, 6);
  ok("改叠加描边宽度", updateAppearance(p, "ap1", { stroke: { ...s.item!.stroke!, width: 18, color: "#f5b301" } }));
  check("叠加描边宽度", appearanceOf(p)[0].stroke?.width, 18);
  check("叠加描边颜色", appearanceOf(p)[0].stroke?.color, "#f5b301");
}

{
  const { p } = makeDoc();
  for (let i = 0; i < MAX_APPEARANCE; i++) addAppearance(p, i % 2 ? "stroke" : "fill");
  check("叠满八层", appearanceOf(p).length, MAX_APPEARANCE);
  const over = addAppearance(p, "fill");
  check("第九层被拒", over.ok, false);
  ok("上限错误文案", (over.error ?? "").includes(String(MAX_APPEARANCE)));
  const ids = appearanceOf(p).map((i) => i.id);
  ok("上移一层", moveAppearance(p, "ap2", 1));
  check("栈顺序变化", appearanceOf(p).map((i) => i.id).slice(0, 3), [ids[0], ids[2], ids[1]]);
  ok("底层不能继续下移", moveAppearance(p, ids[0], -1) === false);
  ok("顶层不能继续上移", moveAppearance(p, appearanceOf(p)[appearanceOf(p).length - 1].id, 1) === false);
  ok("删除一层", removeAppearance(p, "ap3"));
  check("删除后计数", appearanceOf(p).length, MAX_APPEARANCE - 1);
}

{
  const { doc, p } = makeDoc();
  addAppearance(p, "fill");
  addAppearance(p, "stroke");
  updateAppearance(p, "ap1", { fill: { ...solid("#e5484d"), opacity: 0.75 }, opacity: 0.52 });
  updateAppearance(p, "ap2", { stroke: { ...p.stroke, width: 22, color: "#f5b301" }, opacity: 0.6 });
  const svg = docToSVG(doc);
  ok("SVG 含叠加填充", svg.includes('fill="#e5484d"') && svg.includes('opacity="0.52"'));
  ok("SVG 含叠加描边", svg.includes('stroke="#f5b301"') && svg.includes('stroke-width="22"'));
  ok("SVG 底层仍在", svg.includes('fill="#0f76d6"'));
}

{
  const { doc, p } = makeDoc();
  addAppearance(p, "fill");
  updateAppearance(p, "ap1", { fill: { ...solid("#e5484d"), opacity: 0.6 }, opacity: 0.4 });
  addAppearance(p, "stroke");
  updateAppearance(p, "ap2", { stroke: { ...p.stroke, width: 16, color: "#f5b301" }, opacity: 0.3 });
  const pdf = await exportPDF(doc);
  check("PDF 无警告", pdf.warnings.length, 0);
  ok("PDF 有内容", pdf.bytes.length > 800);
  const round = parseVex(serializeVex(doc));
  check(".vex 保留叠加层", appearanceOf(round.nodes[p.id] as PathNode).length, 2);
  check(".vex 保留透明度", appearanceOf(round.nodes[p.id] as PathNode)[0].opacity, 0.4);
  check(".vex 保留描边色", appearanceOf(round.nodes[p.id] as PathNode)[1].stroke?.color, "#f5b301");
}

{
  const { doc, p } = makeDoc();
  (p as unknown as { appearance: unknown }).appearance = [
    { id: "bad", kind: "fill", fill: solid("#fff"), opacity: 1, visible: true },
    { id: "ap1", kind: "fill", opacity: 1, visible: true },
    { id: "ap2", kind: "stroke", stroke: { kind: "solid", color: "#000", opacity: 1, width: 2, dash: [] }, opacity: 2, visible: "no" },
    { id: "ap3", kind: "stroke", stroke: { kind: "solid", color: "#fff", opacity: 1, width: 3, dash: [] }, opacity: 0.5, visible: true },
  ];
  normalizeAppearance(doc);
  check("清洗坏 id / 缺字段", appearanceOf(p).map((i) => i.id), ["ap2", "ap3"]);
  check("透明度夹取", appearanceOf(p)[0].opacity, 1);
  const svg = docToSVG(doc);
  ok("清洁后的栈可导出", svg.includes('stroke="#fff"'));
}

console.log(failed ? `外观 smoke 有 ${failed} 项失败` : "外观 smoke 全部通过");
if (failed) process.exit(1);

