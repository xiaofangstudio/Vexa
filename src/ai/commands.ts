/** Vexa 本地 AI 指令引擎：把中文设计口令解析成可撤销的文档操作。
 *
 * 这是离线模式，不联网、不调用外部模型；后续可把同一套 `AiReply`
 * 接到 OpenAI 兼容的 tool-calling 循环，UI 不需要改。
 */
import { addNode, circlePath, ellipsePath, newId, rectPath, removeNode } from "../core/docOps";
import { polygonPath, roundRectPath, starPath } from "../core/shapes";
import {
  alignNodes,
  arrangeNodes,
  distributeNodes,
  groupNodes,
  rotateNodes,
  translateNode,
  ungroupNodes,
  type AlignMode,
  type ArrangeMode,
} from "../core/vectorOps";
import {
  anchorAt,
  noPaint,
  noStroke,
  solid,
  type Node,
  type Paint,
  type PathNode,
  type Stroke,
  type TextNode,
  type VexaDoc,
} from "../core/types";

export type AiAction = "undo" | "redo" | "selectAll" | "clearSelection";

export interface AiReply {
  message: string;
  /** 变更后要选中的对象。 */
  selected?: string[];
  /** 不需要改文档的界面动作。 */
  action?: AiAction;
  /** 顶部 toast 文案。 */
  toast?: string;
  /** 供 UI 显示的是否命中。 */
  handled: boolean;
}

export interface AiContext {
  doc: VexaDoc;
  selected: string[];
  boardIndex: number;
  fill: Paint;
  stroke: Stroke;
}

const COLORS: Record<string, string> = {
  红: "#e5484d",
  红色: "#e5484d",
  珊瑚: "#e5484d",
  蓝: "#0f76d6",
  蓝色: "#0f76d6",
  天蓝: "#24a2ff",
  深蓝: "#0f2d5a",
  绿: "#2f9e44",
  绿色: "#2f9e44",
  草绿: "#74b816",
  黄: "#f5c518",
  黄色: "#f5c518",
  橙: "#ff7a00",
  橙色: "#ff7a00",
  紫: "#7048e8",
  紫色: "#7048e8",
  粉: "#e64980",
  粉色: "#e64980",
  黑: "#17171c",
  黑色: "#17171c",
  白: "#ffffff",
  白色: "#ffffff",
  灰: "#8f8f9c",
  灰色: "#8f8f9c",
};

const COLOR_LABEL = new Map(Object.entries(COLORS).map(([k, v]) => [v, k.endsWith("色") ? k : `${k}色`]));
const COLOR_NAMES = Object.keys(COLORS).sort((a, b) => b.length - a.length);

interface Entities {
  color?: string;
  w?: number;
  h?: number;
  size?: number;
  radius?: number;
  sides?: number;
  count?: number;
  distance?: number;
  angle?: number;
  text?: string;
  shape: "rect" | "roundrect" | "ellipse" | "circle" | "polygon" | "star" | "text" | "line";
  align?: AlignMode;
  arrange?: ArrangeMode;
  axis?: "h" | "v";
  corner?: "left" | "right" | "top" | "bottom";
  stroke?: boolean;
}

type Intent =
  | "create"
  | "color"
  | "move"
  | "rotate"
  | "align"
  | "distribute"
  | "arrange"
  | "group"
  | "ungroup"
  | "delete"
  | "duplicate"
  | "selectAll"
  | "clearSelection"
  | "undo"
  | "redo"
  | "card"
  | "poster"
  | "help"
  | "unknown";

const SHAPE_WORDS: Array<{ shape: Entities["shape"]; words: string[] }> = [
  { shape: "roundrect", words: ["圆角矩形", "圆角方块", "圆角"] },
  { shape: "circle", words: ["正圆", "圆形", "圆"] },
  { shape: "ellipse", words: ["椭圆", "扁圆"] },
  { shape: "star", words: ["星形", "星星", "五角星"] },
  { shape: "polygon", words: ["多边形", "六边形", "八边形", "五边形", "四边形", "三角形"] },
  { shape: "text", words: ["文字", "文本", "标题", "字"] },
  { shape: "line", words: ["直线", "线条"] },
  { shape: "rect", words: ["矩形", "方块", "方形", "方框"] },
];

