# VectorCraft 对齐清单（PARITY）

> 目标：把 Vexa 的功能面逐项对照参考软件 **VectorCraft**（`github.com/storytold/vectorcraft`，MIT OR Apache-2.0，Rust + egui，对标 Illustrator），把「1:1」拆成可验收的条目，而不是一句口号。
> 本文件只记录**事实**：已对齐 / 部分对齐 / 未实现。每完成一批就更新这里，并附验收方式。

## 0. 参考工程体量（为什么要分批）

参考仓库 `crates/` 共 **26 个 crate、2496 个 `.rs` 文件、74.2 MB 源码**：

| crate | 文件 | 体积 | 职责 |
|---|---:|---:|---|
| ui-egui | 626 | 19.7 MB | 全部面板、菜单、i18n（各语言 tsv 0.7–1.3 MB） |
| engine | 702 | 23.3 MB | 文档模型、命令、撤销、命中、测试 |
| tools | 127 | 4.5 MB | 钢笔/直接选择/剪刀/宽度/自由变换等工具 |
| effects | 90 | 2.9 MB | 变形、绕排、效果目录 |
| doc | 114 | 2.8 MB | 混合、CMYK、文档结构 |
| text | 96 | 2.5 MB | 排版、路径文字、字距 |
| render | 111 | 2.2 MB | 光栅化与预览 |
| pdf / eps / svg | 99 / 100 / 72 | 2.1 / 5.6 / 1.5 MB | 导入导出 |
| pathops | 49 | 1.1 MB | 布尔、偏移、曲线拟合 |
| trace | 49 | 1.1 MB | 图像描摹管线 |
| brush / cad / three-d / js / mcp / plugins | — | 0.3–1.4 MB 各 | 画笔、CAD、3D、脚本、内部 API |

结论：**逐行照搬不现实**（74 MB Rust、上千个测试文件）。可执行的做法是"功能面 1:1 + 交互 1:1"，实现用自己的技术栈（Tauri v2 + React + TS），能力按批次补齐。Vexa 不引入 egui 前端，也不整包搬运参考代码。

## 1. 本轮已对齐（可在实机验收）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 路径查找器：联集 / 交集 / 减去顶层 / 排除重叠 | `pathops` boolean | `src/core/bool.ts`：拍平曲线 → polygon-clipping 布尔 → Douglas–Peucker 简化（0.32px）→ 外环正向、洞反向（nonzero 填充） | 两矩形重叠 → 联集 1 子路径 9 锚点；排除 2 子路径 |
| 排列：置于顶层 / 上移一层 / 下移一层 / 置于底层 | 对象→排列 | `vectorOps.arrangeNodes`，支持组内层级 | 菜单 + `Ctrl+]` `Ctrl+[` `Ctrl+Shift+]` `Ctrl+Shift+[` |
| 对齐：左/水平居中/右/顶/垂直居中/底 | 对象→对齐 | `alignNodes`（选区联合包围盒为基准） | 7 个对象左对齐后 X 一致 |
| 分布：水平 / 垂直 | 对象→分布 | `distributeNodes`（等间距，≥3 个对象） | 实机执行无报错，数量不足时提示 |
| 变换：旋转 ±90° / 水平翻转 / 垂直翻转 | 对象→变换 | `rotateNodes` / `flipNodes`（绕选区中心，锚点与手柄一起变换） | 旋转后包围盒 100×40 → 40×100 |
| 编组 / 取消编组 | 对象→编组 | `groupNodes` / `ungroupNodes`，组占最上层成员的位置 | 根对象 7 → 1 → 7 |
| 编组命中语义 | 选择工具命中整组 | `pickTop(..., deep=false)` 返回最外层组；直接选择 `deep=true` 才钻进组 | 点组内任一图形成选中组 |
| 锁定 / 解锁全部 / 隐藏 / 显示全部 | 对象→锁定/隐藏 | `locked` / `visible` 字段 + 菜单命令；命中与框选会跳过锁定和隐藏对象 | `Ctrl+2` `Ctrl+Alt+2` `Ctrl+3` `Ctrl+Alt+3`，图层面板同步显示眼睛/锁图标 |
| 组内整体拖动 / 变换 | — | `translateNode` 递归组子节点 | 拖动组整体移动 |
| 圆角矩形 / 多边形 / 星形 | 形状工具 | `src/core/shapes.ts`（半径、边数、角数、内径比可调） | 拖拽实时生成，参数在选项栏 |
| 方向键微移（1px / Shift 10px） | 键盘 | `nudge` | 实机 |
| 工具栏扩展到 11 个工具 | 工具轨 | 选择/直接选择/钢笔/矩形/圆角矩形/椭圆/多边形/星形/文字/抓手/缩放 | 截图 `docs/shots/editor-tools.png` |

## 1.2 第二批已对齐（欢迎页 / 设置 / MCP / 更多功能）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 线性渐变填充（两色 + 角度） | 渐变填充 | `Paint.kind = "linear"` + `src/core/paint.ts`（画布与 SVG 共用端点计算）；属性面板可切实色 / 渐变 / 无，调起止色与角度 | 面板切渐变 → 画布即时变化；导出 SVG 含 `<linearGradient>`（MCP 冒烟实测 true） |
| 描边虚线样式 | 描边样式 | `Stroke.dash` 已是工程字段，本轮补 UI：实线 / 虚线 / 点线 / 点划四档 + 自定义数组 | 面板切档后画布与 SVG `stroke-dasharray` 同步 |
| 画板辅助网格 | 网格显示 | `render.ts` 的 `drawBoardGrid`：16px 细线，只画在画板上，缩放 <70% 自动隐藏；默认关闭 | 设置里开关，画布即时生效（截图 `editor-grid.png`） |
| 拖动吸附整像素 | 像素吸附 | 设置项 `snap`，关闭后拖动按原始浮点位移 | 关闭后连续拖动坐标出现小数 |
| 自动保存 | 自动保存 | 设置项 `autoSave`（0/30/120/300 秒）；只在已有保存路径且版本变化时静默写盘 | 改图后等待间隔，`Ctrl+S` 计数不变但文件 mtime 更新 |
| 设置面板 | 首选项 | `src/ui/SettingsDialog.tsx` 四个分页：通用 / 画布 / 保存与导出 / 本地 MCP；localStorage 持久化，界面即时生效 | `Ctrl+,` 或顶栏滑杆图标打开；重启后保留 |
| 界面密度 | UI 缩放 | `density` 写 `html[data-density]`，令牌覆盖控件高度、侧栏宽与间距 | 切紧凑后工具栏与面板间距收窄 |
| 欢迎页呼吸感 | 启动页 | `StartPage.tsx/css` 重排：1240px 容器、56px 顶栏、hero 独立段 + 能力标签、6 个预设三列、预览 112px、右列"最近 / 导入"两张独立卡片、44px 底栏快捷键（窗口较矮时整页可滚动） | 截图 `docs/shots/welcome-v2.png` |
| 本地 MCP 桥 | `crates/mcp`（本机 stdio） | `mcp/vexa-mcp.mjs`：11 个工具（capabilities/read/create/add_shape/add_text/set_paint/transform/arrange/delete/export_svg/validate），zod + 官方 SDK，路径限 `VEXA_MCP_ROOT` | `node mcp/vexa-mcp.mjs --selftest` 全过；`node mcp/smoke.mjs` 端到端 11 工具 / 3 对象 / SVG 1.4 KB / 校验 0 问题 |
| 复制 / 剪切 / 粘贴 | 编辑菜单 | 内部剪贴板（`Ctrl+C` / `Ctrl+X` / `Ctrl+V`）：整棵子树深拷贝、重新分配 id、粘贴偏移 16px；组会连子节点一起粘 | 复制一个对象后 `Ctrl+V`，对象数 1 → 2，选中新副本 |

> MCP 与参考工程的 `crates/mcp`（Rust/Axum 内部 API）不同：Vexa 做的是**本机 stdio** 桥，不出网、不常驻、不调 AI，符合产品定位，不是把内部 HTTP API 搬过来。

