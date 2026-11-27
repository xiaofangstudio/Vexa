# VectorCraft 对齐清单（PARITY）

> 目标：把 Vexa 的功能面逐项对照参考软件 **VectorCraft**（`github.com/storytold/vectorcraft`，MIT OR Apache-2.0，Rust + egui，对标 Illustrator），把「1:1」拆成可验收的条目，而不是一句口号。
> 当前参考基线：commit `3463266b27fecf0d389439a522c7e0358cb72fa3`（2026-11-25，Cargo 版本仍为 `0.24.1`）。
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

已知边界：第二十五批已补齐批量显隐 / 锁定；把子层拖入非组行会按同级 before/after 处理，不会报错；组折叠时子层不可见，需先展开才能拖动子层。

发布验收：`release\Vexa.exe` 已用第二十四批源码重新构建（7,790,080 B，SHA256 `83834C3E9C0C5DAB88029AD29E073788549B0ED7A8FF386696995E7D240A02CD`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,349,102 B（SHA256 `4F9CF6C0950FD932EAB4AC47F009783FFDE3CD9D4A236C7BCCBF739F0522EFE9`）。真实 Tauri/WebView2 窗口在 `scripts/fixtures/layer-panel.vex` 上完成组内排序、拖入组、拖出组三向操作；截图 `docs/shots/layers-drop-before.png`、`layers-drop-inside.png`、`layers-drag.png`。

## 1.22 第二十五至二十七批已对齐（图层多选 / 变换数值 / 色板与最近颜色）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 图层多选 | Layer multi-select | 普通点选单选；Ctrl/Cmd 点逐层切换；Shift 从锚点按当前展开树的可见顺序连选，折叠组不把隐藏子层算进去；选中行统一高亮 | 真实发布版窗口：依次点“标题”、Ctrl 点“副标题”、Shift 点“卡片底”，得到 3 行选中，状态栏“已选 3 · 4 个对象” |
| 批量显隐 / 锁定 | Batch show/hide and lock | 选中多行时，行内眼睛/锁和面板顶部“显隐 / 锁定”作用于整组选中层；未参与多选的行只作用于当前行；语义为“任一层可见→全部隐藏，全部隐藏→全部显示；任一层解锁→全部锁定，全部锁定→全部解锁”，并 toast 数量 | 真实窗口：选中 3 行后点行内眼睛，3 行 aria-label 全部变为“显示”，toast“已隐藏 3 个图层”；再点恢复“隐藏”。顶部锁定后 3 行变为“解锁”，toast“已锁定 3 个图层”；再点恢复 |
| 变换数值面板 | Transform panel | 属性坞对单选与多选都显示 X / Y / W / H；多选 X/Y 平移整组，W/H 以选区左上角缩放；组递归缩放子层；文字按字号 + 水平缩放精确落到目标 W/H；附旋转 ±90°、水平/垂直翻转 | 真实窗口：多选 2 段文字，`276×122` 的选区把 W 输入 `260` 后，W/H 与标题读数精确变为 `260×122`；单测文字 216→260、45→90 均误差 <0.02px |
| 色板与最近颜色 | Swatches / recent colors | 实色填充、描边、画板底色下方显示 12 色固定色板；所有原生取色器与色板点击都会写入最近颜色（最多 10 个，`localStorage` 持久化）；当前颜色在最近与色板中描边高亮 | 真实窗口：选中“标题”，点色板 `#ff9f0a`，填充色板与画布文字同步变橙；最近行出现橙色 chip，重启后仍在；截图为滚到填充区的属性坞 |
| 色板取色反馈 | Swatch feedback | 色板按钮有 hover 抬升、focus-visible 轮廓、active 双描边；填充/描边/画板底色共用同一组件，取色后立即进最近列表 | 真实窗口 1280×1000 检查无横向溢出；填充行“不透明度”保持单行 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（143 modules；`index-Dof4g4IO.js` 470.43 kB / gzip 149.21，`index-C7Qk7DcQ.css` 49.76 kB / gzip 9.69，`pdf-CqBpYk8z.js` 407.16 kB / gzip 169.22）；`npx tsx scripts/smoke.selection.mts` **16 项 PASS**（显示顺序、单击/Ctrl/Shift 选区、批量显隐与锁定语义），`scripts/smoke.transform.mts` **6 项 PASS**（文字宽高精确缩放），`scripts/smoke.layers.mts` **24 项 PASS**（第二十四批复跑无回归）。真实 Tauri/WebView2 窗口用 `scripts/fixtures/layer-panel.vex` 完成多选、批量显隐、批量锁定、多选 W 数值和色板取色；截图 `docs/shots/layers-multi.png`、`layers-batch.png`、`layers-multi-window.png`、`props-transform.png`、`props-transform-after.png`、`props-palette.png`、`props-palette-window.png`。

已知边界：色板是固定 12 色 + 最近 10 色，不含全局色、专色、CMYK、色板命名/删除/导入导出；渐变填充的每个色标仍用原生取色器，快捷色板只出现在实色填充、描边与画板底色；文字 W/H 用字号与水平缩放逼近目标框，路径描边宽度不随框缩放；多选锁定后仍保持选中，方便再点一次批量解锁。

发布验收：`release\Vexa.exe` 已用第二十五至二十七批源码重新构建（7,791,616 B，SHA256 `BB616C84A7F32F377D87868F3D482098B7C2D350C2D501840E97195310420459`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,350,288 B（SHA256 `F83EB15E7C0A80F2201874B8CA14192DFA7CE94F6B288E64783679D48E36F645`）。

## 1.23 第二十八批已对齐（图层搜索 / 颜色标记 / 过滤）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 图层搜索 | Layer search | 图层面板顶部搜索框按名称子串匹配，也认“路径 / 文本 / 图片 / 组”类型词；不区分大小写；命中子层时保留祖先组作为上下文并自动展开，组自身命中但子层不命中时只显示组行；搜索与颜色筛选按 AND 组合 | 真实窗口搜索“操作提示”只留 `卡片组 / 操作提示` 两行，组自动展开，头显“1 匹配”；截图 `layerfilter-search.png` |
| 颜色标记 | Layer color labels | Node 新增 `tag`（红 / 橙 / 黄 / 绿 / 蓝 / 紫），旧 `.vex` 缺字段照常打开，非法值在读取时丢弃；属性坞对单选和多选都显示 7 个标记按钮（含“无”），多选打标一次提交一步撤销；行尾显示对应色点，点色点即切到该色筛选 | 真实窗口给 `标题 / 副标题 / 卡片组` 分别标红 / 蓝 / 绿，行尾三点与筛选条计数 `1 / 1 / 1` 同步；多选两段文字标紫后 toast“已标记 2 个图层”，紫计数变 2；截图 `layerfilter-tags.png`、`layerfilter-props.png`、`layerfilter-final.png` |
| 标记筛选与清除 | Filter by label | 筛选条含“全部”与 6 色 chip，chip 显示数量、无标记时禁用；过滤时保留命中层的祖先组、自动展开、只渲染命中分支；搜索 + 颜色同时启用可得到空集，显示“没有匹配的图层 / 清除筛选”；清除后恢复原展开状态和完整树 | 红色筛选只留 `卡片组 / 标题`，头显“1 匹配”；再叠搜索“操作提示”得到 0 行与空状态；清除后恢复 8 行；截图 `layerfilter-red.png`、`layerfilter-empty.png` |
| 布局与回归 | Panel layout / regression | 搜索框、7 个色 chip、属性标记按钮均在 303px 面板内不横向溢出；多选、批量显隐/锁定、组展开和拖放逻辑未改 | 真实窗口 `.layers-body / .layer-filter / .layer-tag-filters / .layer-search` 的 `scrollWidth == clientWidth`；多选“标题 + 副标题”后批量按钮仍启用；截图 `layerfilter-window.png` |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（144 modules；`index-eWrnshGC.js` 476.25 kB / gzip 150.85，`index-C-PqTAB4.css` 52.66 kB / gzip 10.10，`pdf-DscykRww.js` 407.16 kB / gzip 169.22）；`npx tsx scripts/smoke.layerfilter.mts` **27 项 PASS**（名称/类型搜索、组上下文、AND 组合、剪裁路径排除、环终止、标记保存/非法值丢弃），`scripts/smoke.selection.mts` **16 项 PASS**、`scripts/smoke.layers.mts` **24 项 PASS** 复跑无回归。真实 Tauri/WebView2 窗口（1280×1000 逻辑，DPR 1.5）完成打标、搜索、筛选、空状态、清除和多选打标；截图 `docs/shots/layerfilter-tags.png`、`layerfilter-search.png`、`layerfilter-red.png`、`layerfilter-empty.png`、`layerfilter-props.png`、`layerfilter-final.png`、`layerfilter-window.png`。

已知边界：颜色标记只用于面板整理，不参与 SVG/PDF/PNG 导出，也不改变画布外观；搜索只匹配名称和类型词，不搜节点内文字内容；过滤时命中子层的组会临时强制展开，不能在此期间手动收起；标记还没有命名、全局色或导入导出。

发布验收：`release\Vexa.exe` 已用第二十八批源码重新构建（7,793,152 B，SHA256 `48DFD55B7D10D1762B038C93CD2C1793A32B2DAC379E98C22FE538B4B587B82F`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,352,669 B（SHA256 `84D7AF7B7C1C761B09DE5A82E50FFAC56CE72D8982FFEAA9AB0AD8E35975B403`）。

