/** 闭合路径最大内切圆：拍平环 → nonzero 内部判定 → polylabel 搜索最大间隙。 */
import { flatten } from "./geom";
import type { PathNode, Pt } from "./types";

export interface InscribedCircle {
  cx: number;
  cy: number;
  r: number;
  /** 搜索停止时的误差上界（文档单位）。 */
  precision: number;
}

interface Edge {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

interface Cell {
  x: number;
  y: number;
  h: number;
  d: number;
  max: number;
}

function cleanRing(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-7) out.push({ x: p.x, y: p.y });
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-7) out.pop();
  }
  return out;
}

function segDistance2(px: number, py: number, e: Edge): number {
  const dx = e.bx - e.ax;
  const dy = e.by - e.ay;
  const l2 = dx * dx + dy * dy;
  if (l2 <= 1e-16) {
    const x = px - e.ax;
    const y = py - e.ay;
    return x * x + y * y;
  }
  let t = ((px - e.ax) * dx + (py - e.ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = px - (e.ax + dx * t);
  const y = py - (e.ay + dy * t);
  return x * x + y * y;
}

function winding(px: number, py: number, edges: Edge[]): number {
  let wn = 0;
  for (const e of edges) {
    const cross = (e.bx - e.ax) * (py - e.ay) - (e.by - e.ay) * (px - e.ax);
    if (e.ay <= py && e.by > py && cross > 0) wn++;
    else if (e.ay > py && e.by <= py && cross < 0) wn--;
  }
  return wn;
}

function pushCell(heap: Cell[], c: Cell): void {
  heap.push(c);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].max >= heap[i].max) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function popCell(heap: Cell[]): Cell | undefined {
  if (!heap.length) return undefined;
  const top = heap[0];
  const last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < heap.length && heap[l].max > heap[best].max) best = l;
      if (r < heap.length && heap[r].max > heap[best].max) best = r;
      if (best === i) break;
      [heap[i], heap[best]] = [heap[best], heap[i]];
      i = best;
    }
  }
  return top;
}

/**
 * 选中路径的最大内切圆。路径可含多条闭合子路径（nonzero 填充：孔洞反向子路径参与内部判定）；
 * 任一子路径开口、没有面积或半径过小返回 null。
 */
export function inscribedCircleOf(node: PathNode, precision = 0.05, maxCells = 4096): InscribedCircle | null {
  if (!node.subpaths.length) return null;
  const rings: Pt[][] = [];
  const edges: Edge[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sub of node.subpaths) {
    if (!sub.closed || sub.anchors.length < 3) return null;
    const ring = cleanRing(flatten(sub, 18));
    if (ring.length < 3) return null;
    rings.push(ring);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      edges.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      if (a.x < minX) minX = a.x;
      if (a.y < minY) minY = a.y;
      if (a.x > maxX) maxX = a.x;
      if (a.y > maxY) maxY = a.y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 1e-6 && h > 1e-6) || !Number.isFinite(w) || !Number.isFinite(h)) return null;

  const clearance = (x: number, y: number): number => {
    const inside = winding(x, y, edges) !== 0;
    let d2 = Infinity;
    for (const e of edges) {
      const v = segDistance2(x, y, e);
      if (v < d2) d2 = v;
    }
    const d = Math.sqrt(d2);
    return inside ? d : -d;
  };

  const size = Math.max(w, h);
  let bestX = (minX + maxX) / 2;
  let bestY = (minY + maxY) / 2;
  let bestD = clearance(bestX, bestY);
  const halfDiag = Math.SQRT2 / 2;
  const heap: Cell[] = [];
  pushCell(heap, {
    x: bestX,
    y: bestY,
    h: size,
    d: bestD,
    max: bestD + (size * halfDiag),
  });

  let cells = 0;
  while (heap.length && cells < maxCells) {
    const cell = popCell(heap)!;
    if (cell.d > bestD) {
      bestD = cell.d;
      bestX = cell.x;
      bestY = cell.y;
    }
    if (cell.max - bestD <= precision) break;
    const hh = cell.h / 2;
    if (hh <= precision / 4) continue;
    const q = hh / 2;
    for (let sy = -1; sy <= 1; sy += 2) {
      for (let sx = -1; sx <= 1; sx += 2) {
        const x = cell.x + sx * q;
        const y = cell.y + sy * q;
        const d = clearance(x, y);
        const max = d + hh * halfDiag;
        cells++;
        if (max > bestD) pushCell(heap, { x, y, h: hh, d, max });
      }
    }
  }

  if (!(bestD > precision) || !Number.isFinite(bestD)) return null;
  // 四段贝塞尔圆的曲线略鼓出真圆：按参考的 0.03% 缩小，保证贴边时仍在内部。
  const r = bestD / 1.0003;
  return { cx: bestX, cy: bestY, r: Math.max(0.001, r), precision };
}
