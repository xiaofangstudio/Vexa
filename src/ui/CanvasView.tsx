/** 画布：指针交互 + 直接重绘。视口状态由外层持有，这里只算坐标与手势。 */
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent as RPointerEvent } from "react";
import { anchorAt, type Artboard, type Paint, type PathNode, type Pt, type Stroke, type VexaDoc } from "../core/types";
import { addNode, dragAnchor, dragHandle, ellipsePath, findAnchor, findSegment, insertAnchorOnSegment, newId, rectPath, removeNode } from "../core/docOps";
import { shapeFromDrag } from "../core/shapes";
import { translateNode, scaleNodes, rotateNodesAround, splitPathAtPoint, segmentPoint, smoothPathNear, makeSmoothLimits, freehandAnchors, type SmoothLimit } from "../core/vectorOps";
import { boxOfPoints, nodeBox, unionBox, type Box } from "../core/geom";
import { gradAxis, gradHandlePoints, paintStops, toLinearGradient } from "../core/paint";
import { erasePathNode } from "../core/eraser";
import { nearestOnNode, normalizeWidthPoints, removeWidthPoint, setWidthPoint, widthHandles } from "../core/width";
import { pickTop, boxSelect, groupBox } from "../engine/pick";
import { hitHandle, resizeAnchor, type HandleId } from "../engine/handles";
import { renderScene, type PenState, type RenderState, type ToolId } from "../engine/render";
import { screenToDoc, zoomAt, type View } from "../engine/view";
import type { DocStore } from "../stores/docStore";
import "./CanvasView.css";

interface Props {
  doc: VexaDoc;
  version: number;
  tool: ToolId;
  selected: string[];
  view: View;
  store: DocStore;
  spaceHeld: boolean;
  newFill: Paint;
  newStroke: Stroke;
  shapeOpts?: { radius?: number; sides?: number; points?: number; inner?: number };
  /** 橡皮直径（屏幕 CSS px） */
  eraserRadius?: number;
  /** 画板辅助网格 */
  grid?: boolean;
  /** 拖动吸附整像素 */
  snap?: boolean;
  /** 空画板提示，null 表示不显示 */
  emptyHint?: string | null;
  /** 当前画板 */
  activeBoardId?: string;
  onSelect: (ids: string[]) => void;
  /** 吸管：把取到的填充/描边设为当前绘图样式 */
  onSamplePaint?: (fill: Paint | null, stroke: Stroke | null) => void;
  onView: (v: View) => void;
  onCursor: (p: Pt | null) => void;
  onSize: (w: number, h: number) => void;
  onBoardIndex: (i: number) => void;
  /** 右键：在屏幕坐标处打开对象菜单 */
  onContext?: (x: number, y: number) => void;
}

type Drag =
  | { kind: "move"; before: string; last: Pt; ids: string[] }  | { kind: "marquee"; start: Pt }
  | { kind: "pan"; startScreen: Pt; startView: View }
  | { kind: "anchor"; nodeId: string; si: number; ai: number; part: "anchor" | "hIn" | "hOut"; before: string; last: Pt }
  | { kind: "create"; shape: "rect" | "ellipse" | "roundrect" | "polygon" | "star"; start: Pt; id: string; before: string }
  | { kind: "resize"; before: string; ids: string[]; startBox: Box; anchor: Pt; handle: HandleId }
  | { kind: "rotate"; before: string; ids: string[]; center: Pt; startAngle: number; applied: number }
  | { kind: "pen"; before: string }
  | { kind: "line"; before: string; id: string; start: Pt }
  | { kind: "pencil"; before: string; id: string; points: Pt[]; last: Pt }
  | { kind: "width"; before: string; id: string; t: number; side: "left" | "right" | "both"; normal: Pt; center: Pt; base: number }
  | { kind: "gradient"; before: string; start: Pt; ids: string[] }
  | { kind: "grad-stop"; before: string; id: string; index: number; box: Box; axis: { x1: number; y1: number; x2: number; y2: number } }
  | { kind: "eraser"; before: string; points: Pt[]; last: Pt; r: number; targets: string[] }
  | { kind: "smooth"; before: string; last: Pt; limits: Map<string, SmoothLimit> }
  | { kind: "board-move"; before: string; last: Pt; index: number }
  | { kind: "board-resize"; before: string; index: number; orig: Artboard; handle: HandleId }
  | { kind: "board-create"; before: string; start: Pt; index: number };

const boardCursor = (h: HandleId): string =>
  h === "n" || h === "s" ? "ns-resize" : h === "e" || h === "w" ? "ew-resize" : h === "nw" || h === "se" ? "nwse-resize" : "nesw-resize";