function classify(input: string): Intent {
  const s = input.replace(/\s+/g, "");
  if (/^(帮助|help|能做什么|怎么用|你是谁|介绍)/i.test(s) || /你能做什么|你可以做什么/.test(s)) return "help";
  if (/(取消撤销|撤销|undo)/i.test(s)) return "undo";
  if (/(重做|redo)/i.test(s)) return "redo";
  if (/(取消选择|清空选择|取消选中|不选了)/.test(s)) return "clearSelection";
  if (/(全选|选中全部|选择全部)/.test(s)) return "selectAll";
  if (/(取消编组|解组|拆组)/.test(s)) return "ungroup";
  if (/(生成|做|来|画).*(卡片|名片)|卡片/.test(s)) return "card";
  if (/(生成|做|来|画).*(海报|封面|banner|横幅)/i.test(s)) return "poster";
  if (/(删除|删掉|移除|去掉)/.test(s)) return "delete";
  if (/(复制|克隆|再来一份|再来一个|拷贝)/.test(s)) return "duplicate";
  if (/(编组|组合|打个组|成组)/.test(s)) return "group";
  if (/(右移|左移|上移|下移|移动|挪)/.test(s)) return "move";
  if (/(旋转|转动|转\s*\d+\s*度|转一下)/.test(s)) return "rotate";
  if (/(等距|分布|间距均匀|平均排|均匀排)/.test(s)) return "distribute";
  if (/(置顶|置底|最前|最后|上移一层|下移一层|前移一层|后移一层)/.test(s)) return "arrange";
  if (/(左对齐|右对齐|顶对齐|底对齐|水平居中|垂直居中|对齐)/.test(s)) return "align";
  if (/(画|创建|添加|新建|生成|做一个|来一个|加个|加\d+个|加一个|写(?:上|个|一句)?)/.test(s) || SHAPE_WORDS.some((g) => g.words.some((w) => s.includes(w)))) return "create";
  if (/(填充|描边|改成|变成|换色|颜色|变红|变蓝|变绿|变黑|变白)/.test(s) || COLOR_NAMES.some((c) => s.includes(c))) return "color";
  return "unknown";
}

function firstNumber(s: string, re: RegExp): number | undefined {
  const m = s.match(re);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : undefined;
}

function extractColor(s: string): string | undefined {
  const hex = s.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
  if (hex) {
    const v = hex[1];
    return v.length === 3 ? `#${v.split("").map((c) => c + c).join("")}` : `#${v}`;
  }
  for (const name of COLOR_NAMES) {
    if (s.includes(name)) return COLORS[name];
  }
  return undefined;
}

function extractText(s: string): string | undefined {
  const quoted = s.match(/[“"「']([^”"」']+)[”"」']/);
  if (quoted) return quoted[1].trim();
  const after = s.match(/(?:写上|写作|写|文字|文本|标题|内容)[：:，,]?\s*(.+)$/);
  if (after) {
    return after[1]
      .replace(/[，,。.!！?？]+$/, "")
      .replace(/(红色|蓝色|绿色|黄色|橙色|紫色|粉色|黑色|白色|灰色)/g, "")
      .trim();
  }
  return undefined;
}

