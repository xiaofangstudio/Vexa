/** 主编辑壳：顶栏 + 文档标签 + 三栏（工具轨 / 选项栏+画布 / 面板坞）+ 状态栏。 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { zh } from "../i18n/zh";
import { addNode, newId, removeNode } from "../core/docOps";
import { booleanSubpaths, type BoolOp } from "../core/bool";
import {
  alignNodes,
  arrangeNodes,
  canGroup,
  containerOf,
  distributeNodes,
  flipNodes,
  groupNodes,
  rotateNodes,
  translateNode,
  ungroupNodes,
  type AlignMode,
  type ArrangeMode,
} from "../core/vectorOps";
import { docToSVG, svgToPathNodes } from "../core/svg";
import { offsetPathNode, outlineStrokeNode, smoothPathNode } from "../core/pathfx";
import { nodeBox, unionBox } from "../core/geom";
import { groupBox } from "../engine/pick";
import { noPaint, noStroke, solid, BLEND_MODES, type Artboard, type BlendMode, type GroupNode, type Node, type Paint, type PathNode, type Pt, type Stroke, type TextNode, type VexaDoc } from "../core/types";
import { insertGradStop, paintPreview, paintStops } from "../core/paint";
import { fitBoard, zoomAt, type View } from "../engine/view";
import type { ToolId } from "../engine/render";
import { useDocStore } from "../stores/docStore";
import type { VexaSettings } from "../stores/settings";
import { exportPNG, fileNameOf, pickExport, pickImage, pickSVGOpen, pickVexSave, readImageDataURL, readTextFile, traceImage, writeTextFile, type TraceOptions } from "../engine/io";
import { serializeVex } from "../core/vex";
import CanvasView from "./CanvasView";
import Icon, { type IconName } from "./Icon";
import MenuBar, { type MenuGroup } from "./MenuBar";
import AboutDialog from "./AboutDialog";
import "./EditorShell.css";

const BLEND_LABELS: Record<BlendMode, string> = {
  normal: "正常",
  multiply: "正片叠底",
  screen: "滤色",
  overlay: "叠加",
  darken: "变暗",
  lighten: "变亮",
  "color-dodge": "颜色减淡",
  "color-burn": "颜色加深",
  "hard-light": "强光",
  "soft-light": "柔光",
  difference: "差值",
  exclusion: "排除",
  hue: "色相",
  saturation: "饱和度",
  color: "颜色",
  luminosity: "明度",
};

interface Props {
  initialDoc: VexaDoc;
  initialPath: string | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  settings: VexaSettings;
  onSettings: () => void;
  onSettingsChange: (patch: Partial<VexaSettings>) => void;
  closing?: boolean;
  onExit: () => void;
  onOpenRequest: () => void;
  onSaved: (path: string, doc: VexaDoc) => void;
  pendingTrace: string | null;
}

const TOOLS: Array<{ id: ToolId; icon: IconName; label: string; key: string }> = [
  { id: "select", icon: "select", label: zh.tool.select, key: "V" },
  { id: "direct", icon: "direct", label: zh.tool.direct, key: "A" },
  { id: "pen", icon: "pen", label: zh.tool.pen, key: "P" },
  { id: "line", icon: "line", label: zh.tool.line, key: "\\" },
  { id: "pencil", icon: "pencil", label: zh.tool.pencil, key: "N" },
  { id: "width", icon: "width", label: zh.tool.width, key: "W" },
  { id: "eraser", icon: "eraser", label: zh.tool.eraser, key: "E" },
  { id: "eyedropper", icon: "eyedropper", label: zh.tool.eyedropper, key: "I" },
  { id: "gradient", icon: "gradient", label: zh.tool.gradient, key: "G" },
  { id: "scissors", icon: "scissors", label: zh.tool.scissors, key: "C" },
  { id: "smooth", icon: "smooth", label: zh.tool.smooth, key: "M" },
  { id: "rect", icon: "rect", label: zh.tool.rect, key: "R" },
  { id: "roundrect", icon: "roundrect", label: zh.tool.roundrect, key: "U" },
  { id: "ellipse", icon: "ellipse", label: zh.tool.ellipse, key: "L" },
  { id: "polygon", icon: "polygon", label: zh.tool.polygon, key: "Y" },
  { id: "star", icon: "star", label: zh.tool.star, key: "S" },
  { id: "text", icon: "text", label: zh.tool.text, key: "T" },
  { id: "artboard", icon: "artboard", label: zh.tool.artboard, key: "⇧O" },
  { id: "hand", icon: "hand", label: zh.tool.hand, key: "H" },
  { id: "zoom", icon: "zoom", label: zh.tool.zoom, key: "Z" },
];

/** 工具按任务分组；双列排布，避免一排 20 个图标没有语义。 */
const TOOL_GROUPS: Array<{ label: string; ids: ToolId[] }> = [
  { label: "选择", ids: ["select", "direct"] },
  { label: "路径与笔", ids: ["pen", "line", "pencil", "width"] },
  { label: "修形", ids: ["eraser", "scissors", "smooth"] },
  { label: "颜色", ids: ["eyedropper", "gradient"] },
  { label: "形状", ids: ["rect", "roundrect", "ellipse", "polygon", "star", "text"] },
  { label: "画板", ids: ["artboard"] },
  { label: "视图", ids: ["hand", "zoom"] },
];

const PAINT_TOOLS: ToolId[] = ["pen", "rect", "roundrect", "ellipse", "polygon", "star", "text", "gradient"];
const STROKE_ONLY_TOOLS: ToolId[] = ["line", "pencil"];

const FONTS: Array<[label: string, value: string]> = [
  ["微软雅黑", "Microsoft YaHei"],
  ["宋体", "SimSun"],
  ["黑体", "SimHei"],
  ["楷体", "KaiTi"],
  ["仿宋", "FangSong"],
  ["Arial", "Arial"],
  ["Georgia", "Georgia"],
  ["Times New Roman", "Times New Roman"],
  ["Courier New", "Courier New"],
  ["Segoe UI", "Segoe UI"],
];

const PRESET_OPTS: Array<{ id: TraceOptions["preset"]; label: string; def: Omit<TraceOptions, "preset"> }> = [
  { id: "photo", label: zh.trace.presets[0], def: { colors: 6, detail: 3, smooth: 55, speckle: 10 } },
  { id: "illustration", label: zh.trace.presets[1], def: { colors: 7, detail: 5, smooth: 60, speckle: 4 } },
  { id: "lineart", label: zh.trace.presets[2], def: { colors: 2, detail: 4, smooth: 70, speckle: 6 } },
  { id: "pixel", label: zh.trace.presets[3], def: { colors: 8, detail: 1, smooth: 20, speckle: 0 } },
];

function bboxOf(doc: VexaDoc, ids: string[]) {
  let box = null as ReturnType<typeof unionBox> | null;
  for (const id of ids) {
    const n = doc.nodes[id];
    if (!n) continue;
    const b = n.kind === "group" ? groupBox(doc, n) : nodeBox(n);
    if (b) box = unionBox(box, b);
  }
  return box;
}

function translate(doc: VexaDoc, id: string, dx: number, dy: number): void {
  const n = doc.nodes[id];
  if (n) translateNode(doc, n, dx, dy);
}

function scaleInBox(doc: VexaDoc, id: string, box: { x: number; y: number; w: number; h: number }, sx: number, sy: number): void {
  const n = doc.nodes[id];
  if (!n) return;
  if (n.kind === "path") {
    for (const sub of n.subpaths) {
      for (const a of sub.anchors) {
        a.x = box.x + (a.x - box.x) * sx;
        a.y = box.y + (a.y - box.y) * sy;
        if (a.hIn) { a.hIn.x = box.x + (a.hIn.x - box.x) * sx; a.hIn.y = box.y + (a.hIn.y - box.y) * sy; }
        if (a.hOut) { a.hOut.x = box.x + (a.hOut.x - box.x) * sx; a.hOut.y = box.y + (a.hOut.y - box.y) * sy; }
      }
    }
  } else if (n.kind === "image") {
    const x = box.x + (n.x - box.x) * sx;
    const y = box.y + (n.y - box.y) * sy;
    n.x = x;
    n.y = y;
    n.w *= sx;
    n.h *= sy;
  } else if (n.kind === "text") {
    n.x = box.x + (n.x - box.x) * sx;
    n.y = box.y + (n.y - box.y) * sy;
  }
}

/** 把描摹结果等比放进画板中央。 */
function fitNodes(nodes: Node[], board: Artboard): void {
  let box = null as ReturnType<typeof unionBox> | null;
  for (const n of nodes) box = unionBox(box, nodeBox(n));
  if (!box || box.w < 1 || box.h < 1) return;
  const s = Math.min((board.w * 0.86) / box.w, (board.h * 0.86) / box.h);
  const offX = board.x + (board.w - box.w * s) / 2 - box.x * s;
  const offY = board.y + (board.h - box.h * s) / 2 - box.y * s;
  for (const n of nodes) {
    if (n.kind !== "path") continue;
    for (const sub of n.subpaths) {
      for (const a of sub.anchors) {
        a.x = a.x * s + offX;
        a.y = a.y * s + offY;
        if (a.hIn) { a.hIn.x = a.hIn.x * s + offX; a.hIn.y = a.hIn.y * s + offY; }
        if (a.hOut) { a.hOut.x = a.hOut.x * s + offX; a.hOut.y = a.hOut.y * s + offY; }
      }
    }
  }
}

