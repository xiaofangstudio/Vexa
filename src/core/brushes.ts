/** 图案画笔：把文档内图案砖沿路径切线重复盖章，供画布/SVG/PDF 共用。 */
import { flatten } from "./geom";
import type { BrushDef, Node, PathNode, PatternDef, Pt, Stroke, VexaDoc } from "./types";

export const MAX_BRUSHES = 64;
const MAX_STAMPS = 2400;
const ID_RE = /^[a-z0-9_-]{1,32}$/i;

export interface BrushStamp {
  x: number;
  y: number;
  angle: number;
}

export function brushesOf(doc: VexaDoc): BrushDef[] {
  return Array.isArray(doc.brushes) ? doc.brushes : [];
}

export function brushById(doc: VexaDoc, id: string | undefined): BrushDef | undefined {
  if (!id) return undefined;
  return brushesOf(doc).find((b) => b.id === id);
}

/** 画笔引用的图案砖；图案缺失时画笔视为失效。 */
export function brushPattern(doc: VexaDoc, brush: BrushDef | undefined): PatternDef | undefined {
  if (!brush) return undefined;
  return (doc.patterns ?? []).find((p) => p.id === brush.patternId && p.root.length > 0);
}

export function canBrushStroke(doc: VexaDoc, ids: string[]): boolean {
  return ids.some((id) => {
    const node = doc.nodes[id];
    return !!node && node.visible && (node.kind === "path" || node.kind === "group");
  });
}

export function createPatternBrush(
  doc: VexaDoc,
  patternId: string,
  name?: string,
  scale = 1,
  spacing = 100,
): { ok: boolean; brush?: BrushDef; error?: string } {
  const pattern = (doc.patterns ?? []).find((p) => p.id === patternId);
  if (!pattern || pattern.root.length === 0) return { ok: false, error: "先选中一个可用的图案" };
  const list = brushesOf(doc);
  if (list.length >= MAX_BRUSHES) return { ok: false, error: `最多保存 ${MAX_BRUSHES} 个画笔` };
  let n = 1;
  while (list.some((b) => b.id === `br${n}`)) n++;
  const brush: BrushDef = {
    id: `br${n}`,
    name: cleanName(name) || `${pattern.name}画笔`,
    kind: "pattern",
    patternId: pattern.id,
    scale: clampScale(scale),
    spacing: clampSpacing(spacing),
    rev: 1,
  };
  doc.brushes = [...list, brush];
  return { ok: true, brush };
}

export function renameBrush(doc: VexaDoc, id: string, name: string): boolean {
  const brush = brushById(doc, id);
  const next = cleanName(name);
  if (!brush || !next) return false;
  brush.name = next;
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export function setBrushParams(doc: VexaDoc, id: string, scale?: number, spacing?: number): boolean {
  const brush = brushById(doc, id);
  if (!brush) return false;
  if (scale !== undefined) brush.scale = clampScale(scale);
  if (spacing !== undefined) brush.spacing = clampSpacing(spacing);
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export function redefineBrushPattern(doc: VexaDoc, id: string, patternId: string): boolean {
  const brush = brushById(doc, id);
  const pattern = (doc.patterns ?? []).find((p) => p.id === patternId);
  if (!brush || !pattern || pattern.root.length === 0) return false;
  brush.patternId = pattern.id;
  brush.rev = (brush.rev ?? 1) + 1;
  return true;
}

export function applyBrushStroke(doc: VexaDoc, ids: string[], id: string): number {
  const brush = brushById(doc, id);
  if (!brush) return 0;
  let n = 0;
  const visit = (nodeId: string) => {
    const node = doc.nodes[nodeId];
    if (!node || !node.visible) return;
    if (node.kind === "path") {
      node.stroke.kind = node.stroke.kind === "none" ? "solid" : node.stroke.kind;
      if (!(node.stroke.color && node.stroke.color !== "#000000")) node.stroke.color = "#111827";
      if (!(node.stroke.width > 0)) node.stroke.width = 1;
      node.stroke.brushId = brush.id;
      n++;
    } else if (node.kind === "group") {
      for (const child of node.children) visit(child);
    }
  };
  for (const nodeId of ids) visit(nodeId);
  return n;
}

export function removeBrushStroke(doc: VexaDoc, ids: string[]): number {
  let n = 0;
  const visit = (nodeId: string) => {
    const node = doc.nodes[nodeId];
    if (!node) return;
    if (node.kind === "path" && node.stroke.brushId) {
      delete node.stroke.brushId;
      n++;
    } else if (node.kind === "group") {
      for (const child of node.children) visit(child);
    }
  };
  for (const nodeId of ids) visit(nodeId);
  return n;
}

export function brushUsage(doc: VexaDoc, id: string): { nodes: number; styles: number } {
  let nodes = 0;
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === "path" && node.stroke.brushId === id) nodes++;
  }
  for (const def of doc.symbols ?? []) {
    for (const node of Object.values(def.nodes)) {
      if (node.kind === "path" && node.stroke.brushId === id) nodes++;
    }
  }
  const styles = (doc.styles ?? []).filter((s) => s.stroke?.brushId === id).length;
  return { nodes, styles };
}

