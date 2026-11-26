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

填充与描边的公共数据在 `src/core/types.ts`：
- `Paint.grad.stops` 是 `GradStop[]`，不再固定两色；每个色标有 `offset`、`color`，可选 `alpha` 与
  `midpoint`。新增或读取后用 `src/core/paint.ts` 的 `normalizeGradStops` / `paintStops` 排序并夹到
  `0..1`；画布、SVG 和面板预览都先经 `expandGradStops()`，非 0.5 中点会展开成中间色阶，透明度写成
  `rgba` / `stop-opacity`。
- `Stroke.cap` 为 `butt / round / square`，`Stroke.join` 为 `miter / round / bevel`，默认
  `butt / miter`；画布写 `lineCap/lineJoin`，SVG 写 `stroke-linecap/stroke-linejoin`。
- `.vex` 读取时会给旧描边补默认值，非法 cap/join 回退默认；渐变少于 2 个有效色标时退回实色。
- 可变宽度轮廓目前仍按平头外框绘制，端帽/连接只作用于普通均匀描边；修改 `widthOutline` 时不要把
  这两条路径混在一起。

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
| `src/core/svg.ts` | 导出 SVG；把描摹/导入 SVG 解析回可编辑节点（含线性/径向渐变、色标透明度、href 继承） |
| `src/core/launch.ts` | 启动路径读取（`launch_intent` / `?open=`）与单实例外部打开事件订阅 |
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
- **直接选择多锚点**：`AnchorRef {nodeId,si,ai}` 由 `CanvasView` 持有；`Shift` 点击切换锚点，拖动任一已选锚点时 `docOps.nudgeAnchors` 同步平移所有选中锚点与手柄；方向键在 `window` 捕获阶段拦截并只推锚点，避免同时触发对象级 `nudge`（`scripts/smoke.anchors.mts`）。
- **撤销**：每次提交前把整篇文档 JSON 压栈（上限 200）。拖拽过程走 `live()` 不进栈，抬指后再 `finish()` 补一次。
- **渲染**：Canvas 2D 自绘，DOM 只做面板；任何改文档的动作都会 bump 版本号触发重绘。
- **圆形工具**：`src/core/circle.ts` 的 `circleFromDrag` 统一直径/从中心两种模式，并接收 `roundAlt` 与 `zoom`；`constrain45` 在 Shift 时只吸附方向、保持半径；`circleThroughThree` 求外接圆；`rulerStep` 按缩放给标尺步进，`roundDiameter` 沿首点方向取整直径。`CanvasView` 第一次点击只存 `circlePendingRef`，第二次按下拖过第三点才走三点圆；`docOps.circlePath` 直接复用椭圆路径的四段贝塞尔。
- **描摹**：Rust 用 `image` 解码 → `vtracer` 输出 SVG 字符串 → 前端 `parseD` 成 Vexa 路径 → 等比放进画板中央。
- **SVG 导入**：`svgToPathNodes()` 用 `DOMParser` 解析；`collectPaths()` 逐层继承 fill/stroke/`fill-opacity`/`stroke-opacity`/opacity 与 transform。`gradientPaint()` 读取 `<linearGradient>` / `<radialGradient>` 的 stop（颜色支持 hex/rgb/rgba/命名色/HSL，透明度支持小数与百分比），沿 `href` / `xlink:href` 追最多 4 层；线性用 `x1/y1 → x2/y2` 经当前矩阵推角度，径向按 Vexa 的 bbox 圆心/半径重建。单色标退化为实色，缺失引用变 `none`；解析异常返回空结果，由界面提示。
- **编组**：`GroupNode.children` 存子 id，`drawNode` 递归绘制；选择工具命中组时返回**组 id**（Illustrator 语义），直接选择工具才钻进子节点。组内成员位置照常存绝对坐标，组只做层级与整体操作。
- **路径布尔**：先 `flatten` 拍平（16 段/曲线）→ 规整环（去自闭合点、Douglas–Peucker 0.32px）→ polygon-clipping → 外环正向、洞反向（nonzero 填充）。曲线会退化为折线，属已知取舍（见 `docs/PARITY.md`）。
- **渐变**：`Paint.kind` 支持 `linear` / `radial`；线性用「过包围盒中心、按角度投影裁半」算端点，径向以中心 + 半对角线为半径；画布与 SVG 共用同一几何。
- **虚线**：`Stroke.dash` 是工程字段，画布 `setLineDash`、SVG `stroke-dasharray` 都读它；属性面板给四档预设。
- **箭头**：`Stroke.arrow`（none/triangle/open/diamond）只对开放子路径的末端生效；画布按末段切线画，SVG 用 `<marker orient="auto">`。
- **变换手柄**：`engine/handles.ts` 统一算 8 个缩放柄 + 旋转柄的位置与命中，渲染与 pointer 交互共用；缩放走 `scaleNodes`（可指定固定锚点），旋转走 `rotateNodesAround`，Shift 分别锁比例与 15° 吸附。文字缩放用 `size * |sy|` 与 `hScale * |sx|/|sy|` 精确落到目标 W/H（`scripts/smoke.transform.mts`）。
- **图层排序**：图层面板按视觉从上到下展示，存储是反向；`canMoveLayer` / `moveLayerNode` 支持任意层级行的 `before` / `after`、组行的 `inside`，同容器移动会按来源显示索引修正插入点；搬移只改 `doc.root` 或组 `children`，不改绝对坐标，一次操作记一步撤销。多选与批量显隐/锁定走 `core/layerSelection.ts` 的纯函数；行内眼睛/锁在多选时作用于整组，未选行只作用于当前行。
- **色板**：属性坞的实色填充、描边、画板底色共用 `ColorSwatches`；固定 12 色 + `localStorage` 最近 10 色，所有原生取色器与色板点击都会 `rememberColor`；渐变每个色标仍用原生取色器。
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
- **渐变工具**：`toLinearGradient()` 把任意填充转线性（已有 stops 直接复用，实色用本色→白）。拖动按 `atan2` 得角度，`Shift` 锁 15°；每个选中的路径各自保留停靠点，只同步 `grad.angle`，一次拖动 `snapshot/finish` 合成一步撤销。选中单个线性/径向渐变路径时，`gradAxis` / `gradHandlePoints` 给出轴线与色标手柄：线性沿角度轴、径向沿右侧半径拖动 `offset`，夹在相邻色标之间，不改变渐变类型或角度。
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

