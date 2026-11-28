/** 描边对齐：闭合路径的内侧/外侧描边通过内外两条环带近似，中心对齐仍走原生描边。 */
import { flatten } from "./geom";
import { offsetRingPolygon } from "./pathfx";
import type { PathNode, Pt } from "./types";

/** 只有闭合、无宽度点的普通描边才生成对齐环带；其余回退中心描边。 */
export function strokeAlignLoops(node: PathNode, stroke = node.stroke): Pt[][] | null {
  const align = stroke.align;
  if (align !== "inside" && align !== "outside") return null;
  if (stroke.kind === "none" || stroke.width <= 0) return null;
  if (stroke.widthPoints?.length) return null;
  if (!node.subpaths.length || node.subpaths.some((sub) => !sub.closed)) return null;
  const loops: Pt[][] = [];
  for (const sub of node.subpaths) {
    const pts = flatten(sub, 18);
    const ring = offsetRingPolygon(pts, align === "outside" ? stroke.width : -stroke.width);
    if (pts.length < 3 || ring.length < 3) continue;
    loops.push(pts, [...ring].reverse());
  }
  return loops.length ? loops : null;
}