export function brushUsageCount(doc: VexaDoc, id: string): number {
  const use = brushUsage(doc, id);
  return use.nodes + use.styles;
}

function clearStroke(stroke: Stroke): boolean {
  if (!stroke.brushId) return false;
  delete stroke.brushId;
  return true;
}

export function deleteBrush(doc: VexaDoc, id: string): number {
  let n = 0;
  const visit = (node: Node) => {
    if (node.kind === "path") {
      if (clearStroke(node.stroke)) n++;
    } else if (node.kind === "group") {
      for (const child of node.children) {
        const c = doc.nodes[child];
        if (c) visit(c);
      }
    }
  };
  for (const node of Object.values(doc.nodes)) visit(node);
  for (const def of doc.symbols ?? []) {
    for (const node of Object.values(def.nodes)) visit(node);
  }
  for (const style of doc.styles ?? []) {
    if (style.stroke && clearStroke(style.stroke)) n++;
  }
  doc.brushes = brushesOf(doc).filter((b) => b.id !== id);
  return n;
}

/** 删除图案时一并移除引用它的画笔；返回移除的画笔数。 */
export function pruneBrushesForPattern(doc: VexaDoc, patternId: string): number {
  const list = brushesOf(doc);
  const keep = list.filter((b) => b.patternId !== patternId);
  const removed = list.length - keep.length;
  if (removed) doc.brushes = keep;
  return removed;
}

/** 沿路径生成印章：起点一枚，之后按砖宽 × 间距百分比步进。 */
export function brushStamps(doc: VexaDoc, node: PathNode, brush: BrushDef): BrushStamp[] {
  const pattern = brushPattern(doc, brush);
  if (!pattern) return [];
  const step = Math.max(2, pattern.w * brush.scale * (brush.spacing / 100));
  const out: BrushStamp[] = [];
  for (const sub of node.subpaths) {
    const pts = dedupe(flatten(sub, 18), sub.closed);
    if (pts.length === 0) continue;
    if (pts.length === 1) {
      out.push({ x: pts[0].x, y: pts[0].y, angle: 0 });
      continue;
    }
    let next = 0;
    const segCount = sub.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segCount && out.length < MAX_STAMPS; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.001) continue;
      const angle = Math.atan2(dy, dx);
      while (next <= len + 0.001 && out.length < MAX_STAMPS) {
        const t = next / len;
        out.push({ x: a.x + dx * t, y: a.y + dy * t, angle });
        next += step;
      }
      next -= len;
      if (next < 0) next = 0;
    }
  }
  return out;
}

/** 清理引用与非法定义：画笔缺失的描边、图案缺失的画笔一并降级。 */
export function normalizeBrushes(doc: VexaDoc): void {
  if (!Array.isArray(doc.brushes)) {
    delete doc.brushes;
    return;
  }
  const patterns = new Set((doc.patterns ?? []).map((p) => p.id));
  const seen = new Set<string>();
  const list: BrushDef[] = [];
  for (const raw of doc.brushes) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : "";
    if (!id || seen.has(id)) continue;
    if (typeof raw.patternId !== "string" || !patterns.has(raw.patternId)) continue;
    seen.add(id);
    list.push({
      id,
      name: cleanName(raw.name) || `图案画笔 ${list.length + 1}`,
      kind: "pattern",
      patternId: raw.patternId,
      scale: clampScale(Number(raw.scale)),
      spacing: clampSpacing(Number(raw.spacing)),
      rev: Math.max(1, Math.round(Number(raw.rev) || 1)),
    });
  }
  doc.brushes = list.slice(0, MAX_BRUSHES);
}

export function cleanBrushLinks(doc: VexaDoc): void {
  const ids = new Set(brushesOf(doc).map((b) => b.id));
  const visit = (node: Node) => {
    if (node.kind === "path") {
      if (node.stroke.brushId && !ids.has(node.stroke.brushId)) delete node.stroke.brushId;
    } else if (node.kind === "group") {
      for (const child of node.children) {
        const c = doc.nodes[child];
        if (c) visit(c);
      }
    }
  };
  for (const node of Object.values(doc.nodes)) visit(node);
  for (const def of doc.symbols ?? []) for (const node of Object.values(def.nodes)) visit(node);
  for (const style of doc.styles ?? []) {
    if (style.stroke?.brushId && !ids.has(style.stroke.brushId)) delete style.stroke.brushId;
  }
}

function cleanName(name: unknown): string {
  return typeof name === "string" ? name.trim().slice(0, 24) : "";
}

function clampScale(n: number): number {
  return Math.min(10, Math.max(0.1, Number.isFinite(n) && n > 0 ? n : 1));
}

function clampSpacing(n: number): number {
  return Math.min(400, Math.max(20, Number.isFinite(n) && n > 0 ? n : 100));
}

function dedupe(pts: Pt[], closed: boolean): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.001) out.push(p);
  }
  if (closed && out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) <= 0.001) out.pop();
  }
  return out;
}
