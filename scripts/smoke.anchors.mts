import { createDoc, ellipsePath, nudgeAnchors, rectPath } from "../src/core/docOps";
import { addNode } from "../src/core/docOps";
import type { AnchorRef, PathNode } from "../src/core/types";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};
const r = (n: number) => Math.round(n * 1000) / 1000;
const pt = (p: { x: number; y: number } | null) => (p ? [r(p.x), r(p.y)] : null);
const anchorState = (node: PathNode, si: number, ai: number) => {
  const a = node.subpaths[si].anchors[ai];
  return [r(a.x), r(a.y), pt(a.hIn), pt(a.hOut)];
};

const doc = createDoc("anchors", 400, 300);
const ellipse = ellipsePath("ellipse", "椭圆", 60, 80, 100, 60);
addNode(doc, ellipse);
const refs: AnchorRef[] = [
  { nodeId: "ellipse", si: 0, ai: 0 },
  { nodeId: "ellipse", si: 0, ai: 1 },
];

check("初始锚点数", ellipse.subpaths[0].anchors.length, 4);
check("移动两个锚点", nudgeAnchors(doc, refs, 12, -7), 2);
check("锚点 0 与手柄一起移动", anchorState(ellipse, 0, 0), [72, 13, [16.772, 13], [127.228, 13]]);
check("锚点 1 与手柄一起移动", anchorState(ellipse, 0, 1), [172, 73, [172, 39.863], [172, 106.137]]);
check("未选锚点不动", anchorState(ellipse, 0, 2), [60, 140, [115.228, 140], [4.772, 140]]);

check("重复引用只移动一次", nudgeAnchors(doc, [refs[0], refs[0]], 5, 5), 1);
check("重复引用实际只加一次", anchorState(ellipse, 0, 0), [77, 18, [21.772, 18], [132.228, 18]]);

check("空选择返回 0", nudgeAnchors(doc, [], 3, 4), 0);

const unknown: AnchorRef[] = [{ nodeId: "nope", si: 0, ai: 0 }, { nodeId: "ellipse", si: 9, ai: 0 }, { nodeId: "ellipse", si: 0, ai: 9 }];
check("无效引用全部跳过", nudgeAnchors(doc, unknown, 1, 1), 0);

const mixed: AnchorRef[] = [{ nodeId: "nope", si: 0, ai: 0 }, { nodeId: "ellipse", si: 0, ai: 2 }];
check("部分有效引用只计有效数", nudgeAnchors(doc, mixed, -2, 3), 1);
check("有效锚点按负向移动", anchorState(ellipse, 0, 2), [58, 143, [113.228, 143], [2.772, 143]]);

const rect = rectPath("rect", "矩形", 10, 20, 80, 60);
addNode(doc, rect);
check("直线锚点无手柄也可移动", nudgeAnchors(doc, [{ nodeId: "rect", si: 0, ai: 0 }], 4, -2), 1);
check("直线锚点保持空手柄", anchorState(rect, 0, 0), [14, 18, null, null]);

const text = { ...ellipse, id: "text", kind: "text" as const, text: "A", size: 12, font: "sans", hScale: 1, align: "left" as const };
doc.nodes.text = text as never;
check("非路径节点跳过", nudgeAnchors(doc, [{ nodeId: "text", si: 0, ai: 0 }], 10, 10), 0);

const second = ellipsePath("ellipse2", "椭圆 2", 250, 40, 80, 80);
addNode(doc, second);
check("跨节点多锚点", nudgeAnchors(doc, [
  { nodeId: "ellipse", si: 0, ai: 3 },
  { nodeId: "ellipse2", si: 0, ai: 0 },
], 8, 8), 2);
check("第一个节点末锚点", anchorState(ellipse, 0, 3).slice(0, 2), [-32, 88]);
check("第二个节点首锚点", anchorState(second, 0, 0).slice(0, 2), [258, -32]);

const before = JSON.stringify(ellipse);
check("零位移返回有效数", nudgeAnchors(doc, refs, 0, 0), 2);
check("零位移不改坐标", JSON.stringify(ellipse), before);
check("负向大位移", nudgeAnchors(doc, [{ nodeId: "rect", si: 0, ai: 2 }], -120, -90), 1);
check("允许移出画板", anchorState(rect, 0, 2).slice(0, 2), [-30, -10]);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
if (failed) process.exit(1);
