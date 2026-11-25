/** 画板预设与管理：适配内容、复制（可带内容）、换序。 */
import { newId } from "./docOps";
import { nodeBox, unionBox, type Box } from "./geom";
import { translateNode } from "./vectorOps";
import type { Artboard, Node, VexaDoc } from "./types";

export interface BoardPreset {
  id: string;
  label: string;
  note: string;
  w: number;
  h: number;
}

export const BOARD_PRESETS: BoardPreset[] = [
  { id: "square", label: "方图", note: "1080 × 1080", w: 1080, h: 1080 },
  { id: "hd", label: "横屏", note: "1920 × 1080", w: 1920, h: 1080 },
  { id: "story", label: "竖屏", note: "1080 × 1920", w: 1080, h: 1920 },
  { id: "a4", label: "A4 竖版", note: "794 × 1123", w: 794, h: 1123 },
  { id: "a4l", label: "A4 横版", note: "1123 × 794", w: 1123, h: 794 },
  { id: "icon", label: "图标", note: "1024 × 1024", w: 1024, h: 1024 },
];

export function applyBoardPreset(board: Artboard, preset: BoardPreset): void {
  board.w = preset.w;
  board.h = preset.h;
}

/** 路径描边在几何外侧的近似半径；非均匀宽度取最大倍率。 */
function strokePad(node: Node): number {
  if (node.kind !== "path" || node.stroke.kind === "none") return 0;
  const width = Math.max(0, node.stroke.width);
  if (!width) return 0;
  let factor = 1;
  if (node.stroke.widthPoints && node.stroke.widthPoints.length >= 2) {
    for (const p of node.stroke.widthPoints) factor = Math.max(factor, p.left, p.right);
  }
  return width * factor / 2;
}

function expandBox(box: Box, pad: number): Box {
  if (pad <= 0) return box;
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

/** 递归求节点包围盒；组取所有子层的并集，路径计入描边宽度。 */
export function nodeBounds(
  doc: VexaDoc,
  id: string,
  visiting = new Set<string>(),
  includeHidden = true,
): Box | null {
  if (visiting.has(id)) return null;
  const n = doc.nodes[id];
  if (!n) return null;
  if (!includeHidden && !n.visible) return null;
  if (n.kind !== "group") return expandBox(nodeBox(n), strokePad(n));
  visiting.add(id);
  let box: Box | null = null;
  for (const child of n.children) {
    if (child === n.clip) continue;
    const cb = nodeBounds(doc, child, visiting, includeHidden);
    if (cb) box = unionBox(box, cb);
  }
  visiting.delete(id);
  return box;
}

function overlaps(a: Box, b: Artboard): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 当前画板内所有可见根层内容并集（路径计入描边）；没有内容返回 null。 */
export function boardContentBounds(doc: VexaDoc, index: number): Box | null {
  const board = doc.artboards[index];
  if (!board) return null;
  let box: Box | null = null;
  for (const id of doc.root) {
    const b = nodeBounds(doc, id, new Set<string>(), false);
    if (b && overlaps(b, board)) box = unionBox(box, b);
  }
  if (!box) return null;
  return { x: box.x, y: box.y, w: Math.max(1, box.w), h: Math.max(1, box.h) };
}

/** 把画板贴到当前画板内容的包围盒；没有内容时不改动，返回 false。 */
export function fitBoardToContent(doc: VexaDoc, index: number): boolean {
  const board = doc.artboards[index];
  const box = boardContentBounds(doc, index);
  if (!board || !box) return false;
  board.x = box.x;
  board.y = box.y;
  board.w = box.w;
  board.h = box.h;
  return true;
}

/** 上移 / 下移画板；越界返回 false。 */
export function moveArtboard(doc: VexaDoc, index: number, delta: number): boolean {
  const to = index + delta;
  if (!doc.artboards[index] || to < 0 || to >= doc.artboards.length || delta === 0) return false;
  const list = doc.artboards;
  [list[index], list[to]] = [list[to], list[index]];
  return true;
}

function cloneNode(doc: VexaDoc, srcId: string, map: Map<string, string>): string | null {
  const existing = map.get(srcId);
  if (existing) return existing;
  const src = doc.nodes[srcId];
  if (!src) return null;
  const prefix = src.kind === "path" ? "cp" : src.kind === "text" ? "ct" : src.kind === "image" ? "ci" : "cg";
  const id = newId(doc, prefix);
  map.set(srcId, id);
  const copy = JSON.parse(JSON.stringify(src)) as Node;
  copy.id = id;
  if (copy.kind === "group" && src.kind === "group") {
    copy.children = src.children.map((c) => cloneNode(doc, c, map)).filter((c): c is string => !!c);
    if (src.clip) {
      const clip = map.get(src.clip) ?? cloneNode(doc, src.clip, map);
      if (clip) copy.clip = clip;
      else delete copy.clip;
    } else {
      delete copy.clip;
    }
  }
  doc.nodes[id] = copy;
  return id;
}

export interface DuplicateBoardResult {
  board: Artboard;
  roots: string[];
  index: number;
}

/** 复制画板：默认带内容，内容整体平移到新画板；组/剪裁引用会重新映射。 */
export function duplicateArtboard(doc: VexaDoc, index: number, withContent = true): DuplicateBoardResult | null {
  const source = doc.artboards[index];
  if (!source) return null;
  const right = Math.max(...doc.artboards.map((b) => b.x + b.w));
  const board: Artboard = {
    id: newId(doc, "ab"),
    name: `${source.name} 副本`,
    x: right + 48,
    y: source.y,
    w: source.w,
    h: source.h,
    bg: source.bg,
  };
  doc.artboards.splice(index + 1, 0, board);
  const roots: string[] = [];
  if (withContent) {
    const sourceRoots = doc.root.filter((id) => {
      const b = nodeBounds(doc, id);
      return !!b && overlaps(b, source);
    });
    const dx = board.x - source.x;
    const dy = board.y - source.y;
    const map = new Map<string, string>();
    for (const id of sourceRoots) {
      const clone = cloneNode(doc, id, map);
      if (!clone) continue;
      const n = doc.nodes[clone];
      if (n) translateNode(doc, n, dx, dy);
      roots.push(clone);
      doc.root.push(clone);
    }
  }
  return { board, roots, index: index + 1 };
}
