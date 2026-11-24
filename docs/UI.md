# Vexa 界面壳层（UX 改造）

> 目标：不照搬 VectorCraft 的视觉样式，但导航必须完整、操作顺序必须顺、画面必须有呼吸。
> 本文记录当前壳层的结构、尺寸和交互边界，便于后续继续迭代。

## 骨架尺寸（默认密度，1280×820）

| 区域 | 尺寸 | 说明 |
|---|---|---|
| 顶栏 `.ed-top` | 44px | 品牌 / 7 个主菜单 / 撤销重做 / 缩放 / 主题 / 面板 / 设置 / 导出 |
| 文档标签 `.ed-tabs` | 34px | 当前文档标签 + 右侧画板切换器 |
| 选项栏 `.ed-optbar` | 50px | 当前工具 chip、上下文参数、网格/吸附开关、操作提示 |
| 工具轨 `.ed-rail` | 88px | 双列分组，7 个分组标签；按钮 34×34，间距 4 |
| 右侧面板坞 `.ed-dock` | 304px | 属性 / 图层两页，可收起；标签条 42px |
| 状态栏 `.ed-status` | 30px | 工程名 + 保存状态 / 坐标 / 选中与对象数 / 缩放 / 版本 |

`tokens.css` 的 `--h-bar`、`--h-tabs`、`--h-status`、`--w-rail`、`--w-dock` 与上表同步；
紧凑密度仍保持可用尺寸。

## 导航

- 主菜单：`文件 / 编辑 / 对象 / 文字 / 视图 / 窗口 / 帮助`。
- `文字`：粗体、斜体、左/中/右对齐、字号 ±2、选中全部文字；有文字选中时可用，菜单带 ✓ 状态。
- `视图`：缩放、适合画板、实际大小、显示网格、吸附、主题切换；网格与吸附带 ✓ 状态。
- `窗口`：右侧面板开合、切到属性面板、切到图层面板、恢复默认工作区。
- 文档标签右侧提供“画板”下拉，可在多画板工程里直接切换当前画板。

## 工具轨分组

