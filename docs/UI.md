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
| 形状 | 矩形 R、圆角矩形 U、椭圆 L、圆形 ⇧L、多边形 Y、星形 S、文字 T |
| 画板 | 画板 ⇧O |
| 视图 | 抓手 H、缩放 Z |

总数仍为 21；单个分组若最后一行只剩一个按钮，会居中补位，不再靠左悬空。
悬停/键盘聚焦会显示 `名称 + 快捷键` 浮签。

## 选项栏

- 左侧固定 `当前工具 / 快捷键` chip，避免切换工具后不知道自己在什么状态。
- 选择工具：显示已选数量、包围盒尺寸，以及全选 / 取消选择 / 编组 / 取消编组。
- 绘制与描边工具：填充、描边、粗细；文字工具仍走统一填充/描边。
- 形状工具：圆角、边数、角数、内径比等参数；圆形工具额外显示“从中心”开关（第一点作圆心）；单击首点后第二次按下并拖过第三点会按三点外接圆落地。
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
- 实机 1280×820：顶栏 7 菜单、工具轨 7 组 21 工具、选项栏上下文、右侧 304px 面板、状态栏完整可见。
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
- 第二十四批已补齐组内排序与跨组搬移；第二十五批已补齐批量显隐/锁定。记录见下方第二十四、二十五批验收。
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
- 已知边界：第二十五批已补齐批量显隐 / 锁定；折叠组内的子层不可拖，需先展开；组内排序与跨组搬移一次操作记一步撤销。

## 验收记录（2026-11-25，第二十五至二十七批）

- `npx tsc --noEmit` 通过；`npm run build` 通过：143 modules，`index-Dof4g4IO.js` 470.43 kB / gzip 149.21，`index-C7Qk7DcQ.css` 49.76 kB / gzip 9.69，`pdf-CqBpYk8z.js` 407.16 kB / gzip 169.22。
- 图层多选：`scripts/smoke.selection.mts` 16 项 PASS，覆盖折叠/展开显示顺序、单击单选、Ctrl 逐选/反选、Shift 连选、Shift+Ctrl 叠加，以及批量显隐/锁定“任一可见→全隐藏、任一解锁→全锁定”的语义；`scripts/smoke.layers.mts` 24 项复跑无回归。
- 真实发布版窗口（Tauri/WebView2，1280×1000）：图层页展开“卡片组”，点“标题”→Ctrl 点“副标题”→Shift 点“卡片底”，状态栏“已选 3 · 4 个对象”，三行同时高亮，顶部“显隐/锁定”按钮启用；截图 `docs/shots/layers-multi.png`。
- 批量显隐：选中 3 行后点行内“标题”的眼睛，3 行的眼睛 aria-label 全部变为“显示”，toast“已隐藏 3 个图层”；再点同一眼睛恢复 3 行可见，toast“已显示 3 个图层”。
- 批量锁定：顶部“锁定”按钮把 3 行锁图标变为“解锁”，状态栏“未保存”，toast“已锁定 3 个图层”；再点一次恢复解锁。截图 `docs/shots/layers-batch.png`。
- 变换面板：多选“标题 + 副标题”切到属性页，显示位置 X/Y、尺寸 W/H、旋转 ±90°、水平/垂直翻转与多选说明；`276×122` 选区把 W 输入 `260` 后，W/H 与标题读数精确变为 `260×122`。`scripts/smoke.transform.mts` 6 项 PASS（文字 216→260、45→90，误差 <0.02px）。截图 `docs/shots/props-transform.png`。
- 色板与最近颜色：选中“标题”，填充区显示 12 色固定色板；点橙色 chip 后填充色板与画布文字同步变橙，最近行出现橙色 chip，`localStorage` 记录 `#ff9f0a`；重启后最近颜色仍在。截图 `docs/shots/props-palette.png`。
- 布局自检：1280×1000 下图层底部“Ctrl/Shift 多选”保持单行，“删除 / 提示”不挤压；填充行“不透明度”单行显示，输入框收到 64px；色板两行内完整可见，无横向溢出。
- 已知边界：固定 12 色 + 最近 10 色，不含全局色/专色/CMYK；渐变每个色标仍用原生取色器；文字 W/H 用字号与水平缩放逼近，路径描边宽度不随框缩放；批量锁定后仍保持选中，便于再点一次解锁。
- 截图：`layers-multi.png`、`layers-batch.png`、`layers-multi-window.png`、`props-transform.png`、`props-transform-after.png`、`props-palette.png`、`props-palette-window.png`。

## 验收记录（2026-11-25，第二十八批：图层搜索 / 颜色标记 / 过滤）