## 1.3 第三批已对齐（变换手柄 / 径向渐变 / 箭头 / 图层拖动）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 选择框缩放（8 个手柄） | 自由变换手柄 | `engine/handles.ts` 统一手柄坐标与命中；拖角/边实时缩放，Shift 锁比例；路径锚点与手柄、图片宽高、文字字号一起缩放，组递归 | 拖右下角把 100×40 放大到 2×3 倍，属性栏 W/H 同步 |
| 旋转手柄 | 自由变换旋转 | 顶边上方圆形手柄，绕选区中心旋转，Shift 以 15° 吸附；`rotateNodesAround` 复用路径精确旋转 | 拖旋转柄 45°，包围盒中心不变（冒烟 `rotate45 center kept`） |
| 径向渐变填充 | 径向渐变 | `Paint.kind = "radial"`，圆心为 bbox 中心、半径取半对角线；画布 `createRadialGradient` 与 SVG `<radialGradient gradientUnits="userSpaceOnUse">` 同一几何 | 面板“径向”档可调起止色；导出 SVG 含 `<radialGradient>`（冒烟 `radial=true`） |
| 描边端点箭头 | 箭头/终点样式 | `Stroke.arrow`：无 / 实心三角 / 空心 / 菱形；画布按末段切线绘制，SVG 用 `<marker orient="auto">`，只对开放子路径生效 | 冒烟：闭合矩形不产生箭头，开放线产生 1 个 marker |
| 图层面板拖动排序 | 图层面板 | 任意层级行可拖动；根层与组内 before/after 排序，组行中间 inside 放入组内；落点重排容器 list，显示顺序与存储反向互换；组内排序与跨组搬移见第二十四批 | 实机拖动后画布叠放顺序变化，可撤销；三次搬移截图 `docs/shots/layers-drag.png` |
| SVG 导入（基础图形） | `svg` 导入 | 文件 → 导入 SVG…：支持 `path` / `rect` / `circle` / `ellipse` / `polygon` / `polyline` / `line`，解析 `transform`（translate/scale/rotate/matrix）与分组继承的 fill/stroke/opacity，导入后等比放进画板；第十六批起同时导入线性/径向渐变与 `fill-opacity` / `stroke-opacity` | 结构化 SVG 导入后成为可编辑路径节点；渐变矩形/圆形导入后填充类型、色标与透明度保留 |
| MCP 同步扩展 | — | `vexa-mcp` 的 `fill.kind=radial`、`stroke.arrow` 与 `set_paint` 描述、SVG 导出同步 | `--selftest` 仍 11/11；`smoke.mjs` 端到端通过 |

## 1.4 第四批已对齐（多画板 / 剪切蒙版 / 混合模式）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 多画板增删改 | 画板面板 | 属性坞“画板”段：列出全部画板，`＋/－` 新建或删除；点行切换当前画板并自动适合视图；W/H、名称、底色按当前板编辑；新板排在右侧 48px 处并沿用上一板尺寸 | 新建第二板后画布出现两块白纸，当前板边框为品牌蓝 |
| 激活画板 | 画板高亮 | `RenderState.activeBoardId`：当前板 1.4px 品牌蓝边，其余 1px 中性；空板提示绘制在当前板中心 | 切换画板时蓝框与提示同步移动 |
| 剪切蒙版 | Clipping Mask | `GroupNode.clip` 指向组内路径子节点：画布 `ctx.clip()` 后绘制其余子节点，轮廓本身不显示；菜单“建立/释放剪切蒙版”`Ctrl+7` / `Ctrl+Alt+7`；释放即去掉 clip 并拆组 | 两个同层路径建立蒙版后，内容只在轮廓内可见；SVG 导出 `clipPath` + `clip-path` |
| 混合模式 | 实时混合 | `BlendMode` 16 档（正常/正片叠底/滤色/叠加/变暗/变亮/颜色减淡加深/强光/柔光/差值/排除/色相饱和度颜色明度）；画布映射 `globalCompositeOperation`，SVG 导出 `mix-blend-mode`，属性面板下拉切换 | 叠两个形状切“正片叠底”，重叠区变暗；SVG 含 3 处 `mix-blend-mode` |
| 多画板 SVG 导出 | 画板导出 | 默认一次导出全部画板（每块独立 `<g id="board-N">` + 底色矩形）；导出弹层走当前画板 `docToSVG(doc,{boardId})`，PNG 也按当前板尺寸渲染；只收与板相交的顶层对象 | 冒烟：全量 1700×600 viewBox、单板 `900 0 800 600`；导出弹层标题跟随当前板尺寸 |
| `.vex` 容错 | — | 读取时校验 `blend` 合法值与 `clip` 指向是否存在，非法值静默剔除；`clip`/`blend` 正常往返 | 冒烟 `clip=mk blend=screen`，篡改成非法后读回 `none/none` |
| 界面贴近 Strata | — | 顶栏 38→36px、gap 8、padding 0 12、1px `--border` 底线；标签条去掉渐变高光，选中态只留白底 + 顶部 2px 品牌蓝；分隔线 20px | 与 Strata `EditorShell.css` 的顶栏/标签条尺寸一致 |

## 1.5 第五批已对齐（常驻侧栏 / 偏移路径 / 描边轮廓 / 平滑）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 常驻侧栏面板组 | 可停靠面板 | 属性页不再只有“画板/对象”：常驻“对齐与分布”（6 对齐 + 2 分布）、“排列”（置顶/上移/下移/置底）、“路径查找器”（4 布尔）、“文档信息”（工程/画板/对象/格式）；未选中时也可见，按钮按选择状态禁用 | 空选状态下侧栏能看到 5 组面板，不再是空白 |
| 偏移路径 | Object → Path → Offset Path | `core/pathfx.ts`：曲线先按 10 段拍平，闭合环按外法线做斜接偏移，开口路径单侧平移；属性坞“路径效果”填 px 后点“偏移路径”，对象菜单给 6px 快捷入口 | 冒烟：100×100 矩形外偏 10 → [-10,-10,120,120] |
| 描边转轮廓 | Object → Path → Outline Stroke | 同一文件：闭合路径生成外/内两条轮廓（内环反向成孔），开口路径生成左右两侧 + 平头端帽的闭合轮廓；描边颜色转成填充色，描边清空 | 冒烟：宽 10 的 100×100 矩形 → 2 个子路径，包围盒 [-5,-5,110,110] |
| 平滑路径 | Object → Path → Simplify/Smooth | 锚点向相邻两点的中点靠拢（闭合环首尾参与，开口端点固定），属性坞给 0–1 强度入口（默认 0.35）；菜单快捷项同用 0.35 | 冒烟：100×100 矩形 amount=0.5 → bbox [25,25,50,50] |
| 侧栏路径效果入口 | 路径效果菜单 | 选中单条路径后属性坞出现“路径效果”段：偏移值 + 偏移/轮廓/平滑三键，不必翻菜单 | 实测点击“描边转轮廓”后路径变填充轮廓 |

## 1.6 第六批已对齐（剪刀工具）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 剪刀工具 | Scissors Tool（工具轨 `C`） | 工具轨第 12 个工具；点击路径轮廓 8px（随缩放换算）内切开：锚点处直接切，段中点击先用 De Casteljau 在三次曲线上插锚点再切。开口路径拆成两段（切口两侧各留一个重合锚点、后段手柄深拷贝），闭合路径转成一条开口路径（首尾在切口重合，轮廓保持完整）；命中后选中该路径，可一步撤销 | 冒烟：闭合 4 锚点矩形在 1 号锚点切 → 1 条开口 5 锚点、首尾重合；开口 4 锚点切 → 2 段 2/3 锚点；段中 t=0.5 切 → 6 锚点、切口 x=50 且首尾重合 |
| 剪刀光标与提示 | — | 剪刀选中时画布 `crosshair`，状态栏提示“点击路径轮廓切开：锚点直接切，点在线段中会先插入锚点”；不响应锁定/隐藏路径 | 实机点矩形上边中点：doc 内锚点 4→6、`closed=false`、切口 x=575（矩形 x=295、W=561 的中点）；撤销可回退 |