function parse(s: string): Entities {
  const compact = s.replace(/\s+/g, "");
  const e: Entities = { shape: "rect" };
  e.color = extractColor(compact);

  for (const g of SHAPE_WORDS) {
    if (g.words.some((w) => compact.includes(w))) {
      e.shape = g.shape;
      break;
    }
  }
  if (/(圆角矩形|圆角方块|圆角)/.test(compact)) e.shape = "roundrect";
  if (/(正圆|圆形)/.test(compact)) e.shape = "circle";
  if (/(椭圆|扁圆)/.test(compact)) e.shape = "ellipse";
  if (/(星形|星星|五角星)/.test(compact)) e.shape = "star";
  if (/(多边形|六边形|八边形|五边形|四边形|三角形)/.test(compact)) e.shape = "polygon";
  if (/(文字|文本|标题)/.test(compact)) e.shape = "text";
  if (/(直线|线条)/.test(compact)) e.shape = "line";

  const dims = compact.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)/);
  if (dims) {
    e.w = Number(dims[1]);
    e.h = Number(dims[2]);
  }
  e.w ??= firstNumber(compact, /宽(?:度)?[:：]?(\d+(?:\.\d+)?)/);
  e.h ??= firstNumber(compact, /高(?:度)?[:：]?(\d+(?:\.\d+)?)/);
  e.size = firstNumber(compact, /(?:字号|大小|尺寸)[:：]?(\d+(?:\.\d+)?)/);
  e.radius = firstNumber(compact, /半径[:：]?(\d+(?:\.\d+)?)/);
  if (e.radius && !e.w) e.w = e.radius * 2;
  if (e.radius && !e.h) e.h = e.radius * 2;
  e.sides = firstNumber(compact, /(\d+)\s*边形/);
  if (/三角/.test(compact)) e.sides = 3;
  if (/五角|五边/.test(compact)) e.sides = 5;
  if (/六边/.test(compact)) e.sides = 6;
  if (/八边/.test(compact)) e.sides = 8;
  const count = compact.match(/(\d+)\s*(?:个|张|块|颗|只)/);
  if (count) e.count = Math.max(1, Math.min(20, Number(count[1])));
  e.distance = firstNumber(compact, /(?:右移|左移|上移|下移|移动|挪动?)[了]?(\d+(?:\.\d+)?)/);
  e.angle = firstNumber(compact, /(?:旋转|转动|转)[了]?(\d+(?:\.\d+)?)/);
  e.text = extractText(s);

  if (/左对齐/.test(compact)) e.align = "left";
  else if (/右对齐/.test(compact)) e.align = "right";
  else if (/顶对齐|上对齐/.test(compact)) e.align = "top";
  else if (/底对齐|下对齐/.test(compact)) e.align = "bottom";
  else if (/水平居中/.test(compact)) e.align = "hcenter";
  else if (/垂直居中/.test(compact)) e.align = "vcenter";

  if (/水平等距|横向分布|水平分布|左右等距/.test(compact)) e.axis = "h";
  else if (/垂直等距|纵向分布|垂直分布|上下等距/.test(compact)) e.axis = "v";

  if (/置顶|最前/.test(compact)) e.arrange = "front";
  else if (/置底|最后/.test(compact)) e.arrange = "back";
  else if (/上移一层|前移一层/.test(compact)) e.arrange = "forward";
  else if (/下移一层|后移一层/.test(compact)) e.arrange = "backward";

  if (/右移|向右/.test(compact)) e.corner = "right";
  else if (/左移|向左/.test(compact)) e.corner = "left";
  else if (/上移|向上/.test(compact)) e.corner = "top";
  else if (/下移|向下/.test(compact)) e.corner = "bottom";
  e.stroke = /描边/.test(compact);
  return e;
}

function labelOf(color?: string): string {
  return (color && COLOR_LABEL.get(color)) || color || "当前颜色";
}

function boardOf(ctx: AiContext) {
  return ctx.doc.artboards[ctx.boardIndex] ?? ctx.doc.artboards[0] ?? { x: 0, y: 0, w: 900, h: 600 };
}

function makeText(doc: VexaDoc, text: string, x: number, y: number, size: number, fill: Paint, align: "left" | "center" | "right" = "left"): TextNode {
  return {
    kind: "text",
    id: newId(doc, "t"),
    name: text.slice(0, 12) || "文本",
    x,
    y,
    text,
    size,
    font: "Microsoft YaHei",
    align,
    lineHeight: 1.25,
    fill,
    opacity: 1,
    visible: true,
    locked: false,
  };
}

function makeLine(doc: VexaDoc, x: number, y: number, w: number, h: number, stroke: Stroke): PathNode {
  return {
    kind: "path",
    id: newId(doc, "l"),
    name: "直线",
    subpaths: [{ anchors: [anchorAt(x, y), anchorAt(x + w, y + h)], closed: false }],
    fill: noPaint(),
    stroke,
    opacity: 1,
    visible: true,
    locked: false,
  };
}

