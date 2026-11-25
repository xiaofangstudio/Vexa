import { dragAnchor } from "./docOps";
import type { Anchor, AnchorRef, PathNode, SubPath, VexaDoc } from "./types";

export type AnchorAlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

const refKey = (r: AnchorRef) => `${r.nodeId}:${r.si}:${r.ai}`;

function uniqueRefs(refs: AnchorRef[]): AnchorRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const k = refKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function anchorOf(doc: VexaDoc, ref: AnchorRef): Anchor | null {
  const node = doc.nodes[ref.nodeId];
  if (!node || node.kind !== "path") return null;
  return node.subpaths[ref.si]?.anchors[ref.ai] ?? null;
}

/** 把一组锚点按包围盒左/中/右/顶/中/底对齐；手柄跟着锚点走。 */
export function alignAnchors(doc: VexaDoc, refs: AnchorRef[], mode: AnchorAlignMode): number {
  const plan = alignPlan(doc, refs, mode);
  if (!plan) return 0;
  let moved = 0;
  for (const { ref, a } of plan.anchors) {
    const dx = plan.useX ? plan.targetX - a.x : 0;
    const dy = plan.useX ? 0 : plan.targetY - a.y;
    if (dx === 0 && dy === 0) continue;
    const node = doc.nodes[ref.nodeId] as PathNode;
    dragAnchor(node, ref.si, ref.ai, dx, dy);
    moved++;
  }
  return moved;
}

/** 是否真的有锚点需要移动；用于避免“已经对齐”也写入一步撤销记录。 */
export function anchorsNeedAlign(doc: VexaDoc, refs: AnchorRef[], mode: AnchorAlignMode): boolean {
  const plan = alignPlan(doc, refs, mode);
  if (!plan) return false;
  return plan.anchors.some(({ a }) => (plan.useX ? a.x !== plan.targetX : a.y !== plan.targetY));
}

function alignPlan(
  doc: VexaDoc,
  refs: AnchorRef[],
  mode: AnchorAlignMode,
): { anchors: Array<{ ref: AnchorRef; a: Anchor }>; targetX: number; targetY: number; useX: boolean } | null {
  const list = uniqueRefs(refs);
  if (list.length < 2) return null;
  const anchors: Array<{ ref: AnchorRef; a: Anchor }> = [];
  for (const ref of list) {
    const a = anchorOf(doc, ref);
    if (a) anchors.push({ ref, a });
  }
  if (anchors.length < 2) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { a } of anchors) {
    if (a.x < minX) minX = a.x;
    if (a.x > maxX) maxX = a.x;
    if (a.y < minY) minY = a.y;
    if (a.y > maxY) maxY = a.y;
  }
  return {
    anchors,
    targetX: mode === "left" ? minX : mode === "right" ? maxX : (minX + maxX) / 2,
    targetY: mode === "top" ? minY : mode === "bottom" ? maxY : (minY + maxY) / 2,
    useX: mode === "left" || mode === "hcenter" || mode === "right",
  };
}

function isEndpoint(sub: SubPath, ai: number): boolean {
  if (sub.closed) return false;
  return ai === 0 || ai === sub.anchors.length - 1;
}

function reverseSub(sub: SubPath): void {
  sub.anchors.reverse();
  for (const a of sub.anchors) {
    const hIn = a.hIn;
    a.hIn = a.hOut;
    a.hOut = hIn;
  }
}

/** 只有两个开放子路径端点、且在同一路径节点时才可连接。 */
export function canJoinAnchors(doc: VexaDoc, refs: AnchorRef[]): boolean {
  if (refs.length !== 2) return false;
  const [r1, r2] = refs;
  if (refKey(r1) === refKey(r2)) return false;
  if (r1.nodeId !== r2.nodeId) return false;
  const node = doc.nodes[r1.nodeId];
  if (!node || node.kind !== "path") return false;
  const sub1 = node.subpaths[r1.si];
  const sub2 = node.subpaths[r2.si];
  if (!sub1 || !sub2) return false;
  if (!isEndpoint(sub1, r1.ai) || !isEndpoint(sub2, r2.ai)) return false;
  return true;
}

/**
 * 连接两个开放端点：同一子路径的首尾直接闭合；不同子路径按选中端点方向接成一条开放路径。
 * 端点不重合时用直线段连接，并清掉接缝两侧多余手柄；重合时合并为一个锚点。
 */
export function joinAnchors(doc: VexaDoc, refs: AnchorRef[]): { ok: boolean; error?: string } {
  if (refs.length !== 2) return { ok: false, error: "请先选中两个锚点" };
  const [r1, r2] = refs;
  if (refKey(r1) === refKey(r2)) return { ok: false, error: "请选中两个不同的锚点" };
  if (r1.nodeId !== r2.nodeId) return { ok: false, error: "跨路径连接暂未开放，请先把两段合并到同一路径" };
  const node = doc.nodes[r1.nodeId];
  if (!node || node.kind !== "path") return { ok: false, error: "选中的不是路径锚点" };
  const sub1 = node.subpaths[r1.si];
  const sub2 = node.subpaths[r2.si];
  if (!sub1 || !sub2) return { ok: false, error: "锚点已经不存在" };
  if (sub1.closed || sub2.closed) return { ok: false, error: "闭合路径不能继续连接" };
  if (!isEndpoint(sub1, r1.ai) || !isEndpoint(sub2, r2.ai)) return { ok: false, error: "只能连接开放子路径的首尾端点" };

  if (r1.si === r2.si) {
    sub1.closed = true;
    return { ok: true };
  }

  let a = sub1;
  let b = sub2;
  if (r1.ai === 0) reverseSub(a);
  if (r2.ai !== 0) reverseSub(b);
  const aEnd = a.anchors[a.anchors.length - 1];
  const bFirst = b.anchors[0];
  if (!aEnd || !bFirst) return { ok: false, error: "子路径为空" };
  const samePoint = Math.hypot(aEnd.x - bFirst.x, aEnd.y - bFirst.y) < 0.001;
  if (samePoint) {
    const merged: Anchor = {
      ...aEnd,
      hIn: aEnd.hIn,
      hOut: bFirst.hOut,
      smooth: aEnd.smooth && bFirst.smooth,
    };
    a.anchors = [...a.anchors.slice(0, -1), merged, ...b.anchors.slice(1)];
  } else {
    aEnd.hOut = null;
    bFirst.hIn = null;
    a.anchors = [...a.anchors, ...b.anchors];
  }
  a.closed = false;
  node.subpaths.splice(r2.si, 1);
  return { ok: true };
}
