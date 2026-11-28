/** 符号系统：从选中捕获定义、置入实例、重定义同步、断开链接与删除。 */
import { addNode, newId } from "./docOps";
import { nodeBox, unionBox, type Box } from "./geom";
import type { GroupNode, Node, SymbolDef, SymbolNode, VexaDoc } from "./types";
import { noStroke, solid } from "./types";

export const MAX_SYMBOLS = 64;
const ID_RE = /^[a-z0-9_-]{1,32}$/i;

export function symbolsOf(doc: VexaDoc): SymbolDef[] {
  return Array.isArray(doc.symbols) ? doc.symbols : [];
}

export function symbolById(doc: VexaDoc, id: string | undefined): SymbolDef | undefined {
  if (!id) return undefined;
  return symbolsOf(doc).find((s) => s.id === id);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function treeBox(doc: VexaDoc, n: Node): Box | null {
  if (n.kind === "group") {
    let box: Box | null = null;
    for (const id of n.children) {
      const c = doc.nodes[id];
      if (c && c.visible) box = unionBox(box, treeBox(doc, c) ?? nodeBox(c));
    }
    return box;
  }
  return nodeBox(n);
}

function collectTree(doc: VexaDoc, id: string, out: Set<string>, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  const n = doc.nodes[id];
  if (!n) return false;
  if (n.kind === "symbol") return false;
  out.add(id);
  if (n.kind === "group") {
    for (const c of n.children) if (!collectTree(doc, c, out, seen)) return false;
  }
  return true;
}

/** 捕获一组选中对象为定义内容；坐标平移到左上角 0,0。 */
function captureArtwork(doc: VexaDoc, ids: string[]): { w: number; h: number; nodes: Record<string, Node>; root: string[] } | null {
  const selected = new Set(ids.filter((id) => doc.nodes[id]));
  if (!selected.size) return null;
  const parentOf = new Map<string, string>();
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "group") for (const c of n.children) parentOf.set(c, n.id);
  }
  const isNested = (id: string): boolean => {
    const seen = new Set<string>();
    let parent = parentOf.get(id);
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return true;
      seen.add(parent);
      parent = parentOf.get(parent);
    }
    return false;
  };
  const roots = [...selected].filter((id) => !isNested(id));
  let box: Box | null = null;
  for (const id of roots) {
    const n = doc.nodes[id];
    if (!n || n.kind === "symbol") return null;
    box = unionBox(box, treeBox(doc, n) ?? nodeBox(n));
  }
  if (!box || box.w < 1 || box.h < 1) return null;
  const idset = new Set<string>();
  for (const id of roots) if (!collectTree(doc, id, idset)) return null;
  const map = new Map<string, string>();
  let k = 1;
  for (const id of idset) map.set(id, `d${k++}`);
  const nodes: Record<string, Node> = {};
  for (const [oldId, newIdVal] of map) {
    const n = clone(doc.nodes[oldId]);
    n.id = newIdVal;
    nodes[newIdVal] = n;
  }
  for (const n of Object.values(nodes)) {
    if (n.kind === "group") {
      n.children = n.children.map((c) => map.get(c)).filter((c): c is string => !!c && !!nodes[c]);
      if (n.clip) n.clip = map.get(n.clip);
      if (n.clip && !nodes[n.clip]) delete n.clip;
    }
  }
  for (const n of Object.values(nodes)) shiftNode(n, -box.x, -box.y);
  const root = roots.map((id) => map.get(id)).filter((id): id is string => !!id);
  return { w: Math.max(1, box.w), h: Math.max(1, box.h), nodes, root };
}

function shiftNode(n: Node, dx: number, dy: number): void {
  if (n.kind === "path") {
    for (const sub of n.subpaths) {
      for (const a of sub.anchors) {
        a.x += dx;
        a.y += dy;
        if (a.hIn) { a.hIn.x += dx; a.hIn.y += dy; }
        if (a.hOut) { a.hOut.x += dx; a.hOut.y += dy; }
      }
    }
  } else if (n.kind === "text" || n.kind === "image" || n.kind === "symbol") {
    n.x += dx;
    n.y += dy;
  } else if (n.kind === "group") {
    // 组子节点已单独平移，组本身没有坐标
  }
}