## 1.7 第七批已对齐（画板工具 / 平滑工具）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 画板工具 | Artboard Tool（工具轨 `⇧O`） | 工具轨第 12 个工具。空白处拖动新建画板（`Shift` 拖正方形），画板内部拖动整板移动，当前板显示 8 个边角缩放柄；拖柄改 W/H，支持翻过对边、最小 4px；新建/移动/缩放都吸附 0.5px，一次拖动一步撤销；点击哪块板就切哪块为当前板 | 实机屏幕 875,320→990,500 拖出 `画板 2`：doc 得到 x=1183 y=299 w=215 h=336（54% 缩放下 1:1 换算）；再拖板内 -30,-20 CSS px → x=1129 y=263；拖右下柄 → w=271 h=410，侧栏 W/H 同步 |
| 画板光标反馈 | — | 画板工具下，光标在缩放柄上显示 `nwse/nesw/ns/ew-resize`，板内显示 `move`，空白处 `crosshair`；画板名与当前板蓝框沿用现有渲染 | 画布上悬停四角与四边，光标形状各自正确 |
| 平滑工具 | Smooth Tool（工具轨 `M`） | 工具轨第 5 个工具。按住拖过路径，按 8px 采样笔迹、16px 半径找锚点；锚点按 0.34 强度向相邻两点中点收拢，无手柄的转角自动补对称手柄（长度取相邻距离的 0.28，且不超过半径 1.5 倍）；单次笔划每个锚点位移上限 = min(半径 1.3 倍, 较短邻边 0.22 倍)（16px 半径下约 21 CSS px），避免一笔把角拖塌；开口路径端点固定，重复拖更顺 | 冒烟：单次笔刷扫过 100×100 矩形右上角 → `85,15` 且 `hIn/hOut` 从空变有；半径 12 连扫 12 次仍被预算锁在离原位 16px 内、角点 `89,11` |
| 画布刷新节流 | — | 指针高频移动时渲染合并到 `requestAnimationFrame`，一帧最多重绘一次；没有拖动且悬停对象未变化时不再重绘整张画布；画板工具下只更新光标，不重绘场景 | 工具轨 14 个 + 多画板场景下拖动/悬停无整屏闪烁 |
| 工具轨与快捷键 | — | 工具轨 14 个（第八/九批后 16 个，新增直线 `\`、铅笔 `N`）；`M` 平滑、`⇧O` 画板；剪刀 `C`、钢笔 `P` 等原有快捷键不变 | 实机按 `M` / `⇧O` 能切到对应工具，状态栏提示同步 |
| 工具选项栏 | — | 选项栏按工具换内容：画板工具显示“当前画板 W × H”，绘制类工具（钢笔/矩形/圆角矩形/椭圆/多边形/星形/文字）才显示填充、描边、粗细；剪刀/平滑/选择/抓手/缩放不再挂无关的填色控件 | 切到画板工具，选项栏只剩当前板尺寸；切回矩形恢复填色与粗细 |

## 1.8 第八批已对齐（字符面板 / 文字排版）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 字体选择 | Character 面板 Font Family | 属性坞文字段加入字体下拉：微软雅黑、宋体、黑体、楷体、仿宋、Arial、Georgia、Times New Roman、Courier New、Segoe UI；工程里保存实际字体名，读取到列表外字体时保留为额外选项 | 选中文字切字体，画布与 SVG `font-family` 同步 |
| 字号 / 行距 | Character 面板 Size / Leading | 字号单值提交；行距 UI 显示 px，提交时换算为 `lineHeight = px / size` 存倍数，缩放字号时行距按比例跟随；默认 1.25 倍 | 冒烟：40px + 1.6 倍 → 第二行 `dy=64`；`.vex` 往返 `lineHeight=1.6` |
| 字距 | Character 面板 Tracking | `tracking` 以 px 存储，可为负；为 0 时整行一次性 `fillText` 保留字偶，非 0 时逐字符推进并按字距累加，bbox 同步计入 | 冒烟：`tracking=4` → SVG `letter-spacing="4"`，bbox 宽 237（无字距时更窄） |
| 粗体 / 斜体 | Character 面板 B / I | `bold` 映射 `700` 字重，`italic` 映射斜体字体串；SVG 输出 `font-weight="700"` / `font-style="italic"`；按钮为可切换的 B / I 状态键 | 冒烟：两项均为 true 且 SVG 属性存在；再点一次可回退 |
| 对齐 | Paragraph 面板 Left / Center / Right | `align` 三档；画布按行实际宽度计算 `dx`（center 减半宽、right 减全宽），bbox 的 x 同步左移；SVG 用 `text-anchor="start|middle|end"` + 每行 `<tspan x="0">` | 冒烟：`align=center` → SVG `text-anchor="middle"`，bbox x=181（文本锚点 x=300） |
| 水平 / 垂直缩放 | Character 面板 Horizontal / Vertical Scale | `hScale` / `vScale` 百分比，画布 `ctx.scale` 后再绘字，bbox 宽高同步乘缩放；SVG 在 `translate` 后追加 `scale(hs vs)`，100% 时不输出多余变换 | 冒烟：120% / 90% → SVG `scale(1.2 0.9)`，bbox 237×115 |
| 基线偏移 | Character 面板 Baseline Shift | `baseline` 以 px 存储，正数向上；画布逐行基线减偏移，bbox 顶边同步上移；SVG 的 `translate` y 直接减偏移 | 冒烟：基线 6px → SVG `translate(300 194)`（锚点 y=200） |
| 文字编辑撤销 | — | 文本框聚焦时记录快照，输入过程走 `store.live` 不建栈，失焦后一次 `finish` 合成单步撤销；避免逐字符塞满 200 步历史 | 输入整段文字后撤销一次即回到编辑前，不再一个字一步 |
| 格式读写 | — | `.vex` 读取时补字体/字号/文本默认值；非法 `lineHeight <= 0.3`、非有限 `tracking`、非法 `align`、非正 `hScale/vScale` 全部静默剔除回退默认 | 冒烟 roundtrip：bold/italic/lineHeight/tracking/align/hScale/vScale 七项全保留 |

## 1.9 第九批已对齐（直线工具 / 自由铅笔）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 直线工具 | Line Segment Tool（工具轨 `\`） | 工具轨第 4 个工具。拖出两点直线，`Shift` 锁定 15° 方向；创建时即写入文档并实时更新第二锚点，松开不足 2px 自动丢弃；默认只描边、不填充，描边继承当前工具描边色与粗细 | 实机在画板拖 300,300→500,300 得到 200px 水平线；`Shift` 拖对角得到 45°/15° 步进线；侧栏 W/H 与描边宽度同步 |
| 自由铅笔 | Pencil Tool（工具轨 `N`） | 工具轨第 5 个工具。按住自由绘制，按 2 CSS px 采样，写入临时折线实时预览；松手后用 Douglas–Peucker（容差 1.2px）抽稀，再把内部锚点按 Catmull-Rom 切线（前后差 /6）补对称手柄、首尾补单侧手柄，成为可直接用直接选择编辑的平滑曲线 | 冒烟：49 点正弦抖动笔迹 → 抽稀到 11 点、首尾保留、9 个内部锚点全有对称手柄、首尾各有单侧手柄；实机画 S 曲线后直接选择可拖锚点和手柄 |
| 工具轨与选项栏 | — | 工具轨 16 个；直线/铅笔只显示描边色与粗细，不显示无关的填充控件；两者光标均为十字，状态栏提示各自操作方式 | 切到直线，选项栏只剩描边与粗细；切回矩形恢复填充 + 描边 |

## 1.10 第十批已对齐（吸管 / 渐变工具）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 吸管工具 | Eyedropper Tool（工具轨 `I`） | 工具轨第 8 个工具。点击最上层对象取样：路径取填充 + 描边，文字取填充 + 字体/字号/粗斜体/行距/字距/三档对齐/横纵缩放/基线。无选中时把取样结果设为当前绘图样式并选中源对象；有选中时把式样套到所有选中对象（组会递归应用到子路径/文字） | 实机：先选蓝填充矩形，再点红色圆形 → 矩形填充/描边变红；不选对象点蓝色文字 → 顶部填充色变蓝且文字被选中 |
| 渐变工具 | Gradient Tool（工具轨 `G`） | 工具轨第 9 个工具。在选中路径上拖动定义线性渐变方向（`Shift` 锁 15°）；实色转渐变时停靠点用「本色 → 白」，已有线性/径向渐变保留原停靠点只改角度；多个选中对象一起应用，一次拖动一步撤销 | 实机：选中矩形沿左上→右下拖 → 填充变 45° 渐变，右侧属性栏出现线性两色停靠点，撤销一步回实色 |
| 工具轨密度 | — | 工具增加到 18 个后，工具按钮从 34px 收到 32px、轨间距 3px → 2px，820 高窗口下 18 个工具 + 双色板不裁切 | 实机截图底部队列完整可见 |

## 1.11 第十一批已对齐（橡皮工具）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 橡皮工具 | Eraser Tool（工具轨 `E`） | 工具轨第 7 个工具。按住拖动显示半透明胶囊笔刷 + 当前圆轮廓（4px 采样）；有选中时只擦选中对象（组递归到子路径），无选中时擦所有可见未锁定路径；松开合并为一次撤销 | 实机在 1080 画板上直径 24px 擦过 561×467 红色矩形下部，擦出光滑波浪缺口；侧栏对象仍为 1 个、W/H 不变，撤销一步完整恢复 |
| 填充路径擦除 | — | 闭合且有填充的路径走 `polygon-clipping` 差集：以每个笔刷采样点为 24 边形圆，多个圆一次性从原路径减去；结果保留外环与洞（洞反向，nonzero 填充正确），描边沿新边界重绘 | 冒烟：100×100 红色矩形中心擦半径 20 → 2 条闭合子路径（外环 5 锚 + 孔 25 锚） |
| 线条擦除 | — | 纯描边/开口路径不做布尔，改为把子路径按 ≤3px 加密采样，标记落在笔刷半径 + 半描边宽内的点，连续“笔刷外”段各自重建为平滑开口子路径；整段被擦空则删除对象，未碰到保持原曲线 | 冒烟：0–100 水平线在 50 处半径 10 擦 → 2 条开口段 0–38 / 62–100；笔刷移到 200 处 → `null` 不动原路径 |
| 笔刷尺寸 | — | 选项栏提供 2–200px 直径输入，画布按当前缩放换算成文档半径，屏幕笔刷大小保持恒定 | 输入 60px 后笔刷预览直径变为 60px，缩放到 100% 仍为 60px |
| 工具轨 | — | 工具轨 19 个（新增橡皮），按钮 32px / 间距 2px，底栏仍完整 | 实机工具轨截图 19 个图标 + 色板全部可见 |

## 1.12 第十二批已对齐（宽度工具）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 宽度工具 | Width Tool（工具轨 `W`，第 6 个） | 选中带描边的路径后，在路径上拖动即写入宽度点：拖中心两侧同时加宽，拖已有左/右方块手柄只改该侧；新点按邻近弧长参数 `t` 定位，拖动时 `store.live` 实时重绘，松开合成一步撤销；双击内部宽度点删除，0 / 1 端点始终保留 | 实机：934×0 直线（`stroke.width=10`）中心拖出 3 个宽度点，中点 `left=right=5.23×`，画布出现光滑钟形宽度；再拖上侧手柄，数据变为 `left=7.47× / right=5.23×`，下半仍保持原宽 |
| 数据模型 | Width Point / Width Profile | `Stroke.widthPoints?: WidthPoint[]`，每点 `{ t, left, right }`，`left/right` 是相对 `stroke.width` 的倍数（0.01–80）；`normalizeWidthPoints` 补 0/1 端点、按 `t` 排序并收敛非法值；同 `t` 的两个点形成台阶 | 冒烟：`setWidthPoint` 后 `points=3`，`t=0.25` 处左宽 `3×`；`.vex` 往返保留 3 点、中点 `2×` |
| 宽度过渡 | 平滑宽度曲线 | `widthAtSorted` 在相邻宽度点间用余弦插值 `(1-cos(pi*k))/2`，宽度峰圆润、无线性尖角；同 `t` 台阶保持硬边。渲染前把宽度点归一化一次，轮廓采样直接复用，避免每点重排 | 冒烟：0→0.25 段在 `t=0.0625` 处左宽 `1.293×`（线性应为 1.5×）；实机中心峰为弧线过渡 |
| 可变宽度轮廓 | Variable-width stroke outline | `widthOutline` 先把每条子路径按 4px 加密，再沿逐点法线按 `left/right` 倍数偏移两侧；开放路径输出 1 条闭合环，闭合路径输出外环 + 反向内环，非零填充得到空心描边。画布在存在宽度点时改画填充轮廓，没有时仍走普通 `stroke()` | 冒烟：300px 直线中部 2× → 轮廓包围盒 `200×20`；100×80 闭合矩形 → 2 环、各 90 锚 |
| 手柄与命中 | Width point handles | 每条路径第一个子路径上绘制每个宽度点的横杆、中心圆与左右方块柄；`widthHandleAt` 命中左右柄（8/zoom）或中心（6/zoom），中心优先 `both`；`widthTargetAt` 扫描可见未锁定描边路径，容差随基础线宽与最大倍数扩宽，悬停显示预览横杆与双圆环 | 实机悬停线中心出现中心圆 + 上下圆环；拖上侧方块只改左侧，轮廓上缘加宽、下缘不变 |
| 撤销与删除 | Width point edit history | 拖动前 `snapshot()`、松开 `finish()`；双击内部点走 `commit(remove)`。`removeWidthPoint` 在删掉内部点后若只剩全 1 端点，直接清空宽度点，选项栏回到 0 | 实机：单侧拖后撤销一次，`left/right` 从 `7.474/5.232` 回到 `5.232/5.232`；双击中点后 `宽度点 0`、线恢复 10px 均匀描边 |
| 导出与读写 | SVG / .vex width profile | SVG 在存在宽度点时原路径写 `stroke="none"`，另输出一条 `fill=描边色` 的轮廓路径（`fill-opacity` 随描边透明度）；`.vex` 读取时归一化宽度点，合法 ≥2 点保留、非法删除 | 冒烟：SVG 出现 2 条轮廓 `<path>`、不再输出 `stroke-width="10"`；`.vex` 往返 3 点、中点 `2×` |
| 工具轨密度 | — | 宽度工具插在铅笔与橡皮之间，工具轨增至 20 个；按钮 30px、间距 1px、选中竖条 `left:1 / top-bottom:8`，820 高窗口下 20 个工具 + 双色板不裁切 | 实机工具轨 20 个图标与底部双色板完整可见，宽度图标/提示/选项栏正常 |

## 1.13 第十三批体验改造（UI 壳层，不要求照 VC 视觉）

> 用户明确要求：可以完全不照 VectorCraft 的 UI 样式，但导航不能少、操作要顺、界面要有呼吸。
> 本轮只改壳层与交互路径，不改矢量数据模型和现有工具算法。

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 主菜单完整度 | 标准矢量软件菜单 | 文件 / 编辑 / 对象 / **文字** / 视图 / **窗口** / 帮助 共 7 组；文字菜单提供粗体、斜体、三档对齐、字号 ±2、选中全部文字；窗口菜单控制右侧面板与默认工作区 | 实机 7 个菜单完整显示；选中文字后文字菜单可用，粗体执行后菜单出现 ✓ |
| 工具轨信息架构 | 分组工具栏 | 20 个工具按“选择 / 路径与笔 / 修形 / 颜色 / 形状 / 画板 / 视图”7 组双列排布，按钮 34×34，分组标签独立；单行剩余工具自动居中；底部常驻当前工具与填充/描边 | 实机 7 组全部可见，当前工具 chip 与两个色板不裁切；悬停显示“名称 + 快捷键”浮签 |
| 选项栏 | 工具上下文选项 | 加高到 50px；左端固定当前工具/快捷键 chip；选择工具显示已选数量、包围盒尺寸和全选/取消/编组；右侧常驻网格/吸附开关；上下文提示保留 | 实机切选择工具显示“已选 0 / 未选中对象 / 全选 / 在画布拖框可框选”；绘制工具显示填充、描边、粗细 |
| 右侧面板 | 属性 / 图层 Docks | 加宽到 304px，标签条 42px，正文 18px 呼吸；面板标题带品牌蓝标识；标签条右侧可收起，收起后画布右侧出现“‹ 面板”恢复按钮，宽度 220ms 过渡 | 实机收起后 `.ed-dock.is-collapsed` 宽度为 0；恢复按钮位于选项栏下 12px；开合时画板保持居中 |
| 画布右键 | 对象上下文菜单 | 右键先选中光标下对象（空白取消选择），再打开对象菜单：剪切/复制/粘贴/删除/编组/剪切蒙版/置顶置底/锁定/隐藏/全选/适合画板；菜单自动测量高度并夹在视口内 | 实机菜单高 484px，视口 725px 时顶部 233px、底部 717px，未越出屏幕 |
| 页面过渡 | 视图切换 | 欢迎页→编辑器 260ms 淡入 + 轻微位移缩放；关闭文档先 170ms 退场再显示欢迎页；reduced-motion 下退场延时归零 | 实测关闭后 47ms 为 `.editor.is-leaving` 且欢迎页未挂载，277ms 欢迎页出现 |
| 欢迎页预览 | 画板预览 | 预览纸限制在 240×110，预览区高 144px 且 `overflow:hidden`；修复白纸纵向溢出盖住下方内容 | 1280×820 截图预览纸完整落在棋盘格内，“创建画板”按钮在首屏可见 |
| 画布纵深 | 画布底色 | 画布容器增加上下内阴影，浅/深主题分别使用 `--canvas-vignette`；画板投影与点阵保留 | 浅色/深色实机截图均能区分画布底板与画板纸面 |

发布验收：`release\Vexa.exe` 已用本轮源码重新构建（7,551,488 B），真实 Windows WebView2 窗口在 150% 系统缩放下启动正常，欢迎页与编辑壳均完整落在工作区内；截图见 `docs/shots/ux-v13-real-start.png`、`ux-v13-real-editor.png`。

## 1.14 第十四批已对齐（多色渐变 / 描边端帽与连接）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 描边端帽 | LineCap | `Stroke.cap?: "butt" \| "round" \| "square"`，默认 `butt`；画布写 `ctx.lineCap`，SVG 输出 `stroke-linecap`，`.vex` 读取时非法值回退 `butt`；MCP `stroke.cap` 同步 | 面板“端点”三档选中态正确；冒烟/ MCP 输出 `stroke-linecap="round"` |
| 描边连接 | LineJoin | `Stroke.join?: "miter" \| "round" \| "bevel"`，默认 `miter`；画布、SVG、`.vex`、MCP 全链路同步 | 面板“连接”三档选中态正确；冒烟断言 `stroke-linejoin="bevel"` |
| 多色渐变 | Gradient stops | `GradStop[]` 统一排序 + `offset` 夹到 0..1；画布、SVG `<stop>`、面板预览都按全部色标输出，不再只取首尾两色 | 4 色标画布正常显示；SVG 生成 3 个 `<stop>`；插入第 4 个色标得到空档中点 0.725 |
| 渐变色标编辑 | Gradient stop editor | 属性坞填充段新增色标列表：每行颜色、百分比位置、删除；底部“添加色标”自动找最大空档并混合中间色；最少保留 2 个色标 | 实机添加 2 次得到 4 行；删除 1 行变 3 行，再次添加恢复 4 行 |
| 渐变色标容错 | .vex / MCP | `.vex` 读取 `stops` 排序、裁剪、非法颜色回退；MCP `fill.stops` 优先于 `to`，服务端同样排序 | 冒烟 `.vex` 往返 3 个色标；MCP 端到端多色标=true |
| 面板信息层级 | Stroke / Fill panels | 填充区改为“预览条 → 色标行 → 角度”；描边区改为“线型 → 端点 → 连接 → 箭头”，同类选项成组，不再把 3 个无关按钮混在一行 | 截图 `docs/shots/v14-gradient.png`、`v14-stroke.png` |

发布验收：`release\Vexa.exe` 已用第十四批源码重新构建（7,552,512 B，SHA256 `6F7FB068716D92F032E54CC7C6407904A98F4D1A282181011C35544B44B795B8`），真实 Windows WebView2 窗口启动正常；四色标渐变截图见 `docs/shots/v14-real-editor.png`，14px 圆头开放直线截图见 `docs/shots/v14-real-line3.png`。

## 1.15 第十五批已对齐（渐变透明度 / 中点 / 画布直拖）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 色标透明度 | Stop opacity | `GradStop.alpha?: 0..1`；画布用 rgba、SVG 输出 `stop-opacity`、`.vex` 往返保留；与填充整体 opacity 相乘 | 冒烟半透明中点 alpha=0.7，SVG `stop-opacity="0.7"`，`.vex` 读回 0.4 |
| 色标中点 | Gradient midpoint | `GradStop.midpoint?: 0..1`，表示到上一个色标的插值中点，默认 0.5；共用 `expandGradStops()` 把非 0.5 区间展开成中间色阶，Canvas 与 SVG 观感一致 | 中点 0.25、两端黑白时，25% 位置实测 `#808080 / alpha 0.7`；SVG 由 2 个作者色标展开为 17 个 `<stop>` |
| 面板控件 | Gradient editor | 每个色标行新增“透明”百分比；非首色标新增“中点”百分比；颜色、位置、透明度、中点都可键盘输入；最少保留 2 色标 | 面板实测行值为 `0/100`、`45/35/20`、`100/100/50`；删除按钮仍受 2 色标下限保护 |
| 画布直拖 | On-canvas gradient annotator | 渐变工具选中单个渐变路径时显示轴线与色标手柄；线性沿角度轴拖，径向沿半径拖；拖动时夹在相邻色标之间，整次拖动合并为一步撤销 | 线性拖拽 45% → 28.3%、径向 50% → 66.4%，角度均保持 90°；真实 Tauri 窗口 45% → 30% |
| 全链路同步 | SVG / .vex / MCP | SVG 与画布共用展开算法和 rgba；MCP `fill.stops` 支持 `alpha`、`midpoint`，导出端展开并输出 `stop-opacity` | MCP 自检新增“色标透明度 / 中点展开”全过；端到端 SVG 2617 B，校验 0 问题 |