| 分组 | 工具 |
|---|---|
| 选择 | 选择 V、直接选择 A |
| 路径与笔 | 钢笔 P、直线 `\`、铅笔 N、宽度 W |
| 修形 | 橡皮 E、剪刀 C、平滑 M |
| 颜色 | 吸管 I、渐变 G |
| 形状 | 矩形 R、圆角矩形 U、椭圆 L、多边形 Y、星形 S、文字 T |
| 画板 | 画板 ⇧O |
| 视图 | 抓手 H、缩放 Z |

总数仍为 20；单个分组若最后一行只剩一个按钮，会居中补位，不再靠左悬空。
悬停/键盘聚焦会显示 `名称 + 快捷键` 浮签。

## 选项栏

- 左侧固定 `当前工具 / 快捷键` chip，避免切换工具后不知道自己在什么状态。
- 选择工具：显示已选数量、包围盒尺寸，以及全选 / 取消选择 / 编组 / 取消编组。
- 绘制与描边工具：填充、描边、粗细；文字工具仍走统一填充/描边。
- 形状工具：圆角、边数、角数、内径比等参数。
- 右侧常驻网格 / 吸附开关，与 `视图` 菜单的 ✓ 状态同源。

## 右侧面板

- 宽度 304px，标签条 42px，正文 18px 内边距、18px 段间距。
- 每个 section 标题带 3px 品牌蓝标识，便于在长面板里扫读。
- 标签条最右侧有收起按钮；收起时宽度过渡到 0，画布右侧出现“‹ 面板”恢复按钮。
- 面板开合或窗口缩放时，画布保持视口中心对应的文档位置不变，不会把画板甩到一边。
- 填充段：实色 / 线性 / 径向 / 无一排切换；渐变时给出预览条、色标行（颜色、百分比、删除）和“添加色标”；线性渐变另有角度输入。
- 描边段：颜色、粗细、线型、端点（平头/圆头/方头）、连接（尖角/圆角/斜角）、箭头分组显示；端点/连接只对普通均匀描边生效。

## 画布右键

- 右键会先选中光标下对象（空白处则取消选择），再在光标附近打开对象菜单。
- 菜单自动测量高度并夹在视口内；靠近底部时整体上移，不会被屏幕裁掉。
- 菜单项复用编辑能力：剪切 / 复制 / 粘贴 / 删除 / 编组 / 剪切蒙版 / 置顶置底 / 锁定 / 隐藏 / 全选 / 取消选择 / 适合画板。

## 动效与恢复

- 欢迎页 → 编辑器：`editor-in` 260ms 淡入 + 轻微位移缩放。
- 关闭文档：先给 `.editor.is-leaving` 170ms 退场，再挂载欢迎页；`prefers-reduced-motion: reduce` 时退场延时归零。
- 面板宽度 220ms 过渡，图层/属性切换有轻微 rise-in；所有动效走 `motion.css`，reduced-motion 全局压到 1ms。
- 欢迎页预览纸限制在 `240×110` 内，预览区 144px 高并裁剪，修复此前白纸溢出盖住下方内容的问题。

## 已知边界

- 文档标签目前只显示当前工程，没有多文档并行；标签条还没做拖拽重排。
- 右侧面板是固定停靠，不支持浮动、拖出或多面板堆叠。
- `文字` 菜单只作用于“直接选中的文字对象”，选中组不会批量改组内文字。
- 右键菜单是固定定位面板，暂不做二级子菜单和自定义菜单项。
- 工具轨的分组标签是固定顺序；用户自定义工具组/隐藏工具尚未做。

## 验收记录（2026-11-21）

- `npx tsc --noEmit` 通过。
- `npm run build` 通过：77 modules，JS 432.28 kB，CSS 46.11 kB。
- Tauri `--no-bundle` 发布构建通过，`release\Vexa.exe` 已替换为包含本轮 UI 的版本（7,551,488 B）。
- 真实 Windows WebView2 窗口（150% 缩放）启动正常，窗口标题 `Vexa`、进程响应；欢迎页与编辑壳都完整落在屏幕内，状态栏可见。
- 实机 1280×820：顶栏 7 菜单、工具轨 7 组 20 工具、选项栏上下文、右侧 304px 面板、状态栏完整可见。
- 面板收起：`ed-dock.is-collapsed` 宽度实测 0，右侧恢复按钮距选项栏 12px；画板保持居中。
- 右键菜单：实测 484px 高，视口 725px 时顶部夹到 233px、底部 717px，未越界。
- 文字菜单：选中文字后“粗体”可用，执行后菜单显示 ✓；左对齐默认 ✓。
- 关闭文档：40ms 时 `.editor.is-leaving` 且欢迎页尚未挂载；约 277ms 欢迎页出现。
- 主题：浅色 / 深色均完成截图检查。
- 截图：`docs/shots/ux-v13-start4.png`、`ux-v13-editor4.png`、`ux-v13-collapsed4.png`、`ux-v13-textmenu2.png`、`ux-v13-ctx2.png`、`ux-v13-dark.png`、`ux-v13-start-dark.png`。
- 真实 Tauri 窗口截图：`docs/shots/ux-v13-real-start.png`、`ux-v13-real-editor.png`（150% 系统缩放，欢迎页与编辑壳均完整可见）。

## 验收记录（2026-11-22，第十四批）

- `npx tsc --noEmit` 通过；`npm run build` 通过：77 modules，JS 435.30 kB，CSS 46.83 kB。
- 画布实测：矩形切线性渐变后添加两次色标得到 4 行；四色分别设为 `#0f76d6 / #00d0f8 / #e5484d / #ffffff`，画布渐变条与预览一致。
- 色标删除：4 行删除最后一行变 3 行，再次添加恢复 4 行；最少 2 行时删除按钮禁用。
- 描边：选中路径后“端点”圆头、“连接”斜角均进入选中态；右侧面板文本顺序为“线型 → 端点 → 连接 → 箭头”。
- SVG / `.vex`：冒烟输出 3 个 `<stop>`、`stroke-linecap="round"`、`stroke-linejoin="bevel"`，`.vex` 往返色标=3、cap=round、join=bevel。
- MCP：`--selftest` 通过；端到端导出 SVG 同时含渐变、多色标、端帽/连接、虚线，校验 0 问题。
- 截图：`docs/shots/v14-gradient.png`、`docs/shots/v14-stroke.png`。
- 真实 Tauri/WebView2 窗口：四色标渐变 + 圆头/斜角见 `docs/shots/v14-real-editor.png`；开放直线设为 14px、圆头后画布确实显示粗线与圆端，见 `docs/shots/v14-real-line3.png`。