function createReply(ctx: AiContext, input: string, e: Entities): AiReply {
  const doc = ctx.doc;
  const board = boardOf(ctx);
  const color = e.color;
  const count = e.count ?? 1;
  const created: string[] = [];
  const pad = 72;
  let baseX = board.x + board.w / 2;
  let baseY = board.y + board.h / 2;
  if (/(左上|左上角)/.test(input)) {
    baseX = board.x + pad;
    baseY = board.y + pad;
  } else if (/(右上|右上角)/.test(input)) {
    baseX = board.x + board.w - pad;
    baseY = board.y + pad;
  } else if (/(左下|左下角)/.test(input)) {
    baseX = board.x + pad;
    baseY = board.y + board.h - pad;
  } else if (/(右下|右下角)/.test(input)) {
    baseX = board.x + board.w - pad;
    baseY = board.y + board.h - pad;
  }

  const fill = color ? solid(color) : (ctx.fill.kind === "none" ? solid("#0f76d6") : ctx.fill);
  const stroke = e.stroke ? { ...ctx.stroke, kind: "solid" as const, width: Math.max(1, ctx.stroke.width) } : noStroke();
  const text = e.text;
  const shape = text && (e.shape === "rect" || e.shape === "text") ? "text" : e.shape;
  const w = e.w ?? (shape === "roundrect" ? 320 : shape === "text" ? 0 : 240);
  const h = e.h ?? (shape === "roundrect" ? 200 : shape === "text" ? 0 : 160);
  const size = e.size ?? 32;

  for (let i = 0; i < count; i++) {
    const dx = (i % 4) * 28;
    const dy = Math.floor(i / 4) * 28;
    if (shape === "text") {
      const body = text ?? (i === 0 ? "Vexa AI" : `文本 ${i + 1}`);
      const node = makeText(doc, body, baseX + dx, baseY + dy, size, fill, "center");
      addNode(doc, node);
      created.push(node.id);
      continue;
    }
    if (shape === "line") {
      const len = e.w ?? 240;
      const node = makeLine(doc, baseX + dx - len / 2, baseY + dy, len, e.h ?? 0, stroke.kind === "none" ? { ...noStroke(), kind: "solid", color: color ?? "#17171c", width: 2 } : stroke);
      addNode(doc, node);
      created.push(node.id);
      continue;
    }
    let node: PathNode;
    if (shape === "circle") {
      const r = Math.max(8, Math.min(w, h) / 2);
      node = circlePath(newId(doc, "c"), "圆形", baseX + dx, baseY + dy, r);
    } else if (shape === "ellipse") {
      node = ellipsePath(newId(doc, "e"), "椭圆", baseX + dx, baseY + dy, Math.max(8, w / 2), Math.max(8, h / 2));
    } else if (shape === "roundrect") {
      node = roundRectPath(newId(doc, "r"), "圆角矩形", baseX + dx - w / 2, baseY + dy - h / 2, w, h, Math.min(w, h) * 0.12);
    } else if (shape === "polygon") {
      node = polygonPath(newId(doc, "p"), e.sides ? `${e.sides} 边形` : "多边形", baseX + dx, baseY + dy, Math.max(w, h) / 2, e.sides ?? 6);
    } else if (shape === "star") {
      node = starPath(newId(doc, "s"), "星形", baseX + dx, baseY + dy, Math.max(w, h) / 2, 5, 0.5);
    } else {
      node = rectPath(newId(doc, "r"), "矩形", baseX + dx - w / 2, baseY + dy - h / 2, w, h);
    }
    node.fill = fill;
    node.stroke = stroke;
    addNode(doc, node);
    created.push(node.id);
  }

  const what =
    shape === "text" ? "文字"
      : shape === "roundrect" ? "圆角矩形"
        : shape === "circle" ? "圆形"
          : shape === "ellipse" ? "椭圆"
            : shape === "polygon" ? (e.sides ? `${e.sides} 边形` : "多边形")
              : shape === "star" ? "星形"
                : shape === "line" ? "直线"
                  : "矩形";
  return {
    handled: true,
    message: `已在画板上生成 ${count} 个${what}${color ? `，颜色 ${labelOf(color)}` : ""}${text ? `，文字“${text}”` : ""}。`,
    selected: created,
    toast: `AI 已生成 ${created.length} 个对象`,
  };
}