发布验收：`release\Vexa.exe` 已用第十五批源码重新构建（7,554,048 B，SHA256 `7247BB22D2C69A4D43CB8E84BA13A9234C9825831A47B6F4D9B03050E051854B`），真实 Windows WebView2 窗口启动正常；色标透明度/中点面板与画布拖动见 `docs/shots/v15-real-panel.png`、`v15-real-drag.png`。

## 1.16 第十六批已对齐（SVG 渐变导入 / 透明度保真）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| SVG 线性渐变导入 | SVG import → linear gradient | `src/core/svg.ts` 在导入文档里解析 `linearGradient`：`x1/y1/x2/y2` 推角度，`gradientUnits=userSpaceOnUse` 与 `objectBoundingBox` 都接受；结果转成 `Paint.kind="linear"` + `GradStop[]`，仍按 Vexa 的 bbox 几何铺开 | 浏览器 `DOMParser` 实测 `x1=0,y1=0,x2=0,y2=1` → angle=90；Vexa 导出 SVG 后再导入角度仍为 90 |
| SVG 径向渐变导入 | SVG import → radial gradient | `radialGradient` 转为 `Paint.kind="radial"`，色标（含 `stop-opacity`）原样保存；圆心/半径按 Vexa 规则重新按 bbox 计算 | 径向白→黑 50% 透明导入后 `kind=radial`、2 个色标、末色标 alpha=0.5 |
| 色标透明度与颜色 | Stop color / opacity | `stop-color` 支持 hex、rgb/rgba、百分比 rgb、命名色和 HSL（浏览器端用 2D 上下文归一化）；`stop-opacity` 支持 `0.35` 与 `35%`，与 `stop-color` 自带 alpha 相乘 | 三色标 `#ff0000/0.8`、`rgb(0,128,255)`、`#0000ff/35%` 导入为 `#ff0000 alpha .8`、`#0080ff`、`#0000ff alpha .35` |
| 渐变引用与继承 | `xlink:href` / `href` | 渐变自身没有 `stop` 时沿 `href`/`xlink:href` 最多追 4 层；失效 `url(#missing)` 回退为无填充，不生成黑块 | `xlink:href="#lg"` 的别名渐变导入后 3 个色标完整；缺失引用节点 `fill=none` |
| 填充/描边透明度 | fill-opacity / stroke-opacity | 导入时把 `fill-opacity` 写进 Paint.opacity（与渐变 alpha 相乘）、`stroke-opacity` 写进 Stroke.opacity；节点 `opacity` 只留元素自身透明度，不再误乘到描边 | 组 `fill-opacity=.5` + 渐变首标 alpha .8 → paint.opacity=.5；`stroke-opacity=70%` → 描边 opacity=.7 |
| 单色标与容错 | Gradient fallback | 单色标渐变退化为同色实色（保留透明度）；非 SVG、XML 解析失败、无图形都返回空结果由界面提示，不抛异常 | Node 冒烟：单色标 `#abcdef/0.6` → 实色；坏 XML → 0 节点；空 SVG → 0 节点 |
| 命名与选择 | Import UX | SVG 导入的节点命名为“导入路径 N”，与位图描摹的“描摹路径 N”区分；导入后全选并等比放进当前画板 | 实机六对象导入后状态栏“已选 6 · 6 个对象”，属性坞显示“导入路径 1” |

