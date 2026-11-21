/** 排列 / 对齐分布 / 变换 / 编组 —— 画布层的“对象级”操作，全部原地修改 VexaDoc。 */
import { nodeBox, unionBox, type Box } from "./geom";
import type { Anchor, GroupNode, Node, Pt, VexaDoc } from "./types";

export type ArrangeMode = "front" | "back" | "forward" | "backward";
export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

/** 找到某个节点所在的兄弟列表（根层或某个 group 的 children）。 */
export function containerOf(doc: VexaDoc, id: string, list = doc.root, parent = ""): { list: string[]; parent: string } | null {
  if (list.includes(id)) return { list, parent };
  for (const sid of list) {
    const n = doc.nodes[sid];
    if (n && n.kind === "group") {
      const hit = containerOf(doc, id, n.children, n.id);
      if (hit) return hit;
    }
  }
  return null;
}

export function selectionBox(doc: VexaDoc, ids: string[]): Box | null {
  let box: Box | null = null;
  for (const id of ids) {
    const n = doc.nodes[id];
    if (!n) continue;
    const b = n.kind === "group" ? groupBoxOf(doc, n) : nodeBox(n);
    if (b) box = unionBox(box, b);
  }
  return box;
}

function groupBoxOf(doc: VexaDoc, g: GroupNode): Box | null {
  let box: Box | null = null;
  for (const cid of g.children) {
    const c = doc.nodes[cid];
    if (!c) continue;
    const b = c.kind === "group" ? groupBoxOf(doc, c) : nodeBox(c);
    if (b) box = unionBox(box, b);
  }
  return box;
}

/* ---------------- 排列 ---------------- */

export function arrangeNodes(doc: VexaDoc, ids: string[], mode: ArrangeMode): void {
  if (!ids.length) return;
  const groups = new Map<string[], string[]>();
  for (const id of ids) {
    const c = containerOf(doc, id);
    if (!c) continue;
    const prev = groups.get(c.list) ?? [];
    prev.push(id);
    groups.set(c.list, prev);
  }
  for (const [list, sel] of groups) {
    const keep = list.filter((id) => !sel.includes(id));
    if (mode === "front") {
      list.length = 0;
      list.push(...keep, ...sel);
    } else if (mode === "back") {
      list.length = 0;
      list.push(...sel, ...keep);
    } else if (mode === "forward") {
      for (let i = list.length - 2; i >= 0; i--) {
        if (sel.includes(list[i]) && !sel.includes(list[i + 1])) {
          [list[i], list[i + 1]] = [list[i + 1], list[i]];
        }
      }
    } else {
      for (let i = 1; i < list.length; i++) {
        if (sel.includes(list[i]) && !sel.includes(list[i - 1])) {
          [list[i], list[i - 1]] = [list[i - 1], list[i]];
        }
      }
    }
  }
}

/* ---------------- 对齐 / 分布 ---------------- */

export function alignNodes(doc: VexaDoc, ids: string[], mode: AlignMode, ref?: Box | null): void {
  const target = ref ?? selectionBox(doc, ids);
  if (!target || ids.length < 1) return;
  for (const id of ids) {
    const n = doc.nodes[id];
    if (!n) continue;
    const b = n.kind === "group" ? groupBoxOf(doc, n) : nodeBox(n);
    if (!b) continue;
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case "left": dx = target.x - b.x; break;
      case "right": dx = target.x + target.w - (b.x + b.w); break;
      case "hcenter": dx = target.x + target.w / 2 - (b.x + b.w / 2); break;
      case "top": dy = target.y - b.y; break;
      case "bottom": dy = target.y + target.h - (b.y + b.h); break;
      case "vcenter": dy = target.y + target.h / 2 - (b.y + b.h / 2); break;
      default: break;
    }
    if (dx || dy) translateNode(doc, n, dx, dy);
  }
}

