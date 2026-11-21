/** MCP 端到端冒烟：拉起 stdio server → 列工具 → 新建 / 加形状 / 导出 / 校验 → 清理。 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(here, ".smoke");
const proj = path.join(work, "smoke.vex");

await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "vexa-mcp.mjs")],
  env: { ...process.env, VEXA_MCP_ROOT: path.dirname(here) },
});
const client = new Client({ name: "vexa-smoke", version: "0.1.0" }, { capabilities: {} });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.find((c) => c.type === "text")?.text ?? "";
  if (r.isError) throw new Error(`${name} 失败：${text}`);
  return text ? JSON.parse(text) : {};
};

try {
  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name);
  console.log(`✓ 工具数量 ${names.length}：${names.join(", ")}`);

  await call("vexa_create_project", { path: proj, name: "MCP 冒烟", width: 900, height: 600 });
  console.log("✓ 新建工程");

  const shape = await call("vexa_add_shape", {
    path: proj,
    shape: "roundrect",
    x: 60,
    y: 80,
    w: 320,
    h: 180,
    radius: 20,
    fill: { color: "#0f76d6", to: "#9fd8ff", angle: 45 },
    stroke: { color: "#17171c", width: 2, dash: [8, 4] },
  });
  console.log(`✓ 加圆角矩形 ${shape.id}，锚点 ${shape.anchors}`);

  const star = await call("vexa_add_shape", { path: proj, shape: "star", x: 500, y: 90, w: 240, h: 240, points: 6, inner: 0.42 });
  await call("vexa_transform", { path: proj, id: star.id, rotate: 15, dx: 10 });
  console.log("✓ 星形 + 旋转/平移");

  await call("vexa_add_text", { path: proj, text: "Vexa · 本地 MCP", x: 60, y: 360, size: 36 });
  await call("vexa_arrange", { path: proj, id: star.id, mode: "front" });
  console.log("✓ 文字 + 置顶");

  const read = await call("vexa_read_project", { path: proj });
  console.log(`✓ 读取：${read.count} 个对象，画板 ${read.artboard.w}×${read.artboard.h}`);

  const out = await call("vexa_export_svg", { path: proj });
  const svg = await fs.readFile(out.svg, "utf8");
  console.log(`✓ 导出 SVG ${out.bytes} 字节，渐变=${svg.includes("linearGradient")}，虚线=${svg.includes("stroke-dasharray")}`);

  const val = await call("vexa_validate", { path: proj });
  console.log(`✓ 校验：ok=${val.ok}，问题 ${val.issues.length} 条`);

  const raw = JSON.parse(await fs.readFile(proj, "utf8"));
  console.log(`✓ 结构：format=${raw.format} version=${raw.version} nodes=${Object.keys(raw.doc.nodes).length}`);
} finally {
  await client.close();
  await fs.rm(work, { recursive: true, force: true });
}