export default function EditorShell(props: Props) {
  const store = useDocStore(props.initialDoc);
  const doc = store.doc;
  const [boardIndex, setBoardIndex] = useState(0);
  const board = doc.artboards[boardIndex] ?? doc.artboards[0];

  const [tool, setTool] = useState<ToolId>("select");
  const [selected, setSelected] = useState<string[]>([]);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View | null>(null);
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [space, setSpace] = useState(false);
  const [tab, setTab] = useState<"props" | "layers">("props");
  const [dockOpen, setDockOpen] = useState(true);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxShift, setCtxShift] = useState(0);
  const ctxRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [about, setAbout] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [tracePath, setTracePath] = useState<string | null>(props.pendingTrace);
  const [fileName, setFileName] = useState<string | null>(props.initialPath);
  const [savedVersion, setSavedVersion] = useState(0);
  const [newFill, setNewFill] = useState<Paint>(solid("#0f76d6"));
  const [newStroke, setNewStroke] = useState<Stroke>(noStroke("#17171c"));
  const [shapeOpts, setShapeOpts] = useState({ radius: 12, sides: 5, points: 5, inner: 0.5 });
  const [eraserDia, setEraserDia] = useState(24);

  const toastTimer = useRef<number | undefined>(undefined);
  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  // 画布尺寸就绪后做一次适合画板
  useEffect(() => {
    if (vp.w > 0 && !view) setView(fitBoard(board, vp.w, vp.h));
  }, [vp, view, board]);

  // 切画板时自动适合该板（画板工具在画布上切板不触发，避免拖动时视口跳）
  const boardIdRef = useRef("");
  const noFitBoardIdRef = useRef<string | null>(null);
  useEffect(() => {
    const suppress = board.id === noFitBoardIdRef.current;
    if (suppress) noFitBoardIdRef.current = null;
    if (vp.w > 0 && boardIdRef.current && boardIdRef.current !== board.id && !suppress) {
      setView(fitBoard(board, vp.w, vp.h));
    }
    boardIdRef.current = board.id;
  }, [board, vp]);

  const safeSelected = useMemo(() => selected.filter((id) => !!doc.nodes[id]), [selected, doc, store.version]);
  const widthSel = useMemo(
    () => safeSelected.map((id) => doc.nodes[id]).find((n): n is PathNode => !!n && n.kind === "path" && n.stroke.kind !== "none"),
    [safeSelected, doc, store.version],
  );
  const textNodes = useMemo(
    () => safeSelected.map((id) => doc.nodes[id]).filter((n): n is TextNode => !!n && n.kind === "text"),
    [safeSelected, doc, store.version],
  );
  const selBox = useMemo(() => bboxOf(doc, safeSelected), [doc, safeSelected, store.version]);
  const patchText = useCallback(
    (fn: (n: TextNode) => void) => {
      if (!safeSelected.length) return;
      store.commit((d) => {
        for (const id of safeSelected) {
          const n = d.nodes[id];
          if (n?.kind === "text") fn(n);
        }
      });
    },
    [safeSelected, store],
  );
  const toggleTextStyle = useCallback(
    (field: "bold" | "italic") => {
      const all = textNodes.length > 0 && textNodes.every((n) => !!n[field]);
      patchText((n) => {
        n[field] = !all;
      });
    },
    [patchText, textNodes],
  );
  const setTextAlign = useCallback(
    (align: "left" | "center" | "right") => patchText((n) => { n.align = align; }),
    [patchText],
  );
  const stepTextSize = useCallback(
    (delta: number) => patchText((n) => { n.size = Math.max(1, Math.min(400, n.size + delta)); }),
    [patchText],
  );
  const selectAllText = useCallback(() => {
    setSelected(Object.values(doc.nodes).filter((n) => n.kind === "text").map((n) => n.id));
  }, [doc, store.version]);
  const setBoardFromCanvas = useCallback((i: number) => {
    noFitBoardIdRef.current = doc.artboards[i]?.id ?? null;
    setBoardIndex(i);
  }, [doc.artboards]);

  // 面板开合或窗口缩放时，保持视口中心对应的文档位置不变
  const prevVpRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const prev = prevVpRef.current;
    prevVpRef.current = vp;
    if (!view || !prev.w || !vp.w) return;
    const dx = (vp.w - prev.w) / 2;
    const dy = (vp.h - prev.h) / 2;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    setView((v) => (v ? { ...v, panX: v.panX + dx, panY: v.panY + dy } : v));
  }, [vp, view]);

  // 撤销后清理失效的选中项
  useEffect(() => {
    if (safeSelected.length !== selected.length) setSelected(safeSelected);
  }, [safeSelected, selected]);

  const dirty = store.version !== savedVersion;

  /* ---------------- 文件 ---------------- */

  const doSave = useCallback(
    async (asNew: boolean) => {
      try {
        let path = fileName;
        if (asNew || !path) path = await pickVexSave(doc.name || "未命名");
        if (!path) return;
        await writeTextFile(path, serializeVex(doc));
        setFileName(path);
        setSavedVersion(store.version);
        props.onSaved(path, doc);
        say(zh.vex.saved.replace("{path}", path));
      } catch (e) {
        say(zh.vex.saveFail.replace("{msg}", String((e as Error).message ?? e)));
      }
    },
    [doc, fileName, props, say, store.version],
  );

  // 自动保存：只在已保存过路径、且有改动时悄悄写盘
  useEffect(() => {
    const sec = props.settings.autoSave;
    if (!sec || !fileName) return;
    const timer = window.setInterval(() => {
      if (store.version !== savedVersion) void doSave(false);
    }, sec * 1000);
    return () => window.clearInterval(timer);
  }, [props.settings.autoSave, fileName, savedVersion, store.version, doSave]);

  const doExport = useCallback(    async (fmt: "svg" | "png", scale: number) => {
      try {
        const name = fileName ? fileNameOf(fileName) : doc.name;
        const path = await pickExport(name, fmt);
        if (!path) return;
        if (fmt === "svg") await writeTextFile(path, docToSVG(doc, { boardId: board.id }));
        else await exportPNG(doc, path, scale, board.id);
        setExportOpen(false);
        say(zh.export.done.replace("{path}", path));
      } catch (e) {
        say(zh.export.fail.replace("{msg}", String((e as Error).message ?? e)));
      }
    },
    [board, doc, fileName, say],
  );

  const doPlaceImage = useCallback(
    async (path?: string) => {
      try {
        const p = path ?? (await pickImage());
        if (!p) return;
        const img = await readImageDataURL(p);
        const b = board;
        const s = Math.min((b.w * 0.9) / img.w, (b.h * 0.9) / img.h, 1);
        const nw = img.w * s;
        const nh = img.h * s;
        const x = b.x + (b.w - nw) / 2;
        const y = b.y + (b.h - nh) / 2;
        store.commit((d) => {
          const id = newId(d, "im");
          d.nodes[id] = {
            kind: "image",
            id,
            name: "图片",
            src: img.dataUrl,
            x,
            y,
            w: nw,
            h: nh,
            opacity: 1,
            visible: true,
            locked: false,
          };
          d.root.push(id);
        });
        say("已置入图片");
      } catch (e) {
        say(`置入失败：${String((e as Error).message ?? e)}`);
      }
    },
    [board, say, store],
  );

  const doTrace = useCallback(
    async (path: string, opts: TraceOptions) => {
      try {
        const svg = await traceImage(path, opts);
        const { nodes, nextSeq } = svgToPathNodes(svg, doc.seq);
        if (!nodes.length) {
          say("没有识别到可描摹的形状");
          return false;
        }
        fitNodes(nodes, board);
        store.commit((d) => {
          d.seq = nextSeq;
          for (const n of nodes) addNode(d, n);
        });
        setSelected(nodes.map((n) => n.id));
        setTracePath(null);
        say(zh.trace.done.replace("{n}", String(nodes.length)));
        return true;
      } catch (e) {
        say(zh.trace.fail.replace("{msg}", String((e as Error).message ?? e)));
        return false;
      }
    },
    [board, doc.seq, say, store],
  );

  /* ---------------- 编辑动作 ---------------- */

  const doImportSVG = useCallback(async () => {
    const path = await pickSVGOpen();
    if (!path) return;
    try {
      const svg = await readTextFile(path);
      const { nodes, nextSeq } = svgToPathNodes(svg, doc.seq);
      if (!nodes.length) {
        say("没有在 SVG 里识别到可导入的图形");
        return;
      }
      fitNodes(nodes, board);
      store.commit((d) => {
        d.seq = nextSeq;
        for (const n of nodes) addNode(d, n);
      });
      setSelected(nodes.map((n) => n.id));
      say(`已导入 ${nodes.length} 个图形（矩形/圆/多边形/路径，支持基本变换）`);
    } catch (e) {
      say(`SVG 导入失败：${String((e as Error).message ?? e)}`);
    }
  }, [board, doc.seq, say, store]);

  const deleteSelected = useCallback(() => {
    if (!safeSelected.length) return;
    store.commit((d) => {
      for (const id of safeSelected) removeNode(d, id);
    });
    setSelected([]);
  }, [safeSelected, store]);

  const duplicate = useCallback(() => {
    if (!safeSelected.length) return;
    const ids: string[] = [];
    store.commit((d) => {
      for (const id of safeSelected) {
        const n = d.nodes[id];
        if (!n) continue;
        const copy = JSON.parse(JSON.stringify(n)) as Node;
        const nid = newId(d, n.kind === "text" ? "t" : n.kind === "image" ? "im" : "n");
        copy.id = nid;
        d.nodes[nid] = copy;
        d.root.push(nid);
        if (copy.kind === "path") {
          for (const sub of copy.subpaths) for (const a of sub.anchors) {
            a.x += 12;
            a.y += 12;
            if (a.hIn) { a.hIn.x += 12; a.hIn.y += 12; }
            if (a.hOut) { a.hOut.x += 12; a.hOut.y += 12; }
          }
        } else if (copy.kind === "text" || copy.kind === "image") {
          copy.x += 12;
          copy.y += 12;
        }
        ids.push(nid);
      }
    });
    setSelected(ids);
  }, [safeSelected, store]);

  const clipboardRef = useRef<{ nodes: Record<string, Node>; tops: string[] } | null>(null);

  const gather = (src: Record<string, Node>, id: string, out: Record<string, Node>) => {
    const n = src[id];
    if (!n || out[id]) return;
    out[id] = n;
    if (n.kind === "group") for (const c of n.children) gather(src, c, out);
  };

  const doCopy = useCallback(
    (cut: boolean) => {
      if (!safeSelected.length) return;
      const nodes: Record<string, Node> = {};
      for (const id of safeSelected) gather(doc.nodes, id, nodes);
      clipboardRef.current = { nodes: JSON.parse(JSON.stringify(nodes)), tops: [...safeSelected] };
      say(`已复制 ${safeSelected.length} 个对象`);
      if (cut) {
        store.commit((d) => {
          for (const id of safeSelected) removeNode(d, id);
        });
        setSelected([]);
      }
    },
    [doc.nodes, safeSelected, say, store],
  );

  const doPaste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || !clip.tops.length) return;
    const ids: string[] = [];
    store.commit((d) => {
      const map = new Map<string, string>();
      const clone = (id: string): string | null => {
        if (map.has(id)) return map.get(id)!;
        const src = clip.nodes[id];
        if (!src) return null;
        const copy = JSON.parse(JSON.stringify(src)) as Node;
        const nid = newId(d, copy.kind === "text" ? "t" : copy.kind === "image" ? "im" : copy.kind === "group" ? "g" : "n");
        map.set(id, nid);
        copy.id = nid;
        if (copy.kind === "group") {
          const kids: string[] = [];
          for (const c of copy.children) {
            const k = clone(c);
            if (k) kids.push(k);
          }
          copy.children = kids;
        }
        d.nodes[nid] = copy;
        return nid;
      };
      for (const id of clip.tops) {
        const nid = clone(id);
        if (!nid) continue;
        d.root.push(nid);
        const n = d.nodes[nid];
        if (n) translateNode(d, n, 16, 16);
        ids.push(nid);
      }
    });
    setSelected(ids);
    say(`已粘贴 ${ids.length} 个对象`);
  }, [say, store]);

  const arrange = useCallback(
    (mode: ArrangeMode) => {
      if (!safeSelected.length) return;
      store.commit((d) => arrangeNodes(d, safeSelected, mode));
    },
    [safeSelected, store],
  );

  const alignSel = useCallback(
    (mode: AlignMode) => {
      if (!safeSelected.length) return;
      store.commit((d) => alignNodes(d, safeSelected, mode));
    },
    [safeSelected, store],
  );

  const distributeSel = useCallback(
    (axis: "h" | "v") => {
      if (safeSelected.length < 3) {
        say("分布需要至少 3 个对象");
        return;
      }
      store.commit((d) => distributeNodes(d, safeSelected, axis));
    },
    [safeSelected, store, say],
  );

  const rotateSel = useCallback(
    (deg: number) => {
      if (!safeSelected.length) return;
      store.commit((d) => rotateNodes(d, safeSelected, deg));
    },
    [safeSelected, store],
  );

  const flipSel = useCallback(
    (axis: "h" | "v") => {
      if (!safeSelected.length) return;
      store.commit((d) => flipNodes(d, safeSelected, axis));
    },
    [safeSelected, store],
  );

  const groupSel = useCallback(() => {
    if (!canGroup(doc, safeSelected)) {
      say("请选中同一层级的两个以上对象");
      return;
    }
    let gid: string | null = null;
    store.commit((d) => {
      gid = groupNodes(d, safeSelected);
    });
    if (gid) setSelected([gid]);
  }, [doc, safeSelected, store, say]);

  const ungroupSel = useCallback(() => {
    const groups = safeSelected.filter((id) => doc.nodes[id]?.kind === "group");
    if (!groups.length) return;
    let freed: string[] = [];
    store.commit((d) => {
      freed = ungroupNodes(d, groups);
    });
    setSelected(freed);
  }, [doc, safeSelected, store]);

  /** 建立剪切蒙版：选中最上层对象作为裁切轮廓，其余同层对象被裁。 */
  const makeMask = useCallback(() => {
    if (safeSelected.length < 2) {
      say("建立剪切蒙版需要两个以上对象");
      return;
    }
    if (!canGroup(doc, safeSelected)) {
      say("请选中同一层级的对象");
      return;
    }
    const host = containerOf(doc, safeSelected[0]);
    if (!host) return;
    const top = safeSelected.reduce((a, b) => (host.list.indexOf(a) > host.list.indexOf(b) ? a : b));
    const mask = doc.nodes[top];
    if (!mask || mask.kind !== "path") {
      say("最上层对象需要是路径（形状），才能当裁切轮廓");
      return;
    }
    let gid: string | null = null;
    store.commit((d) => {
      gid = groupNodes(d, safeSelected);
      if (gid) {
        const g = d.nodes[gid] as GroupNode;
        g.clip = top;
        g.name = "剪切蒙版";
      }
    });
    if (gid) setSelected([gid]);
  }, [doc, safeSelected, store, say]);

  const releaseMask = useCallback(() => {
    const masks = safeSelected.filter((id) => {
      const n = doc.nodes[id];
      return n?.kind === "group" && !!n.clip;
    });
    if (!masks.length) return;
    let freed: string[] = [];
    store.commit((d) => {
      for (const id of masks) {
        const g = d.nodes[id];
        if (g && g.kind === "group") delete g.clip;
      }
      freed = ungroupNodes(d, masks);
    });
    setSelected(freed);
  }, [doc, safeSelected, store]);

  /** 对选中的路径批量做偏移 / 描边转轮廓 / 平滑。 */
  const pathFxSel = useCallback(
    (kind: "offset" | "outline" | "smooth", amt = 6) => {
      const ids = safeSelected.filter((id) => doc.nodes[id]?.kind === "path");
      if (!ids.length) {
        say("请选中一条路径");
        return;
      }
      let done = 0;
      store.commit((d) => {
        for (const id of ids) {
          const n = d.nodes[id];
          if (!n || n.kind !== "path") continue;
          const next =
            kind === "offset" ? offsetPathNode(n, amt) : kind === "outline" ? outlineStrokeNode(n) : smoothPathNode(n);
          if (!next) continue;
          n.subpaths = next.subpaths;
          n.fill = next.fill;
          n.stroke = next.stroke;
          n.name = next.name;
          done++;
        }
      });
      if (!done) say("没有可转换的描边，先设置描边宽度");
      else say(kind === "outline" ? `已把 ${done} 条描边转为轮廓` : kind === "offset" ? `已偏移 ${done} 条路径` : `已平滑 ${done} 条路径`);
    },
    [doc, safeSelected, store, say],
  );

  const boolSel = useCallback(
    (op: BoolOp) => {
      const paths = safeSelected
        .map((id) => doc.nodes[id])
        .filter((n): n is PathNode => !!n && n.kind === "path");
      if (paths.length < 2) {
        say("路径查找器需要两个以上路径");
        return;
      }
      const sp = booleanSubpaths(paths, op);
      if (!sp.length) {
        say("结果为空（两个形状可能没有重叠）");
        return;
      }
      const base = paths[0];
      let nid = "";
      store.commit((d) => {
        const host = containerOf(d, base.id);
        const parentId = host?.parent ?? "";
        const at = host ? host.list.indexOf(base.id) : -1;
        for (const p of paths) removeNode(d, p.id);
        nid = newId(d, "n");
        d.nodes[nid] = {
          kind: "path",
          id: nid,
          name: "路径",
          subpaths: sp,
          fill: { ...base.fill },
          stroke: { ...base.stroke },
          opacity: 1,
          visible: true,
          locked: false,
        };
        const list = parentId ? ((d.nodes[parentId] as GroupNode | undefined)?.children ?? d.root) : d.root;
        list.splice(at < 0 ? list.length : Math.min(at, list.length), 0, nid);
      });
      setSelected([nid]);
    },
    [doc, safeSelected, store, say],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!safeSelected.length) return;
      store.commit((d) => {
        for (const id of safeSelected) {
          const n = d.nodes[id];
          if (n) translateNode(d, n, dx, dy);
        }
      });
    },
    [safeSelected, store],
  );

  /** 锁定 / 解锁（锁定后不可选中、不可框选）。 */
  const toggleLock = useCallback(() => {
    if (!safeSelected.length) return;
    store.commit((d) => {
      const anyUnlocked = safeSelected.some((id) => !d.nodes[id]?.locked);
      for (const id of safeSelected) {
        const n = d.nodes[id];
        if (n) n.locked = anyUnlocked;
      }
    });
    if (safeSelected.some((id) => !doc.nodes[id]?.locked)) setSelected([]);
  }, [doc, safeSelected, store]);

  const unlockAll = useCallback(() => {
    store.commit((d) => {
      for (const n of Object.values(d.nodes)) n.locked = false;
    });
    say("已解锁全部对象");
  }, [store, say]);

  /** 隐藏 / 显示。 */
  const toggleVisible = useCallback(() => {
    if (!safeSelected.length) return;
    store.commit((d) => {
      const anyVisible = safeSelected.some((id) => d.nodes[id]?.visible);
      for (const id of safeSelected) {
        const n = d.nodes[id];
        if (n) n.visible = !anyVisible;
      }
    });
    if (safeSelected.some((id) => doc.nodes[id]?.visible)) setSelected([]);
  }, [doc, safeSelected, store]);

  const showAll = useCallback(() => {
    store.commit((d) => {
      for (const n of Object.values(d.nodes)) n.visible = true;
    });
    say("已显示全部对象");
  }, [store, say]);

  const zoomBy = useCallback(
    (f: number) => {
      const v = view ?? { zoom: 1, panX: 0, panY: 0 };
      if (!vp.w) return;
      setView(zoomAt(v, vp.w / 2, vp.h / 2, v.zoom * f));
    },
    [view, vp],
  );

  const fit = useCallback(() => {
    if (vp.w) setView(fitBoard(board, vp.w, vp.h));
  }, [board, vp]);

  const actualSize = useCallback(() => {
    if (!vp.w) return;
    setView({ zoom: 1, panX: vp.w / 2 - (board.x + board.w / 2), panY: vp.h / 2 - (board.y + board.h / 2) });
  }, [board, vp]);

  /* ---------------- 键盘 ---------------- */

  const actionsRef = useRef<Record<string, (...args: any[]) => void>>({});
  actionsRef.current = {
    save: () => void doSave(false),
    saveAs: () => void doSave(true),
    export: () => setExportOpen(true),
    undo: store.undo,
    redo: store.redo,
    del: deleteSelected,
    dup: duplicate,
    copy: () => doCopy(false),
    cut: () => doCopy(true),
    paste: doPaste,
    fit,
    actual: actualSize,
    zin: () => zoomBy(1.2),
    zout: () => zoomBy(1 / 1.2),
    selectAll: () => setSelected(doc.root.slice()),
    group: groupSel,
    ungroup: ungroupSel,
    mask: makeMask,
    releaseMask,
    nudge: nudge,
    arrange: (mode: ArrangeMode) => arrange(mode),
    lock: toggleLock,
    unlockAll,
    hide: toggleVisible,
    showAll,
    escape: () => {
      setSelected([]);
      setTracePath(null);
    },
    bold: () => toggleTextStyle("bold"),
    italic: () => toggleTextStyle("italic"),
    settings: props.onSettings,
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const a = actionsRef.current;
      if (e.code === "Space") {
        if (!e.repeat) setSpace(true);
        e.preventDefault();
        return;
      }
      if (e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        setTool("artboard");
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "z") { e.preventDefault(); if (e.shiftKey) a.redo(); else a.undo(); return; }
        if (k === "y") { e.preventDefault(); a.redo(); return; }
        if (k === "s") { e.preventDefault(); if (e.shiftKey) a.saveAs(); else a.save(); return; }
        if (k === ",") { e.preventDefault(); a.settings(); return; }
        if (k === "e") { e.preventDefault(); a.export(); return; }
        if (k === "a") { e.preventDefault(); a.selectAll(); return; }
        if (k === "d") { e.preventDefault(); a.dup(); return; }
        if (k === "b") { e.preventDefault(); a.bold(); return; }
        if (k === "i") { e.preventDefault(); a.italic(); return; }
        if (k === "c") { e.preventDefault(); a.copy(); return; }
        if (k === "x") { e.preventDefault(); a.cut(); return; }
        if (k === "v") { e.preventDefault(); a.paste(); return; }
        if (k === "g") { e.preventDefault(); if (e.shiftKey) a.ungroup(); else a.group(); return; }
        if (k === "7" || e.code === "Digit7") { e.preventDefault(); if (e.altKey) a.releaseMask(); else a.mask(); return; }
        if (e.key === "]" || e.key === "}") { e.preventDefault(); a.arrange(e.shiftKey ? "front" : "forward"); return; }
        if (e.key === "[" || e.key === "{") { e.preventDefault(); a.arrange(e.shiftKey ? "back" : "backward"); return; }
        if (e.key === "2" || e.code === "Digit2") { e.preventDefault(); if (e.altKey) a.unlockAll(); else a.lock(); return; }
        if (e.key === "3" || e.code === "Digit3") { e.preventDefault(); if (e.altKey) a.showAll(); else a.hide(); return; }
        if (k === "0") { e.preventDefault(); a.fit(); return; }
        if (k === "1") { e.preventDefault(); a.actual(); return; }
        if (k === "=" || k === "+") { e.preventDefault(); a.zin(); return; }
        if (k === "-") { e.preventDefault(); a.zout(); return; }
        return;
      }
      switch (e.key.toLowerCase()) {
        case "v": setTool("select"); break;
        case "a": setTool("direct"); break;
        case "p": setTool("pen"); break;
        case "\\": setTool("line"); break;
        case "n": setTool("pencil"); break;
        case "w": setTool("width"); break;
        case "e": setTool("eraser"); break;
        case "i": setTool("eyedropper"); break;
        case "g": setTool("gradient"); break;
        case "c": setTool("scissors"); break;
        case "m": setTool("smooth"); break;
        case "r": setTool("rect"); break;
        case "u": setTool("roundrect"); break;
        case "l": setTool("ellipse"); break;
        case "y": setTool("polygon"); break;
        case "s": setTool("star"); break;
        case "t": setTool("text"); break;
        case "h": setTool("hand"); break;
        case "z": setTool("zoom"); break;
        case "arrowleft": e.preventDefault(); a.nudge(e.shiftKey ? -10 : -1, 0); break;
        case "arrowright": e.preventDefault(); a.nudge(e.shiftKey ? 10 : 1, 0); break;
        case "arrowup": e.preventDefault(); a.nudge(0, e.shiftKey ? -10 : -1); break;
        case "arrowdown": e.preventDefault(); a.nudge(0, e.shiftKey ? 10 : 1); break;
        case "delete":
        case "backspace":
          e.preventDefault();
          a.del();
          break;
        case "escape":
          a.escape();
          break;
        default:
          break;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  /* ---------------- 菜单 ---------------- */

  const selNone = safeSelected.length === 0;
  const hasPaths = safeSelected.filter((id) => doc.nodes[id]?.kind === "path").length >= 2;
  const hasAnyPath = safeSelected.some((id) => doc.nodes[id]?.kind === "path");
  const hasGroup = safeSelected.some((id) => doc.nodes[id]?.kind === "group");
  const hasAnyText = Object.values(doc.nodes).some((n) => n.kind === "text");

  const menus: MenuGroup[] = [
    {
      label: zh.menu.file,
      items: [
        { label: "新建工程", key: "Ctrl+N", run: props.onExit },
        { label: "打开工程", key: "Ctrl+O", run: props.onOpenRequest },
        { label: "保存", key: "Ctrl+S", run: () => void doSave(false) },
        { label: "另存为", key: "Ctrl+Shift+S", run: () => void doSave(true) },
        { label: "", sep: true },
        { label: "置入图片…", run: () => void doPlaceImage() },
        { label: "导入 SVG…", run: () => void doImportSVG() },
        { label: "图像描摹…", run: () => setTracePath("") },
        { label: "", sep: true },
        { label: "导出 SVG / PNG", key: "Ctrl+E", run: () => setExportOpen(true) },
        { label: "", sep: true },
        { label: "关闭工程", run: props.onExit },
      ],
    },
    {
      label: zh.menu.edit,
      items: [
        { label: "撤销", key: "Ctrl+Z", run: store.undo, disabled: !store.canUndo },
        { label: "重做", key: "Ctrl+Y", run: store.redo, disabled: !store.canRedo },
        { label: "", sep: true },
        { label: "复制对象", key: "Ctrl+D", run: duplicate, disabled: !safeSelected.length },
        { label: "复制", key: "Ctrl+C", run: () => doCopy(false), disabled: !safeSelected.length },
        { label: "剪切", key: "Ctrl+X", run: () => doCopy(true), disabled: !safeSelected.length },
        { label: "粘贴", key: "Ctrl+V", run: doPaste },
        { label: "删除", key: "Delete", run: deleteSelected, disabled: !safeSelected.length },
        { label: "全选", key: "Ctrl+A", run: () => setSelected(doc.root.slice()) },
      ],
    },
    {
      label: zh.menu.object,
      items: [
        { label: "置于顶层", key: "Ctrl+Shift+]", run: () => arrange("front"), disabled: selNone },
        { label: "上移一层", key: "Ctrl+]", run: () => arrange("forward"), disabled: selNone },
        { label: "下移一层", key: "Ctrl+[", run: () => arrange("backward"), disabled: selNone },
        { label: "置于底层", key: "Ctrl+Shift+[", run: () => arrange("back"), disabled: selNone },
        { label: "", sep: true },
        { label: "编组", key: "Ctrl+G", run: groupSel, disabled: safeSelected.length < 2 },
        { label: "取消编组", key: "Ctrl+Shift+G", run: ungroupSel, disabled: !hasGroup },
        { label: "建立剪切蒙版", key: "Ctrl+7", run: makeMask, disabled: safeSelected.length < 2 },
        { label: "释放剪切蒙版", key: "Ctrl+Alt+7", run: releaseMask, disabled: !safeSelected.some((id) => { const n = doc.nodes[id]; return n?.kind === "group" && !!n.clip; }) },
        { label: "", sep: true },
        { label: "左对齐", run: () => alignSel("left"), disabled: selNone },
        { label: "水平居中", run: () => alignSel("hcenter"), disabled: selNone },
        { label: "右对齐", run: () => alignSel("right"), disabled: selNone },
        { label: "顶对齐", run: () => alignSel("top"), disabled: selNone },
        { label: "垂直居中", run: () => alignSel("vcenter"), disabled: selNone },
        { label: "底对齐", run: () => alignSel("bottom"), disabled: selNone },
        { label: "水平分布", run: () => distributeSel("h"), disabled: safeSelected.length < 3 },
        { label: "垂直分布", run: () => distributeSel("v"), disabled: safeSelected.length < 3 },
        { label: "", sep: true },
        { label: "顺时针旋转 90°", run: () => rotateSel(90), disabled: selNone },
        { label: "逆时针旋转 90°", run: () => rotateSel(-90), disabled: selNone },
        { label: "水平翻转", run: () => flipSel("h"), disabled: selNone },
        { label: "垂直翻转", run: () => flipSel("v"), disabled: selNone },
        { label: "", sep: true },
        { label: "路径查找器 · 联集", run: () => boolSel("union"), disabled: !hasPaths },
        { label: "路径查找器 · 交集", run: () => boolSel("intersect"), disabled: !hasPaths },
        { label: "路径查找器 · 减去顶层", run: () => boolSel("subtract"), disabled: !hasPaths },
        { label: "路径查找器 · 排除重叠", run: () => boolSel("exclude"), disabled: !hasPaths },
        { label: "", sep: true },
        { label: "偏移路径（6px）", run: () => pathFxSel("offset"), disabled: !hasAnyPath },
        { label: "描边转轮廓", run: () => pathFxSel("outline"), disabled: !hasAnyPath },
        { label: "平滑路径", run: () => pathFxSel("smooth"), disabled: !hasAnyPath },
        { label: "", sep: true },
        { label: "锁定", key: "Ctrl+2", run: toggleLock, disabled: selNone },
        { label: "解锁全部", key: "Ctrl+Alt+2", run: unlockAll },
        { label: "隐藏", key: "Ctrl+3", run: toggleVisible, disabled: selNone },
        { label: "显示全部", key: "Ctrl+Alt+3", run: showAll },
        { label: "", sep: true },
        { label: "描摹选中位图", run: () => setTracePath(""), disabled: !safeSelected.some((id) => doc.nodes[id]?.kind === "image") },
      ],
    },
    {
      label: zh.menu.text,
      items: [
        { label: "粗体", key: "Ctrl+B", run: () => toggleTextStyle("bold"), disabled: !textNodes.length, checked: textNodes.length > 0 && textNodes.every((n) => !!n.bold) },
        { label: "斜体", key: "Ctrl+I", run: () => toggleTextStyle("italic"), disabled: !textNodes.length, checked: textNodes.length > 0 && textNodes.every((n) => !!n.italic) },
        { label: "", sep: true },
        { label: "左对齐", run: () => setTextAlign("left"), disabled: !textNodes.length, checked: textNodes.length > 0 && textNodes.every((n) => (n.align ?? "left") === "left") },
        { label: "居中对齐", run: () => setTextAlign("center"), disabled: !textNodes.length, checked: textNodes.length > 0 && textNodes.every((n) => n.align === "center") },
        { label: "右对齐", run: () => setTextAlign("right"), disabled: !textNodes.length, checked: textNodes.length > 0 && textNodes.every((n) => n.align === "right") },
        { label: "", sep: true },
        { label: "字号 +2", run: () => stepTextSize(2), disabled: !textNodes.length },
        { label: "字号 -2", run: () => stepTextSize(-2), disabled: !textNodes.length },
        { label: "", sep: true },
        { label: "选中全部文字", run: selectAllText, disabled: !hasAnyText },
      ],
    },
    {
      label: zh.menu.view,
      items: [
        { label: "放大", key: "Ctrl +", run: () => zoomBy(1.2) },
        { label: "缩小", key: "Ctrl -", run: () => zoomBy(1 / 1.2) },
        { label: "适合画板", key: "Ctrl+0", run: fit },
        { label: "实际大小", key: "Ctrl+1", run: actualSize },
        { label: "", sep: true },
        { label: "显示网格", checked: props.settings.grid, run: () => props.onSettingsChange({ grid: !props.settings.grid }) },
        { label: "吸附到网格", checked: props.settings.snap, run: () => props.onSettingsChange({ snap: !props.settings.snap }) },
        { label: "", sep: true },
        { label: props.theme === "light" ? "切换到深色" : "切换到浅色", run: props.onToggleTheme },
      ],
    },
    {
      label: zh.menu.window,
      items: [
        { label: "右侧属性 / 图层面板", checked: dockOpen, run: () => setDockOpen((v) => !v) },
        { label: "打开属性面板", run: () => { setTab("props"); setDockOpen(true); } },
        { label: "打开图层面板", run: () => { setTab("layers"); setDockOpen(true); } },
        { label: "", sep: true },
        { label: "恢复默认工作区", run: () => { setTab("props"); setDockOpen(true); fit(); } },
      ],
    },
    {
      label: zh.menu.help,
      items: [
        { label: "设置…", key: "Ctrl+,", run: props.onSettings },
        { label: "", sep: true },
        { label: zh.about.title, run: () => setAbout(true) },
      ],
    },
  ];

  const dispView = view ?? { zoom: 1, panX: 0, panY: 0 };
  const zoomPct = Math.round(dispView.zoom * 100);
  const tabName = fileName ? fileNameOf(fileName) : doc.name || zh.doc.untitled;
  const currentTool = TOOLS.find((t) => t.id === tool) ?? TOOLS[0];
  const runCtx = (fn?: () => void) => {
    setCtxMenu(null);
    fn?.();
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest(".ctx-menu")) return;
      setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  useLayoutEffect(() => {
    if (!ctxMenu) {
      setCtxShift(0);
      return;
    }
    const h = ctxRef.current?.getBoundingClientRect().height ?? 0;
    const maxY = window.innerHeight - 8;
    setCtxShift(ctxMenu.y + h > maxY ? maxY - h - ctxMenu.y : 0);
  }, [ctxMenu]);

  return (
    <div className={"editor" + (props.closing ? " is-leaving" : "")}>
      {/* 顶栏 */}
      <div className="ed-top">
        <div className="ed-brand">
          <span className="ed-brand-mark" aria-hidden>
            <svg viewBox="0 0 40 40" width="22" height="22">
              <path d="M6 30 L20 8 L34 30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
              <path d="M12.5 24 L27.5 24" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.7" />
            </svg>
          </span>
          <span className="ed-brand-name">Vexa</span>
        </div>
        <div className="top-divider" />
        <MenuBar groups={menus} />
        <div className="spacer" />
        <div className="ed-top-actions">
          <button className="icon-btn" title={zh.btn.undo} onClick={store.undo} disabled={!store.canUndo}>
            <Icon name="undo" />
          </button>
          <button className="icon-btn" title={zh.btn.redo} onClick={store.redo} disabled={!store.canRedo}>
            <Icon name="redo" />
          </button>
          <div className="top-divider" />
          <button className="zoom-label num" title="适合画板（Ctrl+0）" onClick={fit}>{zoomPct}%</button>
          <button className="icon-btn" title={zh.btn.theme} onClick={props.onToggleTheme}>
            <Icon name={props.theme === "light" ? "sun" : "moon"} />
          </button>
          <button
            className={"icon-btn" + (dockOpen ? " is-on" : "")}
            title={dockOpen ? "收起右侧面板" : "展开右侧面板"}
            aria-pressed={dockOpen}
            onClick={() => setDockOpen((v) => !v)}
          >
            <Icon name="layers" />
          </button>
          <button className="icon-btn" title="设置" onClick={props.onSettings}>
            <Icon name="sliders" size={17} />
          </button>
          <button className="btn btn-primary btn-export" onClick={() => setExportOpen(true)}>
            <Icon name="export" size={15} />
            {zh.btn.export}
          </button>
        </div>
      </div>

      {/* 文档标签 */}
      <div className="ed-tabs">
        <div className="tab is-on">
          <span className="tab-name">{tabName}</span>
          {dirty && <span className="tab-dot" />}
          <button className="tab-x" title={zh.btn.close} onClick={props.onExit}>
            <Icon name="close" size={12} />
          </button>
        </div>
        <div className="tabs-spacer" />
        <label className="tabs-board" title="切换当前画板">
          <Icon name="artboard" size={13} />
          <span className="faint">画板</span>
          <select value={boardIndex} onChange={(e) => setBoardIndex(Number(e.target.value))}>
            {doc.artboards.map((b, i) => (
              <option key={b.id} value={i}>
                {b.name || `画板 ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 主体 */}
      <div className="ed-main">
        <div className="ed-rail">
          <div className="rail-groups">
            {TOOL_GROUPS.map((g) => (
              <div className="rail-group" key={g.label}>
                <div className="rail-group-label">{g.label}</div>
                <div className="rail-grid">
                  {g.ids.map((id) => {
                    const t = TOOLS.find((item) => item.id === id);
                    if (!t) return null;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={"tool-btn" + (tool === t.id ? " is-on" : "")}
                        onClick={() => setTool(t.id)}
                        aria-label={`${t.label}（${t.key}）`}
                        data-tip={`${t.label}  ${t.key}`}
                      >
                        <Icon name={t.icon} size={18} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="rail-foot">
            <div className="rail-current" title="当前工具">
              <Icon name={currentTool.icon} size={14} />
              <span>{currentTool.label}</span>
              <kbd>{currentTool.key}</kbd>
            </div>
            <div className="rail-paint">
              <label className="rail-swatch" title={zh.dock.fill}>
                <i style={{ background: paintPreview(newFill), borderStyle: newFill.kind === "none" ? "dashed" : "solid" }} />
                <span>填充</span>
                <input type="color" value={newFill.color} onChange={(e) => setNewFill((p) => ({ ...p, kind: "solid", color: e.target.value }))} />
              </label>
              <label className="rail-swatch" title={zh.dock.stroke}>
                <i style={{ background: newStroke.kind === "none" ? "transparent" : newStroke.color, borderStyle: newStroke.kind === "none" ? "dashed" : "solid" }} />
                <span>描边</span>
                <input type="color" value={newStroke.color} onChange={(e) => setNewStroke((p) => ({ ...p, kind: "solid", color: e.target.value }))} />
              </label>
            </div>
          </div>
        </div>

        <div className="ed-center">
          <div className="ed-optbar">
            <div className="opt-tool-chip">
              <Icon name={currentTool.icon} size={16} />
              <span>{currentTool.label}</span>
              <kbd>{currentTool.key}</kbd>
            </div>
            <span className="opt-sep" />
            {tool === "select" || tool === "direct" ? (
              <div className="opt-selection">
                <span className="faint">已选</span>
                <span className="num opt-sel-count">{safeSelected.length}</span>
                {selBox ? (
                  <span className="opt-size num">{Math.round(selBox.w)} × {Math.round(selBox.h)} px</span>
                ) : (
                  <span className="faint">未选中对象</span>
                )}
                <div className="opt-actions">
                  <button type="button" className="panel-btn" onClick={() => setSelected(doc.root.slice())}>全选</button>
                  {selNone ? (
                    <span className="faint opt-tip">在画布拖框可框选</span>
                  ) : (
                    <>
                      <button type="button" className="panel-btn" onClick={() => setSelected([])}>取消选择</button>
                      <button type="button" className="panel-btn" disabled={safeSelected.length < 2 || !canGroup(doc, safeSelected)} onClick={groupSel}>编组</button>
                      {hasGroup && <button type="button" className="panel-btn" onClick={ungroupSel}>取消编组</button>}
                    </>
                  )}
                </div>
              </div>
            ) : tool === "artboard" ? (
              <div className="opt-artboard">
                <span className="faint">当前画板</span>
                <span className="num">{Math.round(board.w)} × {Math.round(board.h)}</span>
              </div>
            ) : tool === "eraser" ? (
              <div className="opt-artboard">
                <span className="faint">橡皮直径</span>
                <input
                  className="field-input num opt-eraser"
                  value={eraserDia}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 2 && v <= 200) setEraserDia(v);
                  }}
                />
                <span className="faint">px</span>
              </div>
            ) : tool === "width" ? (
              <div className="opt-artboard">
                <span className="faint">描边宽度</span>
                <span className="num">{widthSel ? `${widthSel.stroke.width} px` : "先选中描边路径"}</span>
                <span className="faint">宽度点</span>
                <span className="num">{widthSel?.stroke.widthPoints?.length ?? 0}</span>
              </div>
            ) : PAINT_TOOLS.includes(tool) || STROKE_ONLY_TOOLS.includes(tool) ? (
            <div className="opt-swatches">
              {!STROKE_ONLY_TOOLS.includes(tool) && (
                <label className="opt-swatch" title={zh.dock.fill}>
                  <i style={{ background: paintPreview(newFill), borderStyle: newFill.kind === "none" ? "dashed" : "solid" }} />
                  <span>{zh.dock.fill}</span>
                  <input type="color" value={newFill.color} onChange={(e) => setNewFill({ kind: "solid", color: e.target.value, opacity: 1 })} />
                </label>
              )}
              <label className="opt-swatch" title={zh.dock.stroke}>
                <i style={{ background: newStroke.color, borderStyle: newStroke.kind === "none" ? "dashed" : "solid" }} />
                <span>{zh.dock.stroke}</span>
                <input type="color" value={newStroke.color} onChange={(e) => setNewStroke({ ...newStroke, kind: "solid", color: e.target.value })} />
              </label>
              <div className="opt-width">
                <span className="faint">粗细</span>
                <input
                  className="field-input num opt-width-input"
                  value={newStroke.width}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 0) setNewStroke((p) => ({ ...p, width: v, kind: v > 0 && p.kind === "none" ? "solid" : p.kind }));
                  }}
                />
              </div>
            </div>
            ) : null}
            <div className="spacer" />
            <div className="opt-quick">
              <button
                type="button"
                className={"opt-toggle" + (props.settings.grid ? " is-on" : "")}
                title="显示辅助网格"
                aria-pressed={props.settings.grid}
                onClick={() => props.onSettingsChange({ grid: !props.settings.grid })}
              >
                <Icon name="grid" size={13} />
                网格
              </button>
              <button
                type="button"
                className={"opt-toggle" + (props.settings.snap ? " is-on" : "")}
                title="拖动吸附到整像素"
                aria-pressed={props.settings.snap}
                onClick={() => props.onSettingsChange({ snap: !props.settings.snap })}
              >
                <Icon name="magnet" size={13} />
                吸附
              </button>
            </div>
            {(tool === "roundrect" || tool === "polygon" || tool === "star") && (
              <div className="opt-shape">
                {tool === "roundrect" && (
                  <label className="opt-num">
                    <span className="faint">圆角</span>
                    <input
                      className="field-input num opt-width-input"
                      value={shapeOpts.radius}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v >= 0) setShapeOpts((p) => ({ ...p, radius: v }));
                      }}
                    />
                  </label>
                )}
                {tool === "polygon" && (
                  <label className="opt-num">
                    <span className="faint">边数</span>
                    <input
                      className="field-input num opt-width-input"
                      value={shapeOpts.sides}
                      onChange={(e) => {
                        const v = Math.round(Number(e.target.value));
                        if (Number.isFinite(v)) setShapeOpts((p) => ({ ...p, sides: Math.max(3, Math.min(64, v)) }));
                      }}
                    />
                  </label>
                )}
                {tool === "star" && (
                  <>
                    <label className="opt-num">
                      <span className="faint">角数</span>
                      <input
                        className="field-input num opt-width-input"
                        value={shapeOpts.points}
                        onChange={(e) => {
                          const v = Math.round(Number(e.target.value));
                          if (Number.isFinite(v)) setShapeOpts((p) => ({ ...p, points: Math.max(3, Math.min(64, v)) }));
                        }}
                      />
                    </label>
                    <label className="opt-num">
                      <span className="faint">内径比</span>
                      <input
                        className="field-input num opt-width-input"
                        value={shapeOpts.inner}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) setShapeOpts((p) => ({ ...p, inner: Math.max(0.05, Math.min(0.95, v)) }));
                        }}
                      />
                    </label>
                  </>
                )}
              </div>
            )}
            <span className="opt-hint">{zh.hint[tool]}</span>
          </div>

          <CanvasView
            doc={doc}
            version={store.version}
            tool={tool}
            selected={safeSelected}
            view={dispView}
            store={store}
            spaceHeld={space}
            newFill={newFill}
            newStroke={newStroke}
            shapeOpts={shapeOpts}
            eraserRadius={eraserDia}
            grid={props.settings.grid}
            snap={props.settings.snap}
            emptyHint={props.settings.welcomeHints ? "拖出形状开始；按 P 钢笔，R 矩形，输入文字按 T" : null}
            activeBoardId={board.id}
            onSelect={setSelected}
            onSamplePaint={(f, s) => {
              if (f) setNewFill(f);
              if (s) setNewStroke(s);
            }}
            onView={setView}
            onCursor={setCursor}
            onSize={(w, h) => setVp({ w, h })}
            onBoardIndex={setBoardFromCanvas}
            onContext={(x, y) => setCtxMenu({ x, y })}
          />
        </div>

        <Dock
          doc={doc}
          ids={safeSelected}
          tab={tab}
          onTab={setTab}
          store={store}
          onSelect={setSelected}
          onToast={say}
          boardIndex={boardIndex}
          onBoardIndex={setBoardIndex}
          onAlign={alignSel}
          onDistribute={distributeSel}
          onBool={boolSel}
          onArrange={arrange}
          collapsed={!dockOpen}
          onCollapse={() => setDockOpen(false)}
        />
        {!dockOpen && (
          <button type="button" className="dock-reopen" title="展开右侧面板" onClick={() => setDockOpen(true)}>
            <Icon name="chevron" size={13} />
            面板
          </button>
        )}
      </div>

      {/* 状态栏 */}
      <div className="ed-status">
        <span className="status-file" title={fileName ?? undefined}>
          {fileName ? fileNameOf(fileName) : "未命名工程"}
          <span className={"status-save" + (!fileName || dirty ? " is-dirty" : "")}>{!fileName || dirty ? " · 未保存" : " · 已保存"}</span>
        </span>
        <div className="spacer" />
        {cursor && <span className="status-coord num">X {Math.round(cursor.x)}　Y {Math.round(cursor.y)}</span>}
        <span className="status-count num">{safeSelected.length ? `已选 ${safeSelected.length} · ` : ""}{zh.status.objects.replace("{n}", String(doc.root.length))}</span>
        <span className="status-sep" />
        <button className="icon-btn status-zoom" title="缩小" onClick={() => zoomBy(1 / 1.2)}>
          <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        </button>
        <button className="status-zoom-label num" title="适合画板" onClick={fit}>{zoomPct}%</button>
        <button className="icon-btn status-zoom" title="放大" onClick={() => zoomBy(1.2)}>
          <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8h9M8 3.5v9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        </button>
        <span className="status-sep" />
        <span className="status-ver faint">Vexa 0.1.0</span>
      </div>

      {/* 浮层 */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="ctx-menu"
          role="menu"
          style={{ left: Math.max(8, Math.min(ctxMenu.x, window.innerWidth - 238)), top: ctxMenu.y, transform: `translateY(${ctxShift}px)` }}
        >
          <div className="ctx-head">{safeSelected.length ? `${safeSelected.length} 个对象` : "画布"}</div>
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(() => doCopy(true))}>
            <span>剪切</span><span className="ctx-key">Ctrl+X</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(() => doCopy(false))}>
            <span>复制</span><span className="ctx-key">Ctrl+C</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" onClick={() => runCtx(doPaste)}>
            <span>粘贴</span><span className="ctx-key">Ctrl+V</span>
          </button>
          <button type="button" className="ctx-item is-danger" role="menuitem" disabled={selNone} onClick={() => runCtx(deleteSelected)}>
            <span>删除</span><span className="ctx-key">Delete</span>
          </button>
          <div className="ctx-sep" />
          <button
            type="button"
            className="ctx-item"
            role="menuitem"
            disabled={hasGroup ? false : safeSelected.length < 2}
            onClick={() => runCtx(hasGroup ? ungroupSel : groupSel)}
          >
            <span>{hasGroup ? "取消编组" : "编组"}</span><span className="ctx-key">{hasGroup ? "Ctrl+Shift+G" : "Ctrl+G"}</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" disabled={safeSelected.length < 2} onClick={() => runCtx(makeMask)}>
            <span>建立剪切蒙版</span><span className="ctx-key">Ctrl+7</span>
          </button>
          <div className="ctx-sep" />
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(() => arrange("front"))}>
            <span>置于顶层</span><span className="ctx-key">⇧+]</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(() => arrange("back"))}>
            <span>置于底层</span><span className="ctx-key">⇧+[</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(toggleLock)}>
            <span>锁定 / 解锁</span><span className="ctx-key">Ctrl+2</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(toggleVisible)}>
            <span>隐藏 / 显示</span><span className="ctx-key">Ctrl+3</span>
          </button>
          <div className="ctx-sep" />
          <button type="button" className="ctx-item" role="menuitem" onClick={() => runCtx(() => setSelected(doc.root.slice()))}>
            <span>全选</span><span className="ctx-key">Ctrl+A</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" disabled={selNone} onClick={() => runCtx(() => setSelected([]))}>
            <span>取消选择</span><span className="ctx-key">Esc</span>
          </button>
          <button type="button" className="ctx-item" role="menuitem" onClick={() => runCtx(fit)}>
            <span>适合画板</span><span className="ctx-key">Ctrl+0</span>
          </button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      {exportOpen && (
        <ExportModal
          board={board}
          defaultFmt={props.settings.exportFmt}
          defaultScale={props.settings.exportScale}
          onClose={() => setExportOpen(false)}
          onRun={(fmt, scale) => void doExport(fmt, scale)}
        />
      )}
      {tracePath !== null && (
        <TraceModal
          initialPath={tracePath}
          onClose={() => setTracePath(null)}
          onRun={(path, opts) => doTrace(path, opts)}
        />
      )}
    </div>
  );
}

/* ================= 右侧面板坞 ================= */

interface DockProps {
  doc: VexaDoc;
  ids: string[];
  tab: "props" | "layers";
  onTab: (t: "props" | "layers") => void;
  store: ReturnType<typeof useDocStore>;
  onSelect: (ids: string[]) => void;
  onToast: (msg: string) => void;
  boardIndex: number;
  onBoardIndex: (i: number) => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: "h" | "v") => void;
  onBool: (op: BoolOp) => void;
  onArrange: (mode: ArrangeMode) => void;
  collapsed: boolean;
  onCollapse: () => void;
}

function Dock({ doc, ids, tab, onTab, store, onSelect, onToast, boardIndex, onBoardIndex, onAlign, onDistribute, onBool, onArrange, collapsed, onCollapse }: DockProps) {
  const single = ids.length === 1 ? doc.nodes[ids[0]] : undefined;
  const fillStops = single && (single.kind === "path" || single.kind === "text") && (single.fill.kind === "linear" || single.fill.kind === "radial")
    ? paintStops(single.fill)
    : [];
  const box = bboxOf(doc, ids);
  const pathCount = ids.filter((id) => doc.nodes[id]?.kind === "path").length;
  const hasSel = ids.length > 0;
  const [dragLayer, setDragLayer] = useState<string | null>(null);
  const textBeforeRef = useRef<string | null>(null);

  const reorderLayer = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    store.commit((d) => {
      const display = [...d.root].reverse();
      const from = display.indexOf(fromId);
      const to = display.indexOf(toId);
      if (from < 0 || to < 0) return;
      const [item] = display.splice(from, 1);
      display.splice(to, 0, item);
      d.root = display.reverse();
    });
  };

  const setNode = (fn: (n: Node) => void) => {
    if (!single) return;
    store.commit((d) => {
      const n = d.nodes[single.id];
      if (n) fn(n);
    });
  };


  const [offsetAmt, setOffsetAmt] = useState(6);
  const applyPathFx = (kind: "offset" | "outline" | "smooth") => {
    if (!single || single.kind !== "path") return;
    if (kind === "outline" && (single.stroke.kind === "none" || single.stroke.width <= 0)) {
      onToast("描边转轮廓前，先给路径设描边宽度");
      return;
    }
    let missing = false;
    store.commit((d) => {
      const n = d.nodes[single.id];
      if (!n || n.kind !== "path") return;
      const next =
        kind === "offset" ? offsetPathNode(n, offsetAmt) : kind === "outline" ? outlineStrokeNode(n) : smoothPathNode(n);
      if (!next) {
        missing = true;
        return;
      }
      n.subpaths = next.subpaths;
      n.fill = next.fill;
      n.stroke = next.stroke;
      n.name = next.name;
    });
    if (missing) onToast("没有可转换的描边");
  };

  return (
    <div className={"ed-dock" + (collapsed ? " is-collapsed" : "")}>
      <div className="dock-tabs">
        <button className={"dock-tab" + (tab === "props" ? " is-on" : "")} onClick={() => onTab("props")}>
          <Icon name="sliders" size={14} /> {zh.dock.properties}
        </button>
        <button className={"dock-tab" + (tab === "layers" ? " is-on" : "")} onClick={() => onTab("layers")}>
          <Icon name="layers" size={14} /> {zh.dock.layers}
        </button>
        <button type="button" className="dock-collapse" title="收起右侧面板" onClick={onCollapse}>
          <Icon name="chevron" size={14} />
        </button>
      </div>

      {tab === "props" ? (
        <div className="dock-body" key="props">
          {ids.length === 0 && (
            <BoardProps doc={doc} store={store} index={boardIndex} setIndex={onBoardIndex} />
          )}

          {ids.length > 0 && !single && (
            <div className="dock-empty">
              <div className="dock-empty-title">已选中 {ids.length} 个对象</div>
              <div className="dock-empty-hint">删除或复制可直接在菜单里做。</div>
            </div>
          )}

          {single && (
            <>
              <section className="dock-sec">
                <div className="dock-sec-head">
                  <span>对象</span>
                  <span className="faint">{kindLabel(single)}</span>
                </div>
                <div className="field">
                  <label className="field-label">{zh.dock.layerName}</label>
                  <input
                    className="field-input"
                    value={single.name}
                    onChange={(e) => setNode((n) => { n.name = e.target.value; })}
                  />
                </div>
              </section>

              {box && (
                <section className="dock-sec">
                  <div className="dock-sec-head"><span>{zh.dock.position}</span></div>
                  <div className="dock-grid">
                    <NumField
                      label="X"
                      value={Math.round(box.x)}
                      onCommit={(v) => store.commit((d) => translate(d, single.id, v - box.x, 0))}
                    />
                    <NumField
                      label="Y"
                      value={Math.round(box.y)}
                      onCommit={(v) => store.commit((d) => translate(d, single.id, 0, v - box.y))}
                    />
                  </div>
                  {single.kind !== "group" && (
                    <>
                      <div className="dock-sec-head"><span>{zh.dock.size}</span></div>
                      <div className="dock-grid">
                        <NumField
                          label="W"
                          value={Math.round(box.w)}
                          min={1}
                          onCommit={(v) => {
                            if (box.w <= 0) return;
                            store.commit((d) => scaleInBox(d, single.id, box, v / box.w, 1));
                          }}
                        />
                        <NumField
                          label="H"
                          value={Math.round(box.h)}
                          min={1}
                          onCommit={(v) => {
                            if (box.h <= 0) return;
                            store.commit((d) => scaleInBox(d, single.id, box, 1, v / box.h));
                          }}
                        />
                      </div>
                    </>
                  )}
                </section>
              )}

              {single.kind === "text" && (
                <section className="dock-sec">
                  <div className="dock-sec-head">
                    <span>{zh.menu.text}</span>
                    <span className="faint">字符</span>
                  </div>
                  <textarea
                    className="dock-textarea"
                    value={single.text}
                    rows={3}
                    onFocus={() => { textBeforeRef.current = store.snapshot(); }}
                    onChange={(e) => store.live((d) => {
                      const n = d.nodes[single.id];
                      if (n && n.kind === "text") n.text = e.target.value;
                    })}
                    onBlur={() => {
                      if (textBeforeRef.current) {
                        store.finish(textBeforeRef.current);
                        textBeforeRef.current = null;
                      }
                    }}
                  />
                  <div className="char-row">
                    <span className="faint">字体</span>
                    <select
                      className="field-input char-font"
                      value={single.font}
                      onChange={(e) => setNode((n) => { if (n.kind === "text") n.font = e.target.value; })}
                    >
                      {!FONTS.some(([, v]) => v === single.font) && (
                        <option value={single.font}>{single.font}</option>
                      )}
                      {FONTS.map(([label, value]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="char-grid">
                    <NumField
                      label="字号"
                      value={single.size}
                      min={1}
                      onCommit={(v) => setNode((n) => { if (n.kind === "text") n.size = v; })}
                    />
                    <NumField
                      label="行距"
                      value={Math.round(single.size * (single.lineHeight ?? 1.25))}
                      min={1}
                      unit="px"
                      onCommit={(v) => setNode((n) => { if (n.kind === "text") n.lineHeight = v / n.size; })}
                    />
                    <NumField
                      label="字距"
                      value={Math.round(single.tracking ?? 0)}
                      unit="px"
                      onCommit={(v) => setNode((n) => { if (n.kind === "text") n.tracking = v; })}
                    />
                    <NumField
                      label="水平"
                      value={Math.round(single.hScale ?? 100)}
                      min={1}
                      unit="%"
                      onCommit={(v) => setNode((n) => { if (n.kind === "text") n.hScale = v; })}
                    />
                    <NumField
                      label="垂直"
                      value={Math.round(single.vScale ?? 100)}
                      min={1}
                      unit="%"
                      onCommit={(v) => setNode((n) => { if (n.kind === "text") n.vScale = v; })}
                    />
                    <NumField
                      label="基线"
                      value={Math.round(single.baseline ?? 0)}
                      unit="px"
                      onCommit={(v) => setNode((n) => { if (n.kind === "text") n.baseline = v; })}
                    />
                  </div>
                  <div className="char-row">
                    <span className="faint">样式</span>
                    <button
                      className={"char-btn char-bold" + (single.bold ? " is-on" : "")}
                      onClick={() => setNode((n) => { if (n.kind === "text") n.bold = !n.bold; })}
                      title="粗体"
                    >B</button>
                    <button
                      className={"char-btn char-italic" + (single.italic ? " is-on" : "")}
                      onClick={() => setNode((n) => { if (n.kind === "text") n.italic = !n.italic; })}
                      title="斜体"
                    >I</button>
                    <span className="char-divider" />
                    <span className="faint">对齐</span>
                    {(["left", "center", "right"] as const).map((a) => (
                      <button
                        key={a}
                        className={"char-btn" + ((single.align ?? "left") === a ? " is-on" : "")}
                        onClick={() => setNode((n) => { if (n.kind === "text") n.align = a; })}
                        title={a === "left" ? "左对齐" : a === "center" ? "居中" : "右对齐"}
                      >
                        {a === "left" ? "左" : a === "center" ? "中" : "右"}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {(single.kind === "path" || single.kind === "text") && (
                <section className="dock-sec">
                  <div className="dock-sec-head"><span>{zh.dock.fill}</span></div>
                  <div className="paint-modes">
                    {(
                      [
                        ["solid", "实色"],
                        ["linear", "线性"],
                        ["radial", "径向"],
                        ["none", "无"],
                      ] as const
                    ).map(([k, label]) => (
                      <button
                        key={k}
                        className={"paint-mode" + (single.fill.kind === k ? " is-on" : "")}
                        onClick={() =>
                          setNode((n) => {
                            if (!("fill" in n)) return;
                            const hadGrad = n.fill.kind === "linear" || n.fill.kind === "radial";
                            const stops = hadGrad ? paintStops(n.fill) : [{ offset: 0, color: n.fill.color }, { offset: 1, color: "#ffffff" }];
                            const first = stops[0]?.color ?? n.fill.color;
                            if (k === "none") n.fill = noPaint();
                            else if (k === "solid") n.fill = solid(first, n.fill.opacity);
                            else n.fill = {
                              kind: k,
                              color: first,
                              opacity: n.fill.opacity,
                              grad: { angle: hadGrad ? (n.fill.grad?.angle ?? 90) : 90, stops: stops.map((s) => ({ ...s })) },
                            };
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {single.fill.kind === "solid" && (
                    <div className="paint-row">
                      <label className="paint-swatch" style={{ background: single.fill.color }}>
                        <input
                          type="color"
                          value={single.fill.color}
                          onChange={(e) => setNode((n) => { if ("fill" in n) n.fill = { kind: "solid", color: e.target.value, opacity: n.fill.opacity }; })}
                        />
                      </label>
                      <input
                        className="field-input num"
                        value={single.fill.opacity}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (v >= 0 && v <= 1) setNode((n) => { if ("fill" in n) n.fill.opacity = v; });
                        }}
                      />
                      <span className="faint">不透明度</span>
                    </div>
                  )}
                  {(single.fill.kind === "linear" || single.fill.kind === "radial") && (
                    <div className="paint-grad">
                      <div className="grad-bar" style={{ background: paintPreview(single.fill) }} />
                      <div className="grad-stop-list">
                        {fillStops.map((stop, i) => (
                          <div className="grad-stop" key={i}>
                            <label className="paint-swatch" style={{ background: stop.color }} title={`色标 ${i + 1}`}>
                              <input
                                type="color"
                                value={stop.color}
                                onChange={(e) => setNode((n) => {
                                  if (!("fill" in n)) return;
                                  const g = n.fill.grad ?? { angle: 90, stops: [] };
                                  const stops = paintStops(n.fill).map((s, j) => (j === i ? { ...s, color: e.target.value } : s));
                                  n.fill = { ...n.fill, color: stops[0]?.color ?? n.fill.color, grad: { angle: g.angle, stops } };
                                })}
                              />
                            </label>
                            <input
                              className="field-input num"
                              type="number"
                              min={0}
                              max={100}
                              step={1}
                              value={Math.round(stop.offset * 1000) / 10}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (!Number.isFinite(v)) return;
                                setNode((n) => {
                                  if (!("fill" in n)) return;
                                  const g = n.fill.grad ?? { angle: 90, stops: [] };
                                  const stops = paintStops(n.fill).map((s, j) => (j === i ? { ...s, offset: Math.min(1, Math.max(0, v / 100)) } : s));
                                  n.fill = { ...n.fill, color: stops[0]?.color ?? n.fill.color, grad: { angle: g.angle, stops } };
                                });
                              }}
                            />
                            <span className="faint">%</span>
                            <button
                              className="grad-stop-del"
                              disabled={fillStops.length <= 2}
                              title="删除这个色标"
                              onClick={() => setNode((n) => {
                                if (!("fill" in n) || fillStops.length <= 2) return;
                                const g = n.fill.grad ?? { angle: 90, stops: [] };
                                const stops = paintStops(n.fill).filter((_, j) => j !== i);
                                n.fill = { ...n.fill, color: stops[0]?.color ?? n.fill.color, grad: { angle: g.angle, stops } };
                              })}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="grad-stop-actions">
                          <button
                            className="btn btn-ghost btn-mini"
                            onClick={() => setNode((n) => {
                              if (!("fill" in n)) return;
                              const g = n.fill.grad ?? { angle: 90, stops: [] };
                              const stops = insertGradStop(n.fill, paintStops(n.fill)).stops;
                              n.fill = { ...n.fill, color: stops[0]?.color ?? n.fill.color, grad: { angle: g.angle, stops } };
                            })}
                          >
                            ＋ 添加色标
                          </button>
                          <span className="faint">{fillStops.length} 个色标</span>
                        </div>
                      </div>
                      {single.fill.kind === "linear" && (
                        <div className="grad-angle">
                          <span className="faint">角度</span>
                          <input
                            className="field-input num"
                            value={Math.round((single.fill.grad?.angle ?? 90) * 10) / 10}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              if (!Number.isFinite(v)) return;
                              setNode((n) => {
                                if (!("fill" in n)) return;
                                const g = n.fill.grad ?? { angle: 90, stops: paintStops(n.fill) };
                                n.fill = { ...n.fill, kind: n.fill.kind, grad: { angle: v, stops: g.stops } };
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {single.kind === "path" && (
                <section className="dock-sec">
                  <div className="dock-sec-head"><span>{zh.dock.stroke}</span></div>
                  <div className="paint-row">
                    <label className="paint-swatch" style={{ background: single.stroke.kind === "none" ? "transparent" : single.stroke.color }}>
                      <input
                        type="color"
                        value={single.stroke.color}
                        onChange={(e) => setNode((n) => { if (n.kind === "path") { n.stroke = { ...n.stroke, kind: "solid", color: e.target.value }; } })}
                      />
                    </label>
                    <NumField
                      label={zh.dock.width}
                      value={single.stroke.width}
                      min={0}
                      onCommit={(v) => setNode((n) => { if (n.kind === "path") n.stroke = { ...n.stroke, width: v, kind: v > 0 ? "solid" : "none" }; })}
                      inline
                    />
                    <button className="btn btn-ghost btn-mini" onClick={() => setNode((n) => { if (n.kind === "path") n.stroke = noStroke(n.stroke.color); })}>
                      {zh.dock.none}
                    </button>
                  </div>
                  <div className="dash-row">
                    {(
                      [
                        [[], "实线"],
                        [[6, 4], "虚线"],
                        [[2, 3], "点线"],
                        [[10, 4, 2, 4], "点划"],
                      ] as const
                    ).map(([dash, label]) => (
                      <button
                        key={label}
                        className={"dash-chip" + (single.stroke.dash.join(",") === dash.join(",") ? " is-on" : "")}
                        onClick={() =>
                          setNode((n) => {
                            if (n.kind === "path") n.stroke = { ...n.stroke, kind: "solid", dash: [...dash] };
                          })
                        }
                      >
                        <span className="dash-line" style={{ backgroundImage: `repeating-linear-gradient(90deg, currentColor 0 ${dash[0] ?? 8}px, transparent ${dash[0] ?? 8}px ${(dash[0] ?? 8) + (dash[1] ?? 4)}px)` }} />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="dash-row arrow-row">
                    <span className="faint">端点</span>
                    {(
                      [
                        ["butt", "平头"],
                        ["round", "圆头"],
                        ["square", "方头"],
                      ] as const
                    ).map(([cap, label]) => (
                      <button
                        key={cap}
                        className={"dash-chip" + ((single.stroke.cap ?? "butt") === cap ? " is-on" : "")}
                        onClick={() =>
                          setNode((n) => {
                            if (n.kind === "path") n.stroke = { ...n.stroke, cap };
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="dash-row arrow-row">
                    <span className="faint">连接</span>
                    {(
                      [
                        ["miter", "尖角"],
                        ["round", "圆角"],
                        ["bevel", "斜角"],
                      ] as const
                    ).map(([join, label]) => (
                      <button
                        key={join}
                        className={"dash-chip" + ((single.stroke.join ?? "miter") === join ? " is-on" : "")}
                        onClick={() =>
                          setNode((n) => {
                            if (n.kind === "path") n.stroke = { ...n.stroke, join };
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="dash-row arrow-row">
                    <span className="faint">箭头</span>
                    {(
                      [
                        ["none", "无"],
                        ["triangle", "实心"],
                        ["open", "空心"],
                        ["diamond", "菱形"],
                      ] as const
                    ).map(([kind, label]) => (
                      <button
                        key={kind}
                        className={"dash-chip" + ((single.stroke.arrow ?? "none") === kind ? " is-on" : "")}
                        onClick={() =>
                          setNode((n) => {
                            if (n.kind === "path") n.stroke = { ...n.stroke, arrow: kind };
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {single.kind === "path" && (
                <section className="dock-sec">
                  <div className="dock-sec-head"><span>路径效果</span><span className="faint">折线近似</span></div>
                  <div className="pathfx-row">
                    <span className="faint">偏移</span>
                    <input
                      className="field-input num"
                      value={offsetAmt}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) setOffsetAmt(v);
                      }}
                    />
                    <span className="faint">px</span>
                  </div>
                  <div className="panel-grid cols-3">
                    <button className="panel-btn" onClick={() => applyPathFx("offset")}>偏移路径</button>
                    <button className="panel-btn" onClick={() => applyPathFx("outline")}>描边转轮廓</button>
                    <button className="panel-btn" onClick={() => applyPathFx("smooth")}>平滑</button>
                  </div>
                </section>
              )}

              <section className="dock-sec">
                <div className="dock-sec-head"><span>{zh.dock.opacity}</span><span className="num faint">{Math.round(single.opacity * 100)}%</span></div>
                <input
                  className="dock-range"
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(single.opacity * 100)}
                  onChange={(e) => setNode((n) => { n.opacity = Number(e.target.value) / 100; })}
                />
                <div className="field">
                  <label className="field-label">混合模式</label>
                  <select
                    className="field-input"
                    value={single.blend ?? "normal"}
                    onChange={(e) => {
                      const v = e.target.value as BlendMode;
                      setNode((n) => { if (v === "normal") delete n.blend; else n.blend = v; });
                    }}
                  >
                    {BLEND_MODES.map((m) => (
                      <option key={m} value={m}>{BLEND_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
              </section>

              <button className="btn btn-block" onClick={() => { store.commit((d) => removeNode(d, single.id)); onSelect([]); }}>
                删除对象
              </button>
            </>
          )}

          <section className="dock-sec">
            <div className="dock-sec-head"><span>对齐与分布</span><span className="faint num">{ids.length} 个</span></div>
            <div className="panel-grid cols-3">
              {(
                [
                  ["left", "左对齐"],
                  ["hcenter", "水平居中"],
                  ["right", "右对齐"],
                  ["top", "顶对齐"],
                  ["vcenter", "垂直居中"],
                  ["bottom", "底对齐"],
                ] as const
              ).map(([mode, label]) => (
                <button key={mode} className="panel-btn" disabled={!hasSel} onClick={() => onAlign(mode)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="panel-grid cols-2">
              <button className="panel-btn" disabled={ids.length < 3} onClick={() => onDistribute("h")}>水平分布</button>
              <button className="panel-btn" disabled={ids.length < 3} onClick={() => onDistribute("v")}>垂直分布</button>
            </div>
          </section>

          <section className="dock-sec">
            <div className="dock-sec-head"><span>排列</span></div>
            <div className="panel-grid cols-4">
              {(
                [
                  ["front", "置顶"],
                  ["forward", "上移"],
                  ["backward", "下移"],
                  ["back", "置底"],
                ] as const
              ).map(([mode, label]) => (
                <button key={mode} className="panel-btn" disabled={!hasSel} onClick={() => onArrange(mode)}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="dock-sec">
            <div className="dock-sec-head"><span>路径查找器</span><span className="faint">布尔</span></div>
            <div className="panel-grid cols-2">
              <button className="panel-btn" disabled={pathCount < 2} onClick={() => onBool("union")}>联集</button>
              <button className="panel-btn" disabled={pathCount < 2} onClick={() => onBool("intersect")}>交集</button>
              <button className="panel-btn" disabled={pathCount < 2} onClick={() => onBool("subtract")}>减去顶层</button>
              <button className="panel-btn" disabled={pathCount < 2} onClick={() => onBool("exclude")}>排除重叠</button>
            </div>
          </section>

          <section className="dock-sec dock-info">
            <div className="dock-sec-head"><span>文档信息</span><span className="faint">只读</span></div>
            <div className="info-row"><span>工程</span><span className="info-val">{doc.name}</span></div>
            <div className="info-row"><span>画板</span><span className="info-val num">{doc.artboards.length} 块 · {Math.round(doc.artboards[boardIndex]?.w ?? 0)} × {Math.round(doc.artboards[boardIndex]?.h ?? 0)}</span></div>
            <div className="info-row"><span>对象</span><span className="info-val num">{doc.root.length} 个 · {doc.unit}</span></div>
            <div className="info-row"><span>格式</span><span className="info-val">.vex · Vexa 0.1.0</span></div>
          </section>
        </div>
      ) : (
        <div className="dock-body layers-body" key="layers">
          <div className="layers-head">
            <span>{zh.dock.objects}</span>
            <span className="faint num">{doc.root.length}</span>
          </div>
          <ul className="layer-list">
            {[...doc.root].reverse().map((id) => {
              const n = doc.nodes[id];
              if (!n) return null;
              return (
                <li
                  key={id}
                  className={"layer-row" + (ids.includes(id) ? " is-on" : "") + (dragLayer === id ? " is-dragging" : "")}
                  draggable
                  onDragStart={(e) => { setDragLayer(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => { e.preventDefault(); const from = e.dataTransfer.getData("text/plain") || dragLayer; if (from) reorderLayer(from, id); setDragLayer(null); }}
                  onDragEnd={() => setDragLayer(null)}
                >
                  <button
                    className="layer-eye"
                    title={n.visible ? zh.dock.hide : zh.dock.show}
                    onClick={(e) => {
                      e.stopPropagation();
                      store.commit((d) => { const nn = d.nodes[id]; if (nn) nn.visible = !nn.visible; });
                    }}
                  >
                    <Icon name={n.visible ? "eye" : "eye-off"} size={14} />
                  </button>
                  <button
                    className="layer-lock"
                    title={n.locked ? zh.dock.unlock : zh.dock.lock}
                    onClick={(e) => {
                      e.stopPropagation();
                      store.commit((d) => { const nn = d.nodes[id]; if (nn) nn.locked = !nn.locked; });
                    }}
                  >
                    <Icon name={n.locked ? "lock" : "unlock"} size={13} />
                  </button>
                  <button className="layer-name" onClick={() => onSelect([id])} title={n.name}>
                    {n.name}
                  </button>
                  <span className="layer-kind faint">{kindGlyph(n)}</span>
                </li>
              );
            })}
          </ul>
          {doc.root.length === 0 && (
            <div className="dock-empty">
              <div className="dock-empty-title">{zh.dock.emptyHint}</div>
              <div className="dock-empty-hint">{zh.dock.emptyHint2}</div>
            </div>
          )}
          <div className="layers-foot">
            <button className="btn btn-ghost btn-mini" onClick={() => { if (ids.length) { store.commit((d) => { for (const id of ids) removeNode(d, id); }); onSelect([]); } }} disabled={!ids.length}>
              <Icon name="trash" size={14} /> {zh.dock.delete}
            </button>
            <span className="faint layer-tip">拖动行可调整层级</span>
            <button className="btn btn-ghost btn-mini" onClick={() => onToast("拖动图层行可调整叠放顺序；组内子层请在画布上用菜单排列")}>
              提示
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(n: Node): string {
  if (n.kind === "path") return "路径";
  if (n.kind === "text") return "文本";
  if (n.kind === "image") return "图片";
  return "组";
}

function kindGlyph(n: Node): string {
  if (n.kind === "path") return "P";
  if (n.kind === "text") return "T";
  if (n.kind === "image") return "I";
  return "G";
}

function BoardProps({ doc, store, index, setIndex }: { doc: VexaDoc; store: ReturnType<typeof useDocStore>; index: number; setIndex: (i: number) => void }) {
  const board = doc.artboards[index] ?? doc.artboards[0];
  const setBoard = (fn: (b: Artboard) => void) => {
    store.commit((d) => {
      if (d.artboards[index]) fn(d.artboards[index]);
    });
  };
  const addBoard = () => {
    const at = doc.artboards.length;
    store.commit((d) => {
      const last = d.artboards[d.artboards.length - 1];
      const right = Math.max(...d.artboards.map((a) => a.x + a.w));
      d.artboards.push({
        id: newId(d, "ab"),
        name: `画板 ${at + 1}`,
        x: right + 48,
        y: last ? last.y : 0,
        w: last ? last.w : 1000,
        h: last ? last.h : 1000,
        bg: last ? last.bg : "#ffffff",
      });
    });
    setIndex(at);
  };
  const delBoard = () => {
    if (doc.artboards.length <= 1) return;
    store.commit((d) => {
      d.artboards.splice(index, 1);
    });
    setIndex(Math.max(0, Math.min(index, doc.artboards.length - 2)));
  };
  return (
    <>
      <section className="dock-sec">
        <div className="dock-sec-head">
          <span>画板</span>
          <span className="board-actions">
            <button className="mini-btn" onClick={addBoard} title="新建画板">＋</button>
            <button className="mini-btn" onClick={delBoard} title="删除当前画板" disabled={doc.artboards.length <= 1}>－</button>
          </span>
        </div>
        <div className="board-list">
          {doc.artboards.map((b, i) => (
            <button key={b.id} className={`board-row${i === index ? " is-on" : ""}`} onClick={() => setIndex(i)}>
              <span className="board-dot" style={{ background: b.bg }} />
              <span className="board-name">{b.name}</span>
              <span className="faint">{Math.round(b.w)}×{Math.round(b.h)}</span>
            </button>
          ))}
        </div>
        <div className="field">
          <label className="field-label">名称</label>
          <input className="field-input" value={board.name} onChange={(e) => setBoard((b) => { b.name = e.target.value; })} />
        </div>
        <div className="dock-grid">
          <NumField label="W" value={Math.round(board.w)} min={1} onCommit={(v) => setBoard((b) => { b.w = v; })} />
          <NumField label="H" value={Math.round(board.h)} min={1} onCommit={(v) => setBoard((b) => { b.h = v; })} />
        </div>
      </section>
      <section className="dock-sec">
        <div className="dock-sec-head"><span>背景</span></div>
        <div className="paint-row">
          <label className="paint-swatch" style={{ background: board.bg }}>
            <input type="color" value={board.bg} onChange={(e) => setBoard((b) => { b.bg = e.target.value; })} />
          </label>
          <span className="faint">画板底色</span>
        </div>
      </section>
      <div className="dock-note">{zh.dock.emptyHint}<br />{zh.dock.emptyHint2}</div>
    </>
  );
}

function NumField({ label, value, unit, min, onCommit, inline }: { label: string; value: number; unit?: string; min?: number; onCommit: (v: number) => void; inline?: boolean }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (!Number.isFinite(v) || (min !== undefined && v < min)) {
      setText(String(value));
      return;
    }
    if (v !== value) onCommit(v);
  };
  const body = (
    <div className="field-row">
      <input
        className="field-input num"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setText(String(value));
        }}
      />
      {unit && <span className="field-unit">{unit}</span>}
    </div>
  );
  if (inline) return <div className="num-inline"><span className="faint">{label}</span>{body}</div>;
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {body}
    </div>
  );
}

/* ================= 导出弹层 ================= */

function ExportModal({
  board,
  defaultFmt = "svg",
  defaultScale = 1,
  onClose,
  onRun,
}: {
  board: Artboard;
  defaultFmt?: "svg" | "png";
  defaultScale?: number;
  onClose: () => void;
  onRun: (fmt: "svg" | "png", scale: number) => void;
}) {
  const [fmt, setFmt] = useState<"svg" | "png">(defaultFmt);
  const [scale, setScale] = useState(defaultScale);
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{zh.export.title}</h3>
          <span className="faint num">{board.w} × {board.h}</span>
        </div>
        <div className="modal-body">
          <div className="export-cards">
            <button className={"export-card" + (fmt === "svg" ? " is-on" : "")} onClick={() => setFmt("svg")}>
              <span className="export-title">{zh.export.svg}</span>
              <span className="export-note">{zh.export.svgNote}</span>
            </button>
            <button className={"export-card" + (fmt === "png" ? " is-on" : "")} onClick={() => setFmt("png")}>
              <span className="export-title">{zh.export.png}</span>
              <span className="export-note">{zh.export.pngNote}</span>
            </button>
          </div>
          {fmt === "png" && (
            <div className="export-scale">
              <span className="field-label">{zh.export.scale}</span>
              <div className="segmented">
                {[1, 2, 3, 4].map((s) => (
                  <button key={s} className={"seg-btn" + (scale === s ? " is-on" : "")} onClick={() => setScale(s)}>
                    {s}×
                  </button>
                ))}
              </div>
              <span className="faint num">
                {Math.round(board.w * scale)} × {Math.round(board.h * scale)} px
              </span>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>{zh.btn.cancel}</button>
          <button className="btn btn-primary" onClick={() => onRun(fmt, scale)}>{zh.export.save}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= 描摹弹层 ================= */

function TraceModal({ initialPath, onClose, onRun }: { initialPath: string; onClose: () => void; onRun: (path: string, opts: TraceOptions) => Promise<boolean> }) {
  const [path, setPath] = useState(initialPath);
  const [preset, setPreset] = useState<TraceOptions["preset"]>("illustration");
  const [opts, setOpts] = useState<Omit<TraceOptions, "preset">>({ colors: 7, detail: 5, smooth: 60, speckle: 4 });
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    const p = await pickImage();
    if (p) setPath(p);
  };

  const applyPreset = (id: TraceOptions["preset"]) => {
    const meta = PRESET_OPTS.find((p) => p.id === id);
    setPreset(id);
    if (meta) setOpts(meta.def);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal trace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{zh.trace.title}</h3>
          <span className="faint">{path ? path.split(/[\\/]/).pop() : "未选择图片"}</span>
        </div>
        <div className="modal-body">
          <p className="muted">{zh.trace.note}</p>

          <div className="trace-source">
            <button className="btn" onClick={() => void choose()}>选择图片…</button>
            <span className="faint ellip">{path || zh.trace.source}</span>
          </div>

          <div className="field">
            <label className="field-label">{zh.trace.preset}</label>
            <div className="segmented trace-presets">
              {PRESET_OPTS.map((p) => (
                <button key={p.id} className={"seg-btn" + (preset === p.id ? " is-on" : "")} onClick={() => applyPreset(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="trace-grid">
            <Slider label={zh.trace.colors} value={opts.colors} min={2} max={8} onChange={(v) => setOpts({ ...opts, colors: v })} />
            <Slider label={zh.trace.detail} value={opts.detail} min={0} max={10} onChange={(v) => setOpts({ ...opts, detail: v })} />
            <Slider label={zh.trace.smooth} value={opts.smooth} min={10} max={100} onChange={(v) => setOpts({ ...opts, smooth: v })} />
            <Slider label={zh.trace.speckle} value={opts.speckle} min={0} max={30} onChange={(v) => setOpts({ ...opts, speckle: v })} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>{zh.btn.cancel}</button>
          <button
            className="btn btn-primary"
            disabled={!path || busy}
            onClick={() => {
              if (!path) return;
              setBusy(true);
              void onRun(path, { preset, ...opts }).then((ok) => {
                if (!ok) setBusy(false);
              });
            }}
          >
            {busy ? zh.trace.running : zh.trace.run}
          </button>
        </div>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="trace-slider">
      <div className="trace-slider-head">
        <span className="field-label">{label}</span>
        <span className="num faint">{value}</span>
      </div>
      <input className="dock-range" type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}
