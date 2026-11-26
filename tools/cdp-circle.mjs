import fs from 'node:fs';

const port = process.env.CDP_PORT || '9240';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const narrow = process.env.NARROW === '1';

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
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
      seq: doc.seq,
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
  const readCircleOpt = () => evaluate(`(() => {
    const btn = [...document.querySelectorAll('.opt-toggle')].find((b) => b.innerText.trim() === '从中心');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return {
      pressed: btn.getAttribute('aria-pressed'), text: btn.innerText.trim(),
      w: Math.round(r.width), visible: r.width > 0 && r.height > 0,
    };
  })()`);
  const clickCenterToggle = async () => {
    const ok = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('.opt-toggle')].find((b) => b.innerText.trim() === '从中心');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert(ok, '点“从中心”开关');
    await sleep(250);
  };
  const undo = async () => {
    await evaluate(`document.querySelector('button[title="撤销"]').click()`);
    await sleep(700);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  // Shift+L：圆形工具
  await key('L', 76, 'KeyL', 8);
  let opt = await readCircleOpt();
  assert(opt !== null && opt.visible, '圆形工具显示“从中心”开关');
  assert(opt.pressed === 'false', '“从中心”默认关闭');

  if (narrow) {
    await drag({ x: 350, y: 350 }, { x: 382, y: 350 });
    const overflow = await evaluate(`(() => {
      const b = document.querySelector('.opt-shape') ?? document.querySelector('.optbar');
      return { body: document.body.scrollWidth > document.body.clientWidth + 1, opt: b ? b.scrollWidth > b.clientWidth + 1 : false };
    })()`);
    assert(!overflow.body && !overflow.opt, '1200×900 选项栏无横向溢出');
    await shot('circle-narrow.png');
    clearTimeout(watchdog);
    ws.close();
    console.log('\n圆形工具窄窗口验收通过');
    return;
  }

  const toolLabel = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.tool-btn')].find((b) => b.getAttribute('aria-label')?.startsWith('圆形'));
    return btn?.getAttribute('aria-label') ?? '';
  })()`);
  assert(toolLabel.includes('⇧L'), '工具轨出现圆形（⇧L）');

  // 默认：两点定直径，水平 32px（约 100 文档单位）
  await drag({ x: 400, y: 350 }, { x: 432, y: 350 });
  let doc = await readDoc();
  assert(doc.pathIds.length === 1, '默认拖动画出一个圆');
  const c1 = doc.paths[0];
  console.log('diameter circle', JSON.stringify(c1));
  assert(c1.name === '圆形' && c1.anchors === 4 && c1.closed, '圆形是闭合四段路径');
  assert(Math.abs(c1.w - c1.h) < 0.01, '默认圆形宽高相等');
  assert(c1.w > 0, '圆形有半径');

  // 开“从中心”：同样 32px 拖动，半径翻倍
  await clickCenterToggle();
  opt = await readCircleOpt();
  assert(opt.pressed === 'true', '“从中心”打开');
  await drag({ x: 500, y: 350 }, { x: 532, y: 350 });
  doc = await readDoc();
  assert(doc.pathIds.length === 2, '从中心再画一个圆');
  const c2 = doc.paths[1];
  console.log('center circle', JSON.stringify(c2));
  assert(Math.abs(c2.w - c2.h) < 0.01, '从中心圆宽高相等');
  assert(Math.abs(c2.w / c1.w - 2) < 0.02, '从中心同距离半径是直径模式的两倍');

  // Shift 45°：从中心斜向拖动，宽高应相等
  await drag({ x: 450, y: 500 }, { x: 474, y: 516 }, 8);
  await sleep(250);
  doc = await readDoc();
  assert(doc.pathIds.length === 3, 'Shift 拖动画出第三个圆');
  const c3 = doc.paths[2];
  console.log('shift circle', JSON.stringify(c3));
  assert(Math.abs(c3.w - c3.h) < 0.01, 'Shift 把方向吸附到 45°，圆形仍为正圆');
  await shot('circle-center.png');

  // 关“从中心”，两次点击定直径
  await clickCenterToggle();
  await clickAt(600, 500);
  await sleep(200);
  doc = await readDoc();
  assert(doc.pathIds.length === 3, '第一次点击不落地对象');
  await clickAt(632, 500);
  doc = await readDoc();
  assert(doc.pathIds.length === 4, '第二次点击才落地圆');
  const c4 = doc.paths[3];
  console.log('click circle', JSON.stringify(c4));
  assert(Math.abs(c4.w - c4.h) < 0.01, '两次点击圆宽高相等');
  assert(c4.w > 0, '两次点击圆有半径');

  // 撤销最后一个，保留前三个
  await undo();
  doc = await readDoc();
  assert(doc.pathIds.length === 3, '撤销移除两次点击圆');

  // 选中最后一个圆，确认名称在图层里
  await key('v', 86, 'KeyV');
  await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.dock-tab')].find((b) => b.innerText.trim() === '图层');
    tab?.click();
    return !!tab;
  })()`);
  await sleep(600);
  await clickAt(450, 500);
  await sleep(300);
  await waitFor(`document.querySelectorAll('.layer-row').length > 0`, 6000);
  const layerName = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.layer-row')];
    return rows.map((r) => r.querySelector('.layer-name')?.innerText.trim() ?? '').find((t) => t.includes('圆形')) ?? '';
  })()`);
  assert(layerName.includes('圆形'), '图层面板列出圆形');
  await sleep(900);
  await shot('circle-tool.png');

  clearTimeout(watchdog);
  ws.close();
  console.log('\n圆形工具验收全部通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
