# Vexa MCP · 本地工程桥

给 Vexa 的 `.vex` 工程接一个 **MCP（Model Context Protocol）** 服务：任何支持 MCP 的编辑器 / 助手都能读取工程结构、加形状、改颜色、调顺序、导出 SVG。

定位与 Vexa 一致 —— **纯本地、零联网、零 AI**：stdio 传输，只读写本机文件，不请求任何远端。

## 启动

```bash
node mcp/vexa-mcp.mjs            # stdio server（由客户端拉起，不常驻）
node mcp/vexa-mcp.mjs --selftest # 自检，不碰磁盘
```

首次使用先装依赖（仅本地）：

```bash
cd mcp && npm install
```

## 客户端配置

```json
{
  "mcpServers": {
    "vexa": {
      "command": "node",
      "args": ["D:/20533/deskbox/fangwork/Vexa/mcp/vexa-mcp.mjs"],
      "env": { "VEXA_MCP_ROOT": "D:/20533/deskbox/fangwork/Vexa" }
    }
  }
}
```

`VEXA_MCP_ROOT` 是允许访问的根目录，默认取仓库根。改成你的工程目录即可。

## 工具

| 工具 | 作用 |
| --- | --- |
| `vexa_capabilities` | 工程格式、形状 / 填充 / 描边清单、安全边界 |
| `vexa_read_project` | 读工程摘要；`includeGeometry` 附带锚点 |
| `vexa_create_project` | 新建空白 `.vex`（已存在会拒绝覆盖） |
| `vexa_add_shape` | 矩形 / 圆角矩形 / 椭圆 / 多边形 / 星形 |
| `vexa_add_text` | 加文字 |
| `vexa_set_paint` | 改填充（实色或线性渐变）、描边（含虚线） |
| `vexa_transform` | 平移 / 旋转 / 缩放 / 翻转 |
| `vexa_arrange` | 顶层 / 底层 / 上移 / 下移 |
| `vexa_delete` | 删除对象（组连同子节点） |
| `vexa_export_svg` | 导出 SVG，保留渐变与虚线 |
| `vexa_validate` | 结构自检：悬垂引用、孤儿节点、非法颜色 |

## 安全边界

- 路径必须是**绝对路径**、以 `.vex` 结尾，且落在 `VEXA_MCP_ROOT` 之内；
- 只做工程读写与几何运算，不执行脚本、不访问网络、不调用任何 AI；
- 服务不常驻后台，由 MCP 客户端按需拉起；
- 写盘走「临时文件 + rename」，避免半截文件。

## 与界面的关系

MCP 与 Vexa 界面共用同一份 `.vex` 结构（`format: "vexa"`、`version: 1`、`doc.nodes/root/seq`）。MCP 改过的工程可以直接在 Vexa 里打开，反之亦然；形状几何、渐变端点与虚线节奏的计算方式与 `src/core` 保持一致。
