import fs from 'node:fs';

const port = process.env.CDP_PORT || '9243';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 三点圆验收超时，强制退出');
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
  const waitFor = async (expression, timeout = 15000) => {
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
    await sleep(180);
  };
  const mouse = async (type, x, y, buttons = 0, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0, modifiers });
    await sleep(80);
  };
  const clickAt = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, 1);
    await mouse('mouseReleased', x, y);
    await sleep(300);
  };
  const drag = async (from, to, modifiers = 0) => {
    await mouse('mouseMoved', from.x, from.y, 0, modifiers);
    await mouse('mousePressed', from.x, from.y, 1, modifiers);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1, modifiers);
    await mouse('mouseReleased', to.x, to.y, 0, modifiers);
    await sleep(350);
  };
  const readDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const pathIds = Object.keys(doc.nodes).filter((id) => doc.nodes[id]?.kind === 'path');
    return {
      pathIds,
      paths: pathIds.map((id) => {
        const n = doc.nodes[id];
        const xs = n.subpaths.flatMap((s) => s.anchors.map((a) => a.x));
        const ys = n.subpaths.flatMap((s) => s.anchors.map((a) => a.y));
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return {
          id, name: n.name, anchors: n.subpaths.reduce((a, s) => a + s.anchors.length, 0),
          closed: n.subpaths.every((s) => s.closed),
          x: Math.min(minX, maxX), y: Math.min(minY, maxY),
          w: Math.abs(maxX - minX), h: Math.abs(maxY - minY),
          cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
        };
      }),
    };
  })()`);
  const rulerStep = (zoom) => {
    if (zoom >= 8) return 1;
    if (zoom >= 4) return 2;
    if (zoom >= 2) return 5;
    if (zoom >= 1) return 10;
    if (zoom >= 0.5) return 20;
    if (zoom >= 0.25) return 50;
    return 100;
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  await key('L', 76, 'KeyL', 8);
  const hasOpt = await evaluate(`(() => [...document.querySelectorAll('.opt-toggle')].some((b) => b.innerText.trim() === '从中心'))()`);
  assert(hasOpt, '圆形工具选项栏可用');

  // 标定：32 CSS px 水平拖动，得到文档单位与屏幕的换算
  await drag({ x: 400, y: 300 }, { x: 432, y: 300 });
  let doc = await readDoc();
  assert(doc.pathIds.length === 1, '标定圆落地');
  const cal = doc.paths[0];
  const scale = cal.w / 32;
  const zoom = 1 / scale;
  assert(cal.w > 0, `标定比例 ${scale.toFixed(3)} 文档单位/CSS px`);

  // 单击首点，第二次按下后拖到第三点：三点外接圆
  await clickAt(450, 320);
  doc = await readDoc();
  assert(doc.pathIds.length === 1, '第一点只挂起，不落地对象');
  await drag({ x: 550, y: 320 }, { x: 520, y: 400 });
  doc = await readDoc();
  assert(doc.pathIds.length === 2, '第二次拖动后落地三点圆');
  const three = doc.paths[1];
  const rCss = Math.hypot(50, 26.875);
  const expectedW = 2 * rCss * scale;
  const diameterW = Math.hypot(70, 80) * scale;
  console.log('three-point circle', JSON.stringify(three), 'expectedW', expectedW.toFixed(3), 'diameterW', diameterW.toFixed(3));
  assert(Math.abs(three.w - three.h) < 0.01, '三点圆宽高相等');
  assert(Math.abs(three.w - expectedW) < 2 * scale, '三点圆半径符合外接圆');
  assert(Math.abs(three.w - diameterW) > 2 * scale, '三点圆区别于首点-第三点直径圆');
  const offX = cal.cx - 416 * scale;
  const offY = cal.cy - 300 * scale;
  assert(Math.abs(three.cx - (offX + 500 * scale)) < 2 * scale, '三点圆圆心 x 正确');
  assert(Math.abs(three.cy - (offY + 346.875 * scale)) < 2 * scale, '三点圆圆心 y 正确');
  await shot('circle-three.png');

  // Alt：直径取整到当前标尺刻度
  await drag({ x: 500, y: 500 }, { x: 557, y: 500 }, 1);
  doc = await readDoc();
  assert(doc.pathIds.length === 3, 'Alt 拖动落地第三个圆');
  const alt = doc.paths[2];
  const step = rulerStep(zoom);
  const raw = 57 * scale;
  const expected = Math.max(step, Math.round(raw / step) * step);
  console.log('alt circle', JSON.stringify(alt), 'step', step, 'raw', raw.toFixed(3), 'expected', expected);
  assert(Math.abs(alt.w - expected) < 0.8, 'Alt 直径取整到标尺刻度');
  assert(Math.abs(alt.w - alt.h) < 0.01, 'Alt 圆宽高相等');
  await shot('circle-alt.png');

  // 三点共线：释放后不落对象
  await clickAt(600, 450);
  await drag({ x: 650, y: 450 }, { x: 700, y: 450 });
  doc = await readDoc();
  assert(doc.pathIds.length === 3, '三点共线不落地对象');

  clearTimeout(watchdog);
  ws.close();
  console.log('\n三点圆与 Alt 取整验收通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
