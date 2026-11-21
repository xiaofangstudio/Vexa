/** 视口数学：屏幕 ↔ 文档坐标。pan 是文档原点在屏幕上的位置。 */
import type { Artboard, Pt } from "../core/types";

export interface View {
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function screenToDoc(view: View, sx: number, sy: number): Pt {
  return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom };
}

export function docToScreen(view: View, dx: number, dy: number): Pt {
  return { x: dx * view.zoom + view.panX, y: dy * view.zoom + view.panY };
}

/** 把一块画板居中放进视口并留出边距。 */
export function fitBoard(board: Artboard, vpW: number, vpH: number, pad = 56): View {
  const zoom = clampZoom(Math.min((vpW - pad * 2) / board.w, (vpH - pad * 2) / board.h, 4));
  return {
    zoom,
    panX: vpW / 2 - (board.x + board.w / 2) * zoom,
    panY: vpH / 2 - (board.y + board.h / 2) * zoom,
  };
}

export function zoomAt(view: View, sx: number, sy: number, nextZoom: number): View {
  const z = clampZoom(nextZoom);
  const doc = screenToDoc(view, sx, sy);
  return { zoom: z, panX: sx - doc.x * z, panY: sy - doc.y * z };
}
