import fs from 'node:fs';

const port = process.env.CDP_PORT || '9243';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 内切圆验收超时，强制退出');
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
    await sleep(250);
  };
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1);
    await mouse('mouseReleased', to.x, to.y, 0);
    await sleep(350);
  };
  const readDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let shell = k ? cv[k] : null;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const ids = Object.keys(doc.nodes);
    return {
      count: ids.length,
      nodes: ids.map((id) => {
        const n = doc.nodes[id];
        if (n.kind !== 'path') return { id, kind: n.kind, name: n.name };
        const xs = n.subpaths.flatMap((s) => s.anchors.map((a) => a.x));
        const ys = n.subpaths.flatMap((s) => s.anchors.map((a) => a.y));
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        return {
          id, kind: n.kind, name: n.name,
          anchors: n.subpaths.reduce((a, s) => a + s.anchors.length, 0),
          closed: n.subpaths.every((s) => s.closed),
          fill: n.fill?.color ?? null,
          x: minX, y: minY, w: maxX - minX, h: maxY - minY,
          cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
        };
      }),
    };
  })()`);
  const openObjectMenu = async () => {
    await evaluate(`[...document.querySelectorAll('.menubtn')].find((b) => b.innerText.trim() === '对象')?.click()`);
    await waitFor(`document.querySelector('.menu-pop') !== null`, 5000);
  };
  const readMenu = async () => evaluate(`(() => {
    const sub = document.querySelector('.menu-sub');
    const item = sub ? [...sub.querySelectorAll('.menu-item')].find((b) => b.innerText.includes('添加内切圆')) : null;
    const parent = [...document.querySelectorAll('.menu-item')].find((b) => b.innerText.includes('插件 · 路径精准工具'));
    return { parent: !!parent, parentDisabled: parent ? parent.disabled : null, found: !!item, disabled: item ? item.disabled : null };
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const canvas = await evaluate(`(() => { const r = document.querySelector('.cv-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  console.log('canvas', JSON.stringify(canvas));
  assert(canvas.w > 400 && canvas.h > 300, '画布尺寸可用');

  // 矩形
  await key('R', 82, 'KeyR');
  await drag({ x: 190, y: 230 }, { x: 330, y: 350 });
  await key('V', 86, 'KeyV');
  await clickAt(250, 280);
  let doc = await readDoc();
  const rect = doc.nodes.filter((n) => n.kind === 'path' && n.name !== '内切圆');
  assert(rect.length === 1, '矩形路径落地');
  const r0 = rect[0];
  assert(r0.closed, '矩形是闭合路径');
  console.log('rect', JSON.stringify(r0));

  // 把当前填充改成珊瑚红，让新内切圆与蓝矩形可分辨
  await evaluate(`(() => {
    const input = document.querySelector('.rail-swatch input[type=color]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '#e5484d');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(300);

  // 真实菜单入口
  await openObjectMenu();
  const parentRect = await evaluate(`(() => {
    const p = [...document.querySelectorAll('.menu-item')].find((b) => b.innerText.includes('插件 · 路径精准工具'));
    if (!p) return null;
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  assert(parentRect, '对象菜单含“插件 · 路径精准工具”子菜单');
  await clickAt(parentRect.x + Math.min(120, parentRect.w / 2), parentRect.y + parentRect.h / 2);
  await waitFor(`document.querySelector('.menu-sub') !== null`, 5000);
  const menu = await readMenu();
  assert(menu.parent, '对象菜单含“插件 · 路径精准工具”子菜单');
  assert(menu.parentDisabled === false, '选中闭合路径时插件子菜单可用');
  assert(menu.found, '子菜单含“添加内切圆”');
  assert(menu.disabled === false, '内切圆菜单项可用');
  await shot('inscribed-menu.png');
  const subRect = await evaluate(`(() => {
    const i = document.querySelector('.menu-sub .menu-item');
    if (!i) return null;
    const r = i.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  assert(subRect, '读取“添加内切圆”菜单项位置');
  await clickAt(subRect.x + subRect.w / 2, subRect.y + subRect.h / 2);
  await sleep(500);
  doc = await readDoc();
  const circles = doc.nodes.filter((n) => n.kind === 'path' && n.name === '内切圆');
  assert(circles.length === 1, '菜单入口添加 1 个内切圆');
  const c0 = circles[0];
  console.log('circle', JSON.stringify(c0));
  assert(Math.abs(c0.w - c0.h) < 0.02, '内切圆宽高相等');
  const expectR = Math.min(r0.w, r0.h) / 2 / 1.0003;
  assert(Math.abs(c0.w / 2 - expectR) < 0.5, `半径贴合短边 ${(c0.w / 2).toFixed(3)} ≈ ${expectR.toFixed(3)}`);
  assert(Math.abs(c0.cx - r0.cx) < 0.5 && Math.abs(c0.cy - r0.cy) < 0.5, '圆心落在矩形中心');
  assert(c0.x > r0.x && c0.y > r0.y && c0.x + c0.w < r0.x + r0.w && c0.y + c0.h < r0.y + r0.h, '内切圆完全在矩形内');
  assert(doc.count === 2, '文档只新增一个对象');
  assert(c0.fill === '#e5484d', '内切圆沿用当前填充珊瑚红');
  assert(r0.fill === '#0f76d6', '原矩形填充保持蓝色');

  // 撤销
  await key('z', 90, 'KeyZ', 2);
  doc = await readDoc();
  assert(doc.nodes.filter((n) => n.kind === 'path' && n.name === '内切圆').length === 0, '一次撤销移除内切圆');

  // 面板按钮入口
  await clickAt(200, 240);
  await sleep(300);
  const panel = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.panel-btn')].find((b) => b.innerText.trim() === '内切圆');
    if (!btn) return { found: false };
    btn.click();
    return { found: true };
  })()`);
  assert(panel.found, '路径效果面板含“内切圆”按钮');
  await sleep(500);
  doc = await readDoc();
  const c1 = doc.nodes.find((n) => n.kind === 'path' && n.name === '内切圆');
  assert(!!c1, '面板入口添加内切圆');
  assert(Math.abs(c1.w / 2 - expectR) < 0.5, '面板入口半径一致');
  await shot('inscribed-panel.png');

  clearTimeout(watchdog);
  ws.close();
  console.log('\n内切圆菜单 / 面板入口验收通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
