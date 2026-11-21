# Vexa 开发说明

## 跑起来

```powershell
npm install
npm run tauri:dev     # 开发窗口（热更新）
npm run tauri:build   # 出 NSIS 安装包

cd mcp; npm install   # MCP 依赖（仅本地）
node mcp/vexa-mcp.mjs --selftest   # MCP 自检
node mcp/smoke.mjs                 # MCP 端到端冒烟
```

前端单独调试：`npm run dev`（localhost:1430）。注意 Tauri 命令（文件读写、描摹）在纯浏览器里不可用，
界面会用 `isTauri()` 判断，不会崩，但打不开/存不了文件。

界面壳层（导航 / 工具分组 / 选项栏 / 面板开合 / 右键菜单 / 页面过渡）的结构与验收记录见
[`docs/UI.md`](UI.md)。壳层尺寸由 `src/styles/tokens.css` 与 `src/ui/EditorShell.css` 共同决定；
新增菜单项先扩展 `MenuBar` 的 `MenuAction`，新增工具分组改 `EditorShell.tsx` 的 `TOOL_GROUPS`，
不要把工具按钮重新塞回单列直排。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/core/types.ts` | 文档模型：画板、路径（锚点 + 绝对手柄）、文本、图片、编组 |
| `src/core/geom.ts` | 贝塞尔求值 / 扁平化 / 包围盒 / 命中 / `d` 解析与生成 |
| `src/core/docOps.ts` | 新建文档、矩形/椭圆构造、插锚点、拖锚点/手柄 |
| `src/core/paint.ts` | 线性/径向渐变的几何计算与画布填充（与 SVG 导出共用） |
| `src/engine/handles.ts` | 选择框 8 个缩放手柄 + 旋转柄的坐标与命中（渲染与交互共用） |
| `src/core/shapes.ts` | 圆角矩形 / 正多边形 / 星形（参数化生成贝塞尔路径） |
| `src/core/bool.ts` | 路径查找器：拍平 → polygon-clipping 布尔 → Douglas–Peucker 简化 |
| `src/core/vectorOps.ts` | 对象级操作：排列、对齐、分布、旋转/翻转/平移、编组/取消编组 |
| `src/core/svg.ts` | 导出 SVG；把描摹 SVG 解析回可编辑节点 |
| `src/core/vex.ts` | `.vex` 序列化 / 解析（版本 1，向后兼容兜底） |
| `src/engine/view.ts` | 屏幕 ↔ 文档坐标、适配画板、以光标为中心缩放 |
| `src/engine/render.ts` | 画布渲染（点阵粘贴板、画板、路径、选择框、锚点手柄、钢笔预览、智能参考线） |
| `src/engine/pick.ts` | 命中与框选 |
| `src/engine/io.ts` | 原生对话框、读写、PNG 光栅化、缩略图、描摹调用 |
| `src/stores/docStore.ts` | 原地修改 + 版本号驱动重绘 + 200 步 JSON 撤销栈 |
| `src/stores/settings.ts` | 应用设置：默认值、localStorage 读写、`html[data-density]` |
| `src/ui/SettingsDialog.tsx` | 设置面板：通用 / 画布 / 保存与导出 / 本地 MCP |
| `mcp/vexa-mcp.mjs` | 本地 MCP 服务（stdio，11 个工具，路径限 `VEXA_MCP_ROOT`） |
| `mcp/smoke.mjs` | MCP 端到端冒烟：拉进程 → 建工程 → 加形状 → 导出 → 校验 |
| `src/ui/CanvasView.tsx` | 全部指针手势（选择/直接选择/钢笔/形状/文字/抓手/缩放） |
| `src/ui/EditorShell.tsx` | 顶栏、菜单、标签条、工具轨、选项栏、面板坞、状态栏、导出/描摹弹层 |
| `src-tauri/src/lib.rs` | Rust 命令：读、写、二进制、`trace_image` |

## 关键约定

- **坐标**：文档单位就是像素，画板从 `(0,0)` 开始；视口用 `zoom + pan`，`pan` 是文档原点在屏幕上的位置。
- **锚点手柄**存绝对坐标，`smooth` 决定拖一侧是否镜像另一侧；没有手柄的段就是直线。
- **撤销**：每次提交前把整篇文档 JSON 压栈（上限 200）。拖拽过程走 `live()` 不进栈，抬指后再 `finish()` 补一次。
- **渲染**：Canvas 2D 自绘，DOM 只做面板；任何改文档的动作都会 bump 版本号触发重绘。
- **描摹**：Rust 用 `image` 解码 → `vtracer` 输出 SVG 字符串 → 前端 `parseD` 成 Vexa 路径 → 等比放进画板中央。
- **编组**：`GroupNode.children` 存子 id，`drawNode` 递归绘制；选择工具命中组时返回**组 id**（Illustrator 语义），直接选择工具才钻进子节点。组内成员位置照常存绝对坐标，组只做层级与整体操作。
- **路径布尔**：先 `flatten` 拍平（16 段/曲线）→ 规整环（去自闭合点、Douglas–Peucker 0.32px）→ polygon-clipping → 外环正向、洞反向（nonzero 填充）。曲线会退化为折线，属已知取舍（见 `docs/PARITY.md`）。
- **渐变**：`Paint.kind` 支持 `linear` / `radial`；线性用「过包围盒中心、按角度投影裁半」算端点，径向以中心 + 半对角线为半径；画布与 SVG 共用同一几何。
- **虚线**：`Stroke.dash` 是工程字段，画布 `setLineDash`、SVG `stroke-dasharray` 都读它；属性面板给四档预设。
- **箭头**：`Stroke.arrow`（none/triangle/open/diamond）只对开放子路径的末端生效；画布按末段切线画，SVG 用 `<marker orient="auto">`。
- **变换手柄**：`engine/handles.ts` 统一算 8 个缩放柄 + 旋转柄的位置与命中，渲染与 pointer 交互共用；缩放走 `scaleNodes`（可指定固定锚点），旋转走 `rotateNodesAround`，Shift 分别锁比例与 15° 吸附。
- **图层排序**：图层面板按视觉从上到下展示，拖动落点后反转写回 `doc.root`（末尾在最上层）；一次拖动算一个撤销步。
- **混合模式**：`node.blend` 存 CSS 合成名（16 档），画布直接赋 `globalCompositeOperation`，SVG 写 `style="mix-blend-mode:…"`；`normal` 不落字段。
- **剪切蒙版**：`GroupNode.clip` 指向同组内的路径 id，绘制组时先 `ctx.clip()` 再画其余子节点，轮廓节点本身跳过；释放 = 删 `clip` + 拆组。SVG 导出为 `<clipPath>` + `clip-path`。
- **多画板**：`doc.artboards[boardIndex]` 是当前板；属性坞的画板列表负责切换/增删，激活 id 传给渲染器做蓝框高亮；SVG 每板输出独立 `<g id="board-N">`，只收与板相交的顶层对象，根 viewBox 覆盖全部画板。
- **路径效果**：`core/pathfx.ts` 统一做偏移/轮廓/平滑。偏移先把曲线按 10 段拍平，闭合环用顶点平均法线 + 斜接（miter 分母下限 0.25），开口路径单侧平移；描边轮廓生成外环 + 反向内环（孔），开口加平头端帽；平滑把锚点向相邻中点按 amount 靠拢。三者都返回可编辑折线路径。
- **剪刀**：`vectorOps.splitPathAtPoint` 接收子路径段号与本段参数 t。锚点附近直接 `splitPathAtAnchor`；段中用 De Casteljau 求出切点与两侧控制柄，先插锚点再切。闭合路径切开后首尾各留一个重合锚点，轮廓不丢段；开口路径拆成两条子路径。画布侧先在每段采样 18 点找最近 t，再三分细化 14 轮，命中容差 8 CSS px / zoom。
- **平滑工具**：`vectorOps.makeSmoothLimits` 在按笔刷前给每个锚点算一份“单次笔划位移预算”（上限 = min(半径 1.3 倍, 较短邻边 0.22 倍)），`smoothPathNear` 每次移动不超过剩余预算；锚点向相邻中点移动 `amount`，手柄跟着平移，原本无手柄的转角按前后点连线补一对对称手柄（长度再受半径 1.5 倍限制）。画布按 8 CSS px 采样指针轨迹，半径 16 px / zoom，单次强度 0.34。
- **画布刷新**：`CanvasView.draw()` 只把重绘挂到 `requestAnimationFrame`，同一帧内多次调用合并为一次；无拖动时只有 hover 命中变化才触发重绘；卸载时取消未执行的帧。
- **画板工具**：画布直接操作 `doc.artboards`，不经过节点树。空白按下先插一块 1×1 板，拖动时实时改 x/y/w/h；板内按下为整板移动；当前板 8 个柄复用 `handleLayout`，拖柄支持翻边和 4px 下限。按下前取 `snapshot()`，抬起 `finish()` 合成一步撤销；小于 6px 的新板直接丢弃。
- **字符面板**：`TextNode` 增加 `bold/italic/lineHeight/tracking/align/hScale/vScale/baseline` 八个可选字段。`geom.textBox()` 统一算文本包围盒（0.62em 字宽估算 + 字距，按对齐平移 x，按横纵缩放乘宽高，基线偏移抬 y）；画布逐行按实际 `measureText` 宽度计算对齐偏移，`tracking=0` 时整行一次 `fillText` 保留字偶、非 0 时逐字符推进；`hScale/vScale` 用 `ctx.scale`，SVG 用 `translate(...) scale(...)` + `text-anchor` + `letter-spacing` + `font-weight/style`。文本框输入走 `store.live`，失焦后一次 `finish()` 合成单步撤销。
- **直线工具**：按下即建两点开放路径（fill=none，继承当前描边），拖动只更新第二锚点；`Shift` 把方向锁到 15° 步进；松开长度 <2px 时 `removeNode` 丢弃，否则 `finish()` 记一步撤销。
- **自由铅笔**：`vectorOps.simplifyPoints()` 用 Douglas–Peucker 抽稀，`freehandAnchors()` 按 Catmull-Rom 切线（前后差 /6）补对称手柄。画布按 2 CSS px 采样折线实时预览，松手抽稀 + 补手柄；笔画总长 <3px 直接丢弃。
- **吸管**：`pickTop(..., deep=true)` 取最上层叶子；路径复制 `fill/stroke`，文字额外复制 8 项字符字段。无选中时通过 `onSamplePaint` 回写当前填充/描边并选中源对象；有选中时一次 `commit` 递归套到选中组内所有路径/文字。
- **渐变工具**：`toLinearGradient()` 把任意填充转线性（已有 stops 直接复用，实色用本色→白）。拖动按 `atan2` 得角度，`Shift` 锁 15°；每个选中的路径各自保留停靠点，只同步 `grad.angle`，一次拖动 `snapshot/finish` 合成一步撤销。
- **橡皮**：`core/eraser.ts`。闭合填充路径把每个笔刷采样点做成 24 边形圆，`booleanSubpaths([node, ...circles], "subtract")` 一次性挖掉；纯描边/开口路径先按 ≤3px 加密，再按“笔刷内/外”切成多段开口子路径并用 `freehandAnchors` 平滑。画布 4px 采样、`eraserRef` 画半透明笔刷胶囊 + 当前圆轮廓，松开后一次 `live` 批量替换、一次 `finish` 记撤销。
- **宽度工具**：`core/width.ts`。`Stroke.widthPoints` 每点存 `{ t, left, right }`，左右是相对 `stroke.width` 的倍数；`normalizeWidthPoints` 补 0/1 端点并按 `t` 排序，`widthAtSorted` 用余弦插值 `(1-cos(pi*k))/2` 过渡（同 `t` 两点保持台阶），`setWidthPoint` 按 `left/right/both` 只改指定侧，`removeWidthPoint` 删内部点、端点保留，若只剩全 1 端点则直接清空。`widthOutline` 将每条子路径按 4px 加密，按逐点法线偏移两侧：开放路径 1 条闭合环，闭合路径外环 + 反向内环，非零填充成空心描边；画布有轮廓时改填轮廓，SVG 原路径 `stroke="none"` 并另出轮廓 `<path>`，`.vex` 读取时归一化。`widthHandles` / `widthPreview` 在第一个子路径上给出中心、左右柄与悬停预览，拖中心 `both`、拖方块柄单侧、双击内部点删除。轮廓采样前只归一化一次宽度点，避免逐点排序拖慢拖动重绘。
- **设置**：`src/stores/settings.ts` 是唯一来源，写 localStorage（`vexa.settings.v1`）；主题仍走 `vexa.theme`，与设置面板联动。网格 / 吸附 / 自动保存 / 导出默认值都从这里读。
- **MCP**：`mcp/` 是独立 Node 包，stdio 传输，不联网；与界面共用同一 `.vex` 结构，写盘走「临时文件 + rename」。工具清单与边界见 `mcp/README.md`。

## 位图转矢量参数映射

| UI | VTracer 字段 |
| --- | --- |
| 色彩层数 colors | `color_precision`（2–8） |
| 细节保留 detail | `layer_difference`（24 − 2×detail）与 `length_threshold` |
| 曲线平滑 smooth | `corner_threshold` |
| 忽略碎块 speckle | `filter_speckle` |
| 预设「黑白线稿」 | `ColorMode::Binary` |
| 预设「像素画」 | `PathSimplifyMode::Polygon` |

大图先缩到最长边 2400 再描摹，避免爆内存；输出路径数可能上千条，插入后自动全选。

## 已知边界（下一步）

- 路径布尔是**多边形级**（曲线先拍平），曲线级保真布尔还没做；偏移/描边轮廓是折线近似（尖角斜接、平头端帽），曲线保真与圆头/方头端帽未做
- 可变宽度描边已支持宽度点、单侧加宽、余弦过渡与 SVG/`.vex` 往返；虚线暂不随轮廓走（有宽度点时按实线轮廓输出），箭头仍按基础线宽，端帽/斜接/圆角连接类型未做；宽度手柄只画在第一条子路径，复合路径各子路径共用同一 `t` 轮廓
- 渐变只有线性/径向纯色停靠点；图案填充、渐变网格、符号、画笔、图形样式未做
- 文字已支持单点文字 + 字符面板（字重/字形/行距/字距/对齐/横纵缩放/基线），但还没有段落文字、区域文字、沿路径排版、避头尾、文字转路径
- 旋转/翻转对文本与位图只做位置级变换（没有旋转属性，见 `docs/PARITY.md`）
- 拖拽撤销粒度较粗（一次拖拽一步）
- 文件关联已注册，但双击 `.vex` 启动并载入还需接 argv 处理
- 自动保存只在已有路径时生效；未保存过的新工程仍需手动 `Ctrl+S`