function cleanDefNode(raw: Node): Node | null {
  if (!raw || typeof raw !== "object" || !raw.id) return null;
  if (raw.kind === "symbol") return null;
  if (typeof raw.name !== "string" || !raw.name.trim()) raw.name = "对象";
  if (typeof raw.opacity !== "number" || !Number.isFinite(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) raw.opacity = 1;
  if (raw.visible === undefined) raw.visible = true;
  if (raw.locked === undefined) raw.locked = false;
  if (raw.kind === "path") {
    if (!Array.isArray(raw.subpaths)) return null;
    if (!raw.fill || typeof raw.fill !== "object") raw.fill = solid("#0f76d6");
    if (!raw.stroke || typeof raw.stroke !== "object") raw.stroke = noStroke();
    return raw;
  }
  if (raw.kind === "text") {
    if (typeof raw.text !== "string") raw.text = "";
    if (!Number.isFinite(raw.x)) raw.x = 0;
    if (!Number.isFinite(raw.y)) raw.y = 0;
    if (!Number.isFinite(raw.size) || raw.size <= 0) raw.size = 20;
    if (typeof raw.font !== "string" || !raw.font) raw.font = "Arial";
    if (!raw.fill || typeof raw.fill !== "object") raw.fill = solid("#17171c");
    return raw;
  }
  if (raw.kind === "image") {
    if (typeof raw.src !== "string" || !raw.src) return null;
    if (!Number.isFinite(raw.x)) raw.x = 0;
    if (!Number.isFinite(raw.y)) raw.y = 0;
    if (!Number.isFinite(raw.w) || raw.w <= 0) raw.w = 1;
    if (!Number.isFinite(raw.h) || raw.h <= 0) raw.h = 1;
    return raw;
  }
  if (raw.kind === "group") {
    if (!Array.isArray(raw.children)) raw.children = [];
    return raw;
  }
  return null;
}

/** 清洗符号定义：限制数量、补 id、清掉坏节点与悬空引用。 */
export function normalizeSymbols(input: unknown): SymbolDef[] {
  if (!Array.isArray(input)) return [];
  const out: SymbolDef[] = [];
  for (let i = 0; i < input.length && out.length < MAX_SYMBOLS; i++) {
    const raw = input[i] as Partial<SymbolDef> | null;
    if (!raw || typeof raw !== "object" || !raw.nodes || typeof raw.nodes !== "object") continue;
    let id = typeof raw.id === "string" && ID_RE.test(raw.id) ? raw.id : `sym${i + 1}`;
    while (out.some((s) => s.id === id)) id = `${id}_${out.length + 1}`;
    const nodes: Record<string, Node> = {};
    for (const [key, value] of Object.entries(raw.nodes)) {
      const n = cleanDefNode(value as Node);
      if (!n) continue;
      n.id = key;
      if (n.visible === undefined) n.visible = true;
      if (n.locked === undefined) n.locked = false;
      if (typeof n.opacity !== "number") n.opacity = 1;
      if (n.kind === "group" && !Array.isArray(n.children)) n.children = [];
      nodes[key] = n;
    }
    for (const n of Object.values(nodes)) {
      if (n.kind === "group") {
        n.children = n.children.filter((c) => nodes[c]);
        if (n.clip && !nodes[n.clip]) delete n.clip;
      }
    }
    const root = Array.isArray(raw.root) ? [...new Set(raw.root.filter((r): r is string => typeof r === "string" && !!nodes[r]))] : [];
    if (!root.length) continue;
    const w = typeof raw.w === "number" && Number.isFinite(raw.w) && raw.w > 0 ? Math.min(100000, raw.w) : 100;
    const h = typeof raw.h === "number" && Number.isFinite(raw.h) && raw.h > 0 ? Math.min(100000, raw.h) : 100;
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 24) : `符号 ${out.length + 1}`;
    out.push({ id, name, w, h, nodes, root });
  }
  return out;
}

function nextSymbolId(doc: VexaDoc): string {
  const used = new Set(symbolsOf(doc).map((s) => s.id));
  let n = 1;
  while (used.has(`sym${n}`)) n++;
  return `sym${n}`;
}

export interface SymbolResult {
  ok: boolean;
  symbol?: SymbolDef;
  error?: string;
}

export function addSymbol(doc: VexaDoc, ids: string[], name?: string): SymbolResult {
  if (symbolsOf(doc).length >= MAX_SYMBOLS) return { ok: false, error: `最多保存 ${MAX_SYMBOLS} 个符号` };
  const art = captureArtwork(doc, ids);
  if (!art) return { ok: false, error: "先选中可复制的路径、文字、图片或组" };
  const symbol: SymbolDef = {
    id: nextSymbolId(doc),
    name: name?.trim().slice(0, 24) || `符号 ${symbolsOf(doc).length + 1}`,
    ...art,
  };
  if (!doc.symbols) doc.symbols = [];
  doc.symbols.push(symbol);
  return { ok: true, symbol };
}

export function renameSymbol(doc: VexaDoc, id: string, name: string): boolean {
  const symbol = symbolById(doc, id);
  if (!symbol) return false;
  symbol.name = name.trim().slice(0, 24) || symbol.name;
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "symbol" && n.symbolId === id) n.name = symbol.name;
  }
  return true;
}

/** 用选中内容重新定义符号，所有实例即时换图。 */
export function redefineSymbol(doc: VexaDoc, id: string, ids: string[]): number {
  const symbol = symbolById(doc, id);
  if (!symbol) return 0;
  const art = captureArtwork(doc, ids);
  if (!art) return 0;
  symbol.w = art.w;
  symbol.h = art.h;
  symbol.nodes = art.nodes;
  symbol.root = art.root;
  return symbolUsage(doc, id);
}