## 1.24 第二十九批已对齐（画板预设 / 适配内容 / 复制与换序）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 画板尺寸预设 | Artboard presets | `src/core/artboards.ts` 的 `BOARD_PRESETS` 六档：方图 1080、横屏 1920×1080、竖屏 1080×1920、A4 竖 794×1123、A4 横 1123×794、图标 1024；启动页与编辑器属性坞共用同一份常量，属性坞显示 6 个 chip，命中当前 W/H 时高亮 | 真实窗口点“A4 竖版”，画板行与 W/H 同步为 `794×1123`，chip 变为选中；截图 `boards-preset-a4.png` |
| 适配内容 | Fit artboard to artwork | `nodeBounds` 递归组并跳过剪裁轮廓，只取与当前画板相交的根层对象求并集；`fitBoardToContent` 把画板 x/y/w/h 贴到该包围盒（最小 1px）；无内容时返回 false 并 toast | 真实窗口点“适配内容”，画板从 `794×1123` 回到内容包围盒 `900×600`，toast“画板已适配内容” |
| 复制画板 | Duplicate artboard | `duplicateArtboard` 把新板插到当前板之后、右侧 48px；默认连内容：只克隆与源板相交的根层，子树 id 重新分配，组 `children` 与 `clip` 引用同步重映射，整体按新板偏移平移；空白板也可复制 | 真实窗口点“复制画板”，画板数 1→2，当前板变为“图层拖拽验收 副本”，toast“已复制画板，含 4 个顶层对象”；截图 `boards-copy.png` |
| 画板换序 | Reorder artboards | `moveArtboard` 互换 `doc.artboards` 相邻项，越界/自身返回 false；属性坞标题栏提供 ↑/↓，换序后当前板跟随、边界按钮禁用态更新 | 真实窗口上移后副本到第一位，下移恢复原顺序；toast“画板已上移 / 下移” |
| 布局与回归 | Panel layout / regression | 预设 chips 两行、`适配内容 / 复制画板` 两个按钮、5 个标题栏小按钮都在 303px 面板内；名称/W/H/底色与原有画板工具未改 | `.ed-dock / .dock-body / .board-list / .board-presets / .board-tools` 的 `scrollWidth == clientWidth`；截图 `boards-presets.png`、`boards-window.png` |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（145 modules；`index-NKdXWcrY.js` 479.32 kB / gzip 152.21，`index-DjYS-YFN.css` 53.10 kB / gzip 10.13，`pdf-Dtxo_CmN.js` 407.16 kB / gzip 169.22）；`npx tsx scripts/smoke.artboards.mts` **19 项 PASS**（预设尺寸、组包围盒与剪裁排除、适配、连内容复制、组/剪裁 id 重映射、原文坐标不变、换序、空板复制），`scripts/smoke.selection.mts` 16 项、`scripts/smoke.layers.mts` 24 项、`scripts/smoke.layerfilter.mts` 27 项复跑无回归。真实 Tauri/WebView2 窗口（1280×1000 逻辑，DPR 1.5）完成预设、适配、复制与上下移；截图 `docs/shots/boards-presets.png`、`boards-preset-a4.png`、`boards-copy.png`、`boards-final.png`、`boards-window.png`。

已知边界：画板预设是内置六档，不支持自定义预设保存/导入；适配内容包含隐藏图层，也不把描边宽度计入包围盒；复制画板只克隆与源板相交的根层，跨板对象只保留在源板；换序只改画板列表与导出顺序，不改画板在画布上的坐标。

发布验收：`release\Vexa.exe` 已用第二十九批源码重新构建（7,794,176 B，SHA256 `30100533102295D2432D1001B41FE74B09FD220BA3A86CEF73FC9527798040DC`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,353,312 B（SHA256 `2D47242510B5E94EE8322C2A32BF2B00EF44CA73EE3573CBDC0AC9B3BA044EB5`）。

## 1.25 第三十批已对齐（路径查找器 9 种）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 分割 | Divide | `bool.ts` 的 `pathfinderPieces`：最多 8 个形状时枚举所有成员组合，算出互不重叠的面（A 单独 / B 单独 / A∩B），每面保留覆盖它的最上层填充与透明度；超过 8 个形状退化为自顶向下逐层切面；结果清空描边避免内部接缝 | 真实窗口选红块 + 蓝块点“分割”，2 个对象变 3 个面，对象数 6→7，toast“已生成 3 个路径（分割）”；截图 `pathfinder-divide.png` |
| 修边 | Trim | 从下往上逐层减去上方所有路径：最上层保持完整，下层只留露出部分，重叠区归最上层；保留各自填充，清空描边，视觉与原来一致 | 红块 + 蓝块修边后红块变 L 形、蓝块完整，对象数保持 6，toast“已生成 2 个路径（修边）”；截图 `pathfinder-trim.png` |
| 合并 | Merge | 按 `opacity + fill + stroke` 分组，同组路径做联合，输出一个路径；不同外观各自保留；描边随组保留 | 红块 + 红块 2 合并为 1 个路径，对象数 6→5，toast“已生成 1 个路径（合并）”；截图 `pathfinder-merge.png` |
| 裁剪 | Crop | 按文档叠放顺序取最上层路径作裁剪框，下层每个形状与它求交，输出各自填充的片段；裁剪框自身删除；结果清空描边 | 红块 + 蓝块裁剪后只剩红块在蓝块范围内的 `100×140` 片段，对象数 6→5，toast“已生成 1 个路径（裁剪）”；截图 `pathfinder-crop.png` |
| 轮廓 | Outline | 保留原几何，去掉填充，统一 1px `#17171c` 实线描边；只做边界线，不把描边宽度转成外扩轮廓 | 单选红块点“轮廓”，红块变 1px 边界线，对象数保持 6，toast“已生成 1 个路径（轮廓）”；截图 `pathfinder-outline.png` |
| 叠放顺序 | Stacking order | 新增 `sortPathNodesByZ`，按 `doc.root` 与组内 children 的深度优先顺序排序；路径查找器与“减去顶层/裁剪”不再依赖点击顺序 | 冒烟 `sortPathNodesByZ(doc,[b,a])` 返回 `["a","b"]`；减去顶层与裁剪都以真实的蓝块在上 |
| 入口与布局 | Pathfinder panel | 属性坞路径查找器从 4 个扩到 9 个：前 4 个 2 列、后 5 个 3 列；对象菜单同步新增分割/修边/合并/裁剪/轮廓；合并与轮廓只需 1 个路径，其余至少 2 个 | 真实窗口 257px 面板内 9 个按钮无横向溢出；截图 `pathfinder-panel.png`、`pathfinder-window.png` |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（145 modules；`index-BeGzVO9t.js` 484.02 kB / gzip 153.73，`index-BMY57vWz.css` 53.14 kB / gzip 10.14，`pdf-BC40eu39.js` 407.16 kB / gzip 169.22）；`npx tsx scripts/smoke.pathfinder.mts` **22 项 PASS**（叠放顺序、分割 3 面与总面积、修边 2 面、同/异填充合并、裁剪面积与下层填充、轮廓无填充、1px 描边、无重叠裁剪为空），`scripts/smoke.vector.mts`、`scripts/smoke.artboards.mts` 19 项、`scripts/smoke.selection.mts` 16 项、`scripts/smoke.layers.mts` 24 项、`scripts/smoke.layerfilter.mts` 27 项复跑通过。真实 Tauri/WebView2 窗口用 `scripts/fixtures/pathfinder.vex` 完成 5 个新操作，每次撤销后对象数回到 6；截图 `docs/shots/pathfinder-panel.png`、`pathfinder-divide.png`、`pathfinder-trim.png`、`pathfinder-merge.png`、`pathfinder-crop.png`、`pathfinder-outline.png`、`pathfinder-final.png`、`pathfinder-window.png`。

已知边界：分割最多枚举 8 个形状的全部组合，超过 8 个改为逐层切面，可能不会再单独拆出“只有某两层重叠”的面；分割、修边、裁剪会清空结果描边，只保留填充与透明度；合并按外观分组，不处理不同填充之间的遮挡顺序；轮廓只留 1px 边界线，不会把原描边宽度外扩成轮廓；布尔与路径查找器仍是拍平折线级，不是曲线保真。

发布验收：`release\Vexa.exe` 已用第三十批源码重新构建（7,795,712 B，SHA256 `94135DA721BCC7D2A36072B871F59978E49DCA849F54B975B20CEE021D7C25FA`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,354,744 B（SHA256 `48EF2CE55C65451DA56CA17094FD590833F2AB8124F3BF3AB54DF8A86E70B7A1`）。

## 1.26 第三十一批已对齐（文档设置）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 文档名称 | Document title | `src/core/documentSettings.ts` 的 `readDocSettings` / `applyDocSettings`；空名称回退“未命名”，应用后写入 `doc.name`，同时进入撤销栈 | 真实窗口把名称改为“文档设置验收”，关闭再打开仍保留；撤销后回到“路径查找器验收” |
| 当前画板名称 | Artboard name | 弹窗只编辑当前画板；空名称回退“画板 N”；写入 `board.name`，与属性坞名称字段同源 | 当前画板名改为“主画板”，右侧画板行、W/H 面板与文档设置再次打开均同步显示“主画板” |
| 画板尺寸 | Artboard size | 宽/高整数输入，限制 1–20000 px；显示当前画板序号与全文档对象/根层统计；只改边界，不移动现有对象 | 从 `900×600` 改为 `1000×700`，对象数保持 6；右侧画板行同步 `1000×700`；撤销恢复 `900×600` |
| 画板背景 | Artboard background | 原生取色器 + 6 位十六进制输入；非法色回退 `#ffffff`；写入 `board.bg`，画布与属性坞色块即时更新 | `#f7f3e9` 改为 `#eef4ff`；属性坞色块与画板露出区域变浅蓝，撤销恢复原色 |
| 校验与恢复 | Validation | 使用 `noValidate` 接管原生校验；尺寸为空/非数字/小于 1/超过 20000、背景非 6 位十六进制时在弹窗内显示错误，弹窗不关闭、不写入文档 | 宽输入 `0` 点“应用更改”，错误“画板尺寸不能小于 1 px”，弹窗保持打开；改回 `1000` 后可正常应用 |
| 入口与键盘 | Document setup | 文件菜单新增“文档设置…”，快捷键 `Ctrl+Alt+,`；弹窗打开聚焦文档名称，`Esc` 与遮罩点击关闭；关闭后焦点回到“文件”菜单按钮 | 真实窗口从“文件 → 文档设置…”进入；`Esc` 关闭后 `activeElement` 为 `.menubtn`；再次用 `Ctrl+Alt+,` 打开成功 |
| 只读信息 | Document info | 显示单位 `px`、颜色模式 `RGB / 8 位`、画板序号、对象数/根层数；单位与颜色模式明确只读，不伪造 CMYK/DPI | 初始显示 `单位 px`、`RGB / 8 位`、`画板 1 / 1`、`对象 6 / 6 根层` |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（148 modules；`index-Bo5YbkGz.js` 490.05 kB / gzip 155.45，`index-DmuFagZe.css` 54.90 kB / gzip 10.41，`pdf-9ZZxLwVd.js` 407.16 kB / gzip 169.22）；`npx tsx scripts/smoke.document.mts` **25 项 PASS**（读取、统计、空名称回退、尺寸取整/上下限、非法背景回退、校验错误、应用后不改节点/根层、非法输入不写入、缺画板报错），`scripts/smoke.artboards.mts` 19 项复跑通过。真实 Tauri/WebView2 窗口用 `scripts/fixtures/pathfinder.vex` 完成打开、非法输入、应用、再次打开与撤销；弹窗宽 559 px，正文与全部输入 `scrollWidth == clientWidth`，无横向溢出；关闭后焦点回到菜单按钮。截图 `docs/shots/doc-settings-panel.png`、`doc-settings-error.png`、`doc-settings-applied.png`、`doc-settings-undo.png`、`doc-settings-window.png`。