- `npx tsc --noEmit` 通过；`npm run build` 通过：144 modules，`index-eWrnshGC.js` 476.25 kB / gzip 150.85，`index-C-PqTAB4.css` 52.66 kB / gzip 10.10，`pdf-DscykRww.js` 407.16 kB / gzip 169.22。
- 图层面板结构：对象行上方新增 28px 搜索框与 7 个色标记 chip（“全部” + 红/橙/黄/绿/蓝/紫）。搜索框有放大镜、清除按钮和 `:focus-within` 品牌色描边；无标记的颜色 chip 保留色点但禁用，有标记时显示数量。
- 打标：选中“标题”后属性坞出现“颜色标记”区，7 个按钮为“无 / 红 / 橙 / 黄 / 绿 / 蓝 / 紫”，当前标记双描边。依次给“标题 / 副标题 / 卡片组”标红 / 蓝 / 绿，行尾出现对应色点，筛选条计数变为 `1 / 1 / 1`；多选两段文字点紫后 toast“已标记 2 个图层”，紫计数变 2。截图 `docs/shots/layerfilter-props.png`、`layerfilter-tags.png`、`layerfilter-final.png`。
- 搜索：在搜索框输入“操作提示”，列表只保留 `卡片组 / 操作提示`，组自动展开，头显“1 匹配”，筛选状态行显示““操作提示” · 1 个直接匹配 / 清除”；截图 `docs/shots/layerfilter-search.png`。
- 颜色筛选：点红色 chip 后只保留 `卡片组 / 标题`，头显“1 匹配”，状态行“红色标记 · 1 个直接匹配”；再叠加搜索“操作提示”得到空列表，显示“没有匹配的图层 / 清除筛选”；点“清除”恢复完整 8 行。截图 `docs/shots/layerfilter-red.png`、`layerfilter-empty.png`。
- 布局自检：真实窗口 1280×1000 逻辑（DPR 1.5）下，`.layers-body`、`.layer-filter`、`.layer-tag-filters`、`.layer-search` 的 `scrollWidth == clientWidth`，没有横向溢出；属性标记按钮一行 7 个宽 257px，完整落在 303px 面板内。
- 回归：多选“标题 + 副标题”后顶部“显隐/锁定”仍启用；`scripts/smoke.selection.mts` 16 项、`scripts/smoke.layers.mts` 24 项复跑通过；`scripts/smoke.layerfilter.mts` 27 项覆盖名称/类型搜索、祖先组上下文、AND 组合、剪裁路径排除、环终止、标记保存和非法值丢弃。
- 已知边界：标记不参与导出，不改变画布；搜索不搜节点内文字；过滤时命中子层的组临时强制展开；标记还没有命名、全局色或导入导出。
- 截图：`layerfilter-tags.png`、`layerfilter-search.png`、`layerfilter-red.png`、`layerfilter-empty.png`、`layerfilter-props.png`、`layerfilter-final.png`、`layerfilter-window.png`。

## 验收记录（2026-11-25，第二十九批：画板预设 / 适配内容 / 复制与换序）

- `npx tsc --noEmit` 通过；`npm run build` 通过：145 modules，`index-NKdXWcrY.js` 479.32 kB / gzip 152.21，`index-DjYS-YFN.css` 53.10 kB / gzip 10.13，`pdf-Dtxo_CmN.js` 407.16 kB / gzip 169.22。
- 预设：属性坞“画板”段新增“尺寸预设”六 chip（方图 / 横屏 / 竖屏 / A4 竖版 / A4 横版 / 图标），与启动页共用 `BOARD_PRESETS`；当前 W/H 命中某一档时 chip 高亮。真实窗口点“A4 竖版”后画板行与 W/H 从 `900×600` 变 `794×1123`，chip 选中；截图 `docs/shots/boards-preset-a4.png`。
- 适配内容：`nodeBounds` 递归组、跳过剪裁轮廓，只合并与当前板相交的根层包围盒；点“适配内容”后画板从 `794×1123` 回到内容 `900×600`，toast“画板已适配内容”；空板时按钮保留但提示“当前画板没有可适配的内容”。
- 复制画板：点“复制画板”在当前板后插入“图层拖拽验收 副本”，x 为最右板右侧 48px，内容整体平移；组内子路径与 `clip` 引用重新分配 id。真实窗口画板数 1→2，新板自动成为当前板，toast“已复制画板，含 4 个顶层对象”；截图 `docs/shots/boards-copy.png`。
- 换序：标题栏 ↑/↓ 互换画板数组顺序，首/尾按钮相应禁用；上移后副本到第一位、下移恢复，toast“画板已上移 / 下移”。
- 布局自检：真实窗口 1280×1000 逻辑（DPR 1.5）下，`.ed-dock / .dock-body / .board-list / .board-presets / .board-tools` 的 `scrollWidth == clientWidth`，预设 chip 两行、两个工具按钮与 5 个标题栏小按钮均不横向溢出；`dock-body` 仍纵向滚动。截图 `docs/shots/boards-presets.png`、`boards-window.png`。
- 回归：`scripts/smoke.artboards.mts` 19 项覆盖预设尺寸、组包围盒与剪裁排除、适配、连内容复制、组/剪裁 id 重映射、原文坐标不变、换序与空板复制；`scripts/smoke.selection.mts` 16 项、`scripts/smoke.layers.mts` 24 项、`scripts/smoke.layerfilter.mts` 27 项复跑通过。
- 已知边界：内置六档预设不可自定义保存/导入；适配内容不排除隐藏层，也不计描边宽度；复制只克隆与源板相交的根层；换序只改列表与导出顺序，不改画布坐标。
- 截图：`boards-presets.png`、`boards-preset-a4.png`、`boards-copy.png`、`boards-final.png`、`boards-window.png`。

## 验收记录（2026-11-25，第三十批：路径查找器 9 种）