export function distributeNodes(doc: VexaDoc, ids: string[], axis: "h" | "v"): void {
  if (ids.length < 3) return;
  const items = ids
    .map((id) => {
      const n = doc.nodes[id];
      if (!n) return null;
      const b = n.kind === "group" ? groupBoxOf(doc, n) : nodeBox(n);
      return b ? { n, b } : null;
    })
    .filter((x): x is { n: Node; b: Box } => !!x);
  if (items.length < 3) return;
  if (axis === "h") {
    items.sort((a, b) => a.b.x - b.b.x);
    const first = items[0].b;
    const last = items[items.length - 1].b;
    const total = last.x + last.w - first.x;
    const span = items.reduce((s, it) => s + it.b.w, 0);
    const gap = (total - span) / (items.length - 1);
    let cursor = first.x;
    for (const it of items) {
      translateNode(doc, it.n, cursor - it.b.x, 0);
      cursor += it.b.w + gap;
    }
  } else {
    items.sort((a, b) => a.b.y - b.b.y);
    const first = items[0].b;
    const last = items[items.length - 1].b;
    const total = last.y + last.h - first.y;
    const span = items.reduce((s, it) => s + it.b.h, 0);
    const gap = (total - span) / (items.length - 1);
    let cursor = first.y;
    for (const it of items) {
      translateNode(doc, it.n, 0, cursor - it.b.y);
      cursor += it.b.h + gap;
    }
  }
}

/* ---------------- 变换 ---------------- */

export function translateNode(doc: VexaDoc, n: Node, dx: number, dy: number): void {
  if (n.kind === "path") {
    for (const sub of n.subpaths) {
      for (const a of sub.anchors) {
        a.x += dx;
        a.y += dy;
        if (a.hIn) {
          a.hIn.x += dx;
          a.hIn.y += dy;
        }
        if (a.hOut) {
          a.hOut.x += dx;
          a.hOut.y += dy;
        }
      }
    }
  } else if (n.kind === "text" || n.kind === "image") {
    n.x += dx;
    n.y += dy;
  } else if (n.kind === "group") {
    for (const cid of n.children) {
      const c = doc.nodes[cid];
      if (c) translateNode(doc, c, dx, dy);
    }
  }
}

function mapNodePoints(doc: VexaDoc, n: Node, fn: (p: Pt) => Pt): void {
  if (n.kind === "path") {
    for (const sub of n.subpaths) {
      for (const a of sub.anchors) {
        const p = fn({ x: a.x, y: a.y });
        a.x = p.x;
        a.y = p.y;
        if (a.hIn) {
          const i = fn(a.hIn);
          a.hIn.x = i.x;
          a.hIn.y = i.y;
        }
        if (a.hOut) {
          const o = fn(a.hOut);
          a.hOut.x = o.x;
          a.hOut.y = o.y;
        }
      }
    }
  } else if (n.kind === "text" || n.kind === "image") {
    const p = fn({ x: n.x, y: n.y });
    n.x = p.x;
    n.y = p.y;
  } else if (n.kind === "group") {
    for (const cid of n.children) {
      const c = doc.nodes[cid];
      if (c) mapNodePoints(doc, c, fn);
    }
  }
}

/** 绕指定点旋转（角度制，顺时针为正）。 */
export function rotateNodesAround(doc: VexaDoc, ids: string[], cx: number, cy: number, deg: number): void {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const fn = (p: Pt): Pt => ({
    x: cx + (p.x - cx) * cos - (p.y - cy) * sin,
    y: cy + (p.x - cx) * sin + (p.y - cy) * cos,
  });
  for (const id of ids) {
    const n = doc.nodes[id];
    if (n) mapNodePoints(doc, n, fn);
  }
}

/** 以 origin 为原点整体缩放（缺省 box 左上角）；图片改宽高、文字缩字号、组递归。 */
export function scaleNodes(doc: VexaDoc, ids: string[], box: Box, sx: number, sy: number, origin?: Pt): void {
  const ox = origin?.x ?? box.x;
  const oy = origin?.y ?? box.y;
  const scaleOne = (n: Node) => {
    if (n.kind === "path") {
      for (const sub of n.subpaths) {
        for (const a of sub.anchors) {
          a.x = ox + (a.x - ox) * sx;
          a.y = oy + (a.y - oy) * sy;
          if (a.hIn) {
            a.hIn.x = ox + (a.hIn.x - ox) * sx;
            a.hIn.y = oy + (a.hIn.y - oy) * sy;
          }
          if (a.hOut) {
            a.hOut.x = ox + (a.hOut.x - ox) * sx;
            a.hOut.y = oy + (a.hOut.y - oy) * sy;
          }
        }
      }
    } else if (n.kind === "image") {
      n.x = ox + (n.x - ox) * sx;
      n.y = oy + (n.y - oy) * sy;
      n.w *= sx;
      n.h *= sy;
    } else if (n.kind === "text") {
      n.x = ox + (n.x - ox) * sx;
      n.y = oy + (n.y - oy) * sy;
      n.size *= Math.max(0.01, (Math.abs(sx) + Math.abs(sy)) / 2);
    } else {
      for (const cid of n.children) {
        const c = doc.nodes[cid];
        if (c) scaleOne(c);
      }
    }
  };
  for (const id of ids) {
    const n = doc.nodes[id];
    if (n) scaleOne(n);
  }
}