已知边界：文档设置只编辑当前画板，不批量改所有画板；单位固定 px、颜色模式固定 RGB，不提供 CMYK/DPI；改画板尺寸不移动、不缩放内容，超出部分仍留在画布；文档名称与已保存文件名分离，标签仍显示文件名。

发布验收：`release\Vexa.exe` 已用第三十一批源码重新构建（7,797,248 B，SHA256 `89031DCCA409116E2816EABE8ABDD9A51F9FCD8BFAD4EE33AA9D474ACCBAEC09`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,356,079 B（SHA256 `DDA9BE03C619D010B1C7D3E973A835B35DF8F00E96E221406BE2E127F2713D86`）。

## 1.27 第三十二批已对齐（自定义画板预设 / 适配描边）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 自定义预设 | Custom artboard presets | `src/core/boardPresets.ts` 负责清洗、1–20000 整数尺寸、按尺寸去重、最多 20 个、空名称回退；`src/stores/boardPresets.ts` 写 `vexa.board-presets.v1`，跨启动保留 | 保存“名片”`90×54`，重启后启动页与编辑器都显示；重复尺寸提示“该尺寸已在预设中” |
| 预设库入口 | Preset library | 启动页“新建”卡片右上“预设库…”；编辑器画板段新增自定义 chip、“预设库…”与“存当前尺寸”；当前 W/H 命中时 chip 高亮 | 启动页从 `.preset-open` 打开；编辑器从 `.board-preset-open` 打开；保存当前画板 `900×600` 后出现第三个 chip，toast“已保存预设「路径查找器验收」” |
| 保存 / 应用 / 删除 | Manage presets | 弹窗可填名称、宽、高保存；每行“应用 / 删除”；应用后启动页直接填入 W/H，编辑器一次 `commit` 改当前画板并 toast | 应用“海报”后启动页 `400×300` 且 chip 选中；编辑器画板从 `900×600` 变 `400×300`；删除“名片”行数 3→2，提示“已删除「名片」” |
| 导入 / 导出 | Import / export JSON | 导入走隐藏 `<input type=file>` 读本地 JSON，`parsePresetsJSON` 支持 Vexa 格式或数组，只补新尺寸并受 20 个上限；导出 `{format:"vexa-board-presets",version:1,presets:[...]}`，走原生保存对话框 | 导入 `scripts/fixtures/presets-import.json`，已有“名片”去重后提示“已导入 1 个预设”，列表 1→2；“海报”行显示 `400 × 300 px`；删除后再次导入补回“名片” |
| 适配内容 | Fit artwork | `nodeBounds` 对路径按描边宽度外扩，非均匀宽度取最大 `left/right` 倍率；`boardContentBounds(..., false)` 跳过隐藏根层与隐藏组内子层；`fitBoardToContent` 用该包围盒写画板边界 | 真实窗口应用“海报”后点“适配内容”，画板回到内容包围盒 `900×600`，toast“画板已适配内容”；核心用 20px 描边矩形验证 `90,90,220,120`，隐藏外框不参与 |
| 布局与焦点 | Dialog / panel | 弹窗宽 659 px，正文与表单同宽；行 `613 px`、名称输入 `323 px`、宽高输入 `65 px` 均无横向溢出；打开后聚焦名称，`Esc` 与关闭按钮关闭，焦点回到触发链接 | 真实窗口 `scrollWidth == clientWidth`；应用后焦点 `btn-link preset-open`；`Esc` 关闭后焦点 `btn-link preset-open`，删除/导入后仍可继续操作 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（152 modules；`index-CIlZfatX.js` 500.91 kB / gzip 158.73，`index-C_9PXXkx.css` 58.79 kB / gzip 11.03，`pdf-BVRaIfH3.js` 407.16 kB / gzip 169.22）；`npx tsx scripts/smoke.boardpresets.mts` **25 项 PASS**（清洗、尺寸取整/上下限、去重、上限、增删、合并、导出 schema、解析错误、数组导入、roundtrip）；`scripts/smoke.artboards.mts` 25 项 PASS（新增描边外扩、非均匀宽度、隐藏根层/组内隐藏），`scripts/smoke.document.mts` 25 项复跑通过。真实 Tauri/WebView2 窗口分别验收启动页与编辑器：启动页 `1920×1500` 下弹窗 659 px、表单 615 px；编辑器 3 行预设、应用、存当前、适配全部通过；启动页另验删除、Esc 焦点恢复与再次导入。截图 `docs/shots/presets-start-error.png`、`presets-start-dialog.png`、`presets-start-applied.png`、`presets-editor-dialog.png`、`presets-editor-panel.png`、`presets-start-window.png`、`presets-editor-window.png`。

已知边界：自定义预设只存尺寸与名称，不存画板底色/坐标/内容；同尺寸不能重复保存，但仍允许与内置六档同尺寸；导入只补充，不覆盖或删除现有预设；导出 JSON 已接原生保存对话框，核心 schema/roundtrip 已验证，本批未自动点选原生保存框；适配内容对尖角斜接只按半宽外扩，不计算极尖角的理论外伸。

发布验收：`release\Vexa.exe` 已用第三十二批源码重新构建（7,800,832 B，SHA256 `D504595C6C2B801DE90B507CC1E6A73A0292762909007992A1A09EEFBB513E68`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,360,263 B（SHA256 `415176DFBBF6B0E9DDCDC607E9E87574B2DDF803EA60B5EF631846723CABF52D`）。

## 1.28 第三十三批已对齐（直接选择多锚点 / 方向键微移）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 多锚点选择 | Direct selection multi-anchor | `AnchorRef {nodeId,si,ai}` 记录在 `CanvasView`；`hitAnchor` 命中锚点后普通点击只选当前锚点，`Shift` 点击切换加入/移除；切换到选择工具、对象选择变化或节点失效时自动清理引用 | 直接选择下先点右端锚点得“锚点 1”，`Shift` 点底端得“锚点 2”；再 `Shift` 点已选锚点回到 1，再点回来恢复 2 |
| 多锚点拖动 | Drag selected anchors | `Drag.anchor` 改为 `refs: AnchorRef[]`；拖动任一已选锚点时 `nudgeAnchors(doc, refs, dx, dy)` 同步平移所有选中锚点及其入/出手柄；拖单手柄仍只走 `dragHandle` | 选中右端与底端锚点后从右端拖 40 屏幕 px，W `655→720`，X 保持 `189`，两个锚点一起移动 |
| 方向键微移 | Arrow-key nudge | 锚点选中时在 `window` 捕获阶段拦截方向键并 `stopImmediatePropagation`，只推锚点，不再触发对象级 `nudge`；`Shift` 步长 10 px，普通 1 px，每次按键记一步撤销 | 两次 `→` 后 W `655→657`、X/Y/H `189/368/409` 全不变；两次 `Ctrl+Z` 逐步回到 `655` |
| 选中态与提示 | Anchor highlight | 选中锚点画成 9 px 白底 + 2 px accent 边框，未选保持 6 px 黑边；选项栏提示在选中时变为“锚点 N · Shift 多选 · 方向键微移” | 真实窗口“锚点 2”清晰可读；1920 与 1200 宽下 `.ed-optbar`、`.opt-selection` 均 `scrollWidth == clientWidth` |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（152 modules；`index-x6ScLkuV.js` 503.12 kB / gzip 159.40，`index-C_9PXXkx.css` 58.79 kB / gzip 11.03，`pdf-BWXqOk0E.js` 407.16 kB / gzip 169.22）；`scripts/smoke.anchors.mts` **20 项 PASS**（手柄同步、重复引用去重、无效引用、跨节点、直线锚点、非路径跳过、零位移）；`smoke.artboards` 25 项、`smoke.document` 25 项、`smoke.vector`、`smoke.selection` 16 项、`smoke.pathfinder` 22 项复跑通过。真实 Tauri/WebView2 窗口用钢笔现场画三角形，选中路径后点右端/底端锚点，完成多选、方向键微移、两次撤销、40 px 多锚点拖动、拖动撤销、`Shift` 取消/恢复、切工具清空与切回重选；1200×900 视口无横向溢出。截图 `docs/shots/anchors-multi.png`、`anchors-nudged.png`、`anchors-drag.png`、`anchors-narrow.png`、`anchors-window.png`。

已知边界：锚点多选只覆盖同一路径或跨路径的已选对象，尚未做框选锚点；删除键仍删整个选中对象，未做删锚点；方向键按次数分步入撤销栈，长按会形成多步撤销；仍未做开放子路径连接与锚点水平/垂直/分布对齐。

