# 第三方组件与许可

Vexa 本体为 MIT。下列组件随二进制分发，均为宽松许可，可商用、可再分发。

| 组件 | 版本 | 许可 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| visioncortex / **VTracer** | 0.6.x | MIT | 位图 → 矢量（图像描摹） | 纯 Rust，本地计算；https://github.com/visioncortex/vtracer |
| **image** (Rust) | 0.25.x | MIT / Apache-2.0 | JPG/PNG/WEBP/BMP/GIF/TIFF 解码 | https://github.com/image-rs/image |
| **polygon-clipping** | 0.15.7 | MIT | 路径布尔（联集/交集/减去/排除）的多边形内核 | https://github.com/mfogel/polygon-clipping |
| **Tauri** | 2.x | MIT / Apache-2.0 | 桌面外壳 | https://tauri.app |
| **React** | 19.x | MIT | 界面 | https://react.dev |
| **Vite** | 7.x | MIT | 构建 | https://vite.dev |
| **@modelcontextprotocol/sdk** | 1.32.x | MIT | 本地 MCP 服务（stdio） | 仅在 `mcp/` 子包使用，不打进应用二进制；https://github.com/modelcontextprotocol/typescript-sdk |
| **zod** | 4.x | MIT | MCP 工具参数校验 | 同上，仅 `mcp/` 使用；https://github.com/colinhacks/zod |

## 设计参考（仅思路，未复制代码）

- **Strata**（小方工作室自家产品）：设计令牌、编辑壳骨架、启动页 / 欢迎页的版式语言。同工作室、同许可。
- **VectorCraft / ArtCraft**（MIT OR Apache-2.0）：几何、路径布尔、文档模型、工具状态机、导出的模块切分思路。Vexa 未整包搬运其代码；若后续复用具体实现，须在此处补记文件级来源与许可声明。
