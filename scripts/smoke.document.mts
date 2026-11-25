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
check("apply ok", result, { ok: true });
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

if (failed) {
  console.error(`\n${failed} FAILED`);
  process.exit(1);
}
console.log("\n所有文档设置用例通过");
