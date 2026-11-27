/** 本地 AI 指令引擎冒烟：生成、改色、移动、对齐、卡片/海报、删除与复制。 */
import { createDoc, rectPath } from "../src/core/docOps";
import { nodeBox } from "../src/core/geom";
import { aiNeedsCommit, runAiCommand, type AiContext } from "../src/ai/commands";
import { solid, noStroke, type VexaDoc } from "../src/core/types";

const pass: string[] = [];
const fail: string[] = [];
const check = (name: string, ok: boolean, extra = "") => {
  (ok ? pass : fail).push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " · " + extra : ""}`);
};

function ctxOf(doc: VexaDoc, selected: string[] = []): AiContext {
  return { doc, selected, boardIndex: 0, fill: solid("#0f76d6"), stroke: noStroke() };
}

function run(doc: VexaDoc, input: string, selected: string[] = []) {
  return runAiCommand(input, ctxOf(doc, selected));
}

// 1. 帮助与提交判定
const helpDoc = createDoc("AI", 900, 600);
const help = run(helpDoc, "你能做什么");
check("帮助有回复", help.handled && /离线/.test(help.message));
check("帮助不进撤销栈", !aiNeedsCommit("你能做什么"));
check("生成会进撤销栈", aiNeedsCommit("画一个红色矩形"));

// 2. 生成红色圆角矩形
const d1 = createDoc("AI", 900, 600);
const r1 = run(d1, "画一个 300x200 的红色圆角矩形");
check("生成一个对象", d1.root.length === 1, String(d1.root.length));
const n1 = d1.nodes[d1.root[0]];
check("生成是路径", n1?.kind === "path");
const b1 = n1 && n1.kind === "path" ? nodeBox(n1) : null;
check("尺寸 300×200", !!b1 && Math.abs(b1.w - 300) < 1 && Math.abs(b1.h - 200) < 1, b1 ? `${b1.w}×${b1.h}` : "null");
check("填充红色", n1?.kind === "path" && n1.fill.kind === "solid" && n1.fill.color === "#e5484d", n1?.kind === "path" ? n1.fill.color : "");
check("新对象被选中", r1.selected?.length === 1);

// 3. 生成文字
const d2 = createDoc("AI", 900, 600);
const r2 = run(d2, "写上“让想法变成矢量”");
check("文字对象落地", d2.root.length === 1 && d2.nodes[d2.root[0]]?.kind === "text");
check("文字内容正确", d2.nodes[d2.root[0]]?.kind === "text" && (d2.nodes[d2.root[0]] as any).text === "让想法变成矢量");
check("文字回复含句子", r2.message.includes("让想法变成矢量"));

// 4. 改填充/描边
const d3 = createDoc("AI", 900, 600);
const a = rectPath("a", "A", 100, 100, 100, 100);
const b = rectPath("b", "B", 260, 100, 100, 100);
a.fill = solid("#e5484d");
b.fill = solid("#e5484d");
d3.nodes.a = a;
d3.nodes.b = b;
d3.root.push("a", "b");
const c1 = run(d3, "改成蓝色", ["a", "b"]);
check("批量改填充", a.fill.color === "#0f76d6" && b.fill.color === "#0f76d6");
check("改色计数回复", /2 个对象/.test(c1.message));
const c2 = run(d3, "描边改橙色", ["a"]);
check("单对象描边", a.stroke.kind === "solid" && a.stroke.color === "#ff7a00");

// 5. 移动与旋转
const d4 = createDoc("AI", 900, 600);
const m = rectPath("m", "M", 100, 100, 100, 100);
d4.nodes.m = m;
d4.root.push("m");
run(d4, "右移 100", ["m"]);
check("右移 100", nodeBox(m)!.x === 200, String(nodeBox(m)!.x));
run(d4, "旋转 90", ["m"]);
const rb = nodeBox(m)!;
check("旋转后包围盒仍 100×100", Math.abs(rb.w - 100) < 0.1 && Math.abs(rb.h - 100) < 0.1, `${rb.w}×${rb.h}`);

// 6. 两对象对齐
const d5 = createDoc("AI", 900, 600);
const x1 = rectPath("x1", "X1", 100, 100, 80, 80);
const x2 = rectPath("x2", "X2", 300, 200, 80, 80);
d5.nodes.x1 = x1;
d5.nodes.x2 = x2;
d5.root.push("x1", "x2");
run(d5, "左对齐", ["x1", "x2"]);
check("左对齐同步 X", nodeBox(x1)!.x === nodeBox(x2)!.x, `${nodeBox(x1)!.x} / ${nodeBox(x2)!.x}`);

// 7. 卡片与海报
const d6 = createDoc("AI", 1080, 1080);
const card = run(d6, "生成卡片");
const cardNode = card.selected?.[0] ? d6.nodes[card.selected[0]] : undefined;
check("卡片生成组", cardNode?.kind === "group");
check("卡片组名", cardNode?.kind === "group" && cardNode.name === "AI 卡片");
check("卡片至少 5 个子层", cardNode?.kind === "group" && cardNode.children.length >= 5, cardNode?.kind === "group" ? String(cardNode.children.length) : "");
const poster = run(d6, "生成海报");
const posterNode = poster.selected?.[0] ? d6.nodes[poster.selected[0]] : undefined;
check("海报生成组", posterNode?.kind === "group");
check("海报组名", posterNode?.kind === "group" && posterNode.name === "AI 海报");

// 8. 复制、编组、取消编组
const d7 = createDoc("AI", 900, 600);
const q1 = rectPath("q1", "Q1", 100, 100, 60, 60);
const q2 = rectPath("q2", "Q2", 200, 100, 60, 60);
d7.nodes.q1 = q1;
d7.nodes.q2 = q2;
d7.root.push("q1", "q2");
const dup = run(d7, "复制", ["q1"]);
check("复制新增一个根层", d7.root.length === 3, String(d7.root.length));
check("复制结果被选中", dup.selected?.length === 1);
const grp = run(d7, "编组", ["q1", "q2"]);
const g = grp.selected?.[0] ? d7.nodes[grp.selected[0]] : undefined;
check("编组成功", g?.kind === "group" && g.children.length === 2);
const ung = run(d7, "取消编组", grp.selected ?? []);
check("取消编组释放两个", ung.selected?.length === 2, String(ung.selected?.length));

// 9. 删除
const d8 = createDoc("AI", 900, 600);
const z = rectPath("z", "Z", 100, 100, 60, 60);
d8.nodes.z = z;
d8.root.push("z");
const del = run(d8, "删除选中", ["z"]);
check("删除后节点消失", !d8.nodes.z && d8.root.length === 0);
check("删除后选择清空", del.selected?.length === 0);

// 10. 未知口令
const unk = run(createDoc("AI", 900, 600), "帮我把这个项目做成一个能赚钱的 App");
check("未知口令不装懂", !unk.handled && /没听懂/.test(unk.message));

// 11. 多形状与数量
const d9 = createDoc("AI", 900, 600);
const multi = run(d9, "加 3 个黄色星星");
check("数量 3 落地", d9.root.length === 3, String(d9.root.length));
check("星星填充黄色", d9.nodes[d9.root[0]]?.kind === "path" && (d9.nodes[d9.root[0]] as any).fill.color === "#f5c518");

console.log(`\n${fail.length ? "有失败" : "全部通过"} · PASS ${pass.length} / FAIL ${fail.length}`);
if (fail.length) process.exit(1);
