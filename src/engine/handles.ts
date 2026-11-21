/** 选择框手柄：画布绘制与命中测试共用同一份坐标，避免“看到的和点到的不一致”。 */
import type { Box } from "../core/geom";
import type { Pt } from "../core/types";

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export interface HandleLayout {
  points: Array<{ id: HandleId; p: Pt }>;
  rotate: Pt;
  lineTop: Pt;
  size: number;
  rotSize: number;
}

/** 手柄尺寸跟着缩放走，屏幕上恒定 7px；旋转柄在顶边上方 26px。 */
export function handleLayout(box: Box, zoom: number): HandleLayout {
  const size = 7 / zoom;
  const rotSize = 9 / zoom;
  const cx = box.x + box.w / 2;
  const points: Array<{ id: HandleId; p: Pt }> = [
    { id: "nw", p: { x: box.x, y: box.y } },
    { id: "n", p: { x: cx, y: box.y } },
    { id: "ne", p: { x: box.x + box.w, y: box.y } },
    { id: "e", p: { x: box.x + box.w, y: box.y + box.h / 2 } },
    { id: "se", p: { x: box.x + box.w, y: box.y + box.h } },
    { id: "s", p: { x: cx, y: box.y + box.h } },
    { id: "sw", p: { x: box.x, y: box.y + box.h } },
    { id: "w", p: { x: box.x, y: box.y + box.h / 2 } },
  ];
  return {
    points,
    rotate: { x: cx, y: box.y - 26 / zoom },
    lineTop: { x: cx, y: box.y },
    size,
    rotSize,
  };
}

export type HandleHit = { kind: "resize"; id: HandleId } | { kind: "rotate" };

/** 命中：先看旋转柄，再看八个缩放柄；容差 2px（屏幕）。 */
export function hitHandle(box: Box, zoom: number, p: Pt): HandleHit | null {
  const l = handleLayout(box, zoom);
  const tol = (l.size / 2 + 2) / zoom;
  if (Math.hypot(p.x - l.rotate.x, p.y - l.rotate.y) <= tol + 2 / zoom) return { kind: "rotate" };
  for (const h of l.points) {
    if (Math.abs(p.x - h.p.x) <= tol && Math.abs(p.y - h.p.y) <= tol) return { kind: "resize", id: h.id };
  }
  return null;
}

/** 缩放时的固定锚点（对角/对边）。 */
export function resizeAnchor(box: Box, id: HandleId): Pt {
  const midX = box.x + box.w / 2;
  const midY = box.y + box.h / 2;
  switch (id) {
    case "nw":
      return { x: box.x + box.w, y: box.y + box.h };
    case "ne":
      return { x: box.x, y: box.y + box.h };
    case "se":
      return { x: box.x, y: box.y };
    case "sw":
      return { x: box.x + box.w, y: box.y };
    case "n":
      return { x: midX, y: box.y + box.h };
    case "s":
      return { x: midX, y: box.y };
    case "e":
      return { x: box.x, y: midY };
    default:
      return { x: box.x + box.w, y: midY };
  }
}