发布验收：`release\Vexa.exe` 已用第三十三批源码重新构建（7,799,808 B，SHA256 `AAE7FBDAAE6DC9C128659DCA5BC794DD1967C94649B2349B6ADDB1561394DB96`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,358,465 B（SHA256 `26A41DD7768D3CDDB0353F16EA7415A38895FC025B80050BDD9753907991541D`）。

## 1.29 第三十四批已对齐（锚点连接 / 六向对齐）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 锚点对齐 | Align selected anchors | `core/anchorOps.ts`：按选中锚点包围盒做左 / 水平居中 / 右 / 顶 / 垂直居中 / 底六向对齐；锚点移动时入/出手柄一起平移；`anchorsNeedAlign` 预检，全部已对齐时只提示、不写空撤销 | 真实窗口选中首尾锚点后菜单“锚点左对齐”，尾锚点 X `368.6→188.6`、中点锚点与 Y 不动，toast“已对齐 1 个锚点”；再点一次只提示“已经对齐”，撤销栈长度保持 2 |
| 同路径端点连接 | Join open subpaths | 同一开放子路径的首尾端点直接闭合；不同子路径按选中端点方向反转后拼接，接缝两侧多余手柄清空；两端点距离 <0.001 时合并为一个锚点并保留外侧手柄；跨路径节点明确拒绝 | 三角开放路径选中首尾后菜单“连接锚点”，子路径 `closed=false→true`、锚点数仍 3、锚点选择清空，toast“已连接 2 个锚点”；撤销恢复开放，`Ctrl+J` 可再连 |
| 菜单与键盘 | Object menu / shortcut | 对象菜单新增“连接锚点”`Ctrl+J` 与 6 个“锚点*对齐”；连接只在恰好两个同路径开放端点时启用，对齐在锚点 ≥2 时启用；菜单浮层 `max-height: calc(100vh - 56px)` 可滚动 | 1 个锚点时连接与 6 项对齐均禁用；中点+端点两个锚点时对齐启用、连接仍禁用；首尾端点时连接启用；1200×900 下菜单 217/217、top 41 / bottom 885，不越视口 |
| 选择清理 | Clear after join | `CanvasView` 的 `onAnchorSelection` 改为回传完整 `AnchorRef[]`，新增 `anchorReset`；连接成功后外层清空锚点选择并触发画布重置 | 菜单连接与 `Ctrl+J` 连接后提示均回到“拖动锚点 · Shift 多选 · 方向键微移”，不再显示“锚点 N” |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（153 modules；`index-N3WvSOuM.js` 506.73 kB / gzip 160.62，`index-B25ahhqp.css` 58.86 kB / gzip 11.05，`pdf-C-f7b5j_.js` 407.16 kB / gzip 169.22）；`scripts/smoke.anchorops.mts` **50 项 PASS**（六向对齐、手柄同步、重复/无效引用、已对齐不写历史、同子路径闭合、双子路径顺序/反向/重合端点、闭合/跨节点/非端点拒绝），`smoke.anchors` 21 项及其余 14 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1920×1500 窗口用钢笔现场画 3 锚点开放路径：锚点坐标初始 `[188.6,302.2] [875.9,514.9] [368.6,825.9]`；菜单禁用/启用、左对齐、重复对齐、工具栏撤销、菜单连接、撤销连接、`Ctrl+J` 连接全部通过；`.ed-optbar` 874/874、`.opt-selection` 297/297；1200×900 下 874/874 与 297/297。截图 `docs/shots/anchorjoin-menu-disabled.png`、`anchorjoin-menu-enabled.png`、`anchorjoin-align.png`、`anchorjoin-joined.png`、`anchorjoin-narrow.png`、`anchorjoin-window.png`。

已知边界：连接只支持同一路径节点内的开放子路径；跨路径节点连接、锚点等距分布、框选锚点仍未做；连接后不自动选中合并出的新端点；闭合路径不能再“连接”。

发布验收：`release\Vexa.exe` 已用第三十四批源码重新构建（7,800,320 B，SHA256 `10EF286D9FB0AEB0ADC783ED4B2CE2DFB5BEFF9F7DE61D689B8BC9576F392F2A`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,359,840 B（SHA256 `5CA7DADD20DC847F95ED56B88475D3EE62EB2A27BF20A2C70520B16DD85A6BE7`）。

## 1.30 第三十五批已对齐（锚点分布 / 跨路径连接）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 锚点等距分布 | Distribute selected anchors | `core/anchorOps.ts`：`distributeAnchors` 取有效且去重的锚点，按 X 或 Y 排序，两端固定，中间第 i 个放到 `start + (end-start)/(n-1)*i`；锚点与入/出手柄一起平移；少于 3 个锚点返回 0，同坐标跨度不移动 | 真实窗口 4 锚点路径选 0/1/3 三个锚点，中间锚点 X `352.21→524.03`（首尾 `139.46/908.60` 的中点），Y 保持 `351.30`；未选第 3 个锚点 X 仍 `614.04`；toast“已分布 1 个锚点” |
| 无空撤销预检 | No-op guard | `anchorsNeedDistribute` 先判断是否真的需要移动；已等距时只提示“选中的锚点已经分布”，不写历史 | 连续执行两次分布，第二次只提示“已经分布”；工具栏一次撤销把中间锚点 X 还原为 `352.21`，说明未写空历史 |
| 跨路径节点连接 | Join across nodes | `canJoinAnchors` 不再要求同一节点，只要两边都是路径、两个开放端点、不是剪切蒙版路径；`joinAnchors` 保留第一个节点及其样式，把第二个子路径并入第一个节点，按端点方向反转后拼接 | 路径 A 4 锚点 + 路径 B 3 锚点，选中 A 末端点与 B 首端点后菜单“连接锚点”，文档只剩 `n2` 一个路径节点、一条开放子路径、7 个锚点；对象选择 `2→1`，toast“已连接 2 个锚点” |
| 源节点清理 | Remove empty source node | 第二个节点只剩这一条子路径时删除节点，并沿 `ancestorChain` 清理变空的祖先组；还有其它子路径时只删该子路径；剪切蒙版路径拒绝连接 | 冒烟覆盖：源节点删除、根层只剩首个路径、源节点保留另一条子路径、空组删除、剪切蒙版拒绝、跨节点重合端点合并保留外侧手柄 |
| 菜单与文案 | Object menu | 对象菜单在 6 项对齐后新增“锚点水平分布 / 锚点垂直分布”，锚点 ≥3 时启用；连接预检失败文案改为“请选中两个开放端点”；菜单浮层继续用 `max-height: calc(100vh - 56px)` 滚动 | 3 个锚点时两项分布启用、连接禁用；跨节点两个端点时连接启用；1200×900 下菜单 `217/217`、top 41 / bottom 885 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（153 modules；`index-CNhCqaTu.js` 508.36 kB / gzip 161.04，`index-B25ahhqp.css` 58.86 kB / gzip 11.05，`pdf-CLw7Ps1v.js` 407.16 kB / gzip 169.22）；`scripts/smoke.anchorops.mts` **81 项 PASS**（新增水平/垂直分布、按坐标排序、手柄跟随、少于 3 个、同坐标、跨节点分布，以及跨节点连接/反向/源节点保留/空祖先组清理/剪切蒙版拒绝/重合端点），`smoke.anchors` 21 项及其余 14 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1920×1500 窗口用钢笔现场画 4 锚点路径 A 与 3 锚点路径 B：A 初始锚点 `[139.46,269.47] [352.21,351.30] [614.04,809.51] [908.60,498.58]`，分布后中间锚点到 `524.03`；跨节点连接后锚点序列 `[139.46,269.47] [352.21,351.30] [614.04,809.51] [908.60,498.58] [957.70,596.77] [1055.89,711.32] [933.15,825.87]`；撤销恢复两节点、重做恢复合并；`.ed-optbar` 874/874、`.opt-selection` 297/297。截图 `docs/shots/anchor-dist-menu.png`、`anchor-dist-result.png`、`anchor-cross-menu.png`、`anchor-cross-joined.png`、`anchor-dist-narrow.png`、`anchor-dist-window.png`。

已知边界：分布只做等距，不做按固定间距或按对象边界分布；跨路径连接只合并选中的端点所在子路径，不整节点合并；连接后不自动选中新端点；仍缺锚点框选与 `Delete` 删单个锚点；剪切蒙版路径、闭合路径、非端点不能连接。

发布验收：`release\Vexa.exe` 已用第三十五批源码重新构建（7,802,368 B，SHA256 `6F1DB87E005292A511429B145F73E23ACA85AB17098F769C54905D46DEBC3568`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,361,561 B（SHA256 `6C16CF488E167E0B13650B362F39B05EA64276266F089AC22E696B708795E5A4`）。