export function placeSymbol(doc: VexaDoc, symbolId: string, x: number, y: number, w?: number, h?: number): SymbolNode | null {
  const symbol = symbolById(doc, symbolId);
  if (!symbol) return null;
  const node: SymbolNode = {
    kind: "symbol",
    id: newId(doc, "sym"),
    name: symbol.name,
    symbolId: symbol.id,
    x,
    y,
    w: w ?? symbol.w,
    h: h ?? symbol.h,
    opacity: 1,
    visible: true,
    locked: false,
  };
  addNode(doc, node);
  return node;
}

export function symbolUsage(doc: VexaDoc, id: string): number {
  return Object.values(doc.nodes).filter((n): n is SymbolNode => n.kind === "symbol" && n.symbolId === id).length;
}

function transformClone(n: Node, x: number, y: number, sx: number, sy: number): void {
  if (n.kind === "path") {
    for (const sub of n.subpaths) {
      for (const a of sub.anchors) {
        a.x = x + a.x * sx;
        a.y = y + a.y * sy;
        if (a.hIn) { a.hIn.x = x + a.hIn.x * sx; a.hIn.y = y + a.hIn.y * sy; }
        if (a.hOut) { a.hOut.x = x + a.hOut.x * sx; a.hOut.y = y + a.hOut.y * sy; }
      }
    }
  } else if (n.kind === "image") {
    n.x = x + n.x * sx;
    n.y = y + n.y * sy;
    n.w *= sx;
    n.h *= sy;
  } else if (n.kind === "text") {
    n.x = x + n.x * sx;
    n.y = y + n.y * sy;
    n.size *= Math.abs(sy) || 1;
    n.hScale = (n.hScale ?? 100) * ((Math.abs(sx) || 1) / (Math.abs(sy) || 1));
  } else if (n.kind === "symbol") {
    n.x = x + n.x * sx;
    n.y = y + n.y * sy;
    n.w *= sx;
    n.h *= sy;
  }
}

/** 把实例展开成普通组（复制定义内容并落到当前位置/尺寸），再删除实例。 */
export function expandSymbolInstance(doc: VexaDoc, nodeId: string): string | null {
  const node = doc.nodes[nodeId];
  if (!node || node.kind !== "symbol") return null;
  const symbol = symbolById(doc, node.symbolId);
  if (!symbol) return null;
  const sx = node.w / symbol.w;
  const sy = node.h / symbol.h;
  const map = new Map<string, string>();
  for (const id of symbol.root) map.set(id, newId(doc, "n"));
  for (const oldId of Object.keys(symbol.nodes)) {
    if (map.has(oldId)) continue;
    map.set(oldId, newId(doc, "n"));
  }
  const nodes: Record<string, Node> = {};
  for (const [oldId, newIdVal] of map) {
    const src = symbol.nodes[oldId];
    if (!src) continue;
    const n = clone(src);
    n.id = newIdVal;
    if (n.kind === "group") {
      n.children = n.children.map((c) => map.get(c)).filter((c): c is string => !!c && !!nodes[c]);
      if (n.clip) {
        const nextClip = map.get(n.clip);
        if (nextClip) n.clip = nextClip;
        else delete n.clip;
      }
    }
    nodes[newIdVal] = n;
  }
  for (const n of Object.values(nodes)) transformClone(n, node.x, node.y, sx, sy);
  const children = symbol.root.map((id) => map.get(id)).filter((id): id is string => !!id);
  const group: GroupNode = {
    kind: "group",
    id: newId(doc, "n"),
    name: node.name,
    children,
    opacity: node.opacity,
    visible: node.visible,
    locked: node.locked,
    ...(node.blend ? { blend: node.blend } : {}),
    ...(node.tag ? { tag: node.tag } : {}),
  };
  doc.nodes[group.id] = group;
  for (const n of Object.values(nodes)) doc.nodes[n.id] = n;
  // 用新组替换原实例，保持原层序；实例不在任何父层时兜底放回根层
  const put = (arr: string[], id: string, next: string): boolean => {
    const i = arr.indexOf(id);
    if (i < 0) return false;
    arr[i] = next;
    return true;
  };
  let replaced = put(doc.root, node.id, group.id);
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "group") replaced = put(n.children, node.id, group.id) || replaced;
  }
  if (!replaced) doc.root.push(group.id);
  delete doc.nodes[node.id];
  return group.id;
}

/** 删除符号：先把所有实例展开，保证画面不丢；再移除定义。 */
export function deleteSymbol(doc: VexaDoc, id: string): boolean {
  const instances = Object.values(doc.nodes).filter((n): n is SymbolNode => n.kind === "symbol" && n.symbolId === id).map((n) => n.id);
  for (const inst of instances) expandSymbolInstance(doc, inst);
  const list = symbolsOf(doc);
  const at = list.findIndex((s) => s.id === id);
  if (at < 0) return false;
  list.splice(at, 1);
  return true;
}
