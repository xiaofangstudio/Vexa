import fs from 'node:fs';

const port = process.env.CDP_PORT || '9236';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 120000);
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
    await sleep(300);
  };
  const drag = async (from, to, modifiers = 0) => {
    await mouse('mouseMoved', from.x, from.y, 0, modifiers);
    await mouse('mousePressed', from.x, from.y, 1, modifiers);
    for (let i = 1; i <= 6; i++) {
      await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6, 1, modifiers);
    }
    await mouse('mouseReleased', to.x, to.y, 0, modifiers);
    await sleep(400);
  };
  const readUI = () => evaluate(`(() => {
    const dock = document.querySelector('.ed-dock');
    const skewBtn = document.querySelector('.skew-apply');
    const x = document.querySelector('input[aria-label="斜切 X 角度"]');
    const y = document.querySelector('input[aria-label="斜切 Y 角度"]');
    const r = skewBtn?.getBoundingClientRect();
    const dr = dock?.getBoundingClientRect();
    return {
      toast: document.querySelector('.toast')?.innerText.trim() ?? '',
      selCount: document.querySelector('.opt-sel-count')?.innerText.trim() ?? null,
      hasSkewButton: !!skewBtn,
      skewDisabled: !!skewBtn?.disabled,
      skewValues: [x?.value ?? null, y?.value ?? null],
      layout: {
        dock: dock ? { cw: dock.clientWidth, sw: dock.scrollWidth, ch: dock.clientHeight, sh: dock.scrollHeight, x: Math.round(dr.x), right: Math.round(dr.right) } : null,
        btn: r ? { w: Math.round(r.width), x: Math.round(r.x), right: Math.round(r.right) } : null,
        inputs: [x, y].map((el) => {
          const b = el?.getBoundingClientRect();
          return b ? { w: Math.round(b.width), x: Math.round(b.x), right: Math.round(b.right) } : null;
        }),
      },
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
      ids,
      view: canvas?.memoizedProps?.view ?? null,
      paths: ids.map((id) => ({
        id,
        anchors: doc.nodes[id].subpaths[0].anchors.map((a) => [Math.round(a.x * 1000) / 1000, Math.round(a.y * 1000) / 1000]),
      })),
    };
  })()`);
  const readUndoLen = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = cv && Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    while (f && !(f.memoizedProps && f.memoizedProps.initialDoc)) f = f.return;
    if (!f) return null;
    const arrays = [];
    let h = f.memoizedState;
    let i = 0;
    while (h && i < 40) {
      const v = h.memoizedState;
      if (v && Array.isArray(v.current)) arrays.push(v.current.length);
      h = h.next;
      i++;
    }
    return arrays.length ? arrays[0] : null;
  })()`);
  const readRect = () => evaluate(`(() => { const r = document.querySelector('.cv-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const setInput = async (label, value) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector('input[aria-label="${label}"]');
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert(ok === true, `填入 ${label}=${value}`);
    await sleep(200);
  };
  const clickSkew = async () => {
    const ok = await evaluate(`(() => {
      const b = document.querySelector('.skew-apply');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    })()`);
    assert(ok === true, '点击“应用斜切”');
    await sleep(450);
  };
  const undo = async () => {
    await evaluate(`document.querySelector('button[title="撤销"]').click()`);
    await sleep(500);
  };
  const near = (a, b, eps = 0.35) => Math.abs(a - b) <= eps;
  const bounds = (anchors) => {
    const xs = anchors.map((a) => a[0]);
    const ys = anchors.map((a) => a[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const rect = await readRect();
  console.log('canvas', JSON.stringify(rect));
  await key('r', 82, 'KeyR');
  await drag({ x: 350, y: 350 }, { x: 550, y: 500 });
  await key('v', 86, 'KeyV');
  await clickAt(450, 425);
  await sleep(500);
  let ui = await readUI();
  let doc = await readDoc();
  assert(doc.paths.length === 1, '矩形已创建为一条路径');
  let before = doc.paths[0].anchors;
  const beforeBox = bounds(before);
  console.log('before', JSON.stringify({ before, beforeBox, view: doc.view }), JSON.stringify(ui));
  assert(ui.hasSkewButton && !ui.skewDisabled, '选中路径后斜切面板可用');
  assert(ui.layout.inputs.every((i) => i && i.right <= ui.layout.dock.right + 1), '斜切输入不超出属性坞');
  assert(ui.layout.btn && ui.layout.btn.right <= ui.layout.dock.right + 1, '斜切按钮不超出属性坞');

  await evaluate(`document.querySelector('.skew-apply').scrollIntoView({ block: 'center' })`);
  await sleep(400);
  await shot('skew-panel.png');

  // 数值 X 斜切 45°
  await setInput('斜切 X 角度', '45');
  await clickSkew();
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已斜切') === true`, 8000);
  ui = await readUI();
  doc = await readDoc();
  let after = doc.paths[0].anchors;
  console.log('after X45', JSON.stringify({ after, toast: ui.toast, values: ui.skewValues }));
  const tanX = Math.tan(Math.PI / 4);
  assert(after.every((a, i) => near(a[0], before[i][0] + tanX * (before[i][1] - (beforeBox.y + beforeBox.h / 2)))), 'X 斜切 45° 每个锚点横移正确');
  assert(after.every((a, i) => near(a[1], before[i][1], 0.01)), 'X 斜切不改变锚点 Y');
  assert(ui.toast.includes('已斜切 X 45°'), 'X 斜切提示角度');
  assert(ui.skewValues[0] === '' && ui.skewValues[1] === '', '应用后输入框清空');
  const wideBox = bounds(after);
  assert(wideBox.w > beforeBox.w + 140, 'X 斜切后包围盒明显变宽');
  await shot('skew-numeric.png');

  await undo();
  doc = await readDoc();
  after = doc.paths[0].anchors;
  assert(after.every((a, i) => near(a[0], before[i][0], 0.01) && near(a[1], before[i][1], 0.01)), '撤销恢复 X 斜切前坐标');

  // 数值 Y 斜切 30°
  await setInput('斜切 Y 角度', '30');
  await clickSkew();
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已斜切 Y 30°') === true`, 8000);
  doc = await readDoc();
  after = doc.paths[0].anchors;
  const tanY = Math.tan(Math.PI / 6);
  assert(after.every((a, i) => near(a[0], before[i][0], 0.01)), 'Y 斜切不改变锚点 X');
  assert(after.every((a, i) => near(a[1], before[i][1] + tanY * (before[i][0] - (beforeBox.x + beforeBox.w / 2)))), 'Y 斜切 30° 每个锚点竖移正确');
  const tallBox = bounds(after);
  assert(tallBox.h > beforeBox.h + 90, 'Y 斜切后包围盒明显变高');
  await undo();
  doc = await readDoc();
  after = doc.paths[0].anchors;
  assert(after.every((a, i) => near(a[0], before[i][0], 0.01) && near(a[1], before[i][1], 0.01)), '撤销恢复 Y 斜切前坐标');

  // 空输入不写历史
  const undoLenBeforeNoop = await readUndoLen();
  await clickSkew();
  await waitFor(`document.querySelector('.toast')?.innerText.includes('请输入斜切角度') === true`, 8000);
  ui = await readUI();
  assert(ui.toast.includes('请输入斜切角度'), '空输入提示角度');
  const undoLenAfterNoop = await readUndoLen();
  assert(undoLenAfterNoop === undoLenBeforeNoop, '空输入没有写撤销历史');

  // Ctrl 拖东侧边柄做 Y 斜切
  doc = await readDoc();
  const view = doc.view;
  assert(view && Number.isFinite(view.zoom) && Number.isFinite(view.panX), '读到画布视图');
  const east = {
    x: rect.x + beforeBox.x * view.zoom + beforeBox.w * view.zoom + view.panX,
    y: rect.y + beforeBox.y * view.zoom + beforeBox.h / 2 * view.zoom + view.panY,
  };
  console.log('east handle screen', JSON.stringify(east), JSON.stringify(view));
  await mouse('mouseMoved', east.x, east.y, 0, 2);
  await mouse('mousePressed', east.x, east.y, 1, 2);
  for (let i = 1; i <= 6; i++) {
    await mouse('mouseMoved', east.x, east.y + (80 * i) / 6, 1, 2);
  }
  await mouse('mouseReleased', east.x, east.y + 80, 0, 2);
  await sleep(600);
  doc = await readDoc();
  after = doc.paths[0].anchors;
  const dragTan = 80 / view.zoom / (beforeBox.w / 2);
  console.log('after ctrl drag', JSON.stringify(after), 'dragTan', dragTan);
  assert(after.every((a, i) => near(a[0], before[i][0], 0.01)), 'Ctrl 边柄斜切不改变锚点 X');
  assert(after.every((a, i) => near(a[1], before[i][1] + dragTan * (before[i][0] - (beforeBox.x + beforeBox.w / 2)))), 'Ctrl 边柄斜切按拖动量竖移');
  assert(bounds(after).h > beforeBox.h, 'Ctrl 边柄斜切改变高度');
  await sleep(2200);
  await shot('skew-drag.png');
  await undo();
  doc = await readDoc();
  assert(doc.paths[0].anchors.every((a, i) => near(a[0], before[i][0], 0.01) && near(a[1], before[i][1], 0.01)), '撤销恢复 Ctrl 斜切');

  // 文本单独选中时按钮禁用
  await key('t', 84, 'KeyT');
  await clickAt(450, 425);
  await sleep(350);
  await key('Escape', 27, 'Escape');
  await key('v', 86, 'KeyV');
  await clickAt(450, 425);
  await sleep(300);
  ui = await readUI();
  console.log('text selection skew UI', JSON.stringify(ui));
  assert(ui.skewDisabled === true, '纯文字选中时斜切按钮禁用');

  // 回到矩形选择，检查 1200×900
  await clickAt(380, 480);
  await sleep(300);
  ui = await readUI();
  assert(ui.skewDisabled === false, '重新选中矩形后斜切恢复可用');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const narrow = await readUI();
  console.log('narrow', JSON.stringify(narrow));
  assert(!narrow.layout.dock || narrow.layout.dock.sw <= narrow.layout.dock.cw + 1, '1200 宽属性坞无横向溢出');
  assert(narrow.layout.btn && narrow.layout.btn.right <= narrow.layout.dock.right + 1, '1200 宽斜切按钮不溢出');
  assert(narrow.layout.inputs.every((i) => i && i.w > 40), '1200 宽两个斜切输入仍有可用宽度');
  await evaluate(`document.querySelector('.skew-apply')?.scrollIntoView({ block: 'center' })`);
  await sleep(400);
  await shot('skew-narrow.png');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  doc = await readDoc();
  console.log('final', JSON.stringify(doc));
  assert(doc.paths.length >= 1, '最终文档仍可读');
  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