- `npx tsc --noEmit` 通过；`npm run build` 通过：145 modules，`index-CPnLofxJ.js` 484.02 kB / gzip 153.73，`index-BMY57vWz.css` 53.14 kB / gzip 10.14，`pdf-Bk1CImTc.js` 407.16 kB / gzip 169.22。
- 面板：属性坞路径查找器从 4 个按钮扩到 9 个，前 4 个 2 列，新增“分割 / 修边 / 合并 / 裁剪 / 轮廓”用 3 列排两行；合并、轮廓只需 1 个路径，其余至少 2 个；对象菜单同步 5 个入口。257px 面板内无横向溢出；截图 `docs/shots/pathfinder-panel.png`。
- 分割：按布尔组合枚举互不重叠的面，每个面保留最上层填充。真实窗口选“红块 + 蓝块”点分割，2 个对象变 3 个面，对象数 6→7，toast“已生成 3 个路径（分割）”；三个面拼合后外观与原来一致。截图 `pathfinder-divide.png`。
- 修边：从下往上逐层减去上方路径，最上层保持完整，下层只留露出部分，重叠区归最上层。红块 + 蓝块修边后红块变 L 形、蓝块完整，对象数保持 6，视觉与原来一致；截图 `pathfinder-trim.png`。
- 合并：相同 `opacity + fill + stroke` 的路径联合为一个。红块 + 红块 2 合并为 1 个路径，对象数 6→5；截图 `pathfinder-merge.png`。
- 裁剪：叠放最上层路径当裁剪框，下层各形状与它求交后保留各自填充，裁剪框删除。红块 + 蓝块裁剪得到红块 `100×140` 的片段，对象数 6→5；截图 `pathfinder-crop.png`。
- 轮廓：保留几何、去掉填充、统一 1px 深色边界线。单选红块点轮廓后变成细线框，对象数保持 6；截图 `pathfinder-outline.png`。
- 叠放顺序：新增 `sortPathNodesByZ`，路径查找器按文档根层/组内顺序取上下层，不再依赖点击顺序；减去顶层与裁剪都以蓝块在上为准。
- 回归：`scripts/smoke.pathfinder.mts` 22 项覆盖叠放顺序、分割 3 面与总面积、修边 2 面、同/异填充合并、裁剪面积与下层填充、轮廓、无重叠裁剪；`smoke.vector`、`smoke.artboards` 19 项、`smoke.selection` 16 项、`smoke.layers` 24 项、`smoke.layerfilter` 27 项复跑通过。每次真实操作后点撤销，对象数均回到 6。
- 布局自检：`.ed-dock / .dock-body / .dock-sec / .pathfinder-extra` 的 `scrollWidth == clientWidth`，按钮两行排布完整；截图 `pathfinder-final.png`、`pathfinder-window.png`。
- 已知边界：分割最多完整枚举 8 个形状，超过后按层切面；分割/修边/裁剪清空结果描边；合并不消除不同填充间的遮挡；轮廓不做描边宽度外扩；布尔仍是折线级。
- 截图：`pathfinder-panel.png`、`pathfinder-divide.png`、`pathfinder-trim.png`、`pathfinder-merge.png`、`pathfinder-crop.png`、`pathfinder-outline.png`、`pathfinder-final.png`、`pathfinder-window.png`。

## 验收记录（2026-11-25，第三十一批：文档设置）

- `npx tsc --noEmit` 通过；`npm run build` 通过：148 modules，`index-Bo5YbkGz.js` 490.05 kB / gzip 155.45，`index-DmuFagZe.css` 54.90 kB / gzip 10.41，`pdf-9ZZxLwVd.js` 407.16 kB / gzip 169.22。
- 入口：文件菜单新增“文档设置…”（`Ctrl+Alt+,`）；弹窗打开后文档名称输入框自动聚焦并全选，`Esc`、取消、遮罩点击均可关闭；关闭后焦点回到“文件”菜单按钮，避免浮层卸载后焦点落到 `body`。
- 字段：文档名称、当前画板名称、宽/高（1–20000 px）、画板背景（取色器 + 十六进制）；只读信息栏显示 `px`、`RGB / 8 位`、画板序号与对象/根层统计。
- 非法输入：宽为 `0` 点“应用更改”，弹窗内显示“画板尺寸不能小于 1 px”，弹窗保持打开、文档不变；表单使用 `noValidate`，不会被浏览器原生校验气泡截断。
- 应用：文档名 `文档设置验收`、画板名 `主画板`、尺寸 `1000×700`、背景 `#eef4ff`；一次 `store.commit` 全部写入，对象数保持 6；画板背景在画板露出区域变浅蓝，属性坞色块同步。
- 撤销：`Ctrl+Z` 后文档名、画板名、`900×600` 与 `#f7f3e9` 全部还原；再次打开弹窗读到原值。
- 布局：弹窗宽 559 px，`.modal-body` 与全部输入 `scrollWidth == clientWidth`；`doc-meta` 四列不溢出；真实窗口 1920×1500、DPR 1.5 下完整可见。
- 测试：`scripts/smoke.document.mts` 25 项 PASS（读取/统计、空名称回退、尺寸取整与 1–20000 限制、非法背景回退、校验、应用、节点/根层不变、非法输入不写入、缺画板报错）；`smoke.artboards` 19 项复跑通过。
- 截图：`docs/shots/doc-settings-panel.png`、`doc-settings-error.png`、`doc-settings-applied.png`、`doc-settings-undo.png`、`doc-settings-window.png`。

## 验收记录（2026-11-25，第三十二批：自定义画板预设 / 适配描边）

- `npx tsc --noEmit` 通过；`npm run build` 通过：152 modules，`index-CIlZfatX.js` 500.91 kB / gzip 158.73，`index-C_9PXXkx.css` 58.79 kB / gzip 11.03，`pdf-BVRaIfH3.js` 407.16 kB / gzip 169.22，`splash-bg-DgncLeTt.jpg` 86.90 kB。
- 预设持久化：`src/core/boardPresets.ts` 负责 1–20000 整数校验、尺寸去重、最多 20 个、空名称回退与 JSON schema；`src/stores/boardPresets.ts` 写 `vexa.board-presets.v1`，启动页与编辑器共用同一列表；重启后仍显示。
- 启动页：点“新建”卡片右上“预设库…”打开弹窗，保存“名片”`90×54` 后列表出现该行与“已保存「名片」”；再存同尺寸提示“该尺寸已在预设中”且弹窗不关；通过隐藏文件框导入 `presets-import.json`，已有“名片”去重、只新增“海报”，提示“已导入 1 个预设”，列表 1→2。
- 应用与 chip：点“海报”行“应用”，启动页宽高变 `400×300`、预览 `400 × 300 px`、自定义 chip“海报”高亮；关闭后焦点回到“预设库…”链接。
- 编辑器：画板段新增自定义 chip 与“预设库… / 存当前尺寸”；保存当前 `900×600` 画板后出现“路径查找器验收”chip，toast“已保存预设「路径查找器验收」”；应用“海报”后画板 W/H 变 `400×300`，toast“已应用预设「海报」”。
- 适配内容：点“适配内容”后画板回到内容包围盒 `900×600`、chip 回到内置高亮，toast“画板已适配内容”；核心测试证明路径描边外扩与隐藏层排除都生效。
- 删除 / Esc：删除“名片”后列表 3→2，提示“已删除「名片」”；`Esc` 用真实键盘事件关闭弹窗，焦点回到 `btn-link preset-open`；随后再次导入 fixture 补回“名片”，列表恢复 3。
- 布局：真实 Tauri/WebView2 `1920×1500` 窗口下，弹窗宽 659 px，正文 659 px、表单 615 px，预设行 613 px，名称输入 323 px、宽高输入 65 px；所有 `scrollWidth == clientWidth`，无横向溢出；启动页与编辑器两种宿主位置都完整可见。
- 测试：`scripts/smoke.boardpresets.mts` 25 项 PASS；`scripts/smoke.artboards.mts` 25 项 PASS（新增 20px 描边外扩、非均匀宽度、隐藏根层与组内隐藏）；`scripts/smoke.document.mts` 25 项复跑通过。
- 已知边界：预设只存名称与尺寸，不存底色/坐标/内容；导入只补充新尺寸，不覆盖或删除已有项；导出 JSON 已接原生保存对话框，schema 与 roundtrip 已验证，本批未自动点选原生保存框；尖角斜接只按半宽外扩。
- 截图：`docs/shots/presets-start-error.png`、`presets-start-dialog.png`、`presets-start-applied.png`、`presets-editor-dialog.png`、`presets-editor-panel.png`、`presets-start-window.png`、`presets-editor-window.png`。