验收记录：`npx tsx scripts/smoke.svg-import.mts` 断言 6 个节点、线性 3 色标、径向 2 色标、alpha .8/.35、`href` 继承、单色标退实色、坏 XML/空 SVG 均 0；`npx tsc --noEmit`、`npm run build` 通过。开发页导入截图 `docs/shots/v16-dev-import.png`、`v16-dev-single.png`、`v16-dev-stops.png`；发布构建见 `docs/BUILD.md`。

发布验收：`release\Vexa.exe` 已用第十六批源码重新构建（7,555,584 B，SHA256 `C7C50C414571853A0CDEBCEF14FCF915E9796D6AB3F36CD7467712DEECE3A75B`），真实 Windows WebView2 窗口通过系统“导入 SVG”对话框导入 6 个渐变对象，状态栏“已选 6 · 6 个对象”，单选后色标为 `0/100`、`45/90`、`100/35`、角度 90°；截图 `docs/shots/v16-native-imported.png`、`v16-native-single.png`。

## 1.17 第十七批已对齐（原生矢量 PDF 导出）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| PDF 导出入口 | PDF export | 顶栏“导出”弹窗新增 **PDF 文档** 卡片；文件菜单提供“导出 SVG / PNG / PDF”；默认导出格式设置可保存 PDF；PDF 模块按需懒加载，不拖慢启动 | 实机导出弹窗三卡片、PDF 选中态与“当前画板 / 全部 2 页 / 2 页 · 矢量”切换正常；见 `docs/shots/v17-ui-export-modal2.png`、`v17-ui-export-pdf2.png` |
| 多画板分页 | Artboards to pages | 每个画板独立一页，页面尺寸等于画板尺寸；可选当前画板或全部画板 | 发布版选中“全部 2 页”导出，PDF 为 2 页 `900×640` + `520×360`，页面内容与画板对应；见 `docs/shots/v17-final-export-p1.png`、`v17-final-export-p2.png` |
| 路径与描边 | Vector paths / strokes | 纯本地 PDF writer：路径、矩形、多边形、线宽、端帽、拐角连接、虚线、实色填充；箭头仍按基础线宽输出 | Node 冒烟两页 46,588 B、warnings 0；渐变矩形、虚线描边、星形轮廓与实色文字完整 |
| 原生渐变 | Linear / radial gradients | 线性用 Type 2 轴向 shading，径向用 Type 3 径向 shading；色标采样为 Type 0 函数（256 样本）；逐色标透明度用 `/SMask` 软遮罩；不再用色带近似 | 冒烟 PDF 38–47 KB，径向渐变无白楔缺口、线性渐变无可见色带；渲染 `docs/shots/v17-pdf-p1.png`、`v17-pdf-p2.png` |
| 文字轮廓 | Text outlines | fontkit 读取本机字体并转成 PDF 路径，支持对齐、字距、横纵缩放、基线、合成粗斜体、渐变文字裁剪；文字保持矢量但不可选中/搜索 | 真实发布版导出“Vexa PDF 导出 / 文字轮廓保持矢量 / 实色文字 · 零联网 · 本地导出”字形完整，渐变文字未被裁切 |
| 透明位图 | Raster images with alpha | 图片解码为 RGB + `/DeviceGray` SMask（带 `/Decode [0 1]`）；data URL 在 Tauri CSP 下不再走 `fetch`，直接 base64 → `Blob` → `createImageBitmap` | 发布版导出含 180×120 透明 PNG：PDF 39,722 B（修复前 31,978 B 且位图缺失），渲染右下角 ALPHA 圆图正常；`docs/shots/v17-native-export2-recheck-p1.png` |
| 保存链路 | Native save dialog | 使用 Tauri 原生保存对话框；默认文件名跟随工程名；全路径可直接粘贴到文件名框保存 | 发布版真实 UI：打开 `pdf-export.vex` → 导出 → PDF → 全部 2 页 → 原生保存框粘贴 `D:\20533\deskbox\fangwork\Vexa\docs\shots\v17-final-export.pdf` → 回车写盘 77,615 B；渲染两页均正常 |