/** 绕选区中心旋转（角度制，顺时针为正）。曲线路径精确旋转；文字/位图只移动定位点。 */
export function rotateNodes(doc: VexaDoc, ids: string[], deg: number): void {
  const box = selectionBox(doc, ids);
  if (!box) return;
  rotateNodesAround(doc, ids, box.x + box.w / 2, box.y + box.h / 2, deg);
}

/** 水平/垂直翻转（绕选区中心）。 */
export function flipNodes(doc: VexaDoc, ids: string[], axis: "h" | "v"): void {
  const box = selectionBox(doc, ids);
  if (!box) return;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const fn =
    axis === "h"
      ? (p: Pt): Pt => ({ x: 2 * cx - p.x, y: p.y })
      : (p: Pt): Pt => ({ x: p.x, y: 2 * cy - p.y });
  for (const id of ids) {
    const n = doc.nodes[id];
    if (n) mapNodePoints(doc, n, fn);
  }
}

/* ---------------- 编组 ---------------- */

export function groupNodes(doc: VexaDoc, ids: string[]): string | null {
  if (ids.length < 2) return null;
  const host = containerOf(doc, ids[0]);
  if (!host) return null;
  if (!ids.every((id) => containerOf(doc, id)?.list === host.list)) return null;

  let gid = `g${doc.seq}`;
  while (doc.nodes[gid]) gid = `g${++doc.seq}`;
  doc.seq += 1;
  const order = host.list.filter((id) => ids.includes(id));
  const group: GroupNode = {
    kind: "group",
    id: gid,
    name: "编组",
    children: order,
    opacity: 1,
    visible: true,
    locked: false,
  };
  doc.nodes[gid] = group;
  const insertAt = Math.min(...order.map((id) => host.list.indexOf(id)));
  const next: string[] = [];
  host.list.forEach((id, idx) => {
    if (idx === insertAt) next.push(gid);
    if (!ids.includes(id)) next.push(id);
  });
  host.list.length = 0;
  host.list.push(...next);
  return gid;
}

export function ungroupNodes(doc: VexaDoc, ids: string[]): string[] {
  const freed: string[] = [];
  for (const id of ids) {
    const g = doc.nodes[id];
    if (!g || g.kind !== "group") continue;
    const host = containerOf(doc, id);
    if (!host) continue;
    const at = host.list.indexOf(id);
    host.list.splice(at, 1, ...g.children);
    delete doc.nodes[id];
    freed.push(...g.children);
  }
  return freed;
}

/** 编组是否需要（至少两个同层节点）。 */
export function canGroup(doc: VexaDoc, ids: string[]): boolean {
  if (ids.length < 2) return false;
  const host = containerOf(doc, ids[0]);
  return !!host && ids.every((id) => containerOf(doc, id)?.list === host.list);
}