## 1.31 第三十六批已对齐（倾斜 / 斜切）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 数值斜切 | Shear / skew transform | `core/vectorOps.ts`：`skewNodes` 以选区中心为固定点，按剪切矩阵 `[[1,tan(ax)],[tan(ay),1]]` 变换路径锚点与入/出手柄；`skewNodesAround` 接受角度，`shearNodesAround` 接受切线增量；组递归，文字/位图保持不动 | 矩形 X 45° 后四角 `[[139.464,271.654],[466.758,271.654],[712.229,517.124],[384.935,517.124]]`，Y 不变、包围盒宽 `327→573`；Y 30° 时 X 不变、高增加；撤销均精确还原 |
| Ctrl 拖边柄 | Interactive skew | 选择工具按住 `Ctrl` 拖上/下边柄做 X 斜切，拖左/右边柄做 Y 斜切；按边中点半宽/半高换算目标角，`Shift` 吸附 15°，拖拽中按切线增量累计，固定起始选区中心，多次移动不漂移 | 真实窗口 Ctrl 拖东侧边柄下移 80 px，锚点 X 全不变，Y `[271.654,271.654,517.124,517.124]→[140.736,402.572,648.042,386.207]`，`dragTan=0.8000022`；撤销恢复 |
| 角度边界 | Clamp | `MAX_SKEW_ANGLE=80`，`clampSkewAngle` 对 ±80 截断、NaN 归零；0° 或全 0 不写坐标 | 冒烟 ±80 截断、NaN→0、0° 不变、缺失节点不崩溃 |
| 属性坞 | Properties panel | 尺寸下方新增“斜切 / Ctrl 拖边柄”、`斜切 X°`、`斜切 Y°` 与“应用斜切”；输入支持 Enter，空输入只提示“请输入斜切角度”且不写历史；选中不含路径时按钮禁用 | 1920×1500 属性坞宽 303，两输入各 127 px、按钮 257 px，均不越右边界；纯文字选中 `skewDisabled=true`，重选矩形恢复；1200×900 同样不溢出 |
| 工具提示 | Hint | 选择工具提示改为“拖动框选；拖角缩放，Ctrl 拖边柄斜切”，1920 与 1200 宽下完整显示 | 真实窗口顶部选项栏与属性坞标题同时可见，无截断 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（153 modules；`index-D1dLWNqp.js` 511.05 kB / gzip 161.85，`index-PBkgBnnF.css` 58.89 kB / gzip 11.06，`pdf-CeiQU5zw.js` 407.16 kB / gzip 169.22）；`scripts/smoke.skew.mts` **16 项 PASS**（X/Y 45° 四角、包围盒、手柄随动、组内路径、指定中心、切线增量叠加到 60°、±80 截断、NaN、缺失节点、0°），其余 15 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1920×1500 窗口画矩形：初始锚点 `[[262.2,271.654],[589.493,271.654],[589.493,517.124],[262.2,517.124]]`、包围盒 `327.293×245.47`；X 45°、Y 30°、空输入、Ctrl 拖边柄与撤销全部通过；1200×900 属性坞 `cw=sw=303`。截图 `docs/shots/skew-panel.png`、`skew-numeric.png`、`skew-drag.png`、`skew-narrow.png`、`skew-window.png`。

已知边界：斜切只变换路径锚点与手柄，纯文字/位图没有剪切字段，选中纯文字时按钮禁用，组内混排文字会被跳过；角度限制 ±80°；斜切与旋转/缩放共用选区包围盒，但尚未提供“斜切后重置包围盒”或独立变换矩阵；不写 SVG `skewX/skewY` 矩阵，导出按变换后的路径坐标。

发布验收：`release\Vexa.exe` 已用第三十六批源码重新构建（7,802,880 B，SHA256 `3F8E851DE9E0C4B1EFA9E0BE8BAC9857718AD054960AD6F2A96F827F764D6500`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,362,265 B（SHA256 `EB13ABE211E518F67CEA4805012C53AC54099ED1AF187BF6D04C9FB222E093E0`）。

## 1.32 第三十七批已对齐（锚点框选 / 单锚点删除）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 直接选择框选锚点 | Marquee anchors | 直接选择工具在已选路径上从空白拖框，`anchorsInBox` 收集框内锚点（边界包含、跨子路径、组递归，跳过隐藏/锁定路径）；`Shift` 与已有选择累加，空框清空 | 真实窗口 409×278 矩形切直接选择，从左上空白拖到顶边下方，状态“锚点 2”；再 `Shift` 从底部空白拖回，累加到“锚点 4” |
| Delete 删单个锚点 | Delete anchor | `deleteAnchors` 按节点/子路径批量去重删除；剩余 <2 个锚点的子路径整条移除；节点无子路径时删节点并沿祖先链清空组；剪切蒙版路径跳过；手柄与闭合标记保持 | 删顶部 2 个锚点后路径节点仍在、剩 2 个闭合锚点，toast“已删除 2 个锚点”；删光 4 个后路径节点与根层条目消失；两次撤销分别恢复 4 锚点与整条路径 |
| 选择与提示 | Direct selection UI | 删除后锚点选择立即清空并重置画布；编辑菜单项变“删除 N 个锚点”；直接选择提示在原位显示“拖框选锚点 · Shift 多选 · Delete 删点”，选中后显示“锚点 N · Shift 多选 · Delete 删点” | 删除后选项栏回到无锚点提示；1200×900 下提示宽 151/151、选项栏 808/808，不截断 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（153 modules；`index-Cbq_5_0D.js` 513.18 kB / gzip 162.52，`index-PBkgBnnF.css` 58.89 kB / gzip 11.06，`pdf-D9kOF5nP.js` 407.16 kB / gzip 169.22）；`scripts/smoke.anchordelete.mts` **46 项 PASS**（框选边界/跨子路径/组递归/隐藏锁定、删 1/2/3 个、开放端点、重复/非法引用、双子路径、空祖先组、剪切蒙版拒绝、手柄保持），其余 16 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1920×1500 窗口画矩形（`[[262.2,271.654],[671.317,271.654],[671.317,549.854],[262.2,549.854]]`）：框选上二、Delete 剩二、撤销、Shift 框选到四、全删、撤销全部通过；1200×900 选项栏 808/808、提示 151/151。截图 `docs/shots/marquee-drag.png`、`marquee-anchors.png`、`marquee-deleted.png`、`marquee-undo.png`、`marquee-shift.png`、`marquee-narrow.png`、`marquee-window.png`。

已知边界：框选只从当前已选中的路径/组里收集，不能一次框选未选中的路径；框选只按锚点坐标命中，不做“部分遮挡”或方向键扩展；删到只剩 2 个锚点的闭合路径会保留成一条线，不做自动去退化；剪切蒙版路径不允许删锚点；删除是单步撤销，不按子路径拆分。

发布验收：`release\Vexa.exe` 已用第三十七批源码重新构建（7,803,904 B，SHA256 `8C2DCAE1646511E81DD9E4A0EE9A94C5854CEB48D3B99A47FC6A3FA8CB845337`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,363,364 B（SHA256 `0494227230E8BF2B809F1E3FE73AC9203BA8094ADD122719701FD4245758A164`）。

## 1.33 第三十八批已对齐（文档设置批量应用到全部画板）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 批量尺寸与背景 | Apply document settings to all artboards | `applyDocSettings(doc,index,patch,{allBoards:true})` 把宽/高/背景写入全部画板；文档名全局改，当前画板名只改当前板；画板 x/y、节点坐标与根层保持不动；返回 `boards` 数量 | 两块 1080×1080 画板批量改为 1000×700、`#eef4ff`，两块同时生效；第二板名仍“画板 2”，画板坐标 `[[0,0],[1128,0]]` 不变，矩形锚点 `[[262.2,255.289],[507.67,255.289],[507.67,402.572],[262.2,402.572]]` 前后一致 |
| 单板语义 | Current board only | 不勾选时只改当前画板尺寸/背景；当前板名、文档名照常更新，其他画板完全不动 | 不勾选把当前板改 800×1080、`#ffe9d8`，第二板仍 1080×1080、`#ffffff` |
| 弹窗入口 | Document dialog | 文档设置新增复选框 `doc-all-boards`：“把尺寸与背景应用到全部 N 个画板”；仅 1 个画板时禁用；说明文案写明“勾选全部画板时只同步尺寸与背景，画板名称仍只改当前画板” | 单板时 `disabled=true`、文案“全部 1 个画板”；两块时可用、文案“全部 2 个画板” |
| 反馈与撤销 | Toast / undo | 全量应用 toast“文档设置已同步 N 个画板”，单板仍“文档设置已应用”；整次应用只写一步历史 | 两块批量后 toast“文档设置已同步 2 个画板”，撤销一次同时恢复两块尺寸/背景与文档名 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（153 modules；`index-BGB8e-cJ.js` 513.76 kB / gzip 162.79，`index-Bn8OfWPG.css` 59.21 kB / gzip 11.13，`pdf-DALUF9Jk.js` 407.16 kB / gzip 169.22）；`scripts/smoke.document.mts` **36 项 PASS**（新增两块画板批量尺寸/背景/画板名/坐标/节点不变、未勾选只改当前板），其余 16 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1920×1500 窗口新建第二画板后打开文档设置：弹窗 560×564、`cw=sw=559`，批量行 525/525；勾选后两块画板同步为 1000×700、`#eef4ff`，第二板名与内容坐标保持；撤销恢复；1200×900 弹窗仍 560 宽且不横向溢出。截图 `docs/shots/docs-all-dialog.png`、`docs-all-applied.png`、`docs-all-undo.png`、`docs-all-narrow.png`、`docs-all-window.png`。

已知边界：批量只同步尺寸与背景，不批量改画板名、画板位置或缩放内容；每块画板尺寸仍受 1–20000 px 限制；只处理当前文档，不跨文档/跨标签批量；勾选全部画板不会把内容按新尺寸重排，超出部分仍留在画布上。

发布验收：`release\Vexa.exe` 已用第三十八批源码重新构建（7,803,904 B，SHA256 `294979314814C45AF3936AD5C7731BF5116E7D9DDB32ECE42295CD0077F9FD64`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,364,147 B（SHA256 `715A5A86F06B83A768B72B99E52B4F5F76D31D12640A8316AC8BDAA815F118F2`）。

