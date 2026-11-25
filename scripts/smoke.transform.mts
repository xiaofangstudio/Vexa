import { createDoc } from "../src/core/docOps";
import { nodeBox } from "../src/core/geom";
import { scaleNodes } from "../src/core/vectorOps";
import type { TextNode, VexaDoc } from "../src/core/types";

let failed = 0;
const near = (a: number, b: number, eps = 0.02) => Math.abs(a - b) <= eps;
const check = (name: string, ok: boolean, detail: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
  if (!ok) failed++;
};

const doc: VexaDoc = createDoc("transform", 800, 600);
const text: TextNode = {
  kind: "text", id: "t", name: "文字", text: "图层排序验收", x: 120, y: 180, size: 36,
  font: "Microsoft YaHei", align: "left", fill: { kind: "solid", color: "#17171c", opacity: 1 },
  stroke: { kind: "none", color: "#000000", opacity: 1, width: 0, dash: [], cap: "butt", join: "miter" },
  opacity: 1, visible: true, locked: false,
};
doc.nodes.t = text;
const before = nodeBox(text);
const targetW = 260;
scaleNodes(doc, ["t"], before, targetW / before.w, 1);
const afterW = nodeBox(text);
check("text width exact", near(afterW.w, targetW), { before: before.w, after: afterW.w, hScale: text.hScale });
check("text height unchanged when W", near(afterW.h, before.h), { before: before.h, after: afterW.h });

const targetH = 90;
const beforeH = nodeBox(text);
scaleNodes(doc, ["t"], beforeH, 1, targetH / beforeH.h);
const afterH = nodeBox(text);
check("text height exact", near(afterH.h, targetH), { before: beforeH.h, after: afterH.h, size: text.size });
check("text width unchanged when H", near(afterH.w, beforeH.w), { before: beforeH.w, after: afterH.w, hScale: text.hScale });

const both = nodeBox(text);
const targetW2 = 320;
const targetH2 = 120;
scaleNodes(doc, ["t"], both, targetW2 / both.w, targetH2 / both.h);
const afterBoth = nodeBox(text);
check("text width exact both", near(afterBoth.w, targetW2), { w: afterBoth.w, hScale: text.hScale });
check("text height exact both", near(afterBoth.h, targetH2), { h: afterBoth.h, size: text.size });

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有文字缩放用例通过");