function applyColor(ctx: AiContext, e: Entities): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "先选中要改色的对象，再说“改成红色”。" };
  const color = e.color ?? "#e5484d";
  const target = e.stroke ? "stroke" : "fill";
  let touched = 0;
  const walk = (id: string) => {
    const n = ctx.doc.nodes[id];
    if (!n) return;
    if (n.kind === "path" || n.kind === "text") {
      if (target === "fill") {
        n.fill = solid(color);
        touched++;
      } else if (n.kind === "path") {
        n.stroke = { ...n.stroke, kind: "solid", color, width: Math.max(1, n.stroke.width) };
        touched++;
      }
    } else if (n.kind === "group") {
      for (const c of n.children) walk(c);
    }
  };
  for (const id of ctx.selected) walk(id);
  return {
    handled: true,
    message: `已把 ${touched} 个对象的${target === "fill" ? "填充" : "描边"}改成${labelOf(color)}。`,
    selected: ctx.selected,
    toast: `AI 已改色 ${touched} 处`,
  };
}

function moveReply(ctx: AiContext, e: Entities): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "先选中对象，再说“右移 100”。" };
  const dist = e.distance ?? 20;
  const dx = e.corner === "left" ? -dist : e.corner === "right" ? dist : 0;
  const dy = e.corner === "top" ? -dist : e.corner === "bottom" ? dist : 0;
  for (const id of ctx.selected) {
    const n = ctx.doc.nodes[id];
    if (n) translateNode(ctx.doc, n, dx, dy);
  }
  const dir = e.corner === "left" ? "左" : e.corner === "right" ? "右" : e.corner === "top" ? "上" : "下";
  return {
    handled: true,
    message: `已把 ${ctx.selected.length} 个对象向${dir}移动 ${dist} px。`,
    selected: ctx.selected,
    toast: `AI 已移动 ${dist} px`,
  };
}

function alignReply(ctx: AiContext, e: Entities): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "先选中对象再对齐。" };
  const mode = e.align;
  if (!mode) return { handled: true, message: "可以说“左对齐 / 右对齐 / 顶对齐 / 水平居中”。" };
  alignNodes(ctx.doc, ctx.selected, mode);
  const names: Record<AlignMode, string> = { left: "左对齐", hcenter: "水平居中", right: "右对齐", top: "顶对齐", vcenter: "垂直居中", bottom: "底对齐" };
  return { handled: true, message: `已执行${names[mode]}。`, selected: ctx.selected, toast: `AI ${names[mode]}` };
}

function arrangeReply(ctx: AiContext, e: Entities): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "先选中对象再调整层级。" };
  if (!e.arrange) return { handled: true, message: "可以说“置顶 / 置底 / 上移一层 / 下移一层”。" };
  arrangeNodes(ctx.doc, ctx.selected, e.arrange);
  const names: Record<ArrangeMode, string> = { front: "置顶", back: "置底", forward: "上移一层", backward: "下移一层" };
  return { handled: true, message: `已${names[e.arrange]}。`, selected: ctx.selected, toast: `AI ${names[e.arrange]}` };
}

function distributeReply(ctx: AiContext, e: Entities): AiReply {
  if (ctx.selected.length < 3) return { handled: true, message: "等距分布至少要选中 3 个对象。" };
  const axis = e.axis ?? "h";
  distributeNodes(ctx.doc, ctx.selected, axis);
  return { handled: true, message: `已按${axis === "h" ? "水平" : "垂直"}方向等距分布 ${ctx.selected.length} 个对象。`, selected: ctx.selected, toast: "AI 已等距分布" };
}

function cloneSelected(ctx: AiContext): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "先选中对象再复制。" };
  const doc = ctx.doc;
  const map = new Map<string, string>();
  const cloneNode = (srcId: string): string | null => {
    const old = map.get(srcId);
    if (old) return old;
    const src = doc.nodes[srcId];
    if (!src) return null;
    const id = newId(doc, src.kind === "path" ? "cp" : src.kind === "text" ? "ct" : "cg");
    map.set(srcId, id);
    const copy = JSON.parse(JSON.stringify(src)) as Node;
    copy.id = id;
    doc.nodes[id] = copy;
    if (copy.kind === "group" && src.kind === "group") {
      copy.children = src.children.map(cloneNode).filter((v): v is string => !!v);
      if (src.clip) {
        const c = map.get(src.clip) ?? cloneNode(src.clip);
        if (c) copy.clip = c;
        else delete copy.clip;
      }
    }
    return id;
  };

  const copies: string[] = [];
  for (const id of ctx.selected) {
    const cid = cloneNode(id);
    if (!cid) continue;
    const n = doc.nodes[cid];
    if (n) translateNode(doc, n, 24, 24);
    addNode(doc, n!);
    copies.push(cid);
  }
  return { handled: true, message: `已复制 ${copies.length} 个对象并偏移 24 px。`, selected: copies, toast: "AI 已复制对象" };
}