## 1.34 第三十九批已对齐（文档色板 / 全局色 / 专色）

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 文档级色板 | Document swatches | `VexaDoc.swatches` 保存最多 64 个 `{id,name,color,kind}`；`kind` 分印刷色 `process` 与专色 `spot`（专色当前按 sRGB 近似）；随 `.vex` 保存，旧工程缺省为空；读取时清掉非法颜色、重复 id 和悬空引用 | 新建“品牌蓝” `#0f76d6` 与“专色橙” `#ff7a00`，弹窗 2/64；`.vex` 往返保留色板与链接，坏颜色与悬空 id 被清掉 |
| 全局色链接 | Global swatch | `Paint.swatch` / `Stroke.swatch` 记录色板 id；从属性坞文档色板行点选后填充/描边变成该实色并建立链接；手动取色或固定色板会断开链接；改色板颜色时遍历所有链接填充/描边同步换色 | 两块矩形填充都链接“品牌蓝”（2 处），第二块描边链接“专色橙”（1 处）；把品牌蓝改 `#e5484d`，两块填充同步变红且链接保留，专色描边不受影响 |
| 色板增删改 | Swatch management | 文档色板弹窗：新建名称/颜色/类型、逐行改名/改色/改类型（保存后一次入撤销栈）、删除；删除时断开所有引用但保留当前颜色；右侧属性坞填充/描边/画板底色下方新增“文档”色板行与“管理”入口，选中态显示“全局链接 · 名称” | 新建、改色保存、删除品牌蓝均成功；删除后两块填充仍 `#e5484d` 但 `swatch` 为空；一次撤销恢复品牌蓝与两块链接 |
| 导入导出 | Swatch JSON | `vexa-swatches` v1 JSON（格式头 + `swatches`），也接受直接色板数组；导入合并时同名同色跳过，受 64 个上限约束；导出写全部文档色板 | 核心测试：导出格式/版本/数量、往返、数组导入、坏 JSON、错误格式、空文件、重复跳过、上限；真实窗口的导入/导出按钮与原生文件对话框未自动点选 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（156 modules；`index-4u2hxkyl.js` 525.19 kB / gzip 166.08，`index-BB-PkWTH.css` 61.68 kB / gzip 11.53，`pdf-YDRMVsVs.js` 407.16 kB / gzip 169.22）；`scripts/smoke.swatches.mts` **62 项 PASS**，其余 17 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1920×1500 窗口：选中矩形打开“管理文档色板”，空弹窗 519/519；新建两色板后 2/64、行 519/519、新建行 487/487，无横向溢出；点文档色板后填充变蓝并显示“全局链接 · 品牌蓝”；改色板后 2 处填充同步，保存反馈“已更新「品牌蓝」”；删除后填充断开链接、颜色保留，撤销恢复；1200×900 弹窗仍 520 宽、无溢出。该批截图已按清理惯例删除。

已知边界：全局链接只覆盖实色填充与实色描边（文字填充支持，图片/组无填充），渐变、图案与画板底色不链接；专色只做类型标记和 sRGB 显示，没有分色/油墨通道，CMYK 仍未做；导入导出只处理 JSON，未接 ASE/ACO；删除色板保留对象当前颜色而不是回退到默认色。导入/导出的原生文件选择器未在 CDP 中自动化，核心读写与往返已覆盖。

发布验收：`release\Vexa.exe` 已用第三十九批源码重新构建（7,806,976 B，SHA256 `91DD3DAB9C7BA090E6441AB83B568BB32FE249E12C93A9FF53B19DF6E6651480`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,366,090 B（SHA256 `16037E4649B326D200685AE92707B14683F9DD083E8B4CF2DAAC471440C1C89B`）。

## 1.35 第四十批已对齐（圆形工具 / 从中心 / 两次点击）

参考更新：VectorCraft 2026-11-25 快照（`3463266`）新增 Circle 工具 From Center；本批只取这一条先落地，Quick Pen 长度手柄、Path Precision 内切圆、单位回退 points 与 Transform effect 仍留在待补清单。

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 圆形工具 | Circle 工具 | 工具 id `circle`，快捷键 `⇧L`，工具轨“形状”组新增独立圆形图标；默认两点定直径，拖拽实时生成闭合四段贝塞尔圆 | 实机默认水平拖 32px 生成 `97.5×97.5` 圆，名称“圆形”、4 锚点、闭合 |
| 从中心 | From Center | 选项栏“从中心”开关，默认关闭；打开后第一点是圆心、第二点定半径；同样拖动距离得到直径模式的 2 倍半径 | 实机默认圆直径 `97.5`；开“从中心”后同距离圆直径 `195.1`，比值 2.00 |
| 两次点击 | Click-click diameter | 圆形工具下第一次点击只记起点、不落对象；第二次点击按当前“从中心”状态落地；`Esc` 取消未完成起点 | 实机第一次点击对象数不变，第二次点击新增 1 个圆，撤销后回到 3 个 |
| Shift 45° | Shift constraint | 圆心/直径两种模式都把方向吸附到 45° 步进，半径长度保持 | 斜向拖 `(24,16)` 后宽高均为 `175.8` |
| 几何核心 | circle geometry | `src/core/circle.ts`：`constrain45`、`circleFromCenter`、`circleFromDiameter`、`circleFromDrag`、`circleThroughThree`；`docOps.circlePath` 复用椭圆路径 | `scripts/smoke.circle.mts` 19 项 PASS（45°、中心/直径、比值、三点外接圆、共线、闭合路径） |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（157 modules；`index-Dk9Dir8c.js` 527.36 kB / gzip 166.86，`index-BB-PkWTH.css` 61.68 kB / gzip 11.53，`pdf-B0yhJxcO.js` 407.16 kB / gzip 169.22）；`scripts/smoke.circle.mts` 19 项 PASS，其余 18 个冒烟脚本全复跑通过。真实 Tauri/WebView2 1600×1000 窗口：`⇧L` 显示“从中心”开关且默认关闭；默认拖圆 4 锚点、宽高相等；开开关后同距离直径翻倍；Shift 斜拖仍正圆；两次点击第一次不落地、第二次落地，撤销移除；图层面板列出“圆形”3 行；1200×900 实际窗口选项栏无横向溢出。该批截图已按清理惯例删除。

已知边界：只做圆形工具的直径拖拽、从中心拖拽与两次点击直径；未做参考里的三点圆交互（核心 `circleThroughThree` 已备但未接 UI）、按住 Alt 按标尺刻度取整、虚线预览与中心十字/半径线/直径标注；参考新基线里的 Quick Pen 长度手柄、Path Precision 内切圆、points 单位偏好、填充/描边 Transform effect 尚未补。

发布验收：`release\Vexa.exe` 已用第四十批源码重新构建（7,805,952 B，SHA256 `D95BF2F2ECC1661F9BBBC314192858B92AAD26C3530D1ECAF1BD26A00B9C6A15`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,364,842 B（SHA256 `9076806323F40598709B65D687775FCD72AA1CC19F2452D762DF7ACFDD4FE565`）。

## 1.36 第四十一批已对齐（三点圆拖动 / Alt 直径取整）

参考更新：继续按 `3463266` 的 `crates/tools/src/circle.rs`。参考默认 `dragThird:true`：第一点点击后，第二次按下若拖动，第二点是过圆点、释放点是第三点，三点定圆；第二次按下不拖则仍用两点定直径。参考 Alt 把直径按当前缩放下的标尺刻度取整，Shift 只约束第二点方向。

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 三点圆 | Circle drag-third | `circleThroughThree(a,b,c)` 求外接圆；`CanvasView` 第一次点击只存起点，第二次按下记第二点，移动超过 2 CSS px 后实时改为三点外接圆；释放时用最终第三点重算 | 实机点 `(450,320)`，按下 `(550,320)` 拖到 `(520,400)`，得到 `346.0×346.0` 正圆，圆心落在 `(500,346.875)`，与首点-第三点直径圆的 `324.0` 不同 |
| 单击仍是直径 | Click-click diameter | 第二次按下到释放不足 2 CSS px 时按直径落地；直接按住首点拖出仍按直径；首点 3 CSS px 内按下视为点回首点，不落对象，拖出则直径 | 回归脚本两次点击仍 `97.5×97.5`，第一次点击对象数不变 |
| Alt 直径取整 | Alt ruler tick | `rulerStep(zoom)` 按缩放选 1/2/5/10/20/50/100 文档单位；`roundDiameter` 沿首点方向把直径（圆心模式按 2×半径）吸到最近刻度，保持方向 | 33% 视图下水平拖 57 CSS px，原始直径 `173.7` → 取整 `150.0`（步进 50），宽高仍相等 |
| 几何核心 | circle geometry | `circle.ts` 新增 `rulerStep`、`roundDiameter`；`circleFromDrag` 增加 `roundAlt` 与 `zoom` 可选参数，旧调用保持兼容 | `scripts/smoke.circle.mts` 33 项 PASS（三点、共线/重复点、直角三角形、标尺步进、Alt 直径/中心/方向/缩放） |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（157 modules；`index-C13KfgCs.js` 529.29 kB / gzip 167.53，`index-BB-PkWTH.css` 61.68 kB / gzip 11.53，`pdf-D_qrKUB4.js` 407.16 kB / gzip 169.22）；`scripts/smoke.circle.mts` 33 项 PASS，全部 19 个冒烟脚本复跑通过。真实 Tauri/WebView2 1600×1000 窗口：三点拖动落 `346.0×346.0`、宽高相等、圆心正确；Alt 落 `150.0×150.0`；三点共线释放不落对象，已有 3 个圆不变；上一批的默认直径、从中心、Shift、两次点击、撤销与图层列表全部回归通过。该批截图已按清理惯例删除。

已知边界：参考里的虚线预览、中心十字/半径线/直径标注、`dragThird:false` 的“第三次点击定圆”、`standardAnchors` 锚点落在通过点上、`center/radii/diameter/color` 选项尚未做；Quick Pen 长度手柄、Path Precision 内切圆、points 单位偏好、填充/描边 Transform effect 仍在待补清单。

发布验收：`release\Vexa.exe` 已用第四十一批源码重新构建（7,808,000 B，SHA256 `BCBF8C83199BDE6F33447FB92C26ACC7DE70AF4440FAB55533BE8483F3001DB5`），NSIS 安装包 `Vexa_0.1.0_x64-setup.exe` 2,367,110 B（SHA256 `B64291EDA70F014A4AD2F458A98DB48729C4E20281A62DDCB4E0458583817388`）。

## 1.37 第四十二批已对齐（Path Precision Tools · Add Inscribed Circle）

参考更新：按 `3463266` 的 `crates/engine/src/cmd/addons/pathtools/inscribed.rs`（命令 `addon.pathtools.inscribedCircle`，菜单位置 `Object > Plug-ins > Path Precision Tools > Add Inscribed Circle`）。语义是给每个选中的闭合路径或复合路径画最大内切活圆：孔洞和交叉子路径按填充规则参与，圆用当前 paint，放在当前图层顶部并选中，一次撤销；开放路径、没有面积或过于复杂时报告错误且不改文档。

