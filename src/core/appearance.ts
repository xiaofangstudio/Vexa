import { BLEND_MODES, type AppearanceItem, type AppearanceKind, type BlendMode, type Node, type Paint, type PathNode, type Stroke, type TextNode, type VexaDoc } from "./types";

/** 每条路径或文字最多叠加 8 层外观。 */
export const MAX_APPEARANCE = 8;

type AppearanceHost = PathNode | TextNode;

function isHost(node: Node | undefined): node is AppearanceHost {
  return !!node && (node.kind === "path" || node.kind === "text");
}

function clamp01(n: number, fallback = 1): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function blendOf(value: unknown): BlendMode | undefined {
  if (typeof value !== "string") return undefined;
  if (!(BLEND_MODES as string[]).includes(value) || value === "normal") return undefined;
  return value as BlendMode;
}

function clonePaint(paint: Paint): Paint {
  const clone: Paint = { ...paint };
  if (paint.grad) clone.grad = { angle: paint.grad.angle, stops: paint.grad.stops.map((s) => ({ ...s })) };
  return clone;
}

function cloneStroke(stroke: Stroke): Stroke {
  const clone: Stroke = { ...stroke, dash: [...(stroke.dash ?? [])] };
  delete clone.brushId;
  if (stroke.grad) clone.grad = { angle: stroke.grad.angle, stops: stroke.grad.stops.map((s) => ({ ...s })) };
  if (stroke.widthPoints) clone.widthPoints = stroke.widthPoints.map((p) => ({ ...p }));
  return clone;
}

function defaultStroke(): Stroke {
  return { kind: "solid", color: "#111319", opacity: 1, width: 2, dash: [], cap: "butt", join: "miter", arrow: "none" };
}

export function cloneAppearanceItem(item: AppearanceItem): AppearanceItem {
  const blend = blendOf(item.blend);
  return item.kind === "fill"
    ? { id: item.id, kind: "fill", fill: clonePaint(item.fill!), opacity: item.opacity, visible: item.visible, ...(blend ? { blend } : {}) }
    : { id: item.id, kind: "stroke", stroke: cloneStroke(item.stroke!), opacity: item.opacity, visible: item.visible, ...(blend ? { blend } : {}) };
}

export function appearanceOf(node: Node | undefined): AppearanceItem[] {
  return isHost(node) ? node.appearance ?? [] : [];
}

export function appearanceCount(node: Node | undefined): number {
  return appearanceOf(node).length;
}

/** 在路径/文字底层外观之上新增一项；返回新项，失败时返回错误。 */
export function addAppearance(node: Node, kind: AppearanceKind): { ok: boolean; item?: AppearanceItem; error?: string } {
  if (!isHost(node)) return { ok: false, error: "外观只能叠加在路径或文字上" };
  const list = appearanceOf(node);
  if (list.length >= MAX_APPEARANCE) return { ok: false, error: `最多叠加 ${MAX_APPEARANCE} 层外观` };
  let n = 1;
  while (list.some((item) => item.id === `ap${n}`)) n++;
  const sourceStroke = node.stroke;
  const baseStroke = !sourceStroke || sourceStroke.kind === "none" || sourceStroke.width <= 0
    ? defaultStroke()
    : cloneStroke(sourceStroke);
  const item: AppearanceItem =
    kind === "fill"
      ? {
          id: `ap${n}`,
          kind: "fill",
          fill: clonePaint(node.fill.kind === "none" ? { kind: "solid", color: "#e5484d", opacity: 1 } : node.fill),
          opacity: 1,
          visible: true,
        }
      : {
          id: `ap${n}`,
          kind: "stroke",
          stroke: { ...baseStroke, kind: "solid", width: Math.max(2, baseStroke.width), arrow: "none" },
          opacity: 1,
          visible: true,
        };
  node.appearance = [...list, item];
  return { ok: true, item };
}

export function updateAppearance(
  node: Node,
  id: string,
  patch: { opacity?: number; visible?: boolean; fill?: Paint; stroke?: Stroke; blend?: BlendMode },
): boolean {
  const item = appearanceOf(node).find((it) => it.id === id);
  if (!item) return false;
  if (patch.opacity !== undefined) item.opacity = clamp01(patch.opacity, item.opacity);
  if (patch.visible !== undefined) item.visible = !!patch.visible;
  if (patch.fill !== undefined && item.kind === "fill") item.fill = clonePaint(patch.fill);
  if (patch.stroke !== undefined && item.kind === "stroke") item.stroke = cloneStroke(patch.stroke);
  if (patch.blend !== undefined) {
    const blend = blendOf(patch.blend);
    if (blend) item.blend = blend;
    else delete item.blend;
  }
  return true;
}

export function removeAppearance(node: Node, id: string): boolean {
  if (!isHost(node)) return false;
  const list = appearanceOf(node);
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  if (next.length) node.appearance = next;
  else delete node.appearance;
  return true;
}

/** 在栈内上移/下移一项；dir=-1 向底层，dir=1 向顶层。 */
export function moveAppearance(node: Node, id: string, dir: -1 | 1): boolean {
  if (!isHost(node)) return false;
  const list = [...appearanceOf(node)];
  const i = list.findIndex((item) => item.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  node.appearance = list;
  return true;
}

/** 清洗任意外观数组：坏 id、缺字段、重复 id 与超过上限的项一律丢弃。 */
export function normalizeAppearanceList(input: unknown): AppearanceItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const list: AppearanceItem[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<AppearanceItem>;
    const id = typeof item.id === "string" && /^ap\d+$/.test(item.id) ? item.id : "";
    const kind = item.kind === "fill" || item.kind === "stroke" ? item.kind : "";
    if (!id || !kind || seen.has(id)) continue;
    seen.add(id);
    if (kind === "fill") {
      if (!item.fill || typeof item.fill !== "object") continue;
      const blend = blendOf(item.blend);
      list.push({ id, kind, fill: clonePaint(item.fill as Paint), opacity: clamp01(Number(item.opacity), 1), visible: item.visible !== false, ...(blend ? { blend } : {}) });
    } else {
      if (!item.stroke || typeof item.stroke !== "object") continue;
      const blend = blendOf(item.blend);
      list.push({ id, kind, stroke: cloneStroke(item.stroke as Stroke), opacity: clamp01(Number(item.opacity), 1), visible: item.visible !== false, ...(blend ? { blend } : {}) });
    }
    if (list.length >= MAX_APPEARANCE) break;
  }
  return list;
}

/** 读取 `.vex` 时清洗路径与文字的外观栈。 */
export function normalizeAppearance(doc: VexaDoc): void {
  const cleanNode = (node: Node): void => {
    if (!isHost(node)) return;
    if (!Array.isArray(node.appearance)) {
      delete node.appearance;
      return;
    }
    const list = normalizeAppearanceList(node.appearance);
    if (list.length) node.appearance = list;
    else delete node.appearance;
  };
  for (const node of Object.values(doc.nodes)) cleanNode(node);
  for (const def of doc.symbols ?? []) for (const node of Object.values(def.nodes)) cleanNode(node);
}
