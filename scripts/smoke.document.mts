import { createDoc, rectPath } from "../src/core/docOps";
import {
  applyDocSettings,
  docSettingsStats,
  normalizeDocSettings,
  readDocSettings,
  validateDocSettings,
  type DocSettings,
} from "../src/core/documentSettings";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const doc = createDoc("文档 A", 1080, 1080);
doc.nodes["card"] = rectPath("card", "卡片", 100, 100, 200, 120);
doc.root.push("card");

const read = readDocSettings(doc, 0)!;
check("read name", read.name, "文档 A");
check("read board name", read.boardName, doc.artboards[0].name);
check("read size", [read.width, read.height], [1080, 1080]);
check("read bg", read.background, doc.artboards[0].bg);

check("stats", docSettingsStats(doc), { artboards: 1, nodes: 1, roots: 1 });

const base: DocSettings = {
  name: "  新文档  ",
  boardName: "  主画板  ",
  width: 794.6,
  height: 1122.4,
  background: "#AABBCC",
};
check("normalize", normalizeDocSettings(base, 0), {
  name: "新文档",
  boardName: "主画板",
  width: 795,
  height: 1122,
  background: "#aabbcc",
});
check("normalize empty names", normalizeDocSettings({ ...base, name: "   ", boardName: "" }, 2), {
  name: "未命名",
  boardName: "画板 3",
  width: 795,
  height: 1122,
  background: "#aabbcc",
});
check("normalize clamp low", normalizeDocSettings({ ...base, width: 0, height: -3 }, 0).width, 1);
check("normalize clamp high", normalizeDocSettings({ ...base, width: 30000, height: 99999 }, 0).height, 20000);
check("normalize invalid bg", normalizeDocSettings({ ...base, background: "red" }, 0).background, "#ffffff");

check("validate ok", validateDocSettings(base), null);
check("validate number", validateDocSettings({ ...base, width: Number.NaN }), "尺寸必须是数字");
check("validate min", validateDocSettings({ ...base, width: 0 }), "画板尺寸不能小于 1 px");
check("validate max", validateDocSettings({ ...base, height: 20001 }), "画板尺寸不能超过 20000 px");
check("validate bg", validateDocSettings({ ...base, background: "#fff" }), "背景色需为 6 位十六进制");

const beforeNodes = JSON.stringify(doc.nodes);
const beforeRoot = JSON.stringify(doc.root);
const result = applyDocSettings(doc, 0, base);
check("apply ok", result, { ok: true, boards: 1 });
check("apply name", doc.name, "新文档");
check("apply board name", doc.artboards[0].name, "主画板");
check("apply size", [doc.artboards[0].w, doc.artboards[0].h], [795, 1122]);
check("apply bg", doc.artboards[0].bg, "#aabbcc");
check("apply keeps nodes", JSON.stringify(doc.nodes), beforeNodes);
check("apply keeps root", JSON.stringify(doc.root), beforeRoot);

const beforeBoard = [doc.artboards[0].name, doc.artboards[0].w, doc.artboards[0].h, doc.artboards[0].bg];
const bad = applyDocSettings(doc, 0, { ...base, width: 0 });
check("apply bad size", bad, { ok: false, error: "画板尺寸不能小于 1 px" });
check("apply bad size no mutation", [doc.artboards[0].name, doc.artboards[0].w, doc.artboards[0].h, doc.artboards[0].bg], beforeBoard);
check("apply missing board", applyDocSettings(doc, 9, base), { ok: false, error: "画板不存在" });

// 批量应用：只同步尺寸/背景，画板名与内容坐标不动
const batch = createDoc("批量文档", 900, 600);
batch.nodes["card"] = rectPath("card", "卡片", 40, 50, 120, 80);
batch.root.push("card");
batch.artboards.push({ id: "b2", name: "第二画板", x: 1000, y: 0, w: 400, h: 300, bg: "#eeeeee" });
const batchPatch: DocSettings = { name: "统一文档", boardName: "主画板", width: 1200, height: 800, background: "#123456" };
const beforeBatchNodes = JSON.stringify(batch.nodes);
const batchResult = applyDocSettings(batch, 0, batchPatch, { allBoards: true });
check("批量应用画板数", batchResult, { ok: true, boards: 2 });
check("批量文档名", batch.name, "统一文档");
check("批量当前画板名", batch.artboards[0].name, "主画板");
check("批量第二画板名不动", batch.artboards[1].name, "第二画板");
check("批量尺寸", batch.artboards.map((b) => [b.w, b.h]), [[1200, 800], [1200, 800]]);
check("批量背景", batch.artboards.map((b) => b.bg), ["#123456", "#123456"]);
check("批量不动画板坐标", batch.artboards.map((b) => [b.x, b.y]), [[0, 0], [1000, 0]]);
check("批量不动节点", JSON.stringify(batch.nodes), beforeBatchNodes);

const single = createDoc("单板", 900, 600);
single.artboards.push({ id: "b2", name: "第二画板", x: 1000, y: 0, w: 400, h: 300, bg: "#eeeeee" });
const singleResult = applyDocSettings(single, 0, { ...batchPatch, width: 1000, height: 700, background: "#abcdef" });
check("未勾选只改当前", singleResult, { ok: true, boards: 1 });
check("未勾选当前尺寸", [single.artboards[0].w, single.artboards[0].h], [1000, 700]);
check("未勾选第二画板不变", [single.artboards[1].w, single.artboards[1].h, single.artboards[1].bg], [400, 300, "#eeeeee"]);

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有文档设置用例通过");