function pointsAlong(a: Pt, b: Pt, step: number): Pt[] {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.max(1, Math.ceil(dist / Math.max(2, step)));
  const out: Pt[] = [];
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

export default function CanvasView(props: Props) {
  const { doc, version, tool, selected, view, store, spaceHeld } = props;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const dragRef = useRef<Drag | null>(null);
  const marqueeRef = useRef<Box | null>(null);
  const hoverRef = useRef<string | null>(null);
  const penRef = useRef<PenState | null>(null);
  const eraserRef = useRef<RenderState["eraser"]>(null);
  const widthHoverRef = useRef<RenderState["widthHover"]>(null);
  const gradientHoverRef = useRef<RenderState["gradientHover"]>(null);
  const guidesRef = useRef<RenderState["snapGuides"]>([]);
  const propsRef = useRef(props);
   const rafRef = useRef(0);
  const viewRef = useRef<View>(view);
  const wheelCommitRef = useRef<number | undefined>(undefined);
  propsRef.current = props;
  viewRef.current = view;

  const drawNow = useCallback(() => {
    const cv = canvasRef.current;
    const s = sizeRef.current;
    if (!cv || !s.w) return;
    const p = propsRef.current;
    const state: RenderState = {
      selected: p.selected,
      tool: p.tool,
      pen: penRef.current,
      marquee: marqueeRef.current,
      hoverId: hoverRef.current,
      snapGuides: guidesRef.current,
      showGrid: p.grid !== false,
      emptyHint: p.emptyHint ?? null,
      activeBoardId: p.activeBoardId,
      eraser: eraserRef.current,
      widthHover: widthHoverRef.current,
      gradientHover: gradientHoverRef.current,
    };
    renderScene(cv, p.doc, viewRef.current, state, s.dpr, { w: s.w, h: s.h });
  }, []);

  // 指针高频移动时合并到一帧画一次，避免一移动就全场景重绘
  const draw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      drawNow();
    });
  }, [drawNow]);

  /** 高频平移 / 缩放：只改视口对象并重绘画布，不惊动 React 壳层。 */
  const applyView = useCallback(
    (next: View) => {
      const v = viewRef.current;
      v.zoom = next.zoom;
      v.panX = next.panX;
      v.panY = next.panY;
      draw();
    },
    [draw],
  );

  const commitView = useCallback(() => {
    window.clearTimeout(wheelCommitRef.current);
    wheelCommitRef.current = window.setTimeout(() => {
      propsRef.current.onView({ ...viewRef.current });
    }, 120);
  }, []);

  const commitViewNow = useCallback(() => {
    window.clearTimeout(wheelCommitRef.current);
    propsRef.current.onView({ ...viewRef.current });
  }, []);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    window.clearTimeout(wheelCommitRef.current);
  }, []);

  // 尺寸自适应
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const r = wrap.getBoundingClientRect();
      const dpr = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
      sizeRef.current = { w: r.width, h: r.height, dpr };
      const cv = canvasRef.current;
      if (cv) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      propsRef.current.onSize(r.width, r.height);
      draw();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw]);

  // 任何状态变化都重绘
  useEffect(() => {
    draw();
  }, [draw, doc, version, view, selected, tool, props.grid, props.snap, props.emptyHint, props.activeBoardId]);

  // 拖拽 / 连续编辑走 live：这里直接收通知重绘，不依赖父组件版本号。
  useEffect(() => store.subscribeCanvas(draw), [store.subscribeCanvas, draw]);

  useEffect(() => {
    hoverRef.current = null;
    widthHoverRef.current = null;
    gradientHoverRef.current = null;
  }, [tool]);

  // 滚轮：Ctrl 缩放、其余平移
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.0016);
        applyView(zoomAt(viewRef.current, sx, sy, viewRef.current.zoom * factor));
      } else {
        applyView({
          ...viewRef.current,
          panX: viewRef.current.panX - e.deltaX,
          panY: viewRef.current.panY - e.deltaY,
        });
      }
      commitView();
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [applyView, commitView]);

  // 离开时清掉光标坐标
  useEffect(() => {
    return () => propsRef.current.onCursor(null);
  }, []);

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };

  const docPt = (e: { clientX: number; clientY: number }): Pt => {
    const s = local(e);
    return screenToDoc(propsRef.current.view, s.x, s.y);
  };

  const tol = () => 5 / propsRef.current.view.zoom;

  const hitAnchor = (ids: string[], p: Pt) => {
    const t = tol();
    for (const id of ids) {
      const n = propsRef.current.doc.nodes[id];
      if (!n || n.kind !== "path") continue;
      const hit = findAnchor(n, p.x, p.y, Math.max(3 / propsRef.current.view.zoom, t));
      if (hit) return { node: n, ...hit };
    }
    return null;
  };

  /* ---------------- 钢笔 ---------------- */

  const penCommit = () => {
    const pen = penRef.current;
    penRef.current = null;
    if (!pen || pen.anchors.length < 2) {
      draw();
      return;
    }
    const anchors = pen.anchors.map((a) => ({ ...a }));
    const fill = { ...propsRef.current.newFill };
    store.commit((doc2) => {
      const id = newId(doc2);
      const node: PathNode = {
        kind: "path",
        id,
        name: "路径",
        subpaths: [{ anchors, closed: pen.closed }],
        fill,
        stroke: { ...propsRef.current.newStroke },
        opacity: 1,
        visible: true,
        locked: false,
      };
      addNode(doc2, node);
    });
    draw();
  };

  /* ---------------- 指针 ---------------- */

  // 钢笔：回车结束开放路径，Esc 取消当前未落地的路径
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (propsRef.current.tool !== "pen" || !penRef.current) return;
      if (e.key === "Enter") {
        penRef.current.closed = false;
        penCommit();
      } else if (e.key === "Escape") {
        penRef.current = null;
        draw();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draw]);

  // 切走钢笔时丢弃未完成的预览
  useEffect(() => {
    if (tool !== "pen" && penRef.current) {
      penRef.current = null;
      draw();
    }
  }, [tool, draw]);

  /** 选区包围盒：组用 groupBox 递归。 */
  const boxOfIds = (ids: string[], d = propsRef.current.doc): Box | null => {
    let box: Box | null = null;
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      box = unionBox(box, n.kind === "group" ? groupBox(d, n) ?? nodeBox(n) : nodeBox(n));
    }
    return box;
  };

  /** 宽度工具：找最近的可调描边路径。 */
  const widthTargetAt = (d: VexaDoc, p: Pt, zoom: number) => {
    let best: { id: string; node: PathNode; t: number; point: Pt; tangent: Pt; dist: number } | null = null;
    for (const id of Object.keys(d.nodes)) {
      const n = d.nodes[id];
      if (n.kind !== "path" || !n.visible || n.locked) continue;
      if (n.stroke.kind === "none" || n.stroke.width <= 0) continue;
      const hit = nearestOnNode(n, p);
      if (!hit) continue;
      const maxF = normalizeWidthPoints(n.stroke.widthPoints).reduce((m, q) => Math.max(m, q.left, q.right), 1);
      const tol = 8 / zoom + n.stroke.width * maxF / 2;
      if (hit.distance > tol) continue;
      if (!best || hit.distance < best.dist) {
        best = { id, node: n, t: hit.t, point: hit.point, tangent: hit.tangent, dist: hit.distance };
      }
    }
    return best;
  };

  /** 宽度工具：命中已有宽度点的左侧 / 右侧手柄或中心。 */
  const widthHandleAt = (n: PathNode, p: Pt, zoom: number) => {
    let best: { t: number; side: "left" | "right" | "both"; normal: Pt; center: Pt; dist: number } | null = null;
    for (const h of widthHandles(n)) {
      for (const [side, q] of [["left", h.left], ["right", h.right]] as const) {
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d <= 8 / zoom && (!best || d < best.dist)) {
          best = { t: h.t, side, normal: h.normal, center: h.center, dist: d };
        }
      }
      const dc = Math.hypot(p.x - h.center.x, p.y - h.center.y);
      if (dc <= 6 / zoom && (!best || dc < best.dist)) {
        best = { t: h.t, side: "both", normal: h.normal, center: h.center, dist: dc };
      }
    }
    return best;
  };

  const gradientHandleAt = (n: PathNode, p: Pt, zoom: number) => {
    if (!(n.fill.kind === "linear" || n.fill.kind === "radial") || !n.fill.grad) return null;
    const box = nodeBox(n);
    const axis = gradAxis(n.fill, box);
    if (!axis) return null;
    let best: { index: number; box: Box; axis: { x1: number; y1: number; x2: number; y2: number }; dist: number } | null = null;
    for (const [index, q] of gradHandlePoints(n.fill, box).entries()) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d <= 8 / zoom && (!best || d < best.dist)) best = { index, box, axis, dist: d };
    }
    return best;
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button === 1 || e.button === 2) return;
    const p = docPt(e);
    const prev = propsRef.current;
    wrapRef.current?.setPointerCapture(e.pointerId);
    if (spaceHeld || prev.tool === "hand") {
      dragRef.current = { kind: "pan", startScreen: local(e), startView: { ...viewRef.current } };
      return;
    }

    if (prev.tool === "zoom") {
      const s = local(e);
      const z = e.altKey ? 1 / 1.5 : 1.5;
      applyView(zoomAt(viewRef.current, s.x, s.y, viewRef.current.zoom * z));
      commitView();
      return;
    }

    if (prev.tool === "pen") {
      const pen = penRef.current ?? { nodeId: null, anchors: [], closed: false, hover: p };
      if (pen.anchors.length >= 2) {
        const first = pen.anchors[0];
        if (Math.hypot(first.x - p.x, first.y - p.y) < 7 / prev.view.zoom) {
          pen.closed = true;
          penRef.current = pen;
          dragRef.current = { kind: "pen", before: store.snapshot() };
          penCommit();
          return;
        }
      }
      pen.anchors.push({ ...anchorAt(p.x, p.y), smooth: false });
      penRef.current = pen;
      dragRef.current = { kind: "pen", before: store.snapshot() };
      draw();
      return;
    }

    if (prev.tool === "line" || prev.tool === "pencil") {
      const before = store.snapshot();
      const id = `n${doc.seq}`;
      const stroke: Stroke = { ...prev.newStroke };
      if (stroke.kind === "none") {
        stroke.kind = "solid";
        stroke.width = Math.max(1, stroke.width);
      }
      store.live((d) => {
        d.seq += 1;
        const node: PathNode = {
          kind: "path",
          id,
          name: prev.tool === "line" ? "直线" : "铅笔路径",
          subpaths: [{ anchors: [anchorAt(p.x, p.y)], closed: false }],
          fill: { kind: "none", color: "#000000", opacity: 1 },
          stroke,
          opacity: 1,
          visible: true,
          locked: false,
        };
        if (prev.tool === "line") node.subpaths[0].anchors.push(anchorAt(p.x, p.y));
        d.nodes[id] = node;
        d.root.push(id);
      });
      dragRef.current = prev.tool === "line"
        ? { kind: "line", before, id, start: p }
        : { kind: "pencil", before, id, points: [p], last: p };
      prev.onSelect([id]);
      return;
    }

    if (prev.tool === "width") {
      const zoom = prev.view.zoom;
      const target = widthTargetAt(prev.doc, p, zoom);
      if (!target) {
        prev.onSelect([]);
        return;
      }
      const handle = widthHandleAt(target.node, p, zoom);
      const normal = handle ? handle.normal : { x: target.tangent.y, y: -target.tangent.x };
      const center = handle ? handle.center : target.point;
      const t = handle ? handle.t : target.t;
      let side: "left" | "right" | "both" = handle ? handle.side : "both";
      if (!handle) {
        const off = (p.x - center.x) * normal.x + (p.y - center.y) * normal.y;
        if (Math.abs(off) > 3 / zoom) side = off > 0 ? "left" : "right";
      }
      dragRef.current = {
        kind: "width",
        before: store.snapshot(),
        id: target.id,
        t,
        side,
        normal,
        center,
        base: Math.max(0.01, target.node.stroke.width),
      };
      widthHoverRef.current = null;
      prev.onSelect([target.id]);
      draw();
      return;
    }

    if (prev.tool === "scissors") {
      const tol = 8 / prev.view.zoom;
      let bestId = "";
      let bestSi = 0;
      let bestSeg = 0;
      let bestT = 0;
      let bestD = Infinity;
      for (const n of Object.values(prev.doc.nodes)) {
        if (n.kind !== "path" || !n.visible || n.locked) continue;
        for (let si = 0; si < n.subpaths.length; si++) {
          const sub = n.subpaths[si];
          const count = sub.anchors.length;
          if (!sub.closed && count < 2) continue;
          const segs = sub.closed ? count : count - 1;
          for (let seg = 0; seg < segs; seg++) {
            const a = sub.anchors[seg];
            const b = sub.anchors[(seg + 1) % count];
            let nearT = 0;
            let nearD = Infinity;
            const steps = 18;
            for (let k = 0; k <= steps; k++) {
              const t = k / steps;
              const q = segmentPoint(a, b, t);
              const d = Math.hypot(q.x - p.x, q.y - p.y);
              if (d < nearD) { nearD = d; nearT = t; }
            }
            // 在采样最优点附近再做一轮三分细化，点在线段中段也能切准。
            let lo = Math.max(0, nearT - 1 / steps);
            let hi = Math.min(1, nearT + 1 / steps);
            for (let it = 0; it < 14; it++) {
              const m1 = lo + (hi - lo) / 3;
              const m2 = hi - (hi - lo) / 3;
              const q1 = segmentPoint(a, b, m1);
              const q2 = segmentPoint(a, b, m2);
              const d1 = Math.hypot(q1.x - p.x, q1.y - p.y);
              const d2 = Math.hypot(q2.x - p.x, q2.y - p.y);
              if (d1 < d2) hi = m2; else lo = m1;
            }
            const t = (lo + hi) / 2;
            const q = segmentPoint(a, b, t);
            const d = Math.hypot(q.x - p.x, q.y - p.y);
            if (d <= tol && d < bestD) {
              bestId = n.id;
              bestSi = si;
              bestSeg = seg;
              bestT = t;
              bestD = d;
            }
          }
        }
      }
      if (bestId) {
        store.commit((d) => {
          splitPathAtPoint(d, bestId, bestSi, bestSeg, bestT);
        });
        prev.onSelect([bestId]);
      }
      return;
    }

    if (prev.tool === "smooth") {
      const before = store.snapshot();
      const limits = makeSmoothLimits(prev.doc, 16 / prev.view.zoom);
      store.live((d) => smoothPathNear(d, [p], 16 / prev.view.zoom, 0.34, limits));
      dragRef.current = { kind: "smooth", before, last: p, limits };
      return;
    }

    if (prev.tool === "artboard") {
      const active = prev.doc.artboards.find((b) => b.id === prev.activeBoardId) ?? prev.doc.artboards[0];
      if (active) {
        const hit = hitHandle(active, prev.view.zoom, p);
        if (hit && hit.kind === "resize") {
          const index = prev.doc.artboards.findIndex((b) => b.id === active.id);
          dragRef.current = { kind: "board-resize", before: store.snapshot(), index, orig: { ...active }, handle: hit.id };
          return;
        }
      }
      const under = [...prev.doc.artboards].reverse().find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
      if (under) {
        const index = prev.doc.artboards.findIndex((b) => b.id === under.id);
        prev.onBoardIndex(index);
        dragRef.current = { kind: "board-move", before: store.snapshot(), last: p, index };
        return;
      }
      const before = store.snapshot();
      const index = prev.doc.artboards.length;
      const bg = active?.bg || "#ffffff";
      store.live((d) => {
        d.artboards.push({
          id: newId(d, "ab"),
          name: `画板 ${d.artboards.length + 1}`,
          x: Math.round(p.x * 2) / 2,
          y: Math.round(p.y * 2) / 2,
          w: 1,
          h: 1,
          bg,
        });
      });
      prev.onBoardIndex(index);
      dragRef.current = { kind: "board-create", before, start: p, index };
      return;
    }

    if (prev.tool === "rect" || prev.tool === "ellipse" || prev.tool === "roundrect" || prev.tool === "polygon" || prev.tool === "star") {
      const before = store.snapshot();
      const shape = prev.tool;
      const id = `${doc.seq}`;
      store.live((d) => {
        d.seq += 1;
        const nid = `n${id}`;
        const node =
          shape === "rect"
            ? rectPath(nid, "矩形", p.x, p.y, 0, 0)
            : shape === "ellipse"
              ? ellipsePath(nid, "椭圆", p.x, p.y, 0, 0)
              : shapeFromDrag(shape, nid, p.x, p.y, p.x, p.y, prev.shapeOpts);
        node.fill = { ...propsRef.current.newFill };
        node.stroke = { ...propsRef.current.newStroke };
        addNode(d, node);
      });
      dragRef.current = { kind: "create", shape, start: p, id: `n${id}`, before };
      return;
    }

    if (prev.tool === "text") {
      const fill = { ...prev.newFill };
      const id = `t${doc.seq}`;
      store.commit((d2) => {
        d2.seq += 1;
        d2.nodes[id] = {
          kind: "text",
          id,
          name: "文本",
          x: p.x,
          y: p.y,
          text: "输入文字",
          size: 28,
          font: "Microsoft YaHei",
          fill,
          opacity: 1,
          visible: true,
          locked: false,
        };
        d2.root.push(id);
      });
      prev.onSelect([id]);
      return;
    }

    if (prev.tool === "eyedropper") {
      const hitId = pickTop(prev.doc, p, 4, true);
      if (!hitId) {
        if (!prev.selected.length) prev.onSelect([]);
        return;
      }
      const src = prev.doc.nodes[hitId];
      if (!src || (src.kind !== "path" && src.kind !== "text")) {
        if (!prev.selected.length) prev.onSelect([]);
        return;
      }
      const fill: Paint | null = { ...src.fill };
      const stroke: Stroke | null = src.kind === "path" ? { ...src.stroke } : null;
      const tstyle = src.kind === "text"
        ? {
            font: src.font, size: src.size, bold: src.bold, italic: src.italic,
            lineHeight: src.lineHeight, tracking: src.tracking, align: src.align,
            hScale: src.hScale, vScale: src.vScale, baseline: src.baseline,
          }
        : null;
      propsRef.current.onSamplePaint?.(fill, stroke);
      const targets = prev.selected.length ? prev.selected : [hitId];
      if (prev.selected.length) {
        store.commit((d) => {
          const apply = (nid: string) => {
            const n = d.nodes[nid];
            if (!n) return;
            if (n.kind === "group") {
              n.children.forEach(apply);
              return;
            }
            if (n.kind === "path") {
              n.fill = { ...fill };
              if (stroke) n.stroke = { ...stroke };
            } else if (n.kind === "text") {
              n.fill = { ...fill };
              if (tstyle) Object.assign(n, tstyle);
            }
          };
          targets.forEach(apply);
        });
      } else {
        prev.onSelect([hitId]);
      }
      draw();
      return;
    }

    if (prev.tool === "gradient") {
      const selectedNode = prev.selected.length === 1 ? prev.doc.nodes[prev.selected[0]] : undefined;
      if (selectedNode?.kind === "path") {
        const hit = gradientHandleAt(selectedNode, p, prev.view.zoom);
        if (hit) {
          gradientHoverRef.current = { nodeId: selectedNode.id, index: hit.index };
          dragRef.current = {
            kind: "grad-stop",
            before: store.snapshot(),
            id: selectedNode.id,
            index: hit.index,
            box: hit.box,
            axis: hit.axis,
          };
          draw();
          return;
        }
      }
      const collect = (id: string): string[] => {
        const n = prev.doc.nodes[id];
        if (!n) return [];
        if (n.kind === "path") return [id];
        if (n.kind === "group") return n.children.flatMap(collect);
        return [];
      };
      let ids = prev.selected.flatMap(collect);
      if (!ids.length) {
        const hit = pickTop(prev.doc, p, 4, true);
        if (hit) ids = collect(hit);
      }
      if (!ids.length) return;
      const before = store.snapshot();
      store.live((d) => {
        for (const id of ids) {
          const n = d.nodes[id];
          if (!n || n.kind !== "path") continue;
          n.fill = toLinearGradient(n.fill);
          if (n.fill.grad) n.fill.grad.angle = 90;
        }
      });
      dragRef.current = { kind: "gradient", before, start: p, ids };
      if (!prev.selected.length) prev.onSelect(ids);
      return;
    }

    if (prev.tool === "eraser") {
      const collect = (id: string): string[] => {
        const n = prev.doc.nodes[id];
        if (!n) return [];
        if (n.kind === "path") return [id];
        if (n.kind === "group") return n.children.flatMap(collect);
        return [];
      };
      const selectedPaths = prev.selected.flatMap(collect);
      const targets = selectedPaths.length
        ? selectedPaths
        : Object.values(prev.doc.nodes).filter((n) => n.kind === "path" && n.visible && !n.locked).map((n) => n.id);
      if (!targets.length) return;
      const before = store.snapshot();
      const r = (prev.eraserRadius ?? 24) / 2 / prev.view.zoom;
      eraserRef.current = { points: [p], r };
      dragRef.current = { kind: "eraser", before, points: [p], last: p, r, targets };
      draw();
      return;
    }

    if (prev.tool === "direct") {
      const hit = hitAnchor(prev.selected, p);
      if (hit) {
        const before = store.snapshot();
        dragRef.current = {
          kind: "anchor",
          nodeId: hit.node.id,
          si: hit.si,
          ai: hit.ai,
          part: hit.part,
          before,
          last: p,
        };
        return;
      }
    }

    // 选择工具：先命中变换手柄（旋转柄 / 八个缩放柄），再命中对象
    if (prev.tool === "select" && prev.selected.length) {
      const box = boxOfIds(prev.selected);
      const hit = box ? hitHandle(box, prev.view.zoom, p) : null;
      if (box && hit) {
        const before = store.snapshot();
        if (hit.kind === "rotate") {
          dragRef.current = {
            kind: "rotate",
            before,
            ids: prev.selected,
            center: { x: box.x + box.w / 2, y: box.y + box.h / 2 },
            startAngle: (Math.atan2(p.y - (box.y + box.h / 2), p.x - (box.x + box.w / 2)) * 180) / Math.PI,
            applied: 0,
          };
        } else {
          dragRef.current = {
            kind: "resize",
            before,
            ids: prev.selected,
            startBox: box,
            anchor: resizeAnchor(box, hit.id),
            handle: hit.id,
          };
        }
        return;
      }
    }

    // 选择 / 直接选择：先命中
    const hitId = pickTop(prev.doc, p, 4, prev.tool === "direct");
    if (hitId) {
      let ids = prev.selected;
      if (e.shiftKey) {
        ids = ids.includes(hitId) ? ids.filter((i) => i !== hitId) : [...ids, hitId];
      } else if (!ids.includes(hitId)) {
        ids = [hitId];
      }
      prev.onSelect(ids);
      dragRef.current = { kind: "move", before: store.snapshot(), last: p, ids };
      return;
    }

    if (!e.shiftKey) prev.onSelect([]);
    dragRef.current = { kind: "marquee", start: p };
    marqueeRef.current = { x: p.x, y: p.y, w: 0, h: 0 };
    draw();
  };

  /** 移动时的吸附：画板与其它对象的边、中线。 */
  const snapMove = (ids: string[], dx: number, dy: number) => {
    const d = propsRef.current.doc;
    const zoom = propsRef.current.view.zoom;
    let box: Box | null = null;
    for (const id of ids) {
      const n = d.nodes[id];
      if (!n) continue;
      box = unionBox(box, n.kind === "group" ? groupBox(d, n) ?? nodeBox(n) : nodeBox(n));
    }
    if (!box) return { dx, dy };
    const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
    const xs: number[] = [];
    const ys: number[] = [];
    for (const b of d.artboards) {
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    for (const id of d.root) {
      if (ids.includes(id)) continue;
      const n = d.nodes[id];
      if (!n) continue;
      const b = n.kind === "group" ? groupBox(d, n) ?? nodeBox(n) : nodeBox(n);
      xs.push(b.x, b.x + b.w / 2, b.x + b.w);
      ys.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    const th = 6 / zoom;
    let adjX = 0;
    let adjY = 0;
    let gx: number | null = null;
    let gy: number | null = null;
    for (const edge of [moved.x, moved.x + moved.w / 2, moved.x + moved.w]) {
      for (const t of xs) {
        if (Math.abs(edge - t) < th) {
          adjX = t - edge;
          gx = t;
          break;
        }
      }
      if (gx !== null) break;
    }
    for (const edge of [moved.y, moved.y + moved.h / 2, moved.y + moved.h]) {
      for (const t of ys) {
        if (Math.abs(edge - t) < th) {
          adjY = t - edge;
          gy = t;
          break;
        }
      }
      if (gy !== null) break;
    }
    guidesRef.current = [];
    if (gx !== null) {
      const b = d.artboards[0];
      guidesRef.current.push({ x1: gx, y1: b.y - 40, x2: gx, y2: b.y + b.h + 40 });
    }
    if (gy !== null) {
      const b = d.artboards[0];
      guidesRef.current.push({ x1: b.x - 40, y1: gy, x2: b.x + b.w + 40, y2: gy });
    }
    return { dx: dx + adjX, dy: dy + adjY };
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const p = docPt(e);
    propsRef.current.onCursor(p);
    const drag = dragRef.current;

    if (!drag) {
      const current = propsRef.current;
      if (current.tool === "gradient") {
        const selectedNode = current.selected.length === 1 ? current.doc.nodes[current.selected[0]] : undefined;
        const hit = selectedNode?.kind === "path" ? gradientHandleAt(selectedNode, p, current.view.zoom) : null;
        if (hit) {
          gradientHoverRef.current = { nodeId: selectedNode!.id, index: hit.index };
          if (wrapRef.current) wrapRef.current.style.cursor = "grab";
          draw();
          return;
        }
        if (gradientHoverRef.current) {
          gradientHoverRef.current = null;
          draw();
        }
      }
      if (current.tool === "width") {
        const hit = widthTargetAt(current.doc, p, current.view.zoom);
        widthHoverRef.current = hit ? { nodeId: hit.id, t: hit.t } : null;
        if (wrapRef.current) wrapRef.current.style.cursor = hit ? "crosshair" : "";
        draw();
        return;
      }
      if (current.tool === "artboard") {
        const active = current.doc.artboards.find((b) => b.id === current.activeBoardId) ?? current.doc.artboards[0];
        let cursor = "crosshair";
        if (active) {
          const hit = hitHandle(active, current.view.zoom, p);
          if (hit && hit.kind === "resize") cursor = boardCursor(hit.id);
          else if (current.doc.artboards.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h)) cursor = "move";
        }
        if (wrapRef.current) wrapRef.current.style.cursor = cursor;
      } else if (wrapRef.current) {
        wrapRef.current.style.cursor = current.tool === "smooth" || current.tool === "scissors" || current.tool === "line" || current.tool === "pencil" || current.tool === "eyedropper" || current.tool === "gradient" || current.tool === "eraser" ? "crosshair" : "";
      }
      if (current.tool === "artboard" || current.tool === "smooth") {
        draw();
        return;
      }
      if (current.tool === "pen" && penRef.current) {
        penRef.current.hover = p;
        draw();
        return;
      }
      const hit = pickTop(current.doc, p, 4, current.tool === "direct");
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        draw();
      }
      return;
    }

    if (drag.kind === "pan") {
      const s = local(e);
      applyView({
        ...drag.startView,
        panX: drag.startView.panX + (s.x - drag.startScreen.x),
        panY: drag.startView.panY + (s.y - drag.startScreen.y),
      });
      return;
    }

    if (drag.kind === "marquee") {
      const x = Math.min(drag.start.x, p.x);
      const y = Math.min(drag.start.y, p.y);
      marqueeRef.current = { x, y, w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) };
      draw();
      return;
    }

    if (drag.kind === "pen") {
      const pen = penRef.current;
      if (!pen) return;
      const last = pen.anchors[pen.anchors.length - 1];
      if (!last) return;
      last.hOut = { x: p.x, y: p.y };
      last.hIn = { x: 2 * last.x - p.x, y: 2 * last.y - p.y };
      last.smooth = true;
      draw();
      return;
    }

    if (drag.kind === "width") {
      const nx = drag.normal.x;
      const ny = drag.normal.y;
      let off = (p.x - drag.center.x) * nx + (p.y - drag.center.y) * ny;
      if (drag.side === "right") off = -off;
      if (drag.side === "both") off = Math.abs(off);
      const factor = Math.max(0.01, (off * 2) / drag.base);
      store.live((d) => {
        const n = d.nodes[drag.id];
        if (!n || n.kind !== "path") return;
        n.stroke.widthPoints = setWidthPoint(n.stroke.widthPoints, drag.t, drag.side, factor);
      });
      draw();
      return;
    }

    if (drag.kind === "grad-stop") {
      const dx = drag.axis.x2 - drag.axis.x1;
      const dy = drag.axis.y2 - drag.axis.y1;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 1e-6) return;
      const u = ((p.x - drag.axis.x1) * dx + (p.y - drag.axis.y1) * dy) / len2;
      store.live((d) => {
        const n = d.nodes[drag.id];
        if (!n || n.kind !== "path" || !n.fill.grad) return;
        const stops = paintStops(n.fill);
        if (!stops[drag.index]) return;
        const prev = drag.index > 0 ? stops[drag.index - 1].offset : 0;
        const next = drag.index < stops.length - 1 ? stops[drag.index + 1].offset : 1;
        const lo = Math.min(1, Math.max(0, drag.index > 0 ? prev + 0.002 : 0));
        const hi = Math.min(1, Math.max(0, drag.index < stops.length - 1 ? next - 0.002 : 1));
        const offset = lo <= hi ? Math.min(hi, Math.max(lo, u)) : stops[drag.index].offset;
        stops[drag.index] = { ...stops[drag.index], offset };
        n.fill = { ...n.fill, color: stops[0]?.color ?? n.fill.color, grad: { angle: n.fill.grad.angle, stops } };
      });
      draw();
      return;
    }

    if (drag.kind === "gradient") {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (Math.hypot(dx, dy) < 2) return;
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (e.shiftKey) angle = Math.round(angle / 15) * 15;
      else angle = Math.round(angle * 10) / 10;
      store.live((d) => {
        for (const id of drag.ids) {
          const n = d.nodes[id];
          if (n && n.kind === "path" && n.fill.kind === "linear" && n.fill.grad) n.fill.grad.angle = angle;
        }
      });
      draw();
      return;
    }

    if (drag.kind === "eraser") {
      const zoom = propsRef.current.view.zoom;
      const samples = pointsAlong(drag.last, p, 4 / zoom);
      drag.points.push(...samples);
      drag.last = p;
      eraserRef.current = { points: drag.points, r: drag.r };
      draw();
      return;
    }

    if (drag.kind === "line") {
      let q = p;
      if (e.shiftKey) {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        const ang = Math.atan2(dy, dx);
        const step = Math.PI / 12;
        const snapped = Math.round(ang / step) * step;
        const len = Math.hypot(dx, dy);
        q = { x: drag.start.x + Math.cos(snapped) * len, y: drag.start.y + Math.sin(snapped) * len };
      }
      store.live((d) => {
        const n = d.nodes[drag.id];
        if (!n || n.kind !== "path") return;
        const sub = n.subpaths[0];
        if (sub.anchors[1]) sub.anchors[1] = anchorAt(q.x, q.y);
      });
      draw();
      return;
    }

    if (drag.kind === "pencil") {
      const step = 2 / propsRef.current.view.zoom;
      if (Math.hypot(p.x - drag.last.x, p.y - drag.last.y) >= step) {
        drag.points.push(p);
        drag.last = p;
        store.live((d) => {
          const n = d.nodes[drag.id];
          if (!n || n.kind !== "path") return;
          n.subpaths[0].anchors = drag.points.map((q) => anchorAt(q.x, q.y));
        });
      }
      draw();
      return;
    }

    if (drag.kind === "smooth") {
      const zoom = propsRef.current.view.zoom;
      const samples = pointsAlong(drag.last, p, 8 / zoom);
      store.live((d) => smoothPathNear(d, samples, 16 / zoom, 0.34, drag.limits));
      drag.last = p;
      draw();
      return;
    }

    if (drag.kind === "board-move") {
      const dx = p.x - drag.last.x;
      const dy = p.y - drag.last.y;
      drag.last = p;
      store.live((d) => {
        const b = d.artboards[drag.index];
        if (!b) return;
        b.x = Math.round((b.x + dx) * 2) / 2;
        b.y = Math.round((b.y + dy) * 2) / 2;
      });
      draw();
      return;
    }

    if (drag.kind === "board-resize") {
      let x = drag.orig.x;
      let y = drag.orig.y;
      let w = drag.orig.w;
      let h = drag.orig.h;
      const hs = drag.handle;
      if (hs.includes("w")) {
        x = p.x;
        w = drag.orig.x + drag.orig.w - p.x;
      } else if (hs.includes("e")) {
        w = p.x - drag.orig.x;
      }
      if (hs.includes("n")) {
        y = p.y;
        h = drag.orig.y + drag.orig.h - p.y;
      } else if (hs.includes("s")) {
        h = p.y - drag.orig.y;
      }
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      w = Math.max(4, w);
      h = Math.max(4, h);
      if (hs.includes("w")) x = drag.orig.x + drag.orig.w - w;
      if (hs.includes("n")) y = drag.orig.y + drag.orig.h - h;
      x = Math.round(x * 2) / 2;
      y = Math.round(y * 2) / 2;
      w = Math.round(w * 2) / 2;
      h = Math.round(h * 2) / 2;
      store.live((d) => {
        const b = d.artboards[drag.index];
        if (!b) return;
        b.x = x;
        b.y = y;
        b.w = Math.max(4, w);
        b.h = Math.max(4, h);
      });
      draw();
      return;
    }

    if (drag.kind === "board-create") {
      let x1 = p.x;
      let y1 = p.y;
      if (e.shiftKey) {
        const s = Math.max(Math.abs(p.x - drag.start.x), Math.abs(p.y - drag.start.y));
        x1 = drag.start.x + Math.sign(p.x - drag.start.x || 1) * s;
        y1 = drag.start.y + Math.sign(p.y - drag.start.y || 1) * s;
      }
      const x = Math.min(drag.start.x, x1);
      const y = Math.min(drag.start.y, y1);
      const w = Math.abs(x1 - drag.start.x);
      const h = Math.abs(y1 - drag.start.y);
      store.live((d) => {
        const b = d.artboards[drag.index];
        if (!b) return;
        b.x = Math.round(x * 2) / 2;
        b.y = Math.round(y * 2) / 2;
        b.w = Math.max(1, w);
        b.h = Math.max(1, h);
      });
      draw();
      return;
    }

    if (drag.kind === "create") {
      const shift = e.shiftKey;
      store.live((d) => {
        const n = d.nodes[drag.id];
        if (!n || n.kind !== "path") return;
        if (drag.shape === "rect") {
          let w = p.x - drag.start.x;
          let h = p.y - drag.start.y;
          if (shift) {
            const s = Math.max(Math.abs(w), Math.abs(h));
            w = Math.sign(w || 1) * s;
            h = Math.sign(h || 1) * s;
          }
          const node = rectPath(n.id, n.name, Math.min(drag.start.x, drag.start.x + w), Math.min(drag.start.y, drag.start.y + h), Math.abs(w), Math.abs(h));
          n.subpaths = node.subpaths;
        } else if (drag.shape === "ellipse") {
          let rx = Math.abs(p.x - drag.start.x) / 2;
          let ry = Math.abs(p.y - drag.start.y) / 2;
          if (shift) rx = ry = Math.max(rx, ry);
          const cx = (drag.start.x + p.x) / 2;
          const cy = (drag.start.y + p.y) / 2;
          const node = ellipsePath(n.id, n.name, cx, cy, rx, ry);
          n.subpaths = node.subpaths;
        } else {
          // 圆角矩形 / 多边形 / 星形：按拖拽框实时重算
          let x1 = p.x;
          let y1 = p.y;
          if (shift) {
            const s = Math.max(Math.abs(p.x - drag.start.x), Math.abs(p.y - drag.start.y));
            x1 = drag.start.x + Math.sign(p.x - drag.start.x || 1) * s;
            y1 = drag.start.y + Math.sign(p.y - drag.start.y || 1) * s;
          }
          const node = shapeFromDrag(drag.shape, n.id, drag.start.x, drag.start.y, x1, y1, propsRef.current.shapeOpts);
          n.subpaths = node.subpaths;
        }
      });
      draw();
      return;
    }

    if (drag.kind === "anchor") {
      const dx = p.x - drag.last.x;
      const dy = p.y - drag.last.y;
      drag.last = p;
      store.live((d) => {
        const n = d.nodes[drag.nodeId];
        if (!n || n.kind !== "path") return;
        if (drag.part === "anchor") dragAnchor(n, drag.si, drag.ai, dx, dy);
        else dragHandle(n, drag.si, drag.ai, drag.part, p.x, p.y);
      });
      draw();
      return;
    }

    if (drag.kind === "resize") {
      const cur = boxOfIds(drag.ids);
      if (!cur) return;
      const a = drag.anchor;
      const h = drag.handle;
      const usesX = h.includes("e") || h.includes("w");
      const usesY = h.includes("n") || h.includes("s");
      let w = usesX ? Math.max(1, Math.abs(p.x - a.x)) : drag.startBox.w;
      let hh = usesY ? Math.max(1, Math.abs(p.y - a.y)) : drag.startBox.h;
      const ratio = drag.startBox.w / (drag.startBox.h || 1);
      if (e.shiftKey) {
        if (usesX && !usesY) hh = w / ratio;
        else if (usesY && !usesX) w = hh * ratio;
        else hh = w / ratio;
      }
      const sx = usesX ? w / Math.max(0.01, cur.w) : 1;
      const sy = usesY ? hh / Math.max(0.01, cur.h) : 1;
      if (Math.abs(sx - 1) < 1e-4 && Math.abs(sy - 1) < 1e-4) return;
      store.live((d) => scaleNodes(d, drag.ids, cur, sx, sy, a));
      draw();
      return;
    }

    if (drag.kind === "rotate") {
      const total =
        (Math.atan2(p.y - drag.center.y, p.x - drag.center.x) * 180) / Math.PI - drag.startAngle;
      const snapped = e.shiftKey ? Math.round(total / 15) * 15 : total;
      const delta = snapped - drag.applied;
      if (Math.abs(delta) < 1e-4) return;
      drag.applied = snapped;
      store.live((d) => rotateNodesAround(d, drag.ids, drag.center.x, drag.center.y, delta));
      draw();
      return;
    }

    // move
    if (drag.kind === "move") {
      const raw = { dx: p.x - drag.last.x, dy: p.y - drag.last.y };
      if (Math.abs(raw.dx) < 1e-6 && Math.abs(raw.dy) < 1e-6) return;
      const adj = propsRef.current.snap === false ? raw : snapMove(drag.ids, raw.dx, raw.dy);
      let mx = adj.dx;
      let my = adj.dy;
      if (e.shiftKey) {
        if (Math.abs(mx) > Math.abs(my)) my = 0;
        else mx = 0;
      }
      drag.last = p;
      store.live((d) => {
        for (const id of drag.ids) {
          const n = d.nodes[id];
          if (n) translateNode(d, n, mx, my);
        }
      });
      draw();
    }
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    guidesRef.current = [];
    if (!drag) return;

    if (drag.kind === "pan") {
      commitViewNow();
      draw();
      return;
    }

    if (drag.kind === "marquee") {
      const box = marqueeRef.current;
      marqueeRef.current = null;
      if (box && box.w > 2 && box.h > 2) propsRef.current.onSelect(boxSelect(propsRef.current.doc, box));
      else propsRef.current.onSelect([]);
      draw();
      return;
    }

    if (drag.kind === "create") {
      const d = propsRef.current.doc;
      const n = d.nodes[drag.id];
      if (n && n.kind === "path") {
        const b = boxOfPoints(n.subpaths.flatMap((s) => s.anchors));
        if (b.w < 2 && b.h < 2) {
          store.live((dd) => removeNode(dd, drag.id));
        } else {
          store.finish(drag.before);
          propsRef.current.onSelect([drag.id]);
        }
      }
      return;
    }

    if (drag.kind === "eraser") {
      eraserRef.current = null;
      const last = drag.points[drag.points.length - 1];
      if (last && Math.hypot(last.x - drag.last.x, last.y - drag.last.y) > 1) drag.points.push(drag.last);
      let changed = false;
      store.live((d) => {
        for (const id of drag.targets) {
          const n = d.nodes[id];
          if (!n || n.kind !== "path") continue;
          const result = erasePathNode(n, drag.points, drag.r);
          if (result === null) continue;
          changed = true;
          if (!result.length) {
            removeNode(d, id);
          } else {
            n.subpaths = result;
          }
        }
      });
      if (changed) store.finish(drag.before);
      draw();
      return;
    }

    if (drag.kind === "width") {
      store.finish(drag.before);
      widthHoverRef.current = null;
      draw();
      return;
    }

    if (drag.kind === "grad-stop") {
      store.finish(drag.before);
      gradientHoverRef.current = null;
      draw();
      return;
    }

    if (drag.kind === "gradient") {
      store.finish(drag.before);
      draw();
      return;
    }

    if (drag.kind === "line") {
      const n = propsRef.current.doc.nodes[drag.id];
      const sub = n && n.kind === "path" ? n.subpaths[0] : undefined;
      const a = sub?.anchors[0];
      const b = sub?.anchors[1];
      if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) < 2) {
        store.live((d) => removeNode(d, drag.id));
      } else {
        store.finish(drag.before);
        propsRef.current.onSelect([drag.id]);
      }
      draw();
      return;
    }

    if (drag.kind === "pencil") {
      const total = drag.points.reduce((sum, q, i) => {
        const prev = drag.points[i - 1];
        return sum + (prev ? Math.hypot(q.x - prev.x, q.y - prev.y) : 0);
      }, 0);
      if (drag.points.length < 2 || total < 3) {
        store.live((d) => removeNode(d, drag.id));
      } else {
        store.live((d) => {
          const n = d.nodes[drag.id];
          if (!n || n.kind !== "path") return;
          n.subpaths[0].anchors = freehandAnchors(drag.points, 1);
        });
        store.finish(drag.before);
        propsRef.current.onSelect([drag.id]);
      }
      draw();
      return;
    }

    if (drag.kind === "smooth") {
      store.finish(drag.before);
      return;
    }

    if (drag.kind === "board-move" || drag.kind === "board-resize") {
      store.finish(drag.before);
      return;
    }

    if (drag.kind === "board-create") {
      const b = propsRef.current.doc.artboards[drag.index];
      if (!b || b.w < 6 || b.h < 6) {
        store.live((d) => {
          const at = d.artboards.findIndex((a) => a.id === b?.id);
          if (at >= 0) d.artboards.splice(at, 1);
        });
        propsRef.current.onBoardIndex(0);
      } else {
        store.finish(drag.before);
      }
      draw();
      return;
    }

    if (drag.kind === "move" || drag.kind === "anchor" || drag.kind === "resize" || drag.kind === "rotate") {
      store.finish(drag.before);
      return;
    }

    if (drag.kind === "pen") {
      // 拖出过一次手柄就不用再处理；点下来的情况继续加锚点
      void e;
      draw();
    }
  };

  const onDouble = (e: MouseEvent<HTMLDivElement>) => {
    const prev = propsRef.current;
    if (prev.tool === "width") {
      const p = docPt(e);
      const zoom = prev.view.zoom;
      const target = widthTargetAt(prev.doc, p, zoom);
      if (!target) return;
      const handle = widthHandleAt(target.node, p, zoom);
      if (handle && handle.t > 1e-4 && handle.t < 1 - 1e-4) {
        store.commit((d) => {
          const n = d.nodes[target.id];
          if (n && n.kind === "path") n.stroke.widthPoints = removeWidthPoint(n.stroke.widthPoints, handle.t);
        });
        draw();
      }
      return;
    }
    if (prev.tool !== "direct" && prev.tool !== "select") return;
    const p = docPt(e);
    for (const id of prev.selected) {
      const n = prev.doc.nodes[id];
      if (!n || n.kind !== "path") continue;
      const seg = findSegment(n, p.x, p.y, 10 / prev.view.zoom);
      if (seg) {
        store.commit((d) => {
          const nn = d.nodes[id];
          if (nn && nn.kind === "path") insertAnchorOnSegment(nn, seg.si, seg.gi, seg.t);
        });
        return;
      }
    }
  };

  const onCtx = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const prev = propsRef.current;
    if (prev.tool === "pen" && penRef.current) {
      if (penRef.current.anchors.length >= 2) penRef.current.closed = false;
      penCommit();
    }
    const p = docPt(e);
    const hit = pickTop(prev.doc, p, 3 / prev.view.zoom);
    if (hit) {
      if (!prev.selected.includes(hit)) prev.onSelect([hit]);
    } else if (prev.selected.length) {
      prev.onSelect([]);
    }
    prev.onContext?.(e.clientX, e.clientY);
  };

  const cursor =
    spaceHeld || tool === "hand"
      ? "grab"
      : tool === "pen" || tool === "line" || tool === "pencil" || tool === "width" || tool === "eyedropper" || tool === "gradient" || tool === "eraser" || tool === "scissors" || tool === "smooth" || tool === "artboard"
        ? "crosshair"
        : tool === "rect" || tool === "roundrect" || tool === "ellipse" || tool === "polygon" || tool === "star" || tool === "text"
          ? "crosshair"
          : tool === "zoom"
            ? "zoom-in"
            : "default";

  return (
    <div
      className="cv-wrap"
      ref={wrapRef}
      style={{ cursor }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={onDouble}
      onContextMenu={onCtx}
      onPointerLeave={() => {
        props.onCursor(null);
        if (widthHoverRef.current) {
          widthHoverRef.current = null;
          draw();
        }
        if (gradientHoverRef.current) {
          gradientHoverRef.current = null;
          draw();
        }
        if (wrapRef.current) wrapRef.current.style.cursor = "";
      }}
    >
      <canvas ref={canvasRef} className="cv-canvas" />
    </div>
  );
}
