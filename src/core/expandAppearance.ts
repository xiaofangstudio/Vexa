/** 扩展外观：把路径/文字的多填充多描边拆成独立图层，保持原绘制顺序。 */
import type { GroupNode, PathNode, TextNode, VexaDoc } from "./types";
import { newId } from "./docOps";

export interface ExpandAppearanceResult {
  expanded: number;
  groups: string[];
  layers: number;
}

function cloneNode<T extends PathNode | TextNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function blank(node: PathNode | TextNode): void {
  delete node.appearance;
  delete node.graphicStyle;
  node.opacity = 1;
  node.visible = true;
  node.locked = false;
  delete node.blend;
}

function fillLayer(node: PathNode | TextNode, name: string): PathNode | TextNode | null {
  if (node.fill.kind === "none") return null;
  const copy = cloneNode(node);
  blank(copy);
  copy.name = name;
  copy.fill = JSON.parse(JSON.stringify(node.fill));
  if (copy.kind === "path") copy.stroke = { kind: "none", color: "#111319", opacity: 1, width: 0, dash: [], arrow: "none" };
  else delete copy.stroke;
  return copy;
}

function strokeLayer(node: PathNode | TextNode, name: string): PathNode | TextNode | null {
  const stroke = node.stroke;
  if (!stroke || stroke.kind === "none" || stroke.width <= 0) return null;
  const copy = cloneNode(node);
  blank(copy);
  copy.name = name;
  copy.fill = { kind: "none", color: "#000000", opacity: 1 };
  copy.stroke = JSON.parse(JSON.stringify(stroke));
  return copy;
}

function appearanceLayer(node: PathNode | TextNode, index: number): PathNode | TextNode | null {
  const item = node.appearance?.[index];
  if (!item) return null;
  const copy = cloneNode(node);
  blank(copy);
  copy.name = `${node.name} · 叠加 ${index + 1}`;
  copy.opacity = item.opacity;
  copy.visible = item.visible;
  if (item.kind === "fill" && item.fill) {
    copy.fill = JSON.parse(JSON.stringify(item.fill));
    if (copy.kind === "path") copy.stroke = { kind: "none", color: "#111319", opacity: 1, width: 0, dash: [], arrow: "none" };
    else delete copy.stroke;
  } else if (item.kind === "stroke" && item.stroke) {
    copy.fill = { kind: "none", color: "#000000", opacity: 1 };
    copy.stroke = JSON.parse(JSON.stringify(item.stroke));
  } else {
    return null;
  }
  return copy;
}

function replaceRef(doc: VexaDoc, id: string, next: string): boolean {
  const swap = (list: string[]): boolean => {
    const i = list.indexOf(id);
    if (i < 0) return false;
    list[i] = next;
    return true;
  };
  if (swap(doc.root)) return true;
  for (const node of Object.values(doc.nodes)) {
    if (node.kind === "group" && swap(node.children)) return true;
  }
  return false;
}

/** 只展开带叠加外观的路径/文字；返回展开对象数、新组 id 与生成的独立图层数。 */
export function expandAppearance(doc: VexaDoc, ids: string[]): ExpandAppearanceResult {
  let expanded = 0;
  let layers = 0;
  const groups: string[] = [];
  for (const id of ids) {
    const node = doc.nodes[id];
    if (!node || (node.kind !== "path" && node.kind !== "text")) continue;
    if (!node.appearance?.length) continue;
    const children: string[] = [];
    const baseFill = fillLayer(node, `${node.name} · 底层填充`);
    if (baseFill) {
      baseFill.id = newId(doc, "n");
      doc.nodes[baseFill.id] = baseFill;
      children.push(baseFill.id);
    }
    const baseStroke = strokeLayer(node, `${node.name} · 底层描边`);
    if (baseStroke) {
      baseStroke.id = newId(doc, "n");
      doc.nodes[baseStroke.id] = baseStroke;
      children.push(baseStroke.id);
    }
    for (let i = 0; i < node.appearance.length; i++) {
      const layer = appearanceLayer(node, i);
      if (!layer) continue;
      layer.id = newId(doc, "n");
      doc.nodes[layer.id] = layer;
      children.push(layer.id);
    }
    if (!children.length) continue;
    const gid = newId(doc, "exp");
    const group: GroupNode = {
      kind: "group",
      id: gid,
      name: `${node.name} 扩展外观`,
      children,
      opacity: node.opacity ?? 1,
      visible: node.visible !== false,
      locked: node.locked === true,
      ...(node.blend ? { blend: node.blend } : {}),
      ...(node.tag ? { tag: node.tag } : {}),
    };
    doc.nodes[gid] = group;
    if (!replaceRef(doc, id, gid)) {
      delete doc.nodes[gid];
      for (const c of children) delete doc.nodes[c];
      continue;
    }
    delete doc.nodes[id];
    groups.push(gid);
    expanded++;
    layers += children.length;
  }
  return { expanded, groups, layers };
}