- 路径布尔是**多边形级**（曲线先拍平），曲线级保真布尔还没做；偏移/描边轮廓是折线近似（尖角斜接、平头端帽），路径效果生成的轮廓尚未支持圆头/方头端帽与曲线保真
- 直接选择已支持 `Shift` 多锚点、跨节点同步拖动、方向键微移、开放子路径连接、六向锚点对齐、锚点水平/垂直等距分布、跨路径节点开放端点连接、拖框选锚点与 `Delete` 删单个锚点；框选只从当前已选路径/组收集，不能一次框选未选中路径；删到剩 2 个锚点的闭合路径保留成线；剪切蒙版路径不可删；长按方向键仍会产生多步撤销；分布只做等距，跨路径连接只合并端点所在子路径
- 可变宽度描边已支持宽度点、单侧加宽、余弦过渡与 SVG/`.vex` 往返；均匀描边已支持平/圆/方端帽与尖角/圆角/斜角连接，但可变宽度轮廓不跟随这些设置，仍按平头外框绘制；虚线暂不随轮廓走（有宽度点时按实线轮廓输出），箭头仍按基础线宽；宽度手柄只画在第一条子路径，复合路径各子路径共用同一 `t` 轮廓
- 渐变支持线性/径向多色标、独立透明度、插值中点与画布轴线/色标直拖；径向渐变的圆心固定在 bbox 中心、半径固定为半对角线，画布手柄只沿右侧半径显示；尚缺网格/自由渐变、渐变描边、图案填充、符号、画笔、图形样式
- SVG 导入已覆盖基础图形、变换、线性/径向渐变、色标透明度、`href` 继承、`fill/stroke-opacity`、`<use>` / 嵌套 use、`<clipPath>` 嵌套交集裁切、symbol viewBox/width 缩放与 `<text>` / `<tspan>` 可编辑文字；尚缺图案、滤镜、`mask`、`objectBoundingBox` 剪裁、`gradientTransform` / `spreadMethod` 的完整语义，文本旋转/斜切只映射位置与缩放、不旋转字形
- 文字已支持单点文字 + 字符面板（字重/字形/行距/字距/对齐/横纵缩放/基线），但还没有段落文字、区域文字、沿路径排版、避头尾、文字转路径
- 旋转/翻转对文本与位图只做位置级变换（没有旋转属性，见 `docs/PARITY.md`）；第三十六批斜切同样只变换路径锚点与手柄，纯文字/位图不参与，组内混排文字跳过，角度限 ±80°，不生成 SVG 斜切矩阵，导出为变形后的路径坐标
- 拖拽撤销粒度较粗（一次拖拽一步）
- 图层树已支持组内排序、把子层拖出组、把顶层拖入组、Ctrl/Shift 多选与批量显隐/锁定，第二十八批补了名称/类型搜索、6 色标记和按标记筛选；折叠组内的子层需先展开才能拖动。颜色标记不参与导出，搜索不搜节点内文字。
- 画板面板已在第二十九批补六个尺寸预设、适配内容、复制画板（连内容）与上下换序；第三十二批补了自定义预设保存/导入/删除（本地 `vexa.board-presets.v1`，最多 20 个，导入只补新尺寸），适配内容改为一并计入路径描边半宽、忽略隐藏根层与组内隐藏子层；复制仍只克隆与源板相交的根层，换序只改列表与导出顺序。
- 文档设置已在第三十一批补文档名、当前画板名/尺寸/背景、只读单位与颜色模式和单次撤销；只编辑当前画板，不改全部板；单位固定 px、颜色模式固定 RGB，不提供 CMYK/DPI；改尺寸不移动/缩放内容；文档名与已保存文件名分离。
- 路径查找器已在第三十批补分割、修边、合并、裁剪、轮廓；分割超过 8 个形状改为逐层切面，分割/修边/裁剪清空描边，轮廓只留 1px 边界线，布尔仍是折线级。
- 第二十二批已消除 React 壳层的高频重渲染（live 不再递增 UI 版本、光标/视口/滑块/图层名走局部路径），但画布本身仍是全场景 `renderScene` 重绘，尚未做 dirty-rect / 分层画布；超大节点数文档若仍掉帧，下一步应做节点视口剔除或脏矩形重绘。
- 文件关联已注册，双击 `.vex` / `.svg` 启动并载入已接：`launch_intent` 读第一个真实存在的路径参数；已开实例由 `tauri-plugin-single-instance` 把路径 emit 成 `vexa://launch-open` 并聚焦主窗口；SVG 用 `svgIntrinsicSize` 建同尺寸画板、`svgToNodes` 转可编辑节点。Vexa 只接 `.vex` / `.svg`，不导入 Groma 工程；需要把 Vexa 的图交给 Groma 时，在 Vexa 导出 SVG，再到 Groma“导入 Vexa 画的图”。PNG/JPG 不接。
- 自动保存只在已有路径时生效；未保存过的新工程仍需手动 `Ctrl+S`
- PDF 导出已支持多画板、原生线性/径向渐变、渐变文字、实色/虚线/端帽/连接、透明位图与文字轮廓；文字是路径、不可选中/搜索，渐变描边、图案填充、渐变网格未做，组透明度按节点复合 alpha 近似；字体只读本机文件，不打包不联网
- SVG 导入现支持 `<text>` / `<tspan>` 可编辑文字、`<use>` / `xlink:href` 引用与嵌套 use、`<clipPath>` 组裁切（含嵌套交集）、symbol viewBox/width 缩放；`objectBoundingBox` 剪裁、图案、滤镜、`mask` 仍未处理，文本旋转/斜切只映射位置与缩放、不旋转字形

