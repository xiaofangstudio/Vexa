/** Vexa 文档模型：纯数据，可 JSON 序列化。 */

export type Pt = { x: number; y: number };

export type PaintKind = "none" | "solid" | "linear" | "radial";

export interface GradStop {
  offset: number;
  color: string;
  /** 色标自身透明度 0..1；缺省为 1。与填充整体 opacity 相乘。 */
  alpha?: number;
  /** 与上一个色标之间的插值中点 0..1；缺省 0.5。首个色标忽略。 */
  midpoint?: number;
}

/** 线性渐变：角度按数学方向（0° 向右，90° 向下）。径向渐变复用 stops，中心在 bbox 中心。 */
export interface LinearGrad {
  angle: number;
  stops: GradStop[];
}

export interface Paint {
  kind: PaintKind;
  color: string;
  opacity: number;
  grad?: LinearGrad;
  /** 链接的文档色板 id；仅实色填充/描边有效，改色板时同步换色。 */
  swatch?: string;
}

/** 文档色板。process 为印刷色，spot 为专色（当前按 sRGB 近似显示）。 */
export type SwatchKind = "process" | "spot";

export interface Swatch {
  id: string;
  name: string;
  color: string;
  kind: SwatchKind;
}

/** 文档级图形样式：记录填充、描边、透明度与混合模式；套用后可继续更新链接对象。 */
export interface GraphicStyle {
  id: string;
  name: string;
  fill: Paint;
  stroke?: Stroke;
  opacity: number;
  blend?: BlendMode;
}

/** 宽度点：t 为沿子路径长度的比例；left / right 是相对描边宽度的倍数。 */
export interface WidthPoint {
  t: number;
  left: number;
  right: number;
}

export type StrokeCap = "butt" | "round" | "square";
export type StrokeJoin = "miter" | "round" | "bevel";

export interface Stroke {
  kind: PaintKind;
  color: string;
  opacity: number;
  width: number;
  dash: number[];
  /** 开放子路径两端端帽；默认 butt。 */
  cap?: StrokeCap;
  /** 子路径拐角连接；默认 miter。 */
  join?: StrokeJoin;
  /** 端点箭头，仅对开放子路径的末端生效。 */
  arrow?: "none" | "triangle" | "open" | "diamond";
  /** 非均匀描边宽度点；缺省或少于 2 个时按均匀宽度绘制。 */
  widthPoints?: WidthPoint[];
  /** 链接的文档色板 id；仅实色描边有效。 */
  swatch?: string;
}

/** 锚点。hIn / hOut 是绝对坐标；null 表示该侧没有手柄（直线段）。 */
export interface Anchor {
  x: number;
  y: number;
  hIn: Pt | null;
  hOut: Pt | null;
  smooth: boolean;
}

/** 直接选择里被选中的锚点：节点 + 子路径 + 锚点序号。 */
export interface AnchorRef {
  nodeId: string;
  si: number;
  ai: number;
}

export interface SubPath {
  anchors: Anchor[];
  closed: boolean;
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
];

export type LayerTag = "red" | "orange" | "yellow" | "green" | "blue" | "purple";

export const LAYER_TAGS: Array<{ id: LayerTag; label: string; color: string }> = [
  { id: "red", label: "红", color: "#d65a4a" },
  { id: "orange", label: "橙", color: "#d98a3b" },
  { id: "yellow", label: "黄", color: "#c9a63d" },
  { id: "green", label: "绿", color: "#4f9b6b" },
  { id: "blue", label: "蓝", color: "#4c82c4" },
  { id: "purple", label: "紫", color: "#8b6bb3" },
];

export interface PathNode {
  kind: "path";
  id: string;
  name: string;
  subpaths: SubPath[];
  fill: Paint;
  stroke: Stroke;
  /** 链接的图形样式 id；样式面板更新时同步外观。 */
  graphicStyle?: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blend?: BlendMode;
  /** 图层颜色标记，仅用于图层面板分组和筛选。 */
  tag?: LayerTag;
}

