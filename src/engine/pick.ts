/** 拾取：按叠放顺序从最上层往下命中。 */
import { hitNode, nodeBox, unionBox, type Box } from "../core/geom";
import type { Node, Pt, VexaDoc } from "../core/types";

function pickIn(doc: VexaDoc, ids: string[], p: Pt, tol: number, deep: boolean): string | null {
  for (let i = ids.length - 1; i >= 0; i--) {
    const n = doc.nodes[ids[i]];
    if (!n || !n.visible || n.locked) continue;
    if (n.kind === "group") {
      const hit = pickIn(doc, n.children, p, tol, deep);
      // 普通选择命中整组（Illustrator 语义）；直接选择才钻进去
      if (hit) return deep ? hit : n.id;
      continue;
    }
    if (hitNode(n, p)) return n.id;
  }
  return null;
}

export function pickTop(doc: VexaDoc, p: Pt, tol = 4, deep = false): string | null {
  return pickIn(doc, doc.root, p, tol, deep);
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function boxSelect(doc: VexaDoc, box: Box): string[] {
  const out: string[] = [];
  for (const id of doc.root) {
    const n: Node | undefined = doc.nodes[id];
    if (!n || !n.visible || n.locked) continue;
    const b = n.kind === "group" ? groupBox(doc, n) : nodeBox(n);
    if (b && intersects(box, b)) out.push(id);
  }
  return out;
}

export function groupBox(doc: VexaDoc, group: Node): Box | null {
  if (group.kind !== "group") return nodeBox(group);
  let box: Box | null = null;
  for (const c of group.children) {
    const n = doc.nodes[c];
    if (!n) continue;
    box = unionBox(box, n.kind === "group" ? groupBox(doc, n) ?? nodeBox(n) : nodeBox(n));
  }
  return box;
}