## 发布构建

- 版本：`0.1.0`（第四十一批：三点圆拖动 / Alt 直径取整）
- 文件：`release\Vexa.exe`
- 大小：`7,808,000 B`
- SHA256：`BCBF8C83199BDE6F33447FB92C26ACC7DE70AF4440FAB55533BE8483F3001DB5`
- 构建时间：`2026-11-26 20:43:22`
- 命令：`npm run tauri:build`（内含 `tsc --noEmit && vite build`）→ 复制 `src-tauri\target\release\vexa.exe` 到 `release\Vexa.exe`
- 安装包：`src-tauri\target\release\bundle\nsis\Vexa_0.1.0_x64-setup.exe`，`2,367,110 B`，SHA256 `B64291EDA70F014A4AD2F458A98DB48729C4E20281A62DDCB4E0458583817388`
- 前端产物：`dist/assets/pdf-D_qrKUB4.js` 407.16 kB / gzip 169.22；`dist/assets/index-C13KfgCs.js` 529.29 kB / gzip 167.53；`dist/assets/index-BB-PkWTH.css` 61.68 kB / gzip 11.53；`dist/assets/splash-bg-DgncLeTt.jpg` 86.90 kB
- 三点圆 / Alt 验收（第四十一批）：`npx tsc --noEmit` 通过；`npm run build` 157 modules 通过；`npx tsx scripts/smoke.circle.mts` 33 项 PASS，全部 19 个冒烟脚本复跑通过。`npm run tauri:build` 通过；真实 Tauri/WebView2 1600×1000 窗口在 33% 视图：标定 32 CSS px 圆 `97.5×97.5`；点 `(450,320)` 后按下 `(550,320)` 拖到 `(520,400)` 落三点圆 `346.0×346.0`，圆心 `(500,346.875)`，与直径圆 `324.0` 区分；Alt 水平拖 57 CSS px，直径 `173.7→150.0`，属性坞 `150×150`；三点共线释放不落对象；默认直径、从中心、Shift、两次点击、撤销与图层列表回归通过。截图 `docs/shots/circle-three.png`、`circle-alt.png`、`circle-three-window.png`。
- 圆形工具验收（第四十批，历史）：`npx tsc --noEmit` 通过；`npm run build` 157 modules 通过；`npx tsx scripts/smoke.circle.mts` 19 项 PASS，其余 18 个冒烟脚本全复跑通过。`npm run tauri:build` 通过；真实 Tauri/WebView2 1600×1000 窗口按 `⇧L`：选项栏出现“从中心”且默认关闭；默认水平拖圆 `97.5×97.5`、4 锚点闭合；开“从中心”同距离圆 `195.1×195.1`，直径比值 2.00；Shift 斜拖 `175.8×175.8`；两次点击第一次不落对象、第二次落圆，撤销移除；图层面板 3 行“圆形”。1200×900 实际窗口选项栏无溢出。该批截图已按清理惯例删除。
- 文档色板验收（第三十九批）：`npx tsc --noEmit` 通过；`npm run build` 156 modules 通过；`npx tsx scripts/smoke.swatches.mts` 62 项 PASS，其余 17 个冒烟脚本全复跑通过。`npm run tauri:build` 通过；真实 Tauri/WebView2 1920×1500 窗口画两块矩形，打开“管理文档色板”：空弹窗 519/519；新建“品牌蓝” `#0f76d6`（印刷色）与“专色橙” `#ff7a00`（专色），弹窗 520×361、`cw=sw=519`、新建行 487/487，行无溢出。第一块填充链接品牌蓝并显示“全局链接 · 品牌蓝”；第二块填充链接品牌蓝、描边链接专色橙，使用数 2 处 / 1 处。把品牌蓝改 `#e5484d` 保存，两块填充同步变红且链接保留，专色描边不变，提示“已更新「品牌蓝」”。删除品牌蓝后两块填充 `swatch` 清空但颜色保留，撤销恢复品牌蓝与链接。1200×900 弹窗仍 520 宽、无溢出。该批截图已按清理惯例删除。
- 文档设置批量应用验收（第三十八批）：`npx tsc --noEmit` 通过；`npm run build` 153 modules 通过；`npx tsx scripts/smoke.document.mts` 36 项 PASS，其余 16 个冒烟脚本全复跑通过。`npm run tauri:build` 通过；真实 Tauri/WebView2 1920×1500 窗口新建第二块 1080×1080 画板，文档设置单板时批量复选框禁用、文案“全部 1 个画板”；两块时可用，勾选后一起变 1000×700 / `#eef4ff`，第二板名仍“画板 2”、画板坐标与矩形锚点不变，toast“文档设置已同步 2 个画板”；撤销恢复两块 1080×1080 / `#ffffff`；不勾选时只当前板变 800×1080 / `#ffe9d8`，第二板不动。弹窗 560×564、`cw=sw=559`，批量行 525/525；1200×900 仍 560 宽且不溢出。截图 `docs/shots/docs-all-dialog.png`、`docs-all-applied.png`、`docs-all-undo.png`、`docs-all-narrow.png`、`docs-all-window.png`。
- 锚点框选 / 单锚点删除验收（第三十七批）：`npx tsc --noEmit` 通过；`npm run build` 153 modules 通过；`npx tsx scripts/smoke.anchordelete.mts` 46 项 PASS，其余 16 个冒烟脚本全复跑通过。`npm run tauri:build` 通过；真实 Tauri/WebView2 1920×1500 窗口画矩形（`[[262.2,271.654],[671.317,271.654],[671.317,549.854],[262.2,549.854]]`）：直接选择从左上空白拖框选中顶部 2 个锚点，状态“锚点 2”；`Delete` 后路径节点保留、剩 2 个闭合锚点、`409×278→409×0`，toast“已删除 2 个锚点”；撤销恢复 4 锚点。`Shift` 再从底部框选累加到 4 个锚点，`Delete` 后路径节点与根层条目消失，toast“已删除 4 个锚点”，撤销恢复整条路径。1200×900 选项栏 808/808、提示 151/151，不截断。截图 `docs/shots/marquee-drag.png`、`marquee-anchors.png`、`marquee-deleted.png`、`marquee-undo.png`、`marquee-shift.png`、`marquee-narrow.png`、`marquee-window.png`。
- 锚点连接 / 对齐验收（第三十四批）：`npx tsc --noEmit` 通过；`npm run build` 153 modules 通过；`npx tsx scripts/smoke.anchorops.mts` 50 项 PASS，`smoke.anchors` 21 项及其余 14 个冒烟脚本全复跑通过。`npm run tauri:build` 通过；真实 Tauri/WebView2 1920×1500 窗口用钢笔现场画 3 锚点开放路径（`[188.6,302.2] [875.9,514.9] [368.6,825.9]`）：1 个锚点时连接与 6 项对齐禁用，首尾端点时连接启用；菜单“锚点左对齐”把尾锚点 X 从 `368.6` 移到 `188.6`，中点与 Y 不变；重复对齐只提示“已经对齐”，撤销栈长度仍为 2；工具栏撤销恢复尾锚点；菜单连接后 `closed=true`，撤销恢复开放，`Ctrl+J` 可再连；连接/撤销后锚点选择均清空。1200×900 菜单 217/217、top 41 / bottom 885，选项栏与选择区无横向溢出。截图 `docs/shots/anchorjoin-menu-disabled.png`、`anchorjoin-menu-enabled.png`、`anchorjoin-align.png`、`anchorjoin-joined.png`、`anchorjoin-narrow.png`、`anchorjoin-window.png`。
- 自定义预设验收（第三十二批）：`npx tsc --noEmit` 通过；`npm run build` 152 modules 通过；`npx tsx scripts/smoke.boardpresets.mts` 25 项 PASS，`smoke.artboards` 25 项、`smoke.document` 25 项复跑通过。`npm run tauri:build` 通过，生成上方 `vexa.exe` 与 NSIS；真实 Tauri/WebView2 窗口在启动页保存“名片”`90×54`、重复尺寸报错、导入 `scripts/fixtures/presets-import.json` 后只新增“海报”`400×300`，应用后启动页变 `400×300` 且 chip 高亮；编辑器保存当前 `900×600` 后得到第三个 chip，应用“海报”后画板变 `400×300`，点“适配内容”回到内容包围盒 `900×600`；删除“名片”3→2、`Esc` 后焦点回 `btn-link preset-open`，再次导入补回。弹窗 659 px、行 613 px、名称输入 323 px、宽高输入 65 px，全部 `scrollWidth == clientWidth`。截图 `docs/shots/presets-start-error.png`、`presets-start-dialog.png`、`presets-start-applied.png`、`presets-editor-dialog.png`、`presets-editor-panel.png`、`presets-start-window.png`、`presets-editor-window.png`。
- 文档设置验收（第三十一批）：`npx tsc --noEmit` 通过；`npm run build` 148 modules 通过；`npx tsx scripts/smoke.document.mts` 25 项 PASS，`smoke.artboards` 19 项复跑通过。`npm run tauri:build` 通过，生成上方 `vexa.exe` 与 NSIS；真实 Tauri/WebView2 窗口用 `scripts/fixtures/pathfinder.vex` 从“文件 → 文档设置…”打开，初始 `900×600 / #f7f3e9`，宽输入 `0` 显示“画板尺寸不能小于 1 px”且弹窗不关，改为文档名 `文档设置验收`、画板名 `主画板`、`1000×700`、`#eef4ff` 后一次应用，对象数保持 6，再次打开读回新值，撤销全部还原；`Esc` 关闭后焦点回到 `.menubtn`；弹窗 559 px 无横向溢出。截图 `docs/shots/doc-settings-panel.png`、`doc-settings-error.png`、`doc-settings-applied.png`、`doc-settings-undo.png`、`doc-settings-window.png`。
- 路径查找器验收（第三十批）：`npx tsc --noEmit` 通过；`npm run build` 145 modules 通过；`npx tsx scripts/smoke.pathfinder.mts` 22 项 PASS，`smoke.vector`、`smoke.artboards` 19 项、`smoke.selection` 16 项、`smoke.layers` 24 项、`smoke.layerfilter` 27 项复跑通过。`npm run tauri:build` 通过，生成上方 `vexa.exe` 与 NSIS；真实 Tauri/WebView2 窗口用 `scripts/fixtures/pathfinder.vex` 跑通分割（3 个面）、修边（2 个面）、合并（1 个路径）、裁剪（100×140 片段）、轮廓（1px 边界），每次撤销后对象数回到 6；面板 9 按钮无横向溢出。截图 `docs/shots/pathfinder-panel.png`、`pathfinder-divide.png`、`pathfinder-trim.png`、`pathfinder-merge.png`、`pathfinder-crop.png`、`pathfinder-outline.png`、`pathfinder-final.png`、`pathfinder-window.png`。
- 图层搜索 / 标记 / 筛选验收（第二十八批）：`npx tsc --noEmit` 通过；`npm run build` 144 modules 通过；`npx tsx scripts/smoke.layerfilter.mts` 27 项 PASS、`scripts/smoke.selection.mts` 16 项 PASS、`scripts/smoke.layers.mts` 24 项 PASS。`npm run tauri:build` 通过，生成上方 `vexa.exe` 与 NSIS；真实 Tauri/WebView2 窗口用 `scripts/fixtures/layer-panel.vex` 给标题/副标题/卡片组标红/蓝/绿，搜索“操作提示”只留组与子行，红色筛选只留组与标题，搜索叠加颜色得到空状态，清除恢复 8 行；多选两段文字一次标紫，toast“已标记 2 个图层”。截图 `docs/shots/layerfilter-tags.png`、`layerfilter-search.png`、`layerfilter-red.png`、`layerfilter-empty.png`、`layerfilter-props.png`、`layerfilter-final.png`、`layerfilter-window.png`。
- 应用图标：新图标源文件 `assets/brand/vexa-icon.svg`、`assets/brand/vexa-icon.png`（1024×1024，透明外角）；`scripts/make-icons.mjs` 生成 32/128/256 PNG 与 16/32/48/64/128/256 六尺寸 `icon.ico`。从 `release\Vexa.exe` 提取 32px 资源核对，图标为蓝底倾斜奶油画布 + 黑色 V 路径 + 两个方形锚点 + 珊瑚色底锚点；NSIS 安装器/卸载器同图标。应用内 `BrandMark` 已替换 StartPage 顶部、编辑器顶栏、Splash、AboutDialog 的旧 V 标记，favicon 用 `public/vexa-icon.png`。
- Vexa → Groma 导入验收（第二十三批）：真实 Groma release 从欢迎页“导入 Vexa 画的图”读取 Vexa 导出的 `scripts/fixtures/vexa-groma-import.svg`（1,460×640，两个画板），得到 2 个画板 / 26 个图层；路径、线性/径向渐变、虚线描边、可编辑文本、透明 PNG 均显示，内嵌图片写入工程 `assets\图片 1.png`。选中路径后检查器显示“矢量 / 填充 #E5484D 94% / 描边 #17171C 100% / 宽度 8 / 透明 100”。截图见 `docs/shots/groma-vexa-import-final.png`。
- 第二十三批撤销项：Vexa 的 Groma `.groma` 原生导入已完整移除（`src/core/groma.ts`、`pickGromaOpen()`、`readGromaProject()`、StartPage/EditorShell 入口、启动参数与文件关联全部删除）；Vexa 端只保留 `.vex` / `.svg`，不再把 Groma 工程当文档打开。
- 局部重渲染验收（第二十二批）：开发模式（React StrictMode 双渲染，计数折半即生产值）下，24 步拖动已有对象只触发 `shell/dock/canvas = 2/2/2`（生产 1 次，落在松手提交）；30 次画布指针移动 `0/0/0`；24 步空格平移 `2/2/2`（生产 1 次，落在平移结束）；6 次 Ctrl 滚轮缩放 `2/2/2`（生产 1 次，落在 120ms 防抖后）。`docStore.live` 不再递增 UI 版本，只通知画布；透明度滑块/图层名输入改为 live + finish，锚点拖拽也已从逐帧 `touch()` 改为 `live()`。
- 第二十三批截图：`docs/shots/groma-vexa-import-final.png`（真实 Groma release 导入 Vexa 绘图后的画布、图层面板与路径描边检查器）；`docs/shots/vexa-app-start.png` 仍为启动页样例。
- 真实原生验收（第二十批）：新建 `900×600` 画板“图层终验”，从“文件 → 导入 SVG…”导入 `scripts/fixtures/import-clip-symbol.svg`，切到图层面板：顶层 7 行，展开“导入剪裁组 1”后出现 3 个子行（导入文字 2 / 导入文字 1 / 导入路径 1），内部剪裁路径不显示；点子行“导入文字 1”后状态“已选 1 · 165 × 52 px”，属性坞显示 Arial / 41.28px / 文本“裁切标题”。截图 `docs/shots/v20-final-layers.png`、`v20-final-select-text.png`、`v20-final-text-props.png`。
- 第十九批发布验收保留：导入 clip/symbol fixture 得到 7 个顶层对象、14 个节点、2 个剪裁组、4 段文字；直接选择裁切标题 165×52、Arial 41.28px，改字后 296×52。冒烟 `nodes=14 roots=7 groups=2 text=4 cardSubs=2 bigStar=76.8 smallStar=38.4 nested=5 badGroups=0`。
- 第十八批发布验收保留：`Vexa.exe` 7,715,840 B，SHA256 `E42244D2A0A8D531369053D42A93A72D114ABE600D9F55D2FB75B2867DB1D3D6`；导入 `import-text-use.svg` 得到 9 个对象（5 段文字 + 4 个路径），属性坞 `Arial / 73.05px`。
- 第十七批发布验收保留：`release\Vexa.exe`（7,714,304 B，SHA256 `74D970B9C8BC6D191408A17594C14B8F9445A7A8D3CA8548826BE55FC598F87F`）通过“导出 → PDF → 全部 2 页”原生保存写盘 `docs/shots/v17-final-export.pdf`（77,615 B，2 页），渐变、渐变文字、透明位图与第二画板星形均正常；截图 `v17-final-export-p1.png`、`v17-final-export-p2.png`、`v17-ui-export-done.png`。
- 原生保存/打开对话框自动化注记：前置的测试 Edge 窗口会抢走前台，需先最小化；文件名框是 `ComboBox` 子 `Edit`，UIA 不暴露，必须物理点击文件名框、`Ctrl+A` 后粘贴完整路径，再回车提交；`SetWindowText` 只改内部文本、可见框不刷新，不要依赖。文件列表项本身由 UIA 暴露（`ListItem` + `InvokePattern`），目录已停在 `scripts\fixtures` 时可直接 `Invoke` 目标文件，无需模拟点击；重复点“导出到…”或“导入 SVG…”会堆叠多个 `#32770`，操作前先清理多余对话框。


