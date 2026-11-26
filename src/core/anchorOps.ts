import { dragAnchor, removeNode } from "./docOps";
import type { Box } from "./geom";
import type { Anchor, AnchorRef, GroupNode, PathNode, SubPath, VexaDoc } from "./types";

export type AnchorAlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type AnchorDistributeAxis = "x" | "y";

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

/** 收集 ID（可为组）下所有可见未锁定路径的锚点，命中矩形即选中。 */
export function anchorsInBox(doc: VexaDoc, ids: string[], box: Box): AnchorRef[] {
  const out: AnchorRef[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    const n = doc.nodes[id];
    if (!n || !n.visible || n.locked) return;
    if (n.kind === "group") {
      for (const cid of n.children) visit(cid);
      return;
    }
    if (n.kind !== "path") return;
    n.subpaths.forEach((sub, si) => {
      sub.anchors.forEach((a, ai) => {
        if (a.x < box.x || a.x > box.x + box.w || a.y < box.y || a.y > box.y + box.h) return;
        out.push({ nodeId: id, si, ai });
      });
    });
  };
  for (const id of ids) visit(id);
  return out;
}

/** 删除前预检：至少一个有效、非剪切蒙版的锚点。 */
export function hasDeletableAnchors(doc: VexaDoc, refs: AnchorRef[]): boolean {
  return uniqueRefs(refs).some((r) => {
    const n = doc.nodes[r.nodeId];
    return !!n && n.kind === "path" && !clipUses(doc, n.id) && !!n.subpaths[r.si]?.anchors[r.ai];
  });
}