验收记录：`npx tsc --noEmit`、`npm run build`、`npx tsx scripts/smoke.pdf.mts` 均通过；浏览器 `scripts/pdf-browser-test.html` 的 data URL 透明/不透明位图均正确（16,013 B、warnings 0）；真实发布版通过 UI 完整写盘并渲染（`v17-final-export.pdf`）。已知边界：PDF 文字为轮廓，不可选中/搜索；渐变描边、图案填充、渐变网格未做；组透明度按节点复合 alpha 近似，重叠子节点可能重复压暗；字体只读本机文件，不打包不联网。

发布验收：`release\Vexa.exe` 已用第十七批源码重新构建（7,714,304 B，SHA256 `74D970B9C8BC6D191408A17594C14B8F9445A7A8D3CA8548826BE55FC598F87F`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,304,703 B（SHA256 `E4AF6A4485ED4FCE0100F288F7494EFBABDCA63F4DDCA1FF7222FAC77AC5AB13`）。

## 1.18 第十八批已对齐（SVG 文本与引用导入）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| SVG 文本导入 | Editable SVG text | `<text>` 转为可编辑文本节点：保留 x/y 基线、字号、字体族、粗体/斜体、`text-anchor`、字距、填充实色/渐变、`fill-opacity` 与组透明度；`dominant-baseline` 映射为基线偏移 | Node 冒烟 4 段文字；浏览器渲染标题、渐变行、第二行、缩放文字、居中文字全部正确，见 `docs/shots/v18-svg-text-render.png` |
| tspan 多行 | Text spans | 支持 `tspan` 的 `x/y/dy` 与独立 `transform/fill/font-size`；按叠放顺序拆成独立可编辑文本节点，字距与透明度逐段继承 | 渐变行一与第二行保持可编辑，第二行 y=82；属性坞字号、行距、字距、水平/垂直缩放、基线均可改 |
| `<use>` 引用 | SVG instances | 支持 `href` / `xlink:href` 引用组与 symbol，叠加 `x/y` 位移；支持嵌套 use（深度上限 12，拒绝循环引用）；引用元素继承 use 的填充/透明度 | 引用矩形在 (100,100)，圆在 (122..)，嵌套 use 位移 (20,20)；Node 冒烟 `nodes=8 text=4 usePaths=4` |
| 基础变换 | Basic transforms | 文本/引用支持 `translate`、`scale` 与非均匀缩放；文本旋转/斜切暂不旋转字形，只映射位置与缩放比例 | 缩放文字 `scale(1.5 1)` → 字号 10、水平缩放 150%；真实 app 属性坞读取 `Arial / 73.05px / 水平 100%` |
| 导入落位 | Fit imported group | `fitNodes` 扩展文本与图片，导入 9 个对象整体缩放并居中到当前画板 86% 区域 | 真实发布版导入 9 个对象（5 段文字 + 4 个路径），状态“已选 9”，画布可继续编辑 |

发布验收：`release\Vexa.exe` 已用第十八批源码重新构建（7,715,840 B，SHA256 `E42244D2A0A8D531369053D42A93A72D114ABE600D9F55D2FB75B2867DB1D3D6`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,306,366 B（SHA256 `E57927CB8855B981E0083302D5972030355EC5ECE65C0194FA4CFD50C64E2C97`）。真实 Windows WebView2 窗口从“文件 → 导入 SVG…”打开系统对话框，导入 `scripts/fixtures/import-text-use.svg`，画布出现 5 段文字 + 2 组图标，属性坞显示“导入文字 1 / SVG 文本导入 / Arial / 73.05px”；截图 `docs/shots/v18-native-final-import.png`、`v18-native-final-props.png`。

