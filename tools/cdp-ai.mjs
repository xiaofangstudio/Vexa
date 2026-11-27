import fs from 'node:fs';

const port = process.env.CDP_PORT || '9243';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP AI 面板验收超时，强制退出');
    process.exit(2);
  }, 180000);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|localhost|127\.0\.0\.1/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Vexa 页面');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result?.value;
  };
  const waitFor = async (expression, timeout = 12000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression)) return true;
      await sleep(250);
    }
    throw new Error(`等待超时：${expression}`);
  };
  const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(outDir, { recursive: true });
    const path = `${outDir}\\${name}`;
    fs.writeFileSync(path, Buffer.from(res.data, 'base64'));
    console.log('screenshot', path, fs.statSync(path).size);
  };
  const assert = (cond, msg, extra = '') => {
    if (!cond) throw new Error(`断言失败：${msg}${extra ? ' · ' + extra : ''}`);
    console.log('PASS', msg + (extra ? ' · ' + extra : ''));
  };
  const key = async (keyName, vk, code, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await sleep(200);
  };

  const readDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let shell = k ? cv[k] : null;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const paths = Object.values(doc.nodes).filter((n) => n.kind === 'path');
    return {
      roots: doc.root.length,
      groups: Object.values(doc.nodes).filter((n) => n.kind === 'group').map((n) => ({ id: n.id, name: n.name, kids: n.children.length })),
      paths: paths.map((n) => {
        const xs = n.subpaths.flatMap((s) => s.anchors.map((a) => a.x));
        const ys = n.subpaths.flatMap((s) => s.anchors.map((a) => a.y));
        return { id: n.id, name: n.name, fill: n.fill.kind === 'solid' ? n.fill.color : n.fill.kind, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }),
      texts: Object.values(doc.nodes).filter((n) => n.kind === 'text').map((n) => ({ id: n.id, text: n.text, fill: n.fill.kind === 'solid' ? n.fill.color : n.fill.kind })),
    };
  })()`);

  const setInput = (value) => evaluate(`(() => {
    const ta = document.querySelector('.ai-input');
    if (!ta) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(value)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    return true;
  })()`);

  const sendByClick = async (text) => {
    await setInput(text);
    await sleep(150);
    await evaluate(`document.querySelector('.ai-send').click()`);
    await sleep(250);
    await waitFor(`!document.querySelector('.ai-typing')`, 8000);
    await sleep(350);
  };

  const sendByCtrlEnter = async (text) => {
    await setInput(text);
    await sleep(150);
    await key('Enter', 13, 'Enter', 2);
    await sleep(250);
    await waitFor(`!document.querySelector('.ai-typing')`, 8000);
    await sleep(350);
  };

  const lastAi = () => evaluate(`(() => {
    const nodes = [...document.querySelectorAll('.ai-msg.ai .ai-msg-text')];
    return nodes.length ? nodes[nodes.length - 1].textContent : '';
  })()`);
  const ctxText = () => evaluate(`document.querySelector('.ai-ctx')?.textContent ?? ''`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  // 打开 AI 页签
  const tabLabels = await evaluate(`[...document.querySelectorAll('.dock-tab')].map((b) => b.textContent.trim())`);
  assert(tabLabels.length === 3 && tabLabels[2].includes('AI'), '右侧 Dock 有 AI 页签', JSON.stringify(tabLabels));
  await evaluate(`document.querySelectorAll('.dock-tab')[2].click()`);
  await waitFor(`document.querySelectorAll('.ai-panel').length > 0`, 8000);
  await sleep(300);
  assert(await evaluate(`document.querySelectorAll('.ai-chip').length >= 4`), 'AI 面板有快捷示例');
  const overflow = await evaluate(`(() => { const el = document.querySelector('.ai-panel'); return { sw: el.scrollWidth, cw: el.clientWidth }; })()`);
  assert(overflow.sw <= overflow.cw + 1, 'AI 面板无横向溢出', JSON.stringify(overflow));
  await shot('ai-panel.png');

  // 生成：按钮发送
  await sendByClick('画一个 300x200 的红色圆角矩形');
  const d1 = await readDoc();
  assert(d1 && d1.roots === 1, '画布只新增一个根层', String(d1?.roots));
  const p1 = d1.paths[0];
  assert(p1 && Math.abs(p1.w - 300) < 1 && Math.abs(p1.h - 200) < 1, '矩形 300×200', p1 ? `${p1.w}×${p1.h}` : 'null');
  assert(p1 && p1.fill === '#e5484d', '矩形填充红色', p1?.fill ?? 'null');
  assert((await ctxText()).includes('已选 1'), '生成后自动选中', await ctxText());
  assert((await lastAi()).includes('已在画板上生成'), 'AI 回话已生成');
  await shot('ai-rect.png');

  // 改色：Ctrl+Enter 发送
  await sendByCtrlEnter('改成蓝色');
  const d2 = await readDoc();
  assert(d2.paths[0]?.fill === '#0f76d6', 'Ctrl+Enter 改色为蓝', d2.paths[0]?.fill ?? 'null');
  assert((await lastAi()).includes('改成蓝色'), '改色回话', await lastAi());

  // 移动 + 撤销
  const x0 = d2.paths[0].x;
  await sendByClick('右移 100');
  const d3 = await readDoc();
  assert(Math.abs(d3.paths[0].x - (x0 + 100)) < 0.5, '右移 100 生效', `${x0} → ${d3.paths[0].x}`);
  await sendByClick('撤销');
  const d4 = await readDoc();
  assert(Math.abs(d4.paths[0].x - x0) < 0.5, '撤销移动', `${d3.paths[0].x} → ${d4.paths[0].x}`);

  // 生成卡片
  await sendByClick('生成卡片');
  const d5 = await readDoc();
  const card = d5.groups.find((g) => g.name === 'AI 卡片');
  assert(!!card, '画布出现 AI 卡片组', JSON.stringify(d5.groups));
  assert(card && card.kids >= 5, '卡片至少 5 个子层', String(card?.kids));
  assert((await ctxText()).includes('已选 1'), '卡片生成后选中', await ctxText());
  assert((await lastAi()).includes('卡片'), '卡片回话', await lastAi());
  await shot('ai-card.png');

  // 取消选择后改色应提示先选中
  await sendByClick('取消选择');
  await sendByClick('改成红色');
  assert((await lastAi()).includes('先选中'), '无选中时改色给提示', await lastAi());
  assert((await ctxText()).includes('已选 0'), '取消选择生效', await ctxText());

  // 最终状态截图
  await evaluate(`document.querySelectorAll('.dock-tab')[1].click()`);
  await sleep(500);
  const layerCount = await evaluate(`document.querySelectorAll('.layer-list > li').length`);
  assert(layerCount >= 2, '图层面板可见新增层', String(layerCount));
  await evaluate(`document.querySelectorAll('.dock-tab')[2].click()`);
  await sleep(400);
  await shot('ai-final.png');

  // 菜单入口：窗口 → 打开 AI 助手
  await evaluate(`document.querySelectorAll('.dock-tab')[0].click()`);
  await sleep(300);
  await evaluate(`[...document.querySelectorAll('.menubtn')].find((b) => b.textContent.trim() === '窗口').click()`);
  await waitFor(`document.querySelectorAll('.menu-pop').length > 0`, 6000);
  const hasAiMenu = await evaluate(`[...document.querySelectorAll('.menu-item-label')].some((el) => el.textContent.trim() === '打开 AI 助手')`);
  assert(hasAiMenu, '窗口菜单有 AI 助手入口');
  await evaluate(`(() => { const item = [...document.querySelectorAll('.menu-item')].find((el) => el.textContent.includes('打开 AI 助手')); item?.click(); return !!item; })()`);
  await waitFor(`document.querySelector('.dock-tab.is-on')?.textContent.includes('AI')`, 6000);
  await sleep(300);
  assert(!(await evaluate(`document.querySelectorAll('.menu-pop').length`)), '点击菜单后菜单关闭');
  console.log('AI 面板验收全部通过');
  clearTimeout(watchdog);
  ws.close();
}

main().catch((err) => {
  console.error('FAIL', err.message);
  process.exit(1);
});