/** 三次贝塞尔上 t 处坐标（无手柄的直线段也按同一条参数曲线处理）。 */
export function segmentPoint(a: Anchor, b: Anchor, t: number): Pt {
  const p0 = { x: a.x, y: a.y };
  const p1 = a.hOut ?? p0;
  const p2 = b.hIn ?? { x: b.x, y: b.y };
  const p3 = { x: b.x, y: b.y };
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** 用 De Casteljau 在 t 处切开一段，把切口锚点插到 b 前面（返回插入后的下标）。 */
function insertCutAnchor(anchors: Anchor[], seg: number, t: number): number {
  const a = anchors[seg];
  const b = anchors[(seg + 1) % anchors.length];
  const p0 = { x: a.x, y: a.y };
  const p1 = a.hOut ?? p0;
  const p2 = b.hIn ?? { x: b.x, y: b.y };
  const p3 = { x: b.x, y: b.y };
  const q0 = lerpPt(p0, p1, t);
  const q1 = lerpPt(p1, p2, t);
  const q2 = lerpPt(p2, p3, t);
  const r0 = lerpPt(q0, q1, t);
  const r1 = lerpPt(q1, q2, t);
  const s = lerpPt(r0, r1, t);
  const curved = !!a.hOut || !!b.hIn;
  const mid: Anchor = { x: s.x, y: s.y, hIn: curved ? r0 : null, hOut: curved ? r1 : null, smooth: true };
  if (curved) {
    a.hOut = { x: q0.x, y: q0.y };
    b.hIn = { x: q2.x, y: q2.y };
  }
  anchors.splice(seg + 1, 0, mid);
  return seg + 1;
}

function cutAtAnchor(node: Node, si: number, ai: number): boolean {
  if (node.kind !== "path") return false;
  const sub = node.subpaths[si];
  if (!sub) return false;
  const anchors = sub.anchors;
  if (anchors.length < 3) return false;
  if (!sub.closed) {
    if (ai <= 0 || ai >= anchors.length - 1) return false;
    const right = anchors.slice(ai).map((a, i) =>
      i === 0
        ? { ...a, hIn: a.hIn ? { ...a.hIn } : null, hOut: a.hOut ? { ...a.hOut } : null }
        : a,
    );
    node.subpaths.splice(si, 1, { anchors: anchors.slice(0, ai + 1), closed: false }, { anchors: right, closed: false });
    return true;
  }
  // 闭合路径：切开点变成首尾两个重合锚点，轮廓本身保持完整（剪掉的只是闭合连接）。
  const start = anchors[ai];
  const rotated = [...anchors.slice(ai), ...anchors.slice(0, ai), {
    ...start,
    hIn: start.hIn ? { ...start.hIn } : null,
    hOut: start.hOut ? { ...start.hOut } : null,
  }];
  node.subpaths[si] = { anchors: rotated, closed: false };
  return true;
}

/** 平滑工具的“单次笔划位移预算”：每个锚点最多离开原位 cap，避免一笔把角拖塌。 */
export interface SmoothLimit {
  x: number;
  y: number;
  cap: number;
}

export function makeSmoothLimits(doc: VexaDoc, radius: number): Map<string, SmoothLimit> {
  const out = new Map<string, SmoothLimit>();
  for (const n of Object.values(doc.nodes)) {
    if (n.kind !== "path" || !n.visible || n.locked) continue;
    n.subpaths.forEach((sub, si) => {
      const arr = sub.anchors;
      const count = arr.length;
      if (count < 3) return;
      arr.forEach((a, ai) => {
        if (!sub.closed && (ai === 0 || ai === count - 1)) return;
        const prev = arr[(ai - 1 + count) % count];
        const next = arr[(ai + 1) % count];
        const cap = Math.min(radius * 1.3, Math.min(Math.hypot(prev.x - a.x, prev.y - a.y), Math.hypot(next.x - a.x, next.y - a.y)) * 0.22);
        out.set(`${n.id}:${si}:${ai}`, { x: a.x, y: a.y, cap });
      });
    });
  }
  return out;
}

/** 平滑工具：把笔刷经过的锚点向相邻两点中点收拢；没手柄的转角顺手补成对称手柄。 */
export function smoothPathNear(doc: VexaDoc, samples: Pt[], radius: number, amount = 0.28, limits?: Map<string, SmoothLimit>): boolean {
  if (samples.length === 0) return false;
  const r2 = radius * radius;
  const dist2 = (p: Pt): number => {
    let best = Infinity;
    if (samples.length === 1) return (p.x - samples[0].x) ** 2 + (p.y - samples[0].y) ** 2;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2)) : 0;
      const qx = a.x + vx * t;
      const qy = a.y + vy * t;
      const d = (p.x - qx) ** 2 + (p.y - qy) ** 2;
      if (d < best) best = d;
    }
    return best;
  };

  let changed = false;
  for (const n of Object.values(doc.nodes)) {
    if (n.kind !== "path" || !n.visible || n.locked) continue;
    for (let si = 0; si < n.subpaths.length; si++) {
      const sub = n.subpaths[si];
      const arr = sub.anchors;
      const count = arr.length;
      if (count < 3) continue;
      for (let i = 0; i < count; i++) {
        if (!sub.closed && (i === 0 || i === count - 1)) continue;
        const a = arr[i];
        if (dist2(a) > r2) continue;
        const prev = arr[(i - 1 + count) % count];
        const next = arr[(i + 1) % count];
        const tx = (prev.x + next.x) / 2;
        const ty = (prev.y + next.y) / 2;
        let dx = (tx - a.x) * amount;
        let dy = (ty - a.y) * amount;
        const lim = limits?.get(`${n.id}:${si}:${i}`);
        if (lim) {
          const used = Math.hypot(a.x - lim.x, a.y - lim.y);
          const left = lim.cap - used;
          if (left <= 0.01) continue;
          const need = Math.hypot(dx, dy);
          if (need > left) {
            dx *= left / need;
            dy *= left / need;
          }
        }
        if (Math.abs(dx) + Math.abs(dy) < 0.01) continue;
        a.x += dx;
        a.y += dy;
        if (a.hIn) { a.hIn.x += dx; a.hIn.y += dy; }
        if (a.hOut) { a.hOut.x += dx; a.hOut.y += dy; }
        if (!a.hIn && !a.hOut) {
          const vx = next.x - prev.x;
          const vy = next.y - prev.y;
          const vl = Math.hypot(vx, vy) || 1;
          const handle = Math.min(
            Math.min(Math.hypot(prev.x - a.x, prev.y - a.y), Math.hypot(next.x - a.x, next.y - a.y)) * 0.28,
            radius * 1.5,
          );
          a.hOut = { x: a.x + (vx / vl) * handle, y: a.y + (vy / vl) * handle };
          a.hIn = { x: a.x - (vx / vl) * handle, y: a.y - (vy / vl) * handle };
          a.smooth = true;
        }
        changed = true;
      }
    }
  }
  return changed;
}