## 验收记录（2026-11-25，第三十三批：直接选择多锚点 / 方向键微移）

- `npx tsc --noEmit` 通过；`npm run build` 通过：152 modules，`index-x6ScLkuV.js` 503.12 kB / gzip 159.40，`index-C_9PXXkx.css` 58.79 kB / gzip 11.03，`pdf-BWXqOk0E.js` 407.16 kB / gzip 169.22。
- 锚点状态：`AnchorRef {nodeId,si,ai}` 只在直接选择工具内有效；普通点锚点选 1 个，`Shift` 点第二个变“锚点 2”；切到选择工具、对象选择变化或节点下标失效时自动清空/过滤。
- 多锚点拖动：拖动任一已选锚点会同步平移所有选中锚点及其入/出手柄；真实窗口从右端锚点拖 40 屏幕 px，W `655→720`、X 保持 `189`，底端锚点同时移动。
- 方向键：选中锚点后方向键在窗口捕获阶段被拦截，只推锚点；两次 `→` 后 W `655→657`，X/Y/H 不变；`Shift` 步长 10 px；每次按键独立入撤销栈，两次 `Ctrl+Z` 逐级还原。
- 视觉：选中锚点为 9 px 白底 + 2 px accent 边框，未选 6 px 黑边；选项栏文案在选中时变为“锚点 N · Shift 多选 · 方向键微移”，与“已选 / W×H / 全选 / 取消选择 / 编组”同排显示。
- 切换与恢复：`Shift` 再点已选锚点可取消（2→1）并再点回来（1→2）；按 `V` 切选择工具后对象仍在选、锚点计数清空；按 `A` 切回后重新点选两个锚点成功。
- 布局：真实 Tauri/WebView2 1920×1500、DPR 1.5 下 `.ed-optbar` 874/874、`.opt-selection` 297/297；1200×900 视口下 808/808 与 297/297，均无横向溢出。
- 测试：`scripts/smoke.anchors.mts` 20 项 PASS（手柄同步、重复引用去重、无效引用、跨节点、直线锚点、非路径跳过、零位移/负向大位移）；`smoke.artboards` 25 项、`smoke.document` 25 项、`smoke.vector`、`smoke.selection` 16 项、`smoke.pathfinder` 22 项复跑通过。
- 已知边界：未做锚点框选；`Delete` 仍删整个对象而非锚点；长按方向键会产生多步撤销；开放子路径连接与锚点水平/垂直/分布对齐仍未做。
- 截图：`docs/shots/anchors-multi.png`、`anchors-nudged.png`、`anchors-drag.png`、`anchors-narrow.png`、`anchors-window.png`。

## 验收记录（2026-11-25，第三十四批：锚点连接 / 六向对齐）

- `npx tsc --noEmit` 通过；`npm run build` 通过：153 modules，`index-N3WvSOuM.js` 506.73 kB / gzip 160.62，`index-B25ahhqp.css` 58.86 kB / gzip 11.05，`pdf-C-f7b5j_.js` 407.16 kB / gzip 169.22，`splash-bg-DgncLeTt.jpg` 86.90 kB。
- 菜单：对象菜单在“水平/垂直分布”后新增“连接锚点”`Ctrl+J` 与 6 个“锚点左/水平居中/右/顶/垂直居中/底对齐”；1 个锚点时全部禁用，2 个非端点锚点时只启用对齐，首尾开放端点时连接才启用。
- 对齐：选中三角路径的首尾锚点后执行“锚点左对齐”，尾锚点 X `368.6→188.6`，首锚点、未选中点与 Y 不变；手柄随锚点平移；toast“已对齐 1 个锚点”，选择仍为“锚点 2”。
- 重复对齐：再点一次“锚点左对齐”只提示“选中的锚点已经对齐”；撤销栈长度保持 2，不多写空历史；工具栏撤销一步把尾锚点 X 还原为 `368.6`。
- 连接：首尾端点执行“连接锚点”后子路径由开放变闭合、锚点数仍 3、选择框不变，锚点选择清空；撤销恢复开放；重新选首尾后 `Ctrl+J` 同样闭合。
- 浮层高度：对象菜单新增 7 项后加 `max-height: calc(100vh - 56px)` 与纵向滚动；1200×900 下菜单 `217/217`、top 41 / bottom 885，不越出视口，也无横向滚动。
- 布局：真实 Tauri/WebView2 1920×1500、DPR 1.5 下 `.ed-optbar` 874/874、`.opt-selection` 297/297；1200×900 下 874/874 与 297/297，均无横向溢出。
- 测试：`scripts/smoke.anchorops.mts` 50 项 PASS（六向对齐、手柄同步、重复/无效引用、已对齐不写历史、同子路径闭合、双子路径顺序/反向/重合端点、闭合/跨节点/非端点拒绝）；`smoke.anchors` 21 项及其余冒烟脚本全复跑通过。
- 已知边界：只连接同一路径节点内的开放子路径；跨路径节点、锚点等距分布与框选锚点未做；连接后不自动选中新端点；闭合路径不能继续连接。
- 截图：`docs/shots/anchorjoin-menu-disabled.png`、`anchorjoin-menu-enabled.png`、`anchorjoin-align.png`、`anchorjoin-joined.png`、`anchorjoin-narrow.png`、`anchorjoin-window.png`。

