import { createDoc } from "../src/core/docOps";
import { addAppearance, updateAppearance } from "../src/core/appearance";
import { expandAppearance } from "../src/core/expandAppearance";
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

const rect = (id = "r1"): PathNode => ({
  kind: "path",
  id,
  name: "扩展源",
  subpaths: [{ closed: true, anchors: [
    { x: 20, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 120, y: 20, hIn: null, hOut: null, smooth: false },
    { x: 120, y: 80, hIn: null, hOut: null, smooth: false },
    { x: 20, y: 80, hIn: null, hOut: null, smooth: false },
  ] }],
  fill: solid("#0f76d6"),
  stroke: { kind: "solid", color: "#111319", opacity: 1, width: 6, dash: [] },
  opacity: 0.8,
  visible: true,
  locked: false,
  blend: "multiply",
  tag: "blue",
});

const text = (): TextNode => ({
  kind: "text",
  id: "t1",
  name: "文字扩展",
  x: 40,
  y: 80,
  text: "VEXA",
  size: 56,
  font: "黑体",
  fill: solid("#0f76d6"),
  opacity: 1,
  visible: true,
  locked: false,
  stroke: { kind: "solid", color: "#f5b301", opacity: 1, width: 4, dash: [] },
});

{
  const doc = createDoc("扩展外观", 300, 200);
  const r = rect();
  doc.nodes[r.id] = r;
  doc.root = ["bg", r.id];
  doc.nodes.bg = { ...rect("bg"), name: "底层" };
  const f1 = addAppearance(r, "fill");
  updateAppearance(r, f1.item!.id, { fill: { ...solid("#e5484d"), opacity: 0.7 }, opacity: 0.55 });
  const s1 = addAppearance(r, "stroke");
  updateAppearance(r, s1.item!.id, { stroke: { ...r.stroke, color: "#ffffff", width: 4 }, opacity: 0.75, visible: false });
  const res = expandAppearance(doc, [r.id]);
  check("展开一个对象", res.expanded, 1);
  check("生成独立层数", res.layers, 4);
  const gid = res.groups[0];
  const g = doc.nodes[gid] as GroupNode;
  check("新组类型", g.kind, "group");
  check("组名", g.name, "扩展源 扩展外观");
  check("组子层数", g.children.length, 4);
  check("组承接不透明度", g.opacity, 0.8);
  check("组承接混合", g.blend, "multiply");
  check("组承接标记", g.tag, "blue");
  check("原对象已删除", doc.nodes[r.id], undefined);
  check("根位置保持", doc.root, ["bg", gid]);
  const kids = g.children.map((id) => doc.nodes[id] as PathNode);
  check("底层填充在前", kids[0].fill.color, "#0f76d6");
  check("底层填充无描边", kids[0].stroke.kind, "none");
  check("底层描边第二", kids[1].stroke.width, 6);
  check("底层描边无填充", kids[1].fill.kind, "none");
  check("叠加填充色", kids[2].fill.color, "#e5484d");
  check("叠加填充不透明度", kids[2].opacity, 0.55);
  check("叠加描边隐藏", kids[3].visible, false);
  check("叠加描边色", kids[3].stroke.color, "#ffffff");
  ok("子层无外观栈", kids.every((n) => n.appearance === undefined));
  ok("子层无样式链接", kids.every((n) => n.graphicStyle === undefined));
  check("底层描边承接画笔？", kids[1].stroke.brushId, undefined);
}

{
  const doc = createDoc("文字扩展", 300, 200);
  const t = text();
  doc.nodes[t.id] = t;
  doc.root = [t.id];
  addAppearance(t, "fill");
  const res = expandAppearance(doc, [t.id]);
  const g = doc.nodes[res.groups[0]] as GroupNode;
  check("文字扩展层数", g.children.length, 3);
  const textLayers = g.children.map((id) => doc.nodes[id] as TextNode);
  ok("子层均为文字", textLayers.every((n) => n.kind === "text"));
  check("文字内容保留", textLayers[0].text, "VEXA");
  check("文字底层描边保留", textLayers[1].stroke.color, "#f5b301");
  check("文字叠加填充", textLayers[2].fill.color, "#0f76d6");
}

{
  const doc = createDoc("无外观", 300, 200);
  const r = rect();
  doc.nodes[r.id] = r;
  doc.root = [r.id];
  const res = expandAppearance(doc, [r.id]);
  check("无叠加不展开", res.expanded, 0);
  check("无叠加组为空", res.groups.length, 0);
  check("原对象仍在", doc.root, [r.id]);
}

{
  const doc = createDoc("组内扩展", 300, 200);
  const r = rect();
  doc.nodes[r.id] = r;
  const g: GroupNode = { kind: "group", id: "g0", name: "外层", children: ["a", r.id], opacity: 1, visible: true, locked: false };
  doc.nodes.g0 = g;
  doc.nodes.a = rect("a");
  doc.root = ["g0"];
  addAppearance(r, "fill");
  const res = expandAppearance(doc, [r.id]);
  const outer = doc.nodes.g0 as GroupNode;
  check("组内原位替换", outer.children, ["a", res.groups[0]]);
  check("组内原节点删除", doc.nodes[r.id], undefined);
}

{
  const doc = createDoc("多选扩展", 300, 200);
  const a = rect("a");
  const b = rect("b");
  doc.nodes.a = a;
  doc.nodes.b = b;
  doc.root = ["a", "b"];
  addAppearance(a, "stroke");
  addAppearance(b, "fill");
  const res = expandAppearance(doc, ["a", "b"]);
  check("多选展开两个", res.expanded, 2);
  check("多选生成两组", res.groups.length, 2);
  check("根顺序替换", doc.root.length, 2);
  ok("根均为组", doc.root.every((id) => doc.nodes[id]?.kind === "group"));
}

{
  const doc = createDoc("往返", 300, 200);
  const r = rect();
  doc.nodes[r.id] = r;
  doc.root = [r.id];
  addAppearance(r, "fill");
  addAppearance(r, "stroke");
  const res = expandAppearance(doc, [r.id]);
  const svg = docToSVG(doc);
  ok("SVG 有组", svg.includes("<g"));
  const back = parseVex(serializeVex(doc));
  const gid = res.groups[0];
  const g = back.nodes[gid] as GroupNode;
  check("往返后组子层数", g.children.length, 4);
  check("往返后原对象无", back.nodes[r.id], undefined);
  const res2 = expandAppearance(back, g.children);
  check("已展开层再次扩展为空", res2.expanded, 0);
}

console.log(failed ? `fail ${failed}` : "fail 0");
process.exit(failed ? 1 : 0);
