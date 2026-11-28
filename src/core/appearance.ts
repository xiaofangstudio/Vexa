import type { AppearanceItem, AppearanceKind, Node, Paint, PathNode, Stroke, VexaDoc } from "./types";

/** 每条路径最多叠加 8 层外观。 */
export const MAX_APPEARANCE = 8;

function clamp01(n: number, fallback = 1): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clonePaint(paint: Paint): Paint {
  const clone: Paint = { ...paint };
  if (paint.grad) clone.grad = { angle: paint.grad.angle, stops: paint.grad.stops.map((s) => ({ ...s })) };
  return clone;
}

function cloneStroke(stroke: Stroke): Stroke {
  const clone: Stroke = { ...stroke, dash: [...(stroke.dash ?? [])] };
  delete clone.brushId;
  if (stroke.widthPoints) clone.widthPoints = stroke.widthPoints.map((p) => ({ ...p }));
  return clone;
}

export function appearanceOf(node: PathNode): AppearanceItem[] {
  return node.appearance ?? [];
}

export function appearanceCount(node: PathNode): number {
  return appearanceOf(node).length;
}

/** 在路径底层外观之上新增一项；返回新项，失败时返回错误。 */
export function addAppearance(node: PathNode, kind: AppearanceKind): { ok: boolean; item?: AppearanceItem; error?: string } {
  const list = appearanceOf(node);
  if (list.length >= MAX_APPEARANCE) return { ok: false, error: `最多叠加 ${MAX_APPEARANCE} 层外观` };
  let n = 1;
  while (list.some((item) => item.id === `ap${n}`)) n++;
  const baseStroke = node.stroke.kind === "none" || node.stroke.width <= 0
    ? { kind: "solid" as const, color: "#111319", opacity: 1, width: 2, dash: [], cap: "butt" as const, join: "miter" as const }
    : cloneStroke(node.stroke);
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
  node: PathNode,
  id: string,
  patch: { opacity?: number; visible?: boolean; fill?: Paint; stroke?: Stroke },
): boolean {
  const item = appearanceOf(node).find((it) => it.id === id);
  if (!item) return false;
  if (patch.opacity !== undefined) item.opacity = clamp01(patch.opacity, item.opacity);
  if (patch.visible !== undefined) item.visible = !!patch.visible;
  if (patch.fill !== undefined && item.kind === "fill") item.fill = clonePaint(patch.fill);
  if (patch.stroke !== undefined && item.kind === "stroke") item.stroke = cloneStroke(patch.stroke);
  return true;
}

export function removeAppearance(node: PathNode, id: string): boolean {
  const list = appearanceOf(node);
  const next = list.filter((item) => item.id !== id);
  if (next.length === list.length) return false;
  if (next.length) node.appearance = next;
  else delete node.appearance;
  return true;
}

/** 在栈内上移/下移一项；dir=-1 向底层，dir=1 向顶层。 */
export function moveAppearance(node: PathNode, id: string, dir: -1 | 1): boolean {
  const list = [...appearanceOf(node)];
  const i = list.findIndex((item) => item.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  node.appearance = list;
  return true;
}

/** 读取 `.vex` 时清洗外观栈：坏 id、缺字段、重复 id 与超过上限的项一律丢弃。 */
export function normalizeAppearance(doc: VexaDoc): void {
  const cleanNode = (node: Node): void => {
    if (node.kind !== "path") return;
    if (!Array.isArray(node.appearance)) {
      delete node.appearance;
      return;
    }
    const seen = new Set<string>();
    const list: AppearanceItem[] = [];
    for (const raw of node.appearance) {
      if (!raw || typeof raw !== "object") continue;
      const id = typeof raw.id === "string" && /^ap\d+$/.test(raw.id) ? raw.id : "";
      const kind = raw.kind === "fill" || raw.kind === "stroke" ? raw.kind : "";
      if (!id || !kind || seen.has(id)) continue;
      seen.add(id);
      if (kind === "fill") {
        if (!raw.fill || typeof raw.fill !== "object") continue;
        list.push({ id, kind, fill: clonePaint(raw.fill), opacity: clamp01(Number(raw.opacity), 1), visible: raw.visible !== false });
      } else {
        if (!raw.stroke || typeof raw.stroke !== "object") continue;
        list.push({ id, kind, stroke: cloneStroke(raw.stroke), opacity: clamp01(Number(raw.opacity), 1), visible: raw.visible !== false });
      }
    }
    if (list.length) node.appearance = list.slice(0, MAX_APPEARANCE);
    else delete node.appearance;
  };
  for (const node of Object.values(doc.nodes)) cleanNode(node);
  for (const def of doc.symbols ?? []) for (const node of Object.values(def.nodes)) cleanNode(node);
}