export interface TextNode {
  kind: "text";
  id: string;
  name: string;
  x: number;
  y: number;
  text: string;
  size: number;
  font: string;
  bold?: boolean;
  italic?: boolean;
  /** 行距倍数，默认 1.25 */
  lineHeight?: number;
  /** 字距，单位 px */
  tracking?: number;
  align?: "left" | "center" | "right";
  /** 水平/垂直缩放百分比，100 为原大 */
  hScale?: number;
  vScale?: number;
  /** 基线偏移，单位 px，正数向上 */
  baseline?: number;
  /** point = 单点文字（x/y 为基线锚点）；area = 区域文字（x/y 为文本框左上角）；path = 路径文字 */
  textMode?: "point" | "area" | "path";
  /** 区域文字框宽高，仅 textMode=area 时有效 */
  boxW?: number;
  boxH?: number;
  /** 路径文字的承载路径，绝对坐标；仅 textMode=path 时有效。 */
  pathSubpaths?: SubPath[];
  /** 路径文字从路径起点开始的偏移，单位 px。 */
  pathStart?: number;
  /** 路径文字排在路径左侧（上方）还是右侧（下方）。 */
  pathSide?: "left" | "right";
  /** 区域文字在框内的垂直对齐，默认 top。 */
  areaVAlign?: "top" | "middle" | "bottom";
  /** 段落首行缩进，单位 px；仅区域文字。 */
  firstIndent?: number;
  /** 首行之后的悬挂缩进，单位 px；仅区域文字。 */
  hangingIndent?: number;
  /** 段落左侧缩进，单位 px；仅横排区域文字，分栏时作用于每栏。 */
  leftIndent?: number;
  /** 段落右侧缩进，单位 px；仅横排区域文字，分栏时作用于每栏。 */
  rightIndent?: number;
  /** 区域文字四边内边距，单位 px；默认 4，横排/直排共用。 */
  textInset?: number;
  /** 段间距，单位 px；仅区域文字。 */
  paraSpace?: number;
  /** 每段之前的额外间距，单位 px；仅横排区域文字。 */
  spaceBefore?: number;
  /** 每段之后的额外间距，单位 px；仅横排区域文字。 */
  spaceAfter?: number;
  /** 区域文字分栏数，默认 1；仅区域文字。 */
  columns?: number;
  /** 分栏之间的栏距，单位 px；仅区域文字。 */
  columnGutter?: number;
  /** 文字方向：缺省横排；vertical 为直排（逐字向下、换列向左）。 */
  textDirection?: "horizontal" | "vertical";
  /** 下划线；颜色跟随填充。 */
  underline?: boolean;
  /** 删除线；颜色跟随填充。 */
  strike?: boolean;
  /** 区域文字避头尾：行首不落收尾标点、行末不落起首标点；缺省关闭。 */
  kinsoku?: boolean;
  /** 直排标点挤压：收尾/起首标点的字格缩到 0.55em；缺省关闭。 */
  punctCompress?: boolean;
  fill: Paint;
  /** 链接的图形样式 id；样式面板更新时同步外观。 */
  graphicStyle?: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blend?: BlendMode;
  /** 图层颜色标记，仅用于图层面板分组和筛选。 */
  tag?: LayerTag;
}

export interface ImageNode {
  kind: "image";
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blend?: BlendMode;
  /** 图层颜色标记，仅用于图层面板分组和筛选。 */
  tag?: LayerTag;
}

export interface GroupNode {
  kind: "group";
  id: string;
  name: string;
  children: string[];
  opacity: number;
  visible: boolean;
  locked: boolean;
  blend?: BlendMode;
  /** 剪切蒙版：子节点 id，用它的路径裁切本组其余内容（该子节点本身不绘制）。 */
  clip?: string;
  /** 图层颜色标记，仅用于图层面板分组和筛选。 */
  tag?: LayerTag;
}

/** 符号实例：引用文档级 SymbolDef，按 x/y/w/h 缩放绘制；改定义后所有实例同步。 */
export interface SymbolNode {
  kind: "symbol";
  id: string;
  name: string;
  symbolId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  blend?: BlendMode;
  /** 图层颜色标记，仅用于图层面板分组和筛选。 */
  tag?: LayerTag;
}

/** 符号定义：保存一份独立坐标系的 artwork，实例只引用它。 */
export interface SymbolDef {
  id: string;
  name: string;
  w: number;
  h: number;
  nodes: Record<string, Node>;
  root: string[];
}

export type Node = PathNode | TextNode | ImageNode | GroupNode | SymbolNode;

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
}

export interface VexaDoc {
  format: "vexa";
  version: 1;
  name: string;
  unit: "px";
  artboards: Artboard[];
  nodes: Record<string, Node>;
  /** 根层叠顺序，末尾在最上。 */
  root: string[];
  seq: number;
  /** 文档级色板；老工程可缺省。 */
  swatches?: Swatch[];
  /** 文档级图形样式；老工程可缺省。 */
  styles?: GraphicStyle[];
  /** 文档级符号定义；老工程可缺省。 */
  symbols?: SymbolDef[];
}

export const solid = (color: string, opacity = 1): Paint => ({ kind: "solid", color, opacity });
export const linearPaint = (from: string, to: string, angle = 90, opacity = 1): Paint => ({
  kind: "linear",
  color: from,
  opacity,
  grad: {
    angle,
    stops: [
      { offset: 0, color: from },
      { offset: 1, color: to },
    ],
  },
});
export const radialPaint = (from: string, to: string, opacity = 1): Paint => ({
  kind: "radial",
  color: from,
  opacity,
  grad: {
    angle: 0,
    stops: [
      { offset: 0, color: from },
      { offset: 1, color: to },
    ],
  },
});
export const noPaint = (): Paint => ({ kind: "none", color: "#000000", opacity: 1 });
export const noStroke = (color = "#17171c"): Stroke => ({
  kind: "none",
  color,
  opacity: 1,
  width: 1,
  dash: [],
  cap: "butt",
  join: "miter",
});

export function anchorAt(x: number, y: number, smooth = false): Anchor {
  return { x, y, hIn: null, hOut: null, smooth };
}

export function isPath(n: Node | undefined): n is PathNode {
  return !!n && n.kind === "path";
}