| 能力 | VectorCraft 对应 | Vexa 实现 | 验收 |
|---|---|---|---|
| 内切圆几何 | Add Inscribed Circle | 新 `src/core/inscribed.ts` 的 `inscribedCircleOf(node, precision=0.05, maxCells=4096)`：闭合子路径自适应拍平 → 去重环 → nonzero winding 判内部 → 点到所有边的最小距离 → polylabel 式最大间隙搜索；半径按参考 `1/1.0003` 略缩，保证圆不压边 | 方形圆心 `(50,50)`、半径 `49.985`；直角三角形圆心/半径 `≈29.289`；L 形 `≈17.56`；方环 `≈35.12` 且圆心不在孔内 |
| 命令入口 | Object > Plug-ins > Path Precision Tools | 对象菜单新增“插件 · 路径精准工具”子菜单，内层“添加内切圆”；`MenuBar` 支持二级浮层，点父项展开、`Esc`/点外部关闭 | 实机选中闭合矩形后父项与子项均可用，点内层落 1 个内切圆 |
| 面板入口 | Path Precision Tools panel | 属性坞“路径效果”改为 2×2：偏移路径 / 描边转轮廓 / 平滑 / 内切圆 | 取消选中圆、重选矩形后点面板“内切圆”，半径与菜单入口一致 |
| 落盘与选择 | current paint / top layer / select new | 新圆 `circlePath` 建 4 锚点闭合路径，名称“内切圆”；复制当前填充/描边；`addNode` 追加到根层顶部；完成后选中新圆；整次操作一个 `commit` | 文档对象数 `1→2`；新圆宽高相等、完全在矩形内、圆心与矩形中心重合；一次 `Ctrl+Z` 移除 |
| 错误与跳过 | report error, keep doc | 无路径选中提示“请选中闭合路径或复合路径”；开放路径提示“开放路径没有内部”；面积为空提示“选中路径没有可测量的填充面积”；多选时逐个跳过并在 toast 统计 | 开放路径与极小面积核心返回空；UI 不新增对象 |

验收记录：`npx tsc --noEmit` 通过；`npm run build` 通过（158 modules；`index-CEgLpTWi.js` 533.91 kB / gzip 169.02，`index-DApU8VOk.css` 61.88 kB / gzip 11.56，`pdf-E4e-Vh4B.js` 407.16 kB / gzip 169.22）。`scripts/smoke.inscribed.mts` 17 项 PASS；全部 20 个冒烟脚本复跑通过。真实 Tauri/WebView2 1600×1000 窗口画 `426.71×365.75` 矩形，内切圆 `365.645×365.645`、半径 `182.822`（期望 `365.755/2/1.0003 = 182.822`），圆心 `(34.357,323.083)` 与矩形中心一致，圆完全在矩形内；菜单与面板两个入口都通过，撤销移除。

已知边界：贝塞尔边按 `precision=0.05` 折线近似，曲线边界的内切半径有极小误差；复合路径按 nonzero 填充规则处理，even-odd 文档尚未映射；单次搜索上限 `maxCells=4096`，极复杂路径会走近似网格结果。Quick Pen 长度手柄、points 单位偏好、填充/描边 Transform effect 仍在待补清单。

## 1.38 第四十三批已对齐（画板裁剪 / 视口剔除 / 静态背景缓存）

现象：对象拖到画板外仍画在灰色粘贴板上，和参考软件“画板外内容不出现在成品画布上”的行为不一致；同时大文档每帧重画全部节点、粘贴板点阵和网格，拖动时帧耗时偏高。

| 能力 | Vexa 实现 | 验收 |
|---|---|---|
| 画板外内容裁剪 | `renderScene` 在文档坐标下用全部画板矩形组成 `clip()`，只绘制画板内内容；选择框、锚点、框选、悬停高亮再套同一裁剪，避免对象被裁掉后只剩一圈手柄浮在粘贴板 | 跨越左边界的矩形，板外像素 `236,236,240`（粘贴板灰），板内 `15,118,214`（对象蓝）；关闭裁剪 `hideOutsideBoards:false` 后同点变红 |
| 画板外命中限制 | `src/core/artboards.ts` 新增 `pointInArtboards(doc,p)` 与 `nodeInArtboards(doc,id)`；`CanvasView` 的选择、直接选择、悬停、吸管、渐变命中、右键菜单 6 处 `pickTop` 前先判点是否落在任一画板内；框选结果再按节点包围盒与画板相交过滤，完全在板外的不可见对象不会被框进来；无画板时保持自由画布 | 真实窗口在板外点击 `.opt-sel-count=0`，板内点击 `=1`；框选板外不可见矩形后仍 `=0` |
| 视口剔除 | `drawNode` 接收 `view/size`，组按 `groupBox`、节点按 `nodeBox` 先做屏幕矩形相交判断；组递归时子节点也逐个剔除；包围盒按节点缓存到当前帧；裁剪开启时，节点包围盒与任一画板都不相交就直接跳过，不再先画再裁 | 300 个板外节点开/关剔除，整帧 960000 字节逐像素一致；600 个“视口内但在画板外”节点 × 20 帧 `199.9ms → 10.5ms` |
| 静态背景缓存 | 粘贴板点阵、画板纸面/边框/阴影、网格画进离屏 canvas，key 含尺寸、dpr、zoom、pan、网格、当前板、主题与全部画板 id/坐标/尺寸/底色；对象拖动只改内容，直接 `drawImage` 贴背景 | 背景缓存开/关整帧 960000 字节一致 |
| 性能 | 1500 个视口外节点 × 20 帧：旧全绘制 `407.4ms`，剔除+缓存 `23.3ms`，约 `17.49x`；早期一轮 `258.8ms → 27.4ms`（`9.45x`） | `scripts/smoke.render.mts` 16 项 PASS |

已知边界：画板裁剪默认开启，暂未提供“显示画板外内容”的界面开关；完全在画板外的对象不会被框选或点选，但节点本身仍保留在文档与图层面板里，可通过图层面板选回并按数值移回；艺术板阴影、画板名、画板工具手柄、空板提示仍画在裁剪外，属于画板 chrome；粘贴板点阵与网格仍在缓存里，改主题、换当前板、改画板几何会重建一次背景。

## 1.39 第四十五批已对齐（区域文字 / Area Type）

区域的文字按框宽自动换行，文字超出框高时显示溢出标记；单点文字与区域文字可随时互转，画布、SVG、PDF 与 `.vex` 共用同一套行布局。

| 能力 | Vexa 实现 | 验收 |
|---|---|---|
| 拖出区域文字 | 文字工具按下记起点、拖动显示虚线框、松开落对象；拖动小于 8px 仍按点击创建单点文字 | 真实窗口在画板拖出 220×120 文本框，节点 `textMode=area`，框宽高与拖动范围一致 |
| 自动换行与对齐 | `textLayout` 按框内宽逐字贪心换行，CJK 可逐字断；左/中/右对齐在框内计算基线起点；行距、字距、横纵缩放沿用字符面板 | `scripts/smoke.area-text.mts`：180×80 框、20px 字自动断成 5 行，每行宽度不超过内框 |
| 溢出与框尺寸 | 框高不足时最后一行超出框底，画布右下角画 3px 红色溢出点；属性坞出现“框宽/框高”，画布手柄缩放同步框尺寸 | 框高压到 28px 时 `overflow=true`；属性坞改框高后行数实时变化 |
| 单点 ↔ 区域 | 属性坞“单点 / 区域”切换与“文字 → 转区域文字 / 转单点文字”双向转换，保留可见文字与大致位置 | 转换后 `.vex` 往返保留 `textMode/boxW/boxH`，再转回单点会清掉框字段 |
| 导出与 PDF | SVG 输出 `clipPath` 框裁切 + 每行绝对 `tspan x/y`；PDF 用同一换行结果并按框矩形裁切 | 冒烟 SVG 含 `clipPath` 与绝对定位 `tspan`；PDF 冒烟 `warnings 0`，区域文字不越框 |

已知边界：区域文字目前只做横排、单栏，首行缩进/段距/垂直对齐已在第四十六批补齐；仍不含避头尾与悬挂缩进；换行宽度用字宽近似，极端字偶/连字可能与 Canvas 实际宽度有 1–2px 差；PDF 区域文字仍转轮廓，不可选中/搜索。

## 1.40 第四十六批已对齐（区域文字段落选项）

| 能力 | Vexa 实现 | 验收 |
|---|---|---|
| 首行缩进 | `firstIndent` 单位 px，每个段落第一行按缩进减可用宽并右移起点；后续行恢复整框宽 | 冒烟：180px 框、30px 首行缩进，首行 x=134，第二行回到 x=104 |
| 段间距 | `paraSpace` 单位 px，段落最后一行后追加到下一段第一行基线；不叠加到末段 | 冒烟：20px 字、1.25 行距、20px 段距，两段基线差 = 25 + 20 |
| 框内垂直对齐 | `areaVAlign` 三档顶/中/底；先算文本块高，再在框内偏移首基线；文本高于框时退回顶对齐并显示溢出 | 冒烟：同一两段文本，垂直居中首基线比顶对齐下移；属性坞“顶/中/底”可切换 |
| 面板与导出 | 属性坞区域文字多出“首行 / 段距”数值与“垂直”三键；画布、SVG、PDF 继续共用 `textLayout` | 真实窗口设置首行 24px、段距 12px、垂直居中，节点字段与画面同步；SVG/PDF 冒烟通过 |

已知边界：首行缩进只缩进段落第一行，不支持悬挂缩进/左右缩进；段距不参与首段前与末段后；垂直对齐只对未溢出文本生效；避头尾、制表符与 OpenType 段落特性仍未做。

## 1.41 第四十八批已对齐（路径文字 / Type on a Path）

