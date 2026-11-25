/** 文档操作：新建、节点构造、增删、顺序。所有函数都作用在传入的文档上（调用方负责克隆）。 */
import { anchorAt, noStroke, solid, type AnchorRef, type Node as DocNode, type PathNode, type VexaDoc } from "./types";

export const KAPPA = 0.5522847498;

export function createDoc(name: string, w: number, h: number, bg = "#ffffff"): VexaDoc {
  return {
    format: "vexa",
    version: 1,
    name,
    unit: "px",
    artboards: [{ id: "a1", name: name || "画板 1", x: 0, y: 0, w, h, bg }],
    nodes: {},
    root: [],
    seq: 2,
  };
}

export function newId(doc: VexaDoc, prefix = "n"): string {
  return `${prefix}${doc.seq++}`;
}

export function addNode(doc: VexaDoc, node: DocNode): void {
  doc.nodes[node.id] = node;
  doc.root.push(node.id);
}

export function removeNode(doc: VexaDoc, id: string): void {
  const node = doc.nodes[id];
  if (!node) return;
  if (node.kind === "group") for (const c of node.children) removeNode(doc, c);
  delete doc.nodes[id];
  doc.root = doc.root.filter((r) => r !== id);
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "group") n.children = n.children.filter((c) => c !== id);
  }
}

export function rectPath(id: string, name: string, x: number, y: number, w: number, h: number): PathNode {
  const anchors = [
    anchorAt(x, y),
    anchorAt(x + w, y),
    anchorAt(x + w, y + h),
    anchorAt(x, y + h),
  ];
  return {
    kind: "path",
    id,
    name,
    subpaths: [{ anchors, closed: true }],
    fill: solid("#0f76d6"),
    stroke: noStroke(),
    opacity: 1,
    visible: true,
    locked: false,
  };
}

export function ellipsePath(id: string, name: string, cx: number, cy: number, rx: number, ry: number): PathNode {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const S = true;
  const anchors = [
    { x: cx, y: cy - ry, hIn: { x: cx - kx, y: cy - ry }, hOut: { x: cx + kx, y: cy - ry }, smooth: S },
    { x: cx + rx, y: cy, hIn: { x: cx + rx, y: cy - ky }, hOut: { x: cx + rx, y: cy + ky }, smooth: S },
    { x: cx, y: cy + ry, hIn: { x: cx + kx, y: cy + ry }, hOut: { x: cx - kx, y: cy + ry }, smooth: S },
    { x: cx - rx, y: cy, hIn: { x: cx - rx, y: cy + ky }, hOut: { x: cx - rx, y: cy - ky }, smooth: S },
  ];
  return {
    kind: "path",
    id,
    name,
    subpaths: [{ anchors, closed: true }],
    fill: solid("#0f76d6"),
    stroke: noStroke(),
    opacity: 1,
    visible: true,
    locked: false,
  };
}

/** 在路径的某一段上插入锚点（直接选择双击用）。返回插入的锚点索引，找不到返回 -1。 */
export function insertAnchorOnSegment(node: PathNode, subIndex: number, segIndex: number, t = 0.5): number {
  const sub = node.subpaths[subIndex];
  if (!sub) return -1;
  const a = sub.anchors[segIndex];
  const b = sub.anchors[(segIndex + 1) % sub.anchors.length];
  if (!a || !b) return -1;
  const c1 = a.hOut ?? { x: a.x, y: a.y };
  const c2 = b.hIn ?? { x: b.x, y: b.y };
  const mt = 1 - t;
  const p = {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
  };
  const anchor = { x: p.x, y: p.y, hIn: null, hOut: null, smooth: false };
  sub.anchors.splice(segIndex + 1, 0, anchor);
  return segIndex + 1;
}

/** 点击命中哪个锚点（直接选择）。 */
export function findAnchor(node: PathNode, x: number, y: number, tol: number) {
  for (let si = 0; si < node.subpaths.length; si++) {
    const sub = node.subpaths[si];
    for (let ai = 0; ai < sub.anchors.length; ai++) {
      const a = sub.anchors[ai];
      if (Math.hypot(a.x - x, a.y - y) <= tol) return { si, ai, part: "anchor" as const };
      if (a.hIn && Math.hypot(a.hIn.x - x, a.hIn.y - y) <= tol) {
        return { si, ai, part: "hIn" as const };
      }
      if (a.hOut && Math.hypot(a.hOut.x - x, a.hOut.y - y) <= tol) {
        return { si, ai, part: "hOut" as const };
      }
    }
  }
  return null;
}

/** 找最近的路径段，用于双击加锚点。 */
export function findSegment(node: PathNode, x: number, y: number, tol: number) {
  for (let si = 0; si < node.subpaths.length; si++) {
    const sub = node.subpaths[si];
    const count = sub.closed ? sub.anchors.length : sub.anchors.length - 1;
    for (let gi = 0; gi < count; gi++) {
      const a = sub.anchors[gi];
      const b = sub.anchors[(gi + 1) % sub.anchors.length];
      const c1 = a.hOut ?? a;
      const c2 = b.hIn ?? b;
      let best = { t: 0, d: Infinity };
      for (let k = 0; k <= 24; k++) {
        const t = k / 24;
        const mt = 1 - t;
        const px = mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x;
        const py = mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y;
        const dd = Math.hypot(px - x, py - y);
        if (dd < best.d) best = { t, d: dd };
      }
      if (best.d <= tol) return { si, gi, t: best.t, d: best.d };
    }
  }
  return null;
}

/** 拖锚点时，若为平滑锚点则让两侧手柄保持共线。 */
export function dragAnchor(node: PathNode, si: number, ai: number, dx: number, dy: number): void {
  const a = node.subpaths[si]?.anchors[ai];
  if (!a) return;
  a.x += dx;
  a.y += dy;
  if (a.hIn) { a.hIn.x += dx; a.hIn.y += dy; }
  if (a.hOut) { a.hOut.x += dx; a.hOut.y += dy; }
}

/** 平移一组已选锚点；无效引用跳过，返回实际移动数量。 */
export function nudgeAnchors(doc: VexaDoc, refs: AnchorRef[], dx: number, dy: number): number {
  let moved = 0;
  const seen = new Set<string>();
  for (const ref of refs) {
    const key = `${ref.nodeId}:${ref.si}:${ref.ai}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = doc.nodes[ref.nodeId];
    if (!node || node.kind !== "path") continue;
    const anchor = node.subpaths[ref.si]?.anchors[ref.ai];
    if (!anchor) continue;
    dragAnchor(node, ref.si, ref.ai, dx, dy);
    moved++;
  }
  return moved;
}

/** 拖手柄：平滑锚点镜像另一侧。 */
export function dragHandle(node: PathNode, si: number, ai: number, part: "hIn" | "hOut", x: number, y: number): void {
  const a = node.subpaths[si]?.anchors[ai];
  if (!a) return;
  a[part] = { x, y };
  if (a.smooth) {
    const other = part === "hIn" ? "hOut" : "hIn";
    const vx = x - a.x;
    const vy = y - a.y;
    a[other] = { x: a.x - vx, y: a.y - vy };
  }
}
