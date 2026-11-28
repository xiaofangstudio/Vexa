/** 图层搜索 / 颜色标记过滤：只算可见树，剪裁路径不参与。 */
import type { LayerTag, Node, VexaDoc } from "./types";

export interface LayerFilter {
  query: string;
  tag: LayerTag | null;
}

export interface LayerFilterTree {
  /** 自身命中的节点。 */
  self: Set<string>;
  /** 自身或任一后代命中的节点。 */
  subtree: Set<string>;
  /** 组内至少有一个后代命中（用于过滤时强制展开）。 */
  descendant: Set<string>;
  /** 自身命中的数量，显示在面板头。 */
  count: number;
}

export const EMPTY_LAYER_FILTER: LayerFilter = { query: "", tag: null };

export function normalizeLayerQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function isLayerFilterActive(filter: LayerFilter): boolean {
  return normalizeLayerQuery(filter.query).length > 0 || filter.tag !== null;
}

export function layerKindName(n: Node): string {
  if (n.kind === "path") return "路径";
  if (n.kind === "text") return "文本";
  if (n.kind === "image") return "图片";
  if (n.kind === "symbol") return "符号";
  return "组";
}

export function nodeMatchesLayerFilter(n: Node, filter: LayerFilter): boolean {
  if (filter.tag && n.tag !== filter.tag) return false;
  const query = normalizeLayerQuery(filter.query);
  if (!query) return true;
  return n.name.toLocaleLowerCase().includes(query) || layerKindName(n).includes(query);
}

export function filterLayerTree(doc: VexaDoc, filter: LayerFilter): LayerFilterTree {
  const self = new Set<string>();
  const subtree = new Set<string>();
  const descendant = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string): boolean => {
    if (subtree.has(id)) return true;
    if (visiting.has(id)) return false;
    const n = doc.nodes[id];
    if (!n) return false;
    visiting.add(id);

    const own = nodeMatchesLayerFilter(n, filter);
    if (own) self.add(id);

    let childHit = false;
    if (n.kind === "group") {
      for (const child of n.children) {
        if (child === n.clip) continue;
        if (visit(child)) childHit = true;
      }
    }
    visiting.delete(id);

    if (childHit) descendant.add(id);
    if (own || childHit) {
      subtree.add(id);
      return true;
    }
    return false;
  };

  for (const id of doc.root) visit(id);
  return { self, subtree, descendant, count: self.size };
}