## 验收记录（2026-11-23，第十五批）

- `npx tsc --noEmit` 通过；`npm run build` 通过：77 modules，JS 440.04 kB，CSS 47.22 kB。
- 渐变色标行：颜色、位置、透明度、中点四类输入均可键盘输入；位置行显示百分比，透明显示 0..100，非首色标才出现“中点”。
- 中点语义：`50%` 为线性；低于 50% 时前半段更慢、后半段更快，画布与 SVG 使用同一份展开结果。
- 画布渐变工具：选中单个渐变路径后显示虚线轴与色标圆柄；色标悬停出现放大环与 `grab` 光标。
- 线性直拖：中点色标从 45% 拖到 28.3%，角度保持 90°。
- 径向直拖：中点色标从 50% 拖到 66.4%，填充仍保持径向，未误切成线性。
- 真实 Tauri/WebView2 窗口（150% 缩放）：三色标设 `0/100`、`45/35/20`、`100/100/50`；拖中间色标到 30% 后，右侧面板位置同步，角度保持 90°。
- 截图：`docs/shots/v15-panel.png`（无头浏览器面板）、`v15-canvas-drag.png`（线性直拖）、`v15-radial-handles.png`（径向轴线）、`v15-real-panel.png`、`v15-real-drag.png`（真实 Tauri）。

## 验收记录（2026-11-23，第十六批）

- `npx tsc --noEmit` 通过；`npm run build` 通过：77 modules，JS 444.79 kB，CSS 47.22 kB。
- 开发页 `DOMParser` 测试：线性渐变三色标 `#ff0000 alpha .8 / #0080ff / #0000ff alpha .35`、角度 90、`fill-opacity .5` 全部保留；径向白→黑 50% 透明正确；`xlink:href` 别名继承 3 个色标；缺失引用回退 `none`；命名色/HSL/rgba 归一化正确。
- 开发页真实导入 `scripts/fixtures/import-gradients.svg`：6 个对象、自动全选，状态栏“已选 6 · 6 个对象”；渐变渲染与 fixture 一致；属性坞显示“导入路径 1”，三行色标为 `0/100`、`45/90`、`100/35`，中点均 50，角度 90。
- 真实发布版（Tauri/WebView2，150% 缩放）：从“文件 → 导入 SVG…”调起系统文件对话框，选择同一 fixture 后成功导入；对话框关闭、无报错，画布显示渐变矩形/径向圆/渐变三角/紫色渐变条/半透明块/描边曲线，状态栏“已选 6 · 6 个对象”；从图层面板单选“导入路径 1”后属性坞显示 3 个色标与角度 90。
- 原生对话框：文件名框的可见文本属于 `ComboBox`，直接 `SetWindowText` 子 `Edit` 不可靠；需先点击文件名框再用剪贴板粘贴，最后点“打开(O)”。另需确认没有前置测试窗口遮挡对话框，否则物理点击会落到覆盖窗口。
- 截图：`docs/shots/v16-dev-import.png`、`v16-dev-single.png`、`v16-dev-stops.png`、`v16-import-render.png`、`v16-native-dialog.png`、`v16-native-imported.png`、`v16-native-single.png`。

## 验收记录（2026-11-23，第十七批）

- `npx tsc --noEmit` 通过；`npm run tauri:build` 通过：139 modules，`pdf-Bv5Z9TuM.js` 407.16 kB（懒加载）、`index-DepRFTcP.js` 449.46 kB、CSS 47.27 kB。
- 导出弹窗：三张卡片 SVG / PNG / PDF 等宽排列，弹窗宽 620px；选择 PDF 后出现“当前画板 / 全部 2 页”分段控件与“2 页 · 矢量”提示。
- 真实发布版：顶栏“导出”打开弹窗 → PDF → 全部 2 页 → 原生保存框，文件名框用 `Ctrl+A` + 剪贴板粘贴完整路径 `D:\...\v17-final-export.pdf` 后回车，2 秒内写盘；无错误框、无重复模态。
- 输出核验：导出的 77,615 B PDF 为 2 页；渲染第一页渐变矩形、径向圆角、两行渐变标题、实色小字与右下角 ALPHA 透明位图均正常；第二页黄色星形正常。
- 位图修复：Tauri 生产 CSP 拦截 `fetch(data:)`；改为 data URL 直接 base64 → `Blob` → `createImageBitmap`。修复后同一 fixture 的 PDF 从 31,978 B（位图缺失）变为 39,722 B（位图完整）。
- 原生保存框：前置 Edge 会抢前台，需先最小化；UIA 不暴露文件名框，必须物理点击后粘贴；重复点“导出到…”会堆 `#32770`，先关错误框再清理。
- 截图：`docs/shots/v17-ui-export-modal2.png`、`v17-ui-export-pdf2.png`、`v17-ui-export-done.png`、`v17-final-export-p1.png`、`v17-final-export-p2.png`、`v17-native-save-dialog4.png`、`v17-native-save-pasted.png`。