## 验收记录（2026-11-26，第三十五批：锚点分布 / 跨路径连接）

- `npx tsc --noEmit` 通过；`npm run build` 通过：153 modules，`index-CNhCqaTu.js` 508.36 kB / gzip 161.04，`index-B25ahhqp.css` 58.86 kB / gzip 11.05，`pdf-CLw7Ps1v.js` 407.16 kB / gzip 169.22，`splash-bg-DgncLeTt.jpg` 86.90 kB。
- 菜单：对象菜单在 6 个“锚点*对齐”后新增“锚点水平分布 / 锚点垂直分布”；锚点 ≥3 时启用，2 个锚点时禁用。选中 3 个锚点（0/1/3 号）时水平/垂直分布均可点，“连接锚点”因 1 号不是端点而禁用。
- 分布：4 锚点路径选 0/1/3 号后执行“锚点水平分布”，中间锚点 X `352.21→524.03`（首尾 X `139.46/908.60` 的中点），Y 保持 `351.30`；未选中的第 3 个锚点 X 仍 `614.04`；toast“已分布 1 个锚点”，锚点选择仍为 3。
- 重复分布：再执行一次只提示“选中的锚点已经分布”；工具栏一次撤销把中间锚点 X 还原为 `352.21`，说明第二次没有写空撤销。
- 跨节点连接：路径 A（4 锚点）与路径 B（3 锚点）分别选中，状态“已选 2 · 2 个对象”；选中 A 末端点与 B 首端点后“连接锚点”启用，执行后只剩一个路径节点、一条开放子路径、7 个锚点，对象选择 `2→1`，锚点选择清空，toast“已连接 2 个锚点”。
- 撤销/重做：工具栏撤销恢复两个路径节点（4 + 3 锚点）；重做恢复单个节点 7 锚点，选择与提示正常。
- 浮层：对象菜单在 1200×900 下 top `41` / bottom `885`，`clientWidth == scrollWidth == 217`，内容高 1552 靠内部滚动；不越视口、不横向溢出。
- 布局：真实 Tauri/WebView2 1920×1500、DPR 1.5 下 `.ed-optbar` 874/874、`.opt-selection` 297/297；1200×900 下 874/874 与 297/297，均无横向溢出。
- 测试：`scripts/smoke.anchorops.mts` 81 项 PASS（含新增 15 项分布与跨节点连接断言）；`smoke.anchors` 21 项及其余 14 个冒烟脚本全复跑通过。
- 已知边界：分布只做等距，不做固定间距/按对象边界；跨路径连接只合并端点所在子路径，不整节点合并；连接后不自动选中新端点；锚点框选与 `Delete` 删单个锚点仍未做；闭合路径、非端点、剪切蒙版路径不能连接。
- 截图：`docs/shots/anchor-dist-menu.png`、`anchor-dist-result.png`、`anchor-cross-menu.png`、`anchor-cross-joined.png`、`anchor-dist-narrow.png`、`anchor-dist-window.png`。

## 验收记录（2026-11-26，第三十六批：倾斜 / 斜切）

- `npx tsc --noEmit` 通过；`npm run build` 通过：153 modules，`index-D1dLWNqp.js` 511.05 kB / gzip 161.85，`index-PBkgBnnF.css` 58.89 kB / gzip 11.06，`pdf-CeiQU5zw.js` 407.16 kB / gzip 169.22。
- 属性坞：尺寸 W/H 下新增“斜切 / Ctrl 拖边柄”标题、`斜切 X°` / `斜切 Y°` 两个输入和“应用斜切”按钮；输入支持 Enter，角度限制 ±80；选中纯文字时按钮禁用，选中路径时恢复。
- 数值斜切：1920×1500 真实窗口画矩形后选中，X 45° 把四角从 `[[262.2,271.654],[589.493,271.654],[589.493,517.124],[262.2,517.124]]` 变为 `[[139.464,271.654],[466.758,271.654],[712.229,517.124],[384.935,517.124]]`，Y 不变，包围盒 `327×245→573×245`，toast“已斜切 X 45°”，输入清空；撤销恢复原坐标。Y 30° 时 X 不变、包围盒变高；撤销恢复。
- 空输入：直接点“应用斜切”只提示“请输入斜切角度”，撤销栈长度前后相等，不写空历史。
- Ctrl 拖边柄：选择工具按住 `Ctrl` 拖东侧边柄下移 80 屏幕 px，锚点 X 全不变，Y `[271.654,271.654,517.124,517.124]→[140.736,402.572,648.042,386.207]`，`dragTan=0.8000022`（`80/zoom/(w/2)`）；撤销恢复。`Shift` 吸附 15°，角度超 ±80 截断。
- 视觉：斜切后矩形变平行四边形，选中框仍是变换后包围盒，角柄/边柄/旋转柄位置正确；属性坞与工具提示无重叠，斜切实色填充与描边随路径变形。
- 布局：1920×1500 下属性坞 `cw=sw=303`，两个输入各 127 px、按钮 257 px，均不越右边界；1200×900 下同样 `303/303`，按钮右 1172 ≤ dock right 1200；选择工具提示缩短为“拖动框选；拖角缩放，Ctrl 拖边柄斜切”，两种宽度都完整显示。
- 测试：`scripts/smoke.skew.mts` 16 项 PASS（X/Y 四角、包围盒、手柄随动、组内路径、指定中心、切线增量叠加、±80 截断、NaN、缺失节点、0°）；其余 15 个冒烟脚本全复跑通过。
- 已知边界：只变换路径锚点与手柄，纯文字/位图没有剪切字段不参与，组内混排文字跳过；±80° 限制；不生成 SVG 斜切矩阵，导出为变形后的路径坐标。
- 截图：`docs/shots/skew-panel.png`、`skew-numeric.png`、`skew-drag.png`、`skew-narrow.png`、`skew-window.png`。

