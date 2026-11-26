import fs from 'node:fs';

const port = process.env.CDP_PORT || '9243';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 画板裁剪验收超时，强制退出');
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
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`断言失败：${msg}`);
    console.log('PASS', msg);
  };
  const key = async (keyName, vk, code, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await sleep(200);
  };
  const mouse = async (type, x, y, buttons = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
    await sleep(70);
  };
  const clickAt = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, 1);
    await mouse('mouseReleased', x, y);
    await sleep(300);
  };
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1);
    await mouse('mouseReleased', to.x, to.y, 0);
    await sleep(400);
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
      board: doc.artboards[0],
      nodes: paths.map((n) => {
        const xs = n.subpaths.flatMap((s) => s.anchors.map((a) => a.x));
        const ys = n.subpaths.flatMap((s) => s.anchors.map((a) => a.y));
        return { id: n.id, name: n.name, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }),
    };
  })()`);
  const pixelAt = (x, y) => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const r = cv.getBoundingClientRect();
    const dpr = cv.width / r.width;
    const d = cv.getContext('2d').getImageData(Math.round(${x} * dpr), Math.round(${y} * dpr), 1, 1).data;
    return Array.from(d);
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  // 从画布像素找画板左边界（白色连续段）
  const geom = await evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const r = cv.getBoundingClientRect();
    const ctx = cv.getContext('2d');
    const dpr = cv.width / r.width;
    const y = Math.round(200 * dpr);
    let left = -1, run = 0;
    for (let x = 0; x < cv.width; x++) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      const white = d[0] > 248 && d[1] > 248 && d[2] > 248;
      run = white ? run + 1 : 0;
      if (run >= 10) { left = (x - run + 1) / dpr; break; }
    }
    return { x: r.x, y: r.y, w: r.width, h: r.height, boardLeft: left };
  })()`);
  console.log('canvas', JSON.stringify(geom));
  assert(geom.boardLeft > 100, '扫描到画板左边界');

  const edge = geom.x + geom.boardLeft;
  const y0 = geom.y + 260;
  const y1 = geom.y + 380;

  // 矩形从画板外跨到画板内
  await key('R', 82, 'KeyR');
  await drag({ x: edge - 80, y: y0 }, { x: edge + 70, y: y1 });
  await key('V', 86, 'KeyV');
  await sleep(300);
  const doc = await readDoc();
  const rect = doc.nodes.find((n) => n.name === '矩形');
  assert(!!rect, '跨边界矩形落地');
  const screenLeft = edge;
  const outsideDocX = doc.board.x - 20;
  const insideDocX = doc.board.x + 20;
  console.log('rect', JSON.stringify(rect), 'board', JSON.stringify(doc.board));

  // 用文档坐标换算屏幕点：x_screen = canvas.x + (docX - board.x)*scale + boardLeft
  const scale = (rect.w) / 150; // 拖拽 150 CSS px 等于矩形宽
  const outX = screenLeft + (outsideDocX - doc.board.x) * scale;
  const inX = screenLeft + (insideDocX - doc.board.x) * scale;
  const midY = (y0 + y1) / 2 - geom.y;

  const outsidePx = await pixelAt(outX - geom.x, midY);
  const insidePx = await pixelAt(inX - geom.x, midY);
  console.log('outside', outsidePx.join(','), 'inside', insidePx.join(','));
  assert(!(outsidePx[2] > 170 && outsidePx[0] < 100), '画板外不显示矩形');
  assert(insidePx[2] > 170 && insidePx[0] < 100, '画板内保留矩形');
  await shot('clip-board.png');

  // 画板外点击不应命中隐藏矩形
  await clickAt(outX, geom.y + midY);
  let count = await evaluate(`Number(document.querySelector('.opt-sel-count')?.innerText || 0)`);
  assert(count === 0, '画板外点击不选中隐藏对象');
  await clickAt(inX, geom.y + midY);
  count = await evaluate(`Number(document.querySelector('.opt-sel-count')?.innerText || 0)`);
  assert(count === 1, '画板内点击正常选中');
  await shot('clip-select.png');

  // 画板外再画一个完全不可见的矩形，框选不应把它收进来
  await clickAt(outX, geom.y + midY);
  await key('R', 82, 'KeyR');
  await drag({ x: edge - 155, y: y0 }, { x: edge - 115, y: y1 });
  await key('V', 86, 'KeyV');
  await sleep(300);
  await drag({ x: edge - 162, y: y0 - 20 }, { x: edge - 95, y: y1 + 20 });
  count = await evaluate(`Number(document.querySelector('.opt-sel-count')?.innerText || 0)`);
  assert(count === 0, '框选不收集画板外不可见对象');
  await shot('clip-marquee.png');

  clearTimeout(watchdog);
  ws.close();
  console.log('\n画板裁剪与命中断言通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
