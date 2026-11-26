import fs from 'node:fs';

const port = process.env.CDP_PORT || '9237';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 150000);
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
  const waitFor = async (expression, timeout = 20000) => {
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
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`断言失败：${msg}`);
    console.log('PASS', msg);
  };
  const key = async (keyName, vk, code, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await sleep(140);
  };
  const mouse = async (type, x, y, buttons = 0, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0, modifiers });
    await sleep(90);
  };
  const clickAt = async (x, y, modifiers = 0) => {
    await mouse('mouseMoved', x, y, 0, modifiers);
    await mouse('mousePressed', x, y, 1, modifiers);
    await mouse('mouseReleased', x, y, 0, modifiers);
    await sleep(320);
  };
  const drag = async (from, to, modifiers = 0, midShot = null) => {
    await mouse('mouseMoved', from.x, from.y, 0, modifiers);
    await mouse('mousePressed', from.x, from.y, 1, modifiers);
    for (let i = 1; i <= 8; i++) {
      await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1, modifiers);
      if (midShot && i === 8) {
        await sleep(300);
        await shot(midShot);
      }
    }
    await mouse('mouseReleased', to.x, to.y, 0, modifiers);
    await sleep(450);
  };
  const readUI = () => evaluate(`(() => {
    const dock = document.querySelector('.ed-dock');
    const bar = document.querySelector('.ed-optbar');
    const hint = document.querySelector('.opt-hint');
    const r = bar?.getBoundingClientRect();
    const hr = hint?.getBoundingClientRect();
    return {
      toast: document.querySelector('.toast')?.innerText.trim() ?? '',
      hint: hint?.innerText.trim() ?? '',
      hintLayout: hint ? { cw: hint.clientWidth, sw: hint.scrollWidth, x: Math.round(hr.x), right: Math.round(hr.right) } : null,
      selCount: document.querySelector('.opt-sel-count')?.innerText.trim() ?? null,
      bar: bar ? { cw: bar.clientWidth, sw: bar.scrollWidth, right: Math.round(r.right) } : null,
      dock: dock ? { right: Math.round(dock.getBoundingClientRect().right) } : null,
    };
  })()`);
  const readDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    let canvas = f;
    while (canvas && !(canvas.memoizedProps && canvas.memoizedProps.view)) canvas = canvas.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const ids = Object.keys(doc.nodes).filter((id) => doc.nodes[id]?.kind === 'path');
    return {
      root: doc.root,
      ids,
      selected: shell?.memoizedProps?.initialDoc ? null : null,
      view: canvas?.memoizedProps?.view ?? null,
      paths: ids.map((id) => ({
        id,
        closed: doc.nodes[id].subpaths[0]?.closed ?? null,
        anchors: (doc.nodes[id].subpaths[0]?.anchors ?? []).map((a) => [Math.round(a.x * 1000) / 1000, Math.round(a.y * 1000) / 1000]),
      })),
    };
  })()`);
  const readRect = () => evaluate(`(() => { const r = document.querySelector('.cv-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const undo = async () => {
    await evaluate(`document.querySelector('button[title="撤销"]').click()`);
    await sleep(500);
  };
  const near = (a, b, eps = 0.35) => Math.abs(a - b) <= eps;
  const toScreen = (view, rect, p) => ({
    x: rect.x + p.x * view.zoom + view.panX,
    y: rect.y + p.y * view.zoom + view.panY,
  });

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const rect = await readRect();
  console.log('canvas', JSON.stringify(rect));
  await key('r', 82, 'KeyR');
  await drag({ x: 350, y: 350 }, { x: 600, y: 520 });
  await key('v', 86, 'KeyV');
  await clickAt(470, 435);
  await sleep(400);
  let ui = await readUI();
  let doc = await readDoc();
  assert(doc.paths.length === 1, '矩形已创建为一条路径');
  assert(ui.hint.includes('拖动框选'), '选择工具提示正常');
  const before = doc.paths[0].anchors;
  const beforeBox = {
    x: Math.min(...before.map((a) => a[0])),
    y: Math.min(...before.map((a) => a[1])),
    w: Math.max(...before.map((a) => a[0])) - Math.min(...before.map((a) => a[0])),
    h: Math.max(...before.map((a) => a[1])) - Math.min(...before.map((a) => a[1])),
  };
  console.log('before', JSON.stringify({ before, beforeBox, view: doc.view }));
  const view = doc.view;

  await key('a', 65, 'KeyA');
  await sleep(300);
  ui = await readUI();
  assert(ui.hint.includes('拖框选锚点'), '直接选择提示改为框选锚点');

  // 框选上面两个锚点：从路径外左上拖到顶边下方
  const topStart = toScreen(view, rect, { x: beforeBox.x - 18, y: beforeBox.y - 18 });
  const topEnd = toScreen(view, rect, { x: beforeBox.x + beforeBox.w + 18, y: beforeBox.y + 24 });
  await drag(topStart, topEnd, 0, 'marquee-drag.png');
  ui = await readUI();
  assert(ui.hint.startsWith('锚点 2'), '框选到 2 个锚点');
  assert(ui.hint.includes('Delete 删点'), '锚点提示带 Delete');
  await shot('marquee-anchors.png');

  // Delete 两个锚点：矩形保留为 2 锚点闭合路径
  await key('Delete', 46, 'Delete');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已删除 2 个锚点') === true`, 8000);
  doc = await readDoc();
  ui = await readUI();
  console.log('after delete 2', JSON.stringify({ anchors: doc.paths[0]?.anchors, toast: ui.toast, hint: ui.hint }));
  assert(doc.paths.length === 1, '删 2 个锚点后路径节点仍在');
  assert(doc.paths[0].anchors.length === 2, '路径只剩 2 个锚点');
  assert(doc.paths[0].closed === true, '闭合状态保留');
  assert(ui.toast.includes('已删除 2 个锚点'), '删除锚点提示数量');
  assert(ui.hint.includes('拖框选锚点'), '删除后锚点选择清空');
  await shot('marquee-deleted.png');

  await undo();
  doc = await readDoc();
  assert(doc.paths[0].anchors.length === 4, '撤销恢复 4 个锚点');
  assert(doc.paths[0].anchors.every((a, i) => near(a[0], before[i][0], 0.01) && near(a[1], before[i][1], 0.01)), '撤销恢复原坐标');
  await sleep(2200);
  await shot('marquee-undo.png');

  // Shift 框选：先上二，再 Shift 下二，凑满 4 个
  await drag(topStart, topEnd, 0);
  await sleep(250);
  const bottomStart = toScreen(view, rect, { x: beforeBox.x - 18, y: beforeBox.y + beforeBox.h + 18 });
  const bottomEnd = toScreen(view, rect, { x: beforeBox.x + beforeBox.w + 18, y: beforeBox.y + beforeBox.h - 24 });
  await drag(bottomStart, bottomEnd, 8);
  ui = await readUI();
  assert(ui.hint.startsWith('锚点 4'), 'Shift 框选累加到 4 个锚点');
  await shot('marquee-shift.png');

  // 全删：节点与路径消失
  await key('Delete', 46, 'Delete');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已删除 4 个锚点') === true`, 8000);
  doc = await readDoc();
  ui = await readUI();
  console.log('after delete all', JSON.stringify({ paths: doc.paths, root: doc.root, toast: ui.toast, hint: ui.hint }));
  assert(doc.paths.length === 0, '删光锚点后路径节点删除');
  assert(ui.toast.includes('已删除 4 个锚点'), '全删提示 4 个锚点');
  await undo();
  doc = await readDoc();
  assert(doc.paths.length === 1 && doc.paths[0].anchors.length === 4, '撤销恢复整条路径');

  // 恢复选中对象，重新选上面两个锚点做 1200 宽检查
  await key('v', 86, 'KeyV');
  await clickAt(470, 435);
  await sleep(300);
  await key('a', 65, 'KeyA');
  await drag(topStart, topEnd, 0);
  ui = await readUI();
  assert(ui.hint.startsWith('锚点 2'), '窄屏前重新选中 2 个锚点');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const narrow = await readUI();
  console.log('narrow', JSON.stringify(narrow));
  assert(!narrow.bar || narrow.bar.sw <= narrow.bar.cw + 1, '1200 宽选项栏无横向溢出');
  assert(!narrow.hintLayout || narrow.hintLayout.sw <= narrow.hintLayout.cw + 1, '1200 宽锚点提示不截断');
  await shot('marquee-narrow.png');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