## 验收记录（2026-11-23，第十八批）

- `npx tsc --noEmit` 通过；`npm run tauri:build` 通过：139 modules，`pdf-DDEkuYgI.js` 407.16 kB、`index-CdbjTig7.js` 454.50 kB、CSS 47.27 kB；release `Vexa.exe` 7,715,840 B。
- SVG 文本：`scripts/fixtures/import-text-use.svg` 导入 9 个对象（标题、两行 tspan、缩放文字、居中文字共 5 段文字；两处 `<use>` 展开 4 条路径）。标题保留粗体/左对齐；渐变行保留 `url(#tg)` 三色标渐变；`tspan dy=24` 生成第二行可编辑文本；`scale(1.2 1)` 映射为水平缩放 120%。
- 浏览器渲染页 `scripts/svg-text-test.html`：`nodes=9 paths=4 texts=5`，全画板截图 `docs/shots/v18-svg-text-render.png` 中文字、渐变、两处引用图标均正确。
- 真实发布版（Tauri/WebView2）：从“文件 → 导入 SVG…”导入同一 fixture，画布出现 5 段文字 + 2 组图标；图层面板选中“导入文字 1”，属性坞显示“SVG 文本导入 / Arial / 73.05px / 行距 91 / 字距 1 / 水平 100% / 垂直 100%”，文本仍可编辑。
- 导入定位：`fitNodes` 现在同时缩放路径、文本与图片；文本字号缩放后保留 2 位小数，避免属性坞出现一长串浮点。
- 已知边界：文本旋转/斜切暂不旋转字形；`<clipPath>` 组裁切、图案、滤镜、`<use>` 的 symbol viewBox/width 缩放未处理。
- 截图：`docs/shots/v18-native-open-dialog.png`、`v18-native-final-import.png`、`v18-native-final-props.png`。

## 验收记录（2026-11-23，第十九批）

- `npx tsc --noEmit` 通过；`npm run tauri:build` 通过：139 modules，`pdf-CCjG0iuz.js` 407.16 kB、`index-CBeaEbsD.js` 458.88 kB、CSS 47.27 kB；release `Vexa.exe` 7,717,376 B。
- 浏览器渲染页 `scripts/svg-clip-test.html`：卡片矩形+圆形并集裁切、裁切内标题/副标题、底部色带裁切、两枚星星（96 与 meet 缩放到 48）全部正确，状态 `nodes=14 roots=7 groups=2 texts=4 clips=2`；截图 `docs/shots/v19-svg-clip-render.png`。
- 真实发布版（Tauri/WebView2）：新建干净 `900×600` 画板，从“文件 → 导入 SVG…”导入 `scripts/fixtures/import-clip-symbol.svg`；实际得到 7 个顶层对象、14 个总节点、2 个剪裁组、4 段文字，状态“已选 7 · 7 个对象”；图层根层顺序为剪裁组 2、路径 5..2、文字 3、剪裁组 1，画布与 fixture 一致。
- 剪裁内对象可选择：直接选择工具点击裁切标题，属性坞显示“导入文字 1 / 文本 / Arial / 41.28px / 165×52 px”；普通选择仍是整组。改成“裁切标题 · 已改”后画布即时重排，宽度变 296×52，说明组内文字不是死图。
- 修复点：拾取现在按组的 clip 范围先做排除，clip 外的整张画布矩形不再挡住上方裁切内容；中文文字包围盒改为按字符宽度估（CJK 1em），避免中文标题点到字上却选不到。
- 已知边界：图层面板仍不展开组内子节点，也不支持双击钻组；组内对象依靠“直接选择”工具进入。`objectBoundingBox` 剪裁、even-odd 孔洞、`slice` 对齐、图案/滤镜/`mask` 仍未处理。
- 原生对话框自动化：重复点“导入 SVG…”会留下多个 `#32770`；UIA 对文件列表项暴露 `ListItem + InvokePattern`，目录已停在 fixtures 时可直接 Invoke 文件打开，比物理点击稳。
- 截图：`docs/shots/v19c-native-direct.png`、`v19c-text-edited.png`、`v19b-native-final.png`。

