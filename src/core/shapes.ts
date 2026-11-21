/** 更多基础形状：圆角矩形 / 正多边形 / 星形。全部输出可编辑的贝塞尔路径。 */
import { KAPPA, rectPath } from "./docOps";
import { anchorAt, noStroke, solid, type PathNode } from "./types";

function mkPath(id: string, name: string, subpaths: PathNode["subpaths"], color = "#0f76d6"): PathNode {
  return {
    kind: "path",
    id,
    name,
    subpaths,
    fill: solid(color),
    stroke: noStroke(),
    opacity: 1,
    visible: true,
    locked: false,
  };
}

/** 圆角矩形：半径按短边一半截断（与 Illustrator 一致）。 */
export function roundRectPath(id: string, name: string, x: number, y: number, w: number, h: number, r = 0): PathNode {
  const rad = Math.max(0, Math.min(r, Math.min(Math.abs(w), Math.abs(h)) / 2));
  if (rad <= 0.01) return rectPath(id, name, x, y, w, h);

  const x0 = Math.min(x, x + w);
  const y0 = Math.min(y, y + h);
  const x1 = x0 + Math.abs(w);
  const y1 = y0 + Math.abs(h);
  const k = rad * KAPPA;

  // 从左上角起的顺时针四段圆角
  const anchors = [
    { x: x0 + rad, y: y0, hIn: { x: x0 + rad - k, y: y0 }, hOut: null, smooth: false },
    { x: x1 - rad, y: y0, hIn: null, hOut: { x: x1 - rad + k, y: y0 }, smooth: false },
    { x: x1, y: y0 + rad, hIn: { x: x1, y: y0 + rad - k }, hOut: null, smooth: false },
    { x: x1, y: y1 - rad, hIn: null, hOut: { x: x1, y: y1 - rad + k }, smooth: false },
    { x: x1 - rad, y: y1, hIn: { x: x1 - rad + k, y: y1 }, hOut: null, smooth: false },
    { x: x0 + rad, y: y1, hIn: null, hOut: { x: x0 + rad - k, y: y1 }, smooth: false },
    { x: x0, y: y1 - rad, hIn: { x: x0, y: y1 - rad + k }, hOut: null, smooth: false },
    { x: x0, y: y0 + rad, hIn: null, hOut: { x: x0, y: y0 + rad - k }, smooth: false },
  ];
  return mkPath(id, name, [{ anchors, closed: true }]);
}

/** 正多边形（外接圆半径，顶点朝上）。 */
export function polygonPath(id: string, name: string, cx: number, cy: number, r: number, sides = 5): PathNode {
  const n = Math.max(3, Math.round(sides));
  const anchors = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / n;
    anchors.push(anchorAt(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return mkPath(id, name, [{ anchors, closed: true }]);
}

/** 星形：points 个角，内半径比例 inner（默认 0.5）。 */
export function starPath(id: string, name: string, cx: number, cy: number, r: number, points = 5, inner = 0.5): PathNode {
  const p = Math.max(3, Math.round(points));
  const ir = Math.max(0.05, Math.min(0.95, inner)) * r;
  const anchors = [];
  for (let i = 0; i < p * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / p;
    const rr = i % 2 === 0 ? r : ir;
    anchors.push(anchorAt(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  return mkPath(id, name, [{ anchors, closed: true }]);
}

/** 从拖拽框推形状参数（起点→终点）。 */
export function shapeFromDrag(
  kind: "roundrect" | "polygon" | "star",
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  opts: { radius?: number; sides?: number; points?: number; inner?: number } = {},
): PathNode {
  const w = x1 - x0;
  const h = y1 - y0;
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const r = Math.max(Math.abs(w), Math.abs(h)) / 2;
  if (kind === "roundrect") {
    return roundRectPath(id, "圆角矩形", Math.min(x0, x1), Math.min(y0, y1), Math.abs(w), Math.abs(h), opts.radius ?? 12);
  }
  if (kind === "polygon") return polygonPath(id, "多边形", cx, cy, r, opts.sides ?? 5);
  return starPath(id, "星形", cx, cy, r, opts.points ?? 5, opts.inner ?? 0.5);
}