## 验收记录（2026-11-26，第三十七批：锚点框选 / 单锚点删除）

- `npx tsc --noEmit` 通过；`npm run build` 通过：153 modules，`index-Cbq_5_0D.js` 513.18 kB / gzip 162.52，`index-PBkgBnnF.css` 58.89 kB / gzip 11.06，`pdf-D9kOF5nP.js` 407.16 kB / gzip 169.22。
- 框选：直接选择工具在已选路径上从空白（路径外）拖框，框内锚点高亮为 9px 白底 + accent 边框；真实窗口从矩形左上外拖到顶边下方，状态“锚点 2”；再 `Shift` 从底部外拖回，累加到“锚点 4”。
- 提示：未选锚点时显示“拖框选锚点 · Shift 多选 · Delete 删点”，选中后显示“锚点 N · Shift 多选 · Delete 删点”；1200×900 下提示 151/151、选项栏 808/808，不截断。
- Delete：选中顶部 2 个锚点按 `Delete`，路径节点保留、剩 2 个闭合锚点，包围盒 `409×278→409×0`，toast“已删除 2 个锚点”；锚点选择立即清空，属性坞仍显示路径对象。
- 删光：4 个锚点全删后路径节点与根层条目消失，状态“已选 0”、画布空白，toast“已删除 4 个锚点”；撤销恢复整条 4 锚点路径，坐标与原始一致。
- 撤销：删 2 个锚点后一次工具栏撤销恢复 4 个锚点与原坐标；删光后一次撤销恢复整条路径，说明每次删除只写一步历史。
- Shift 累加：框选上二后再 `Shift` 框选下二，提示“锚点 4”，四个锚点均高亮；未按 `Shift` 的第二次框选会替换为框内锚点。
- 边界：框选只从当前已选路径/组收集，不能一次框选未选中路径；剪切蒙版路径不可删；隐藏/锁定路径不参与框选；只剩 2 个锚点的闭合路径保留为线。
- 测试：`scripts/smoke.anchordelete.mts` 46 项 PASS（框选边界/跨子路径/组递归/隐藏锁定、删 1/2/3 个、开放端点、重复/非法引用、双子路径、空祖先组、剪切蒙版拒绝、手柄保持）；其余 16 个冒烟脚本全复跑通过。
- 截图：`docs/shots/marquee-drag.png`、`marquee-anchors.png`、`marquee-deleted.png`、`marquee-undo.png`、`marquee-shift.png`、`marquee-narrow.png`、`marquee-window.png`。

## 验收记录（2026-11-26，第三十八批：文档设置批量应用全部画板）

- `npx tsc --noEmit` 通过；`npm run build` 通过：153 modules，`index-BGB8e-cJ.js` 513.76 kB / gzip 162.79，`index-Bn8OfWPG.css` 59.21 kB / gzip 11.13，`pdf-DALUF9Jk.js` 407.16 kB / gzip 169.22。
- 入口：文档设置（`Ctrl+Alt+,` 或“文件 → 文档设置…”）新增复选框“把尺寸与背景应用到全部 N 个画板”；单画板时禁用并显示“全部 1 个画板”，两块时可用并显示“全部 2 个画板”。
- 批量：两块 1080×1080 画板勾选后一起改为 1000×700、背景 `#eef4ff`；文档名改为“批量文档”，当前画板名改为“主画板”，第二画板名仍“画板 2”；画板坐标 `[[0,0],[1128,0]]` 不变，矩形锚点 `[[262.2,255.289],[507.67,255.289],[507.67,402.572],[262.2,402.572]]` 前后一致。
- 反馈：应用后 toast“文档设置已同步 2 个画板”，标签页标题同步为“批量文档”，右侧画板列表两行尺寸都变为 1000×700。
- 撤销：一次撤销同时恢复两块画板的 1080×1080、`#ffffff` 与文档名“未命名画板”，内容位置不变。
- 单板：重新打开默认不勾选；把宽度改 800、背景改 `#ffe9d8` 后只当前板变化，第二板仍 1080×1080、`#ffffff`。
- 布局：1920×1500 弹窗 560×564，`cw=sw=559`，批量行 525/525；1200×900 弹窗仍 560 宽，`cw=sw=559`，批量行 525/525，不横向溢出、不截断。
- 测试：`scripts/smoke.document.mts` 36 项 PASS（新增两块画板批量尺寸/背景/画板名/坐标/节点不变、未勾选只改当前板）；其余 16 个冒烟脚本全复跑通过。
- 已知边界：批量只同步尺寸与背景，不批量改画板名、画板位置或缩放内容；不跨文档批量；新尺寸不重排内容。
- 截图：`docs/shots/docs-all-dialog.png`、`docs-all-applied.png`、`docs-all-undo.png`、`docs-all-narrow.png`、`docs-all-window.png`。

## 验收记录（2026-11-26，第三十九批：文档色板 / 全局色 / 专色）