function makeCard(ctx: AiContext): AiReply {
  const doc = ctx.doc;
  const board = boardOf(ctx);
  const w = Math.min(720, Math.max(420, board.w * 0.72));
  const h = Math.min(440, Math.max(260, w * 0.58));
  const x = board.x + (board.w - w) / 2;
  const y = board.y + (board.h - h) / 2;
  const ids: string[] = [];
  const bg = roundRectPath(newId(doc, "k"), "卡片底板", x, y, w, h, 24);
  bg.fill = solid("#ffffff");
  bg.stroke = { ...noStroke(), kind: "solid", color: "#e6e6ec", width: 1 };
  addNode(doc, bg);
  ids.push(bg.id);

  const bar = rectPath(newId(doc, "k"), "强调条", x + 36, y + 36, 6, 54);
  bar.fill = solid("#0f76d6");
  addNode(doc, bar);
  ids.push(bar.id);

  const title = makeText(doc, "新卡片", x + 60, y + 36, 34, solid("#17171c"), "left");
  title.bold = true;
  addNode(doc, title);
  ids.push(title.id);

  const body = makeText(doc, "一句话说清楚这张卡片要表达什么。", x + 60, y + 96, 18, solid("#8f8f9c"), "left");
  addNode(doc, body);
  ids.push(body.id);

  const dot = circlePath(newId(doc, "k"), "装饰圆", x + w - 80, y + h - 76, 34);
  dot.fill = solid("#e5484d");
  addNode(doc, dot);
  ids.push(dot.id);

  const group = groupNodes(doc, ids);
  if (group && doc.nodes[group]) doc.nodes[group].name = "AI 卡片";
  return {
    handled: true,
    message: `已在画板中心生成一张 ${Math.round(w)} × ${Math.round(h)} 的卡片，含标题和正文，可继续用“改成蓝色”等口令调整。`,
    selected: group ? [group] : ids,
    toast: "AI 已生成卡片",
  };
}

function makePoster(ctx: AiContext): AiReply {
  const doc = ctx.doc;
  const board = boardOf(ctx);
  const x = board.x;
  const y = board.y;
  const w = board.w;
  const h = board.h;
  const ids: string[] = [];
  const bg = rectPath(newId(doc, "k"), "海报底色", x, y, w, h);
  bg.fill = solid("#0f2d5a");
  addNode(doc, bg);
  ids.push(bg.id);

  const title = makeText(doc, "VEXA", x + 72, y + h * 0.26, Math.max(48, Math.min(140, w * 0.12)), solid("#ffffff"), "left");
  title.bold = true;
  addNode(doc, title);
  ids.push(title.id);

  const sub = makeText(doc, "让想法直接变成矢量", x + 76, y + h * 0.26 + Math.max(64, w * 0.13), Math.max(18, w * 0.028), solid("#a9c7ff"), "left");
  addNode(doc, sub);
  ids.push(sub.id);

  const accent = circlePath(newId(doc, "k"), "海报强调圆", x + w * 0.76, y + h * 0.66, Math.min(w, h) * 0.16);
  accent.fill = solid("#e5484d");
  addNode(doc, accent);
  ids.push(accent.id);

  const line = rectPath(newId(doc, "k"), "底部线", x + 76, y + h - 92, w * 0.44, 3);
  line.fill = solid("#24a2ff");
  addNode(doc, line);
  ids.push(line.id);

  const group = groupNodes(doc, ids);
  if (group && doc.nodes[group]) doc.nodes[group].name = "AI 海报";
  return {
    handled: true,
    message: "已按当前画板生成一张 VEXA 海报：深蓝底、白色标题、强调圆和底部线。可以继续说“把强调圆改成黄色”。",
    selected: group ? [group] : ids,
    toast: "AI 已生成海报",
  };
}

function deleteReply(ctx: AiContext): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "当前没有选中对象。" };
  const count = ctx.selected.length;
  for (const id of ctx.selected) removeNode(ctx.doc, id);
  return {
    handled: true,
    message: `已删除 ${count} 个对象，Ctrl+Z 可撤销。`,
    selected: [],
    toast: `AI 已删除 ${count} 个对象`,
  };
}