/** 删除选中锚点；子路径不足 2 个锚点时整条移除，路径空了就删节点并清理空祖先组。 */
export function deleteAnchors(doc: VexaDoc, refs: AnchorRef[]): number {
  const byNode = new Map<string, Map<number, Set<number>>>();
  for (const r of uniqueRefs(refs)) {
    const n = doc.nodes[r.nodeId];
    if (!n || n.kind !== "path" || clipUses(doc, n.id)) continue;
    if (!n.subpaths[r.si]?.anchors[r.ai]) continue;
    let subs = byNode.get(r.nodeId);
    if (!subs) {
      subs = new Map();
      byNode.set(r.nodeId, subs);
    }
    let ais = subs.get(r.si);
    if (!ais) {
      ais = new Set();
      subs.set(r.si, ais);
    }
    ais.add(r.ai);
  }

  let removed = 0;
  for (const [nodeId, subs] of byNode) {
    const n = doc.nodes[nodeId];
    if (!n || n.kind !== "path") continue;
    const ancestors = ancestorChain(doc, nodeId);
    const kept: SubPath[] = [];
    for (let si = 0; si < n.subpaths.length; si++) {
      const sub = n.subpaths[si];
      const ais = subs.get(si);
      if (!ais || !ais.size) {
        kept.push(sub);
        continue;
      }
      removed += ais.size;
      const next = sub.anchors.filter((_, ai) => !ais.has(ai));
      if (next.length >= 2) kept.push({ ...sub, anchors: next });
    }
    n.subpaths = kept;
    if (!n.subpaths.length) {
      removeNode(doc, nodeId);
      for (const pid of ancestors) {
        const g = doc.nodes[pid] as GroupNode | undefined;
        if (!g || g.kind !== "group" || g.children.length !== 0) break;
        removeNode(doc, pid);
      }
    }
  }
  return removed;
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

/** 沿 X 或 Y 把选中锚点等距分布：两端固定，中间按排序后的位置均分。 */
export function distributeAnchors(doc: VexaDoc, refs: AnchorRef[], axis: AnchorDistributeAxis): number {
  const plan = distributePlan(doc, refs, axis);
  if (!plan) return 0;
  let moved = 0;
  for (let i = 1; i < plan.items.length - 1; i++) {
    const { ref, a, target } = plan.items[i];
    const delta = target - a[axis];
    if (Math.abs(delta) < 1e-9) continue;
    const node = doc.nodes[ref.nodeId] as PathNode;
    dragAnchor(node, ref.si, ref.ai, axis === "x" ? delta : 0, axis === "y" ? delta : 0);
    moved++;
  }
  return moved;
}

/** 是否真的有中间锚点需要移动；用于避免空分布写撤销。 */
export function anchorsNeedDistribute(doc: VexaDoc, refs: AnchorRef[], axis: AnchorDistributeAxis): boolean {
  const plan = distributePlan(doc, refs, axis);
  if (!plan) return false;
  return plan.items.some(({ a, target }, i) => i > 0 && i < plan.items.length - 1 && Math.abs(a[axis] - target) >= 1e-9);
}

function distributePlan(
  doc: VexaDoc,
  refs: AnchorRef[],
  axis: AnchorDistributeAxis,
): { items: Array<{ ref: AnchorRef; a: Anchor; target: number }> } | null {
  const list = uniqueRefs(refs);
  if (list.length < 3) return null;
  const anchors: Array<{ ref: AnchorRef; a: Anchor }> = [];
  for (const ref of list) {
    const a = anchorOf(doc, ref);
    if (a) anchors.push({ ref, a });
  }
  if (anchors.length < 3) return null;
  anchors.sort((p, q) => p.a[axis] - q.a[axis] || refKey(p.ref).localeCompare(refKey(q.ref)));
  const start = anchors[0].a[axis];
  const end = anchors[anchors.length - 1].a[axis];
  const step = (end - start) / (anchors.length - 1);
  return {
    items: anchors.map((it, i) => ({ ...it, target: start + step * i })),
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

/** 两个开放子路径端点，可同节点，也可跨节点。 */
export function canJoinAnchors(doc: VexaDoc, refs: AnchorRef[]): boolean {
  if (refs.length !== 2) return false;
  const [r1, r2] = refs;
  if (refKey(r1) === refKey(r2)) return false;
  const n1 = doc.nodes[r1.nodeId];
  const n2 = doc.nodes[r2.nodeId];
  if (!n1 || n1.kind !== "path" || !n2 || n2.kind !== "path") return false;
  const sub1 = n1.subpaths[r1.si];
  const sub2 = n2.subpaths[r2.si];
  if (!sub1 || !sub2) return false;
  if (clipUses(doc, r1.nodeId) || clipUses(doc, r2.nodeId)) return false;
  return isEndpoint(sub1, r1.ai) && isEndpoint(sub2, r2.ai);
}

function clipUses(doc: VexaDoc, id: string): boolean {
  for (const n of Object.values(doc.nodes)) {
    if (n.kind === "group" && n.clip === id) return true;
  }
  return false;
}

/** 删除前取祖先链，删除后从最内层向外清掉空组。 */
function ancestorChain(doc: VexaDoc, id: string): string[] {
  const parents = new Map<string, string>();
  for (const n of Object.values(doc.nodes)) {
    if (n.kind !== "group") continue;
    for (const c of n.children) parents.set(c, n.id);
  }
  const out: string[] = [];
  let cur = id;
  while (true) {
    const pid = parents.get(cur);
    if (!pid) return out;
    out.push(pid);
    cur = pid;
  }
}

/**
 * 连接两个开放端点：同一子路径的首尾直接闭合；同节点不同子路径或跨节点子路径按选中端点方向接成一条开放路径。
 * 端点不重合时用直线段连接，并清掉接缝两侧多余手柄；重合时合并为一个锚点。
 * 跨节点时保留第一个节点及其样式，把第二个子路径并入；第二个节点空了就删除。
 */
export function joinAnchors(doc: VexaDoc, refs: AnchorRef[]): { ok: boolean; error?: string } {
  if (refs.length !== 2) return { ok: false, error: "请先选中两个锚点" };
  const [r1, r2] = refs;
  if (refKey(r1) === refKey(r2)) return { ok: false, error: "请选中两个不同的锚点" };
  const node1 = doc.nodes[r1.nodeId];
  const node2 = doc.nodes[r2.nodeId];
  if (!node1 || node1.kind !== "path" || !node2 || node2.kind !== "path") {
    return { ok: false, error: "选中的不是路径锚点" };
  }
  const sub1 = node1.subpaths[r1.si];
  const sub2 = node2.subpaths[r2.si];
  if (!sub1 || !sub2) return { ok: false, error: "锚点已经不存在" };
  if (sub1.closed || sub2.closed) return { ok: false, error: "闭合路径不能继续连接" };
  if (!isEndpoint(sub1, r1.ai) || !isEndpoint(sub2, r2.ai)) {
    return { ok: false, error: "只能连接开放子路径的首尾端点" };
  }
  if (clipUses(doc, r1.nodeId) || clipUses(doc, r2.nodeId)) {
    return { ok: false, error: "剪切蒙版路径不能连接" };
  }

  if (r1.si === r2.si && r1.nodeId === r2.nodeId) {
    sub1.closed = true;
    return { ok: true };
  }

  const a = sub1;
  const b = sub2;
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

  if (r1.nodeId === r2.nodeId) {
    node1.subpaths.splice(r2.si, 1);
    return { ok: true };
  }

  if (node2.subpaths.length === 1) {
    const ancestors = ancestorChain(doc, node2.id);
    removeNode(doc, node2.id);
    for (const pid of ancestors) {
      const g = doc.nodes[pid] as GroupNode | undefined;
      if (!g || g.kind !== "group" || g.children.length !== 0) break;
      removeNode(doc, pid);
    }
  } else {
    node2.subpaths.splice(r2.si, 1);
  }
  return { ok: true };
}