- `npx tsc --noEmit` 通过；`npm run build` 通过：156 modules，`index-4u2hxkyl.js` 525.19 kB / gzip 166.08，`index-BB-PkWTH.css` 61.68 kB / gzip 11.53，`pdf-YDRMVsVs.js` 407.16 kB / gzip 169.22。
- 入口：选中对象后填充/描边区新增“文档”色板行与“管理”按钮；无文档色板时仍显示“管理”。也可以在“窗口 → 文档色板…”打开。弹窗标题“文档色板”，副标题“全局色 / 专色随工程保存；改动同步链接对象”，右上显示 `2 / 64`。
- 新建：输入名称“品牌蓝”、颜色 `#0f76d6`、类型“印刷色”→ 新建；再建“专色橙” `#ff7a00`、类型“专色”。两行都有颜色块、名称、类型下拉、使用数、保存、删除；专色 chip 右下有深色小圆点。
- 链接填充：选中第一块矩形，点文档色板“品牌蓝”，填充变 `#0f76d6` 并写入 `swatch`；属性坞显示“全局链接 · 品牌蓝”，文档行 chip 高亮。第二块同样点“品牌蓝”，记为 2 处。
- 链接描边：选中第二块，在描边区文档行点“专色橙”，描边变 `#ff7a00` 并链接；使用数变 1 处。
- 改色板：打开管理，把“品牌蓝”颜色改为 `#e5484d`，保存后两块矩形填充同步变红、链接保留；弹窗使用数“2 处”，提示“已更新「品牌蓝」”，专色描边不受影响。
- 删除：点“品牌蓝”行删除，剩“专色橙”；两块填充颜色仍 `#e5484d`，但 `swatch` 清空；关闭弹窗后一次撤销恢复品牌蓝与两块链接。
- 布局：1920×1500 空弹窗 519/519；两行后 520×361、`cw=sw=519`，行与新建行（487/487）均无横向溢出；1200×900 仍 520 宽、无溢出、不截断。属性坞色板区可滚动到完整可见，全局链接行、最近、文档、色板四行不重叠。
- 测试：`scripts/smoke.swatches.mts` 62 项 PASS（清洗/上限/新增/改色/改类型/删除/链接/断开/引用计数/导出往返/数组导入/坏文件/合并上限/`.vex` 往返与悬空清理）；其余 17 个冒烟脚本全复跑通过。
- 已知边界：只有实色填充与实色描边能链接色板，渐变、图案、画板底色不链接；专色只是类型标记，按 sRGB 显示，没有分色/油墨通道；导入导出只支持 JSON；导入/导出的原生文件对话框未在 CDP 自动化里点选，核心读写已测。
- 截图：该批截图已按清理惯例删除。

## 验收记录（2026-11-26，第四十批：圆形工具 / 从中心）

- `npx tsc --noEmit` 通过；`npm run build` 通过：157 modules，`index-Dk9Dir8c.js` 527.36 kB / gzip 166.86，`index-BB-PkWTH.css` 61.68 kB / gzip 11.53，`pdf-B0yhJxcO.js` 407.16 kB / gzip 169.22。
- 入口：`⇧L` 进入圆形工具，选项栏左侧 chip 显示“圆形 ⇧L”，随后出现“从中心”开关；工具轨“形状”组椭圆（扁圆）与圆形（正圆）并排，靠图标形状、快捷键与提示区分。
- 默认：关闭“从中心”，从空白处水平拖 32 CSS px，落一个名称“圆形”、4 锚点、闭合的圆，属性坞尺寸 `97.5×97.5`；Shift 斜拖时宽高仍相等，方向吸附 45°。
- 从中心：点开“从中心”后按钮呈选中蓝，同样拖 32 px 得到 `195.1×195.1`，直径是默认模式的 2 倍；圆心在按下点，半径跟指针。
- 两次点击：关闭“从中心”，第一次点击后对象数不变、只留起点；第二次点击才落圆，尺寸 `97.5×97.5`；工具栏撤销后圆消失，前三个圆保留。
- 图层：切到图层面板，3 行都显示“圆形”，选中项高亮，画布四个缩放手柄正常。
- 布局：1600×1000 真实窗口画三个圆，选项栏“圆形 / 从中心 / 网格 / 吸附”同排不换行；1200×900 实际窗口仍不横向溢出，右侧属性面板正常滚动，画板与圆形都在视口内。
- 测试：`scripts/smoke.circle.mts` 19 项 PASS（45° 吸附、中心/直径几何、Shift 保长、三点外接圆、共线返回空、圆路径闭合与锚点）；其余 18 个冒烟脚本全复跑通过。
- 已知边界：只支持拖拽与两次点击定直径，不支持三点圆交互（核心函数已备）；无 Alt 标尺取整、虚线预览、中心十字/半径线/直径标注。
- 截图：该批截图已按清理惯例删除。

## 验收记录（2026-11-26，第四十一批：三点圆拖动 / Alt 直径取整）

- `npx tsc --noEmit` 通过；`npm run build` 通过：157 modules，`index-C13KfgCs.js` 529.29 kB / gzip 167.53，`index-BB-PkWTH.css` 61.68 kB / gzip 11.53，`pdf-D_qrKUB4.js` 407.16 kB / gzip 169.22。
- 标定：33% 视图下 32 CSS px 水平拖动画出 `97.5×97.5` 圆，换算得 3.048 文档单位/CSS px，供三点圆和 Alt 断言使用。
- 三点圆：`⇧L` 后点 `(450,320)` 只挂起；按下 `(550,320)` 拖到 `(520,400)`，移动期间实时重算三点外接圆，释放后落 `346.0×346.0` 圆、4 锚点闭合；圆心落在 `(500,346.875)`，与首点-第三点直径圆的 `324.0` 明显不同。
- 直径回归：直接拖 32 px 仍 `97.5×97.5`；两次点击第一次不落对象、第二次落 `97.5×97.5`；撤销移除该圆；图层面板仍列出“圆形”。
- Alt：水平拖 57 CSS px，原始直径 `173.7` 被取整为 `150.0`（33% 视图下标尺步进 50），仍为正圆；属性坞尺寸 `150 × 150`。
- 共线：再点 `(600,450)` 后从 `(650,450)` 拖到 `(700,450)`，释放不落地对象，已有 3 个圆不变。
- 布局：1600×1000 真实窗口画板、三点圆、属性坞、工具轨同屏无裁切；三条截图均自检画板与选中框在视口内，无横向溢出。
- 测试：`scripts/smoke.circle.mts` 33 项 PASS（三点外接圆、直角三角形、共线/重复点返回空、标尺步进 1/2/5/10/20/50/100、Alt 直径/圆心/保持方向/随缩放）；全部 19 个冒烟脚本复跑通过。
- 已知边界：未做虚线预览、中心十字/半径线/直径标注、`dragThird:false` 的三次点击定圆与 `standardAnchors` 选项。
- 截图：该批截图已按清理惯例删除。