## 1.19 第十九批已对齐（SVG clipPath 与 symbol 缩放导入）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| clipPath 组裁切 | SVG clipping paths | `src/core/svg.ts` 读取元素的 `clip-path`（属性或内联 style），支持路径、矩形、圆、椭圆、多边形、折线，以及 clipPath 内的组与 `<use>`；clipPath 自身 transform 与引用元素的矩阵都参与换算 | `scripts/fixtures/import-clip-symbol.svg` 导入得到卡片矩形+圆 2 条子路径（bbox 90..580 / 60..340），底部色带组 3 个孩子；冒烟 `cardSubs=2` |
| 剪裁组数据模型 | Clip group | 每个裁切范围写成顶层 `GroupNode`：`children[0]` 是隐藏剪裁路径（`visible:false`、`locked:true`、无填充），`clip` 指向该路径；同前缀后代复用同一组，嵌套 clip 用组套组表达交集 | 2 个剪裁组、7 个顶层根；组首孩子均为剪裁路径；嵌套用例 5 个节点、外层/内层都带 clip |
| symbol viewBox 缩放 | SVG symbol instances | `<use>` 引用 `<symbol>` 或 `<svg>` 时读取目标 `viewBox`，以 use 的 `width/height`（缺省用 symbol 尺寸）建 viewport；默认 `preserveAspectRatio` 按 meet 等比缩放并居中，`none` 支持非均匀拉伸；引用普通组/形状仍只做 x/y 位移 | 96×96 星星实际 76.8×74，48×96 星星按 meet 缩到 38.4×37 且垂直居中；`preserveAspectRatio="none"` 纳入冒烟 |
| 导入落位与根层 | Fit imported root | `svgToNodes` 返回 `{ nodes, roots, nextSeq }`；`fitNodes` 递归组内所有孩子（含隐藏剪裁路径）统一缩放；只有 roots 进入根层，组内孩子不再重复出现 | 真实发布版干净画板导入：7 个顶层对象、14 个总节点、2 个剪裁组、4 段文字，状态“已选 7 · 7 个对象” |
| 剪裁内对象可选可改 | Direct selection inside clip | 拾取尊重剪裁范围：点落在 clip 外时整组跳过，避免底层整张画布矩形挡住上方内容；同时把中文文字包围盒从 0.62em 修为按字符宽度估算 | 直接选择工具点裁切标题：选中“导入文字 1”，165×52 px，属性坞 Arial / 41.28px；改成“裁切标题 · 已改”后画布即时更新、包围盒变 296×52 |
| 导出与容错 | SVG round-trip | `docToSVG` 为剪裁组写出 `<clipPath>` / `clip-path`，文字仍是可编辑 `<text>`；缺失 clip 引用、`objectBoundingBox` 不建组但保留原图形；`svgToPathNodes` 过滤隐藏剪裁轮廓 | 冒烟断言导出含 `<clipPath id="cN">`、`clip-path="url(#cN)"`、`<text transform="translate(130 170)">` 与“裁切标题”；坏引用 0 组、objectBoundingBox 保留 2 条可见路径 |

验收记录：`npx tsc --noEmit` 通过；`npx tsx scripts/smoke.svg-clip.mts` 输出 `clip nodes=14 roots=7 groups=2 text=4 cardSubs=2 bigStar=76.8 smallStar=38.4 nested=5 badGroups=0`，并新增 clip 命中测试（点在标题上 deep=true 得到文字、普通选择得到卡片组、色带整张画布矩形不得截胡）；`smoke.svg-text.mts`、`smoke.svg-import.mts`、`smoke.vector.mts` 回归通过。浏览器渲染 `docs/shots/v19-svg-clip-render.png` 中卡片矩形+圆形并集裁切、裁切内文字、底部色带、两枚星星尺寸均正确。真实 Tauri 窗口从“文件 → 导入 SVG…”导入同一 fixture：14 个节点、2 个剪裁组、4 段文字；直接选择裁切标题并改字见 `docs/shots/v19c-native-direct.png`、`v19c-text-edited.png`。

已知边界：`clipPathUnits="objectBoundingBox"` 暂不建组；clipPath 的 even-odd 孔洞未专门保留；`preserveAspectRatio="slice"` 与显式 `xMin/xMid/xMax` 对齐未细分；clipPath 内文本不参与剪裁轮廓；图案、滤镜、`mask` 仍未导入。

发布验收：`release\Vexa.exe` 已用第十九批最终源码重新构建（7,717,376 B，SHA256 `7C9CD4F00F6E1A837C24BBC5689A64A2E333B424E83E3CCEACFCE637E0179A7E`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,312,360 B（SHA256 `A9CB45DD4E525F2C088EB8115BD742346515D36823C12EE4B6DCF9EB940EDAED`）。

## 1.20 第二十批已对齐（图层面板组展开）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 组图层展开 | Layer hierarchy | 图层列表从只列顶层改为递归树：组前出现展开箭头，子图层按实际叠放顺序倒序列出并缩进；展开状态按组 id 记住，收起后选中关系不变 | 真实发布版导入 clip 验收文件后，展开“导入剪裁组 1”得到“导入文字 2 / 导入文字 1 / 导入路径 1”三行；收起箭头、展开箭头方向正确 |
| 内部剪裁路径不打扰 | Clip implementation hidden | 组的 `clip` 路径是渲染内部实现，图层树里跳过；用户只看到背景、文字等真实内容，仍可用直接选择工具改剪裁内的文字 | 展开组后子行只有 3 条，不出现隐藏且锁定的“导入剪裁路径 1” |
| 子图层可选中 | Direct layer selection | 点子图层名称直接 `onSelect([id])`，不需要先选组再进组；选中后属性坞切到该文字节点 | 点“导入文字 1”后状态“已选 1 · 165 × 52 px”，属性坞显示图层名“导入文字 1”、Arial、41.28px、文本“裁切标题” |
| 组行交互 | Group row | 单击组名选中整组；双击组名或点箭头展开/收起；组内子行也带显隐与锁定，操作作用于子节点本身 | 双击“导入剪裁组 1”可展开/收起；眼睛与锁按钮点击不改变当前选择 |
| 顶层排序保留 | Layer reorder | 拖拽仍只对顶层行生效，避免把子图层拖到根层造成结构破坏；底部提示改为“组可展开；拖动顶层行调整层级” | 顶层 7 行仍可拖动排序；子行不设 draggable |

验收记录：`npx tsc --noEmit` 通过；`npx tauri:build` 通过（139 modules，`index-CIZP0VR_.js` 459.59 kB、`index-T9he_bYd.css` 47.62 kB）。真实 Tauri 窗口新建 `900×600` 画板“图层终验”，导入 `scripts/fixtures/import-clip-symbol.svg` 后切到图层面板：顶层 7 行、展开“导入剪裁组 1”后增加 3 个子行，箭头方向正确；点子行“导入文字 1”选中 165×52 的文字节点，属性坞 Arial 41.28px。截图 `docs/shots/v20-final-layers.png`、`v20-final-select-text.png`、`v20-final-text-props.png`。

已知边界：组内子图层暂不支持拖动排序，也不能把子图层拖出组；导入后的组默认收起，需要点箭头或双击组名展开。

发布验收：`release\Vexa.exe` 已用第二十批源码重新构建（7,717,888 B，SHA256 `880F8BAEA9461EE9E9928D1DD7F299D901F6CA977281E5482C272B30BF009C91`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,308,381 B（SHA256 `8B617959EF85FB269BF8506A5B6DCA6737A0522FC0548574AF671D1DAD9A9650`）。

## 1.21 第二十四批已对齐（图层组内排序与跨组搬移）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 组内子层拖动排序 | Layer reorder inside groups | 图层树所有层级都可拖动；`before` / `after` 以同级行定位，同一容器移动时按来源显示索引修正插入点；只改 `doc.root` 或组 `children`，不改绝对坐标 | 真实发布版窗口：展开“卡片组”，把“标题”拖到“副标题”上方，显示顺序变为 `标题 / 副标题 / 卡片底`；截图 `docs/shots/layers-drop-before.png` |
| 子层拖出组 | Move child to root | 拖到根层行的上/下半区即离开原组，插入根层对应位置；组内剩余顺序与撤销历史保持 | 真实发布版窗口：把“操作提示”从卡片组拖到根层“背景”上方，根层对象 4 → 5，行缩进从 19px 回到 5px；截图 `docs/shots/layers-drag.png` |
| 顶层拖入组 | Move into group | 组行按纵向 `<28%` / `28..72%` / `>72%` 分 before / inside / after；`inside` 把目标组当新容器，从组顶插入并自动展开目标组 | 真实发布版窗口：把“操作提示”拖到“图标组”中间，出现“放入组内”胶囊；松手后成为图标组顶行，图标组自动展开，见 `docs/shots/layers-drop-inside.png` |
| 落点反馈与非法拦截 | Drop affordances | 行内画顶部/底部品牌色落点线；组内落点显示胶囊；`canMoveLayer` 拒绝拖自身、把普通对象拖成组内、把组拖进自己的后代；成功后选中来源节点 | 冒烟拒绝 self / not-group / cycle；真实窗口三向搬移后状态栏“未保存”，对象数与缩进同步 |