## 验收记录（2026-11-23，第二十批）

- `npx tsc --noEmit` 通过；`npx tauri:build` 通过：139 modules，`pdf-D7J_EnSR.js` 407.16 kB、`index-CIZP0VR_.js` 459.59 kB、`index-T9he_bYd.css` 47.62 kB；release `Vexa.exe` 7,717,888 B。
- 图层树：顶层行保持倒序；组前新增箭头，展开后子图层缩进列出，内部剪裁路径跳过；展开状态按组 id 保存，收起再开不丢选中。
- 真实发布版：新建 `900×600` 画板“图层终验”，导入 clip 验收文件后切到图层面板；顶层 7 行，展开“导入剪裁组 1”得到 3 个子行（导入文字 2 / 导入文字 1 / 导入路径 1），箭头方向为收起向右、展开向下。
- 子层选择：点“导入文字 1”直接选中 165×52 px；切到属性页显示“导入文字 1 / 文本 / Arial / 41.28px / 文本 裁切标题”，不再需要先选组。
- 交互约束：拖拽仍只允许顶层行，子行不可拖，避免结构损坏；组名单击选组、双击展开/收起。
- 已知边界：组内子层拖动排序、把子层拖出组、批量显隐/锁定尚未做；导入组默认收起。
- 第二十四批已补齐组内排序与跨组搬移；批量显隐/锁定仍未做。组内排序与拖入/拖出记录见下方第二十四批验收。
- 截图：`docs/shots/v20-final-layers.png`、`v20-final-select-text.png`、`v20-final-text-props.png`。

## 验收记录（2026-11-24，第二十四批）

- `npx tsc --noEmit` 通过；`npm run build` 通过：142 modules，`index-Dr0xuXFD.js` 466.30 kB / gzip 147.82，`index-DmPGAybe.css` 48.38 kB / gzip 9.49，`pdf-DagSJbuI.js` 407.16 kB / gzip 169.22。
- 纯逻辑：`npx tsx scripts/smoke.layers.mts` 24 项 PASS，覆盖组内 A/B/C 排序、子层拖出到根层、顶层拖入组、根层组重排、拒绝自身 / inside 普通路径 / 把组拖进后代，以及“子层从 A 组放进已有子层的 B 组”。
- 真实发布版窗口（Tauri/WebView2，1280×1000）：用 `scripts/fixtures/layer-panel.vex` 打开图层页，展开“卡片组”，在窗口内触发完整 `dragstart → dragover → drop` 链。组内排序把“标题”拖到“副标题”上方，得到 `标题 / 副标题 / 卡片底`；拖拽时目标行顶部出现品牌蓝落点线。
- 拖入组：把“操作提示”拖到“图标组”行中间，目标行高亮并出现“放入组内”胶囊；松手后“操作提示”成为图标组顶行，图标组自动展开为 `操作提示 / 短条 / 圆点`。
- 拖出组：再把“操作提示”拖到根层“背景”上方，缩进从 19px 回到 5px，根层对象数从 4 变为 5，背景仍在最底层；状态栏显示“已选 1 · 5 个对象”。
- 落点分区：组行纵向 28% / 44% / 28% 分别为 before / inside / after；普通行按上下半区。只有合法落点才显示反馈并 `preventDefault`，拖自身、普通对象 inside、组进后代都不产生落点。
- 自动化工具：`tools/shot.ps1` 在独立虚拟桌面启动 release，`--remote-debugging-port` 接 WebView2，`tools/cdp-layer-drag.mjs` 驱动并截取拖放前后状态；截图后虚拟桌面立即关闭。
- 截图：`docs/shots/layers-drop-before.png`（组内排序落点）、`layers-drop-inside.png`（放入组内）、`layers-drag.png`（三次搬移后的最终树）、`layers-drag-window.png`（真实窗口截图）。
- 已知边界：批量显隐 / 锁定仍未做；折叠组内的子层不可拖，需先展开；组内排序与跨组搬移一次操作记一步撤销。