export function splitPathAtAnchor(doc: VexaDoc, id: string, si: number, ai: number): boolean {
  const node = doc.nodes[id];
  if (!node || node.kind !== "path") return false;
  return cutAtAnchor(node, si, ai);
}

/** 剪刀：在子路径第 seg 段（0..n-2；闭合可到 n-1）的 t 处切开，先在曲线上插锚点再走锚点切线。 */
export function splitPathAtPoint(doc: VexaDoc, id: string, si: number, seg: number, t: number): boolean {
  const node = doc.nodes[id];
  if (!node || node.kind !== "path") return false;
  const sub = node.subpaths[si];
  if (!sub) return false;
  const n = sub.anchors.length;
  const segCount = sub.closed ? n : n - 1;
  if (seg < 0 || seg >= segCount || n < 2) return false;
  if (t <= 1e-3) return cutAtAnchor(node, si, seg);
  if (t >= 1 - 1e-3) return cutAtAnchor(node, si, (seg + 1) % n);
  insertCutAnchor(sub.anchors, seg, t);
  return cutAtAnchor(node, si, seg + 1);
}

/* ---------------- 自由铅笔 ---------------- */

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  if (len < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** 自由笔画抽稀：Douglas–Peucker，保留首尾，容差单位为文档像素。 */
export function simplifyPoints(points: Pt[], tolerance = 1.2): Pt[] {
  if (points.length <= 2) return points.map((p) => ({ x: p.x, y: p.y }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let best = -1;
    let max = tolerance;
    for (let i = s + 1; i < e; i++) {
      const d = pointSegDist(points[i], points[s], points[e]);
      if (d > max) {
        max = d;
        best = i;
      }
    }
    if (best > 0) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push({ x: points[i].x, y: points[i].y });
  return out;
}

/** 把抽稀后的自由笔画变成带对称手柄的平滑锚点（Catmull-Rom 型切线，内部点用前后差 /6）。 */
export function freehandAnchors(points: Pt[], strength = 1): Anchor[] {
  const pts = simplifyPoints(points, 1.2);
  const out: Anchor[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    const next = pts[i + 1];
    let hIn: Pt | null = null;
    let hOut: Pt | null = null;
    if (prev && next) {
      const tx = ((next.x - prev.x) / 6) * strength;
      const ty = ((next.y - prev.y) / 6) * strength;
      hIn = { x: p.x - tx, y: p.y - ty };
      hOut = { x: p.x + tx, y: p.y + ty };
    } else if (next) {
      hOut = { x: p.x + ((next.x - p.x) / 3) * strength, y: p.y + ((next.y - p.y) / 3) * strength };
    } else if (prev) {
      hIn = { x: p.x + ((prev.x - p.x) / 3) * strength, y: p.y + ((prev.y - p.y) / 3) * strength };
    }
    out.push({ x: p.x, y: p.y, hIn, hOut, smooth: true });
  }
  return out;
}