验收记录：`npx tsc --noEmit`、`npm run build` 通过（142 modules；`index-Dr0xuXFD.js` 466.30 kB、`index-DmPGAybe.css` 48.38 kB、`pdf-DagSJbuI.js` 407.16 kB）；`npx tsx scripts/smoke.layers.mts` **24 项 PASS**，新增“把一个组里的子层放进另一个已有子层的组”回归（目标组显示 `P / R / Q`，来源组清空）。真实 Tauri/WebView2 窗口用 `scripts/fixtures/layer-panel.vex`（4 个根对象、2 个组）完成组内排序、拖入组、拖出组三次操作；截图 `docs/shots/layers-drag.png`、`layers-drop-before.png`、`layers-drop-inside.png`、`layers-drag-window.png`。

已知边界：批量显隐 / 锁定仍未做；把子层拖入非组行会按同级 before/after 处理，不会报错；组折叠时子层不可见，需先展开才能拖动子层。

发布验收：`release\Vexa.exe` 已用第二十四批源码重新构建（7,790,080 B，SHA256 `83834C3E9C0C5DAB88029AD29E073788549B0ED7A8FF386696995E7D240A02CD`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,349,102 B（SHA256 `4F9CF6C0950FD932EAB4AC47F009783FFDE3CD9D4A236C7BCCBF739F0522EFE9`）。真实 Tauri/WebView2 窗口在 `scripts/fixtures/layer-panel.vex` 上完成组内排序、拖入组、拖出组三向操作；截图 `docs/shots/layers-drop-before.png`、`layers-drop-inside.png`、`layers-drag.png`。

## 2. 部分对齐

| 能力 | 现状 | 差什么 |
|---|---|---|
| 路径布尔 | 多边形级（拍平后运算） | 曲线保真布尔（参考 `pathops/boolean.rs` 80 KB 思路）；形状边界会退化为折线，锚点数偏多 |
| 钢笔 / 直接选择 | 加锚点、拖手柄、双击插入锚点 | 连接、锚点对齐、方向键推锚点、多选锚点 |
| 文字 | 单点文字 + 字符面板（字体/字号/行距/字距/粗斜体/三档对齐/横纵缩放） | 段落/区域/路径文字、段落面板（避头尾、首行缩进、段间距）、文字转路径 |
| 可变宽度描边 | 画布与 SVG 轮廓填充、宽度点编辑、余弦过渡 | 虚线不随宽度轮廓走（有宽度点时按实线轮廓输出）；箭头仍按基础线宽绘制；端帽 / 连接类型目前只作用于普通均匀描边，宽度轮廓仍是平头外框；宽度点手柄只画在第一条子路径，复合路径各子路径共用同一 `t` 轮廓 |
| 渐变 | 线性/径向均支持多色标、透明度、中点、画布轴线与色标直拖、`.vex` 往返、MCP `fill.stops` | 网格渐变、自由渐变、渐变描边尚未做；径向渐变的画布手柄只沿一条半径显示，不能改圆心位置/半径 |
| SVG | 导出（组、线性/径向渐变、虚线、箭头、混合模式、剪切蒙版）；导入基础图形、变换、线性/径向渐变、色标透明度、`href` 继承、`fill/stroke-opacity`、`<text>` 可编辑文字、`<use>` 引用、`<clipPath>` 组裁切与 symbol viewBox 缩放 | 导入仍不含 `objectBoundingBox` 剪裁、图案、滤镜、`mask`；clipPath 的 even-odd 孔洞与 `slice` 对齐未细分；文本旋转/斜切只映射位置与缩放、不旋转字形；`gradientTransform`、`spreadMethod` 径向的 `cx/cy/r` 暂按 Vexa 的 bbox 规则近似 |
| PDF 导出 | 多画板分页、原生线性/径向渐变、渐变文字、实色/虚线/端帽/连接、透明位图、文字轮廓 | 文字不可选中/搜索；渐变描边、图案填充、渐变网格未做；组透明度按节点复合 alpha 近似；字体只读本机文件 |
| .vex 文档 | 保存/读取、撤销栈 200 步、多画板、混合模式、剪切蒙版往返 | 画板级导出（单板 PNG）与文档设置面板尚未全流程实测 |
| 描摹 | Rust VTracer：预设/颜色数/细节/平滑/杂色，单测 3 项通过 | 分层输出、调色板编辑、实时预览、批量 |
| 面板 | 属性面板（位置/尺寸/填充/描边/不透明度/混合模式/画板）+ 可展开组图层树、组内排序与跨组搬移 | 批量显隐/锁定、色板、样式、符号、变换面板仍缺 |

## 3. 未实现（按批次规划）

**P2 · 路径与几何**
- 曲线保真的偏移与描边轮廓（当前为拍平折线，尖角按斜接近似，端帽只做平头）
- 路径查找器的细分：分割、修边、合并、裁剪、轮廓
- 曲线级布尔（替换 polygon-clipping 的退化问题）
- 自由变换框已支持缩放与旋转，还缺倾斜/斜切、变换数值面板
- 网格与参考线对象化

**P3 · 文档与绘制**
- 画板预设导入、单画板 PNG 导出
- 图层作为真实对象：组嵌套显示、组内拖动排序、把子层拖入/拖出组已做，还缺批量显隐/锁定
- 色板、全局色、专色、CMYK（参考 `doc/cmyk.rs`）
- 图案填充、渐变网格/自由渐变、渐变描边
- 符号、样式、画笔（参考 `brush` crate）

**P4 · 文字**
- 段落文字、区域文字、路径文字（参考 `text/shape.rs`、`text/retype.rs`）
- 字符/段落面板、OpenType 特性、竖排

**P5 · 导入导出**
- PDF 导入（`pdf` 2.1 MB）；PDF 导出已完成第十七批
- EPS 导出（`eps` 5.6 MB）
- AI/SVG 高保真导入、打印与出血

**P6 · 效果与扩展**
- 效果目录（变形、绕排、纹理）、3D/透视（`effects` 2.9 MB、`three-d`）
- 脚本与插件（`js`、`plugins`）——Vexa 定位"零联网零 AI"，此组默认不做；本机 MCP 已自带

## 4. 不打算照搬的部分

| 项 | 原因 |
|---|---|
| egui 前端与 626 个 UI 文件 | Vexa 是 Tauri + React + TS，界面语言按 Strata 设计令牌重做 |
| `cad`、`three-d`、`js`、`plugins` | 与本产品定位（纯矢量、零联网、无 AI）冲突或成本过高；MCP 改用本机 stdio 实现 |
| 各语言 i18n tsv | Vexa 只做全中文，`src/i18n/zh.tsx` |
| `testkit`、`apischema` | 属于参考工程的内部基建，Vexa 用自己的 `src-tauri/tests` |

## 5. 验收口径

每批完成后必须满足：
1. `npx tsc --noEmit` 与 `npm run build` 通过；
2. 新逻辑有可复现的冒烟脚本（`scripts/smoke.*.mts`，Vite SSR 打包后用 node 跑）；
3. 实机走一遍 UI（截图存 `docs/shots/`），菜单项禁用态、快捷键、撤销都验过；
4. 本文件把该批条目从"未实现"移到"已对齐"，并写明验收数据。

> 许可：若后续直接复用 VectorCraft 的算法代码，必须在该文件对应条目注明来源文件，并在 `ATTRIBUTION.md` 增加 MIT/Apache-2.0 声明。目前 `bool.ts` 走的是 polygon-clipping（MIT），未复制参考仓库代码。