| 能力 | Vexa 实现 | 验收 |
|---|---|---|
| 路径转文字 | 选中一条路径后“文字 → 转为路径文字”；可同时选中已有文字，把该文字改挂到路径并删除原路径；未选文字时新建 32px 微软雅黑“路径文字”对象，继承路径实色填充、透明度、显隐与锁定 | 真实窗口选中椭圆路径，菜单出现“转为路径文字”；转换后 `texts=1`、`paths=0`，节点 `textMode=path`、`pathSubpaths` 保留一圈锚点 |
| 沿路径排字 | `geom.ts` 按路径折线采样累计弧长，逐字符按 `textEmWidth * size + tracking` 前进，按切线旋转字形；支持 `pathStart`、左/中/右对齐、`baseline` 偏移与左右侧 | 冒烟：320px 水平路径 6 字全部落点，首字 x=100；`pathStart=50` 首字 x=150；左/右侧基线分别落在 y=88 / 112 |
| 画布与属性坞 | 画布逐字符 `translate → rotate → scale → fillText`；属性坞显示只读“路径”类型，提供“起点”px 与“路径侧”上/下，基线继续可调 | 真实窗口把椭圆转成路径文字，34px 文本绕椭圆一周；面板可改起点 10、切换路径侧，窗口无横向溢出 |
| 导出与工程 | SVG 输出每字符 `<text transform="translate() rotate() scale()">`；PDF 用同一套字符落点把字形轮廓按切线旋转写入；`.vex` 保留 `pathSubpaths/pathStart/pathSide`；平移缩放同步路径锚点、起点与基线 | 冒烟 SVG 首字 `translate(100 88) rotate(0)`；PDF `warnings 0`；`.vex` 往返后模式、路径与侧向都在；路径文字转轮廓得到每个字符真实字形 |

## 1.42 第四十九批已对齐（区域文字分栏）

| 能力 | Vexa 实现 | 验收 |
|---|---|---|
| 分栏排版 | `columns` 1–6 栏、`columnGutter` 栏距；每栏按自身宽度重新换行，第一栏到底后余字流入下一栏，跨栏保留段落顺序、首行缩进与段距 | 冒烟：`300×100` 框两栏、栏距 10，首栏 x=104、第二栏 x=255，行宽不超 `141`；跨栏拼回原文不丢字，两栏内排完不误报溢出 |
| 溢出判定 | 栏内放不下先换栏，只有最后一栏仍有余字才置 `overflow` | 冒烟：长文四栏仍有余字时 `overflow=true`；两栏排完为 false |
| 属性坞与工程 | 区域文字新增“分栏 / 栏距”数值；画布、SVG、PDF 共用绝对行坐标，`.vex` 往返保留 `columns/columnGutter` | 真实窗口把 22px 长文排成 `520×370` 两栏，栏距 24、首行 24、段距 12；面板显示分栏 2 / 栏距 24，撤销回单栏、重做恢复两栏，窗口无横向溢出 |

## 2. 部分对齐

| 能力 | 现状 | 差什么 |
|---|---|---|
| 路径布尔 | 多边形级（拍平后运算） | 曲线保真布尔（参考 `pathops/boolean.rs` 80 KB 思路）；形状边界会退化为折线，锚点数偏多 |
| 文字 | 单点文字 + 区域文字（自动换行/框尺寸/溢出标记/双向转换/首行缩进/段距/垂直对齐/1–6 栏分栏）+ 路径文字（沿路径弧长排字/起点/左右侧/切线旋转）+ 字符面板 + 文字转路径 | 避头尾/悬挂缩进、段落文字、竖排
| 可变宽度描边 | 画布与 SVG 轮廓填充、宽度点编辑、余弦过渡 | 虚线不随宽度轮廓走（有宽度点时按实线轮廓输出）；箭头仍按基础线宽绘制；端帽 / 连接类型目前只作用于普通均匀描边，宽度轮廓仍是平头外框；宽度点手柄只画在第一条子路径，复合路径各子路径共用同一 `t` 轮廓 |
| 渐变 | 线性/径向均支持多色标、透明度、中点、画布轴线与色标直拖、`.vex` 往返、MCP `fill.stops` | 网格渐变、自由渐变、渐变描边尚未做；径向渐变的画布手柄只沿一条半径显示，不能改圆心位置/半径 |
| SVG | 导出（组、线性/径向渐变、虚线、箭头、混合模式、剪切蒙版）；导入基础图形、变换、线性/径向渐变、色标透明度、`href` 继承、`fill/stroke-opacity`、`<text>` 可编辑文字、`<use>` 引用、`<clipPath>` 组裁切与 symbol viewBox 缩放 | 导入仍不含 `objectBoundingBox` 剪裁、图案、滤镜、`mask`；clipPath 的 even-odd 孔洞与 `slice` 对齐未细分；文本旋转/斜切只映射位置与缩放、不旋转字形；`gradientTransform`、`spreadMethod` 径向的 `cx/cy/r` 暂按 Vexa 的 bbox 规则近似 |
| PDF 导出 | 多画板分页、原生线性/径向渐变、渐变文字、实色/虚线/端帽/连接、透明位图、文字轮廓 | 文字不可选中/搜索；渐变描边、图案填充、渐变网格未做；组透明度按节点复合 alpha 近似；字体只读本机文件 |
| .vex 文档 | 保存/读取、撤销栈 200 步、多画板、混合模式、剪切蒙版往返 | 单板 PNG 导出代码路径已接当前板，但原生保存全流程尚未实测；文档设置面板已在 1.26 完成 |
| 描摹 | Rust VTracer：预设/颜色数/细节/平滑/杂色，单测 3 项通过 | 分层输出、调色板编辑、实时预览、批量 |
| 面板 | 属性面板（位置/尺寸支持单选与多选、组与文字精确缩放、旋转/翻转；填充/描边/画板底色带 12 色板与最近 10 色；文档色板行显示全局色/专色与“全局链接 · 名称”）+ 可展开组图层树、组内排序与跨组搬移、Ctrl/Shift 多选与批量显隐/锁定 | 样式面板、符号、CMYK 仍缺；渐变每个色标仍用原生取色器 |

## 3. 未实现（按批次规划）

**P2 · 路径与几何**
- 圆形工具已在第四十/四十一批完成直径拖拽、从中心开关、两次点击、Shift 45°、三点拖动与 Alt 直径取整；仍缺参考的虚线预览、中心十字/半径线/直径标注、`dragThird:false` 的三次点击定圆与 `standardAnchors` 选项
- Quick Pen 长度手柄（新版 `crates/tools/src/quickpen/length.rs`）未做：Vexa 的钢笔还没有起点/终点外侧的拉长/缩短手柄
- Path Precision 内切圆插件（新版 `crates/pathops/src/addons/pathtools/inscribed.rs`）未做：还没有“给每个闭合路径画最大内切活圆”的插件入口
- 曲线保真的偏移与描边轮廓（当前为拍平折线，尖角按斜接近似，端帽只做平头）
- 路径查找器的分割、修边、合并、裁剪、轮廓已在第三十批完成；还缺曲线级保真的分割/布尔与超过 8 个形状的完整组合拆分
- 曲线级布尔（替换 polygon-clipping 的退化问题）
- 自由变换框已支持缩放与旋转，数值面板已补 X/Y/W/H 与多选精确缩放、倾斜/斜切（第三十六批：数值 X/Y 与 Ctrl 拖边柄，±80°），还缺文字/位图的真实斜切参与与独立变换矩阵
- 网格与参考线对象化

**P3 · 文档与绘制**
- 画板预设/适配内容/复制画板/上下换序已在第二十九批完成（编辑器复用启动页六档预设）；自定义预设保存/导入/删除、适配计入描边宽度并排除隐藏层已在第三十二批完成；单画板 PNG 导出路径已存在（`exportPNG` + `doExport` 传当前板），原生保存全流程尚未实测
- 文档设置面板已在第三十一批完成（文档名、当前画板名/尺寸/背景、只读单位与颜色模式、撤销与键盘恢复）；批量改全部画板已在第三十八批完成（只同步尺寸与背景，画板名仍只改当前板）；仍缺 CMYK/DPI
- 图层作为真实对象：组嵌套显示、组内拖动排序、把子层拖入/拖出组、多选与批量显隐/锁定已完成；图层搜索/过滤与 6 色标记已在第二十八批完成；还缺图层搜索的历史记录与标记命名
- 色板与最近颜色已做（固定 12 色、最近 10 色、持久化）；文档级全局色/专色、增删改、链接填充/描边与 JSON 导入导出已在第三十九批完成；仍缺 CMYK（参考 `doc/cmyk.rs`）、ASE/ACO、渐变与画板底色的色板链接
- 图案填充、渐变网格/自由渐变、渐变描边
- 符号、样式、画笔（参考 `brush` crate）

**P4 · 文字**
- 区域文字已在第四十五批完成（拖框创建、框内自动换行、框宽高、溢出标记、单点互转、SVG/PDF 导出），第四十六批补首行缩进、段距与框内垂直对齐；文字转路径已在第四十七批完成（`Ctrl+Shift+O` / 属性坞“转路径”，按本机字体文件真实字形轮廓生成每个字形一个可编辑路径，渐变文字合成一个复合路径以保持整段渐变，继承填充/透明度/混合/图层标记，支持一次撤销）；路径文字已在第四十八批完成（“文字 → 转为路径文字”，选中路径或路径+文字，保留路径几何与实色填充，属性坞可调起点与左右侧，画布按切线逐字旋转，SVG/PDF/.vex 同步，路径文字也能再转轮廓）；区域文字分栏已在第四十九批完成（1–6 栏、栏距、逐栏换行与跨栏续排，保留首行缩进/段距，SVG/PDF/.vex 共用）；仍缺段落文字（参考 `text/shape.rs`、`text/retype.rs`）、竖排与避头尾
- 字符/段落面板已覆盖字体、字号、行距、字距、粗斜体、对齐、横纵缩放、基线、首行缩进、段距、垂直对齐；仍缺避头尾、OpenType 特性、竖排

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