function ungroupReply(ctx: AiContext): AiReply {
  if (!ctx.selected.length) return { handled: true, message: "先选中组再取消编组。" };
  const freed = ungroupNodes(ctx.doc, ctx.selected);
  if (!freed.length) return { handled: true, message: "选中的对象里没有可拆的组。" };
  return { handled: true, message: `已取消编组，释放 ${freed.length} 个子对象。`, selected: freed, toast: "AI 已取消编组" };
}

function groupReply(ctx: AiContext): AiReply {
  if (ctx.selected.length < 2) return { handled: true, message: "编组至少要选中 2 个对象。" };
  const id = groupNodes(ctx.doc, ctx.selected);
  if (!id) return { handled: true, message: "这些对象不能编组。" };
  return { handled: true, message: `已把 ${ctx.selected.length} 个对象编成一组。`, selected: [id], toast: "AI 已编组" };
}

function duplicateReply(ctx: AiContext): AiReply {
  return cloneSelected(ctx);
}

/** 供 UI 判断是否需要先包一层 commit（帮助、撤销、选择等不改文档）。 */
export function aiNeedsCommit(input: string): boolean {
  const intent = classify(input.trim());
  return !(intent === "help" || intent === "unknown" || intent === "undo" || intent === "redo" || intent === "selectAll" || intent === "clearSelection");
}

export function runAiCommand(input: string, ctx: AiContext): AiReply {
  const raw = input.trim();
  if (!raw) return { handled: false, message: "" };
  const intent = classify(raw);
  const e = parse(raw);

  switch (intent) {
    case "help":
      return {
        handled: true,
        message:
          "我能离线干这些事：\n" +
          "· 生成图形：“画一个 300×200 的红色圆角矩形”“在画板中心加个六边形”\n" +
          "· 生成内容：“写上‘让想法变成矢量’”“生成卡片”“生成海报”\n" +
          "· 改选中的对象：“改成蓝色”“描边改橙色”“右移 100”“旋转 45 度”\n" +
          "· 排布：“左对齐”“水平等距”“置顶”“编组 / 取消编组”“复制”\n" +
          "· 文档：“全选”“删除选中”“撤销”“重做”\n" +
          "所有改动都走一次撤销栈，Ctrl+Z 可回退。",
      };
    case "undo":
      return { handled: true, action: "undo", message: "已撤销一步。" };
    case "redo":
      return { handled: true, action: "redo", message: "已重做一步。" };
    case "selectAll":
      return { handled: true, action: "selectAll", message: `已选中全部 ${ctx.doc.root.length} 个顶层对象。` };
    case "clearSelection":
      return { handled: true, action: "clearSelection", message: "已取消选择。" };
    case "card":
      return makeCard(ctx);
    case "poster":
      return makePoster(ctx);
    case "delete":
      return deleteReply(ctx);
    case "duplicate":
      return duplicateReply(ctx);
    case "group":
      return groupReply(ctx);
    case "ungroup":
      return ungroupReply(ctx);
    case "color":
      return applyColor(ctx, e);
    case "move":
      return moveReply(ctx, e);
    case "rotate": {
      if (!ctx.selected.length) return { handled: true, message: "先选中对象再旋转。" };
      const angle = e.angle ?? 90;
      rotateNodes(ctx.doc, ctx.selected, angle);
      return { handled: true, message: `已把 ${ctx.selected.length} 个对象旋转 ${angle}°。`, selected: ctx.selected, toast: `AI 已旋转 ${angle}°` };
    }
    case "align":
      return alignReply(ctx, e);
    case "distribute":
      return distributeReply(ctx, e);
    case "arrange":
      return arrangeReply(ctx, e);
    case "create":
      return createReply(ctx, raw, e);
    default:
      return {
        handled: false,
        message:
          "这句还没听懂。可以试试：\n" +
          "“画一个 300×200 的红色圆角矩形”\n" +
          "“把选中的改成蓝色”“右移 100”\n" +
          "“生成卡片”“生成海报”“全部左对齐”",
      };
  }
}

/** 供 UI 显示颜色的小圆点。 */
export function aiColorOf(input: string): string | null {
  return extractColor(input) ?? null;
}
