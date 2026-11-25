/** 图层多选的纯逻辑：显示顺序、Ctrl/Shift 选区和批量显隐/锁定语义。 */
import type { Node, VexaDoc } from "./types";

export interface LayerSelectEvent {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export interface LayerSelectionResult {
  ids: string[];
  anchor: string | null;
}

/** 按当前展开状态收集图层面板的可见显示顺序（组顶行在前，子层紧随）。 */
export function layerDisplayOrder(doc: VexaDoc, openGroups: Set<string>): string[] {
  const out: string[] = [];
  const walk = (list: string[]) => {
    for (const id of [...list].reverse()) {
      const n = doc.nodes[id];
      if (!n) continue;
      out.push(id);
      if (n.kind === "group" && openGroups.has(id)) {
        walk(n.children.filter((c) => c !== n.clip && doc.nodes[c]));
      }
    }
  };
  walk(doc.root);
  return out;
}

/** Ctrl/Cmd 切换、Shift 从锚点连选、普通点击单选。 */
export function selectLayerIds(
  current: string[],
  id: string,
  e: LayerSelectEvent,
  anchor: string | null,
  order: string[],
): LayerSelectionResult {
  const additive = e.metaKey || e.ctrlKey;
  if (e.shiftKey && anchor) {
    const from = order.indexOf(anchor);
    const to = order.indexOf(id);
    if (from >= 0 && to >= 0) {
      const range = order.slice(Math.min(from, to), Math.max(from, to) + 1);
      return { ids: [...new Set([...(additive ? current : []), ...range])], anchor };
    }
  }
  if (additive) {
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    return { ids: next, anchor: next.includes(id) ? id : anchor };
  }
  return { ids: [id], anchor: id };
}

/** 批量按钮：任一层可见则全部隐藏，全部隐藏则全部显示；任一层解锁则全部锁定。 */
export function nextLayerFlagValue(nodes: Node[], flag: "visible" | "locked"): boolean {
  const anyOn = flag === "visible" ? nodes.some((n) => n.visible) : nodes.some((n) => !n.locked);
  return flag === "visible" ? !anyOn : anyOn;
}

/** 选中层是否全部可见 / 全部锁定，用于按钮 active 态。 */
export function allLayerFlag(nodes: Node[], flag: "visible" | "locked"): boolean {
  if (!nodes.length) return false;
  return flag === "visible" ? nodes.every((n) => n.visible) : nodes.every((n) => n.locked);
}
