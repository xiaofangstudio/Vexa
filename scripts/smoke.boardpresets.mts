import {
  MAX_CUSTOM_PRESETS,
  addCustomPreset,
  exportPresetsJSON,
  findPresetBySize,
  mergeCustomPresets,
  parsePresetsJSON,
  removeCustomPreset,
  sanitizeCustomPresets,
} from "../src/core/boardPresets";
import type { BoardPreset } from "../src/core/artboards";

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
  if (!ok) failed++;
};

const shape = (p: BoardPreset) => ({ label: p.label, w: p.w, h: p.h });

check("non-array sanitizes empty", sanitizeCustomPresets("bad"), []);
check(
  "sanitize dims and dedupe",
  sanitizeCustomPresets([
    { label: " 名片 ", width: 90, height: 54 },
    { label: "重复", w: 90, h: 54 },
    { label: "太大", w: 20001, h: 10 },
    { label: "小数", w: 10.4, h: 20.6 },
  ]),
  [
    { id: "custom-90x54-1", label: "名片", note: "90 × 54", w: 90, h: 54 },
    { id: "custom-10x21-2", label: "小数", note: "10 × 21", w: 10, h: 21 },
  ],
);
check(
  "fallback label and invalid id",
  sanitizeCustomPresets([{ id: "builtin", w: 300, h: 200 }]),
  [{ id: "custom-300x200-1", label: "自定义 1", note: "300 × 200", w: 300, h: 200 }],
);
check(
  "sanitize cap",
  sanitizeCustomPresets(Array.from({ length: 25 }, (_, i) => ({ label: `P${i}`, w: 10 + i, h: 20 + i }))).length,
  MAX_CUSTOM_PRESETS,
);
check("duplicate id rewritten", sanitizeCustomPresets([{ id: "custom-x", w: 1, h: 1 }, { id: "custom-x", w: 2, h: 2 }])[1].id !== "custom-x", true);

let idSeq = 0;
const add = (list: BoardPreset[], label: string, w: number, h: number) =>
  addCustomPreset(list, { label, width: w, height: h }, () => `custom-t${++idSeq}`);

const first = add([], " 名片 ", 90, 54);
check("add preset", first.preset, { id: "custom-t1", label: "名片", note: "90 × 54", w: 90, h: 54 });
check("add no error", first.error, null);
check("add duplicate size", add(first.list, "又一张", 90, 54), { list: first.list, preset: null, error: "该尺寸已在预设中" });
check("add zero", add(first.list, "零", 0, 10).error, "尺寸需为 1–20000 的整数");
check("add over max", add(first.list, "超大", 20001, 10).error, "尺寸需为 1–20000 的整数");
check("label truncates", add(first.list, "一二三四五六七八九十一二三四五六七八九十", 10, 10).preset?.label.length, 18);

const full = Array.from({ length: MAX_CUSTOM_PRESETS }, (_, i) => ({
  id: `custom-f${i}`, label: `F${i}`, note: `${i + 1} × ${i + 2}`, w: i + 1, h: i + 2,
}));
check("add at cap", add(full, "超额", 50, 50).error, `最多保存 ${MAX_CUSTOM_PRESETS} 个自定义预设`);

check("find by size", findPresetBySize(first.list, 90, 54)?.label, "名片");
check("remove", removeCustomPreset(full, "custom-f0").length, MAX_CUSTOM_PRESETS - 1);

const incoming = sanitizeCustomPresets([
  { label: "已有尺寸", w: 90, h: 54 },
  { label: "导入项", w: 400, h: 300 },
]);
check("merge keeps and adds", mergeCustomPresets(first.list, incoming).map(shape), [
  { label: "名片", w: 90, h: 54 },
  { label: "导入项", w: 400, h: 300 },
]);

const exported = exportPresetsJSON(first.list);
const parsedExport = JSON.parse(exported) as { format: string; version: number; presets: unknown[] };
check("export format", parsedExport.format, "vexa-board-presets");
check("export version", parsedExport.version, 1);
check("export payload", parsedExport.presets, [{ label: "名片", w: 90, h: 54 }]);
check("roundtrip", parsePresetsJSON(exported).list.map(shape), [{ label: "名片", w: 90, h: 54 }]);
check("parse malformed", parsePresetsJSON("{bad"), { list: [], added: 0, error: "JSON 解析失败" });
check("parse wrong format", parsePresetsJSON('{"format":"other","presets":[]}').error, "不是 Vexa 画板预设文件");
check("parse array", parsePresetsJSON('[{"label":"数组","w":12,"h":34}]').list.map(shape), [{ label: "数组", w: 12, h: 34 }]);
check("parse empty", parsePresetsJSON('{"format":"vexa-board-presets","presets":[{"w":0,"h":0}]}').error, "文件里没有可用预设");

const capped = mergeCustomPresets(
  full,
  sanitizeCustomPresets([{ label: "第21个", w: 999, h: 999 }]),
);
check("merge respects cap", capped.length, MAX_CUSTOM_PRESETS);
check("merge ignores existing size", mergeCustomPresets(first.list, first.list).length, 1);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
if (failed) process.exit(1);