## 验收记录（2026-11-26，第四十二批：Path Precision Tools / Add Inscribed Circle）

- `npx tsc --noEmit` 通过；`npm run build` 通过：158 modules，`index-CEgLpTWi.js` 533.91 kB / gzip 169.02，`index-DApU8VOk.css` 61.88 kB / gzip 11.56，`pdf-E4e-Vh4B.js` 407.16 kB / gzip 169.22。
- 菜单：对象菜单底部新增“插件 · 路径精准工具 ▸”。父项可滚动到可见，点开后在右侧弹二级浮层，标题“插件 · 路径精准工具”，内层只有“添加内切圆”；选中闭合矩形时父子项都可用。
- 菜单入口：画 `426.71×365.75` 矩形，选“添加内切圆”后落 1 个名称“内切圆”的 4 锚点闭合路径，尺寸 `365.645×365.645`，半径 `182.822`；圆心与矩形中心 `(34.357,323.083)` 完全重合；圆在矩形内，toast“已添加 1 个内切圆”。
- 面板入口：`Ctrl+Z` 移除后重选矩形，属性坞“路径效果”2×2 四按钮（偏移路径 / 描边转轮廓 / 平滑 / 内切圆）分两行、组内无溢出；点“内切圆”再落一个同尺寸圆，无截断。
- 选择与撤销：新圆自动选中，属性坞显示“路径 / 内切圆 / 366×366”；文档对象数只 `1→2`；一次 `Ctrl+Z` 回 1 个对象。
- 布局：1600×1000 真实窗口二级菜单在画布上方完整可见，不出右边界；画板、矩形、内切圆、属性坞同屏无裁切。
- 测试：`scripts/smoke.inscribed.mts` 17 项 PASS（方形/直角三角形/L 形/方环、圆心、半径、孔洞、开放路径、极小面积）；全部 20 个冒烟脚本复跑通过。
- 已知边界：曲线边按 0.05 精度折线化，极小误差；只按 nonzero 填充规则，even-odd 尚未映射；极复杂路径受 `maxCells=4096` 限制。
- 截图：该批截图已按清理惯例删除（原 `inscribed-menu.png`、`inscribed-panel.png`、`inscribed-window.png`）。

## 验收记录（2026-11-27，第四十三批：画板裁剪 / 画板外命中 / 渲染提速）

- `npx tsc --noEmit` 通过；`npm run build` 通过：158 modules，`index-QUDTSv4t.js` 535.77 kB / gzip 169.71，`index-DApU8VOk.css` 61.88 kB / gzip 11.56，`pdf-CGW1UTVM.js` 407.16 kB / gzip 169.22。
- 画板裁剪：真实 Tauri 1600×1000 窗口在画板左边界上跨着画一个 `457.19×365.75` 矩形（X `-234.116`），板外整段不再显示，板内保持当前蓝色；选择框、缩放手柄、旋转柄也只画在画板内，不再在灰色粘贴板上留下“半个对象 + 一圈手柄”。
- 像素断言：板外取点 `236,236,240`（粘贴板灰），板内 `15,118,214`（对象蓝）；关闭 `hideOutsideBoards` 后同一板外点恢复为对象色。
- 命中：`V` 下点画板外灰色区域，选项栏“已选 0”；点板内蓝色区域，“已选 1”，隐藏对象不再被误选；再在画板外画一个完全不可见的矩形，用框选圈它，结果仍为“已选 0”，框选不再收集板外对象。
- 手柄：中心落在板外的缩放柄、旋转柄、锚点与渐变/宽度手柄整颗跳过，不再沿板边留下半颗白方块；板内手柄正常显示。
- 背景与性能：粘贴板点阵、画板纸面/阴影、网格改离屏缓存；1500 个视口外节点 × 20 帧，旧路径 `407.4ms`，剔除+背景缓存 `23.3ms`，约 `17.49x`；600 个“视口内但在画板外”节点 × 20 帧从 `199.9ms` 降到 `10.5ms`，板外节点不再先画再裁；对象拖动只贴背景图，缩放/平移/换板/改主题才重建。
- 回归：`scripts/smoke.render.mts` 16 项 PASS（板外裁剪、关闭裁剪、板内保留、板外/板内命中、无画板自由画布、选择手柄裁剪、开关手柄回归、板外节点不参与框选、跨板节点参与框选、无画板框选、剔除前后逐像素一致、背景缓存前后逐像素一致、提速、视口内板外节点跳过、粗描边压边仍显示）；全部 21 个冒烟脚本复跑通过。
- 布局：截图自检画布、工具轨、选项栏、属性坞、底部状态栏无重叠；选项栏 `457 × 366 px` 与属性坞 X/Y/W/H 数值一致；画板左边界与对象交界干净，无锯齿缝隙。
- 已知边界：默认裁剪，暂未做“显示画板外内容”开关；框选尚未排除画板外不可见对象；画板名、空板提示、画板工具手柄和阴影仍画在裁剪外。
- 截图：`docs/shots/clip-board.png`、`clip-select.png`、`clip-marquee.png`、`clip-window.png`。
