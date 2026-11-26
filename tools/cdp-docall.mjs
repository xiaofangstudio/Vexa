import fs from 'node:fs';

const port = process.env.CDP_PORT || '9238';
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
    await sleep(150);
  };
  const mouse = async (type, x, y, buttons = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
    await sleep(90);
  };
  const clickAt = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, 1);
    await mouse('mouseReleased', x, y);
    await sleep(320);
  };
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1);
    await mouse('mouseReleased', to.x, to.y);
    await sleep(400);
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
      name: doc.name,
      artboards: doc.artboards.map((b) => ({ id: b.id, name: b.name, x: b.x, y: b.y, w: Math.round(b.w), h: Math.round(b.h), bg: b.bg })),
      roots: doc.root.length,
      pathIds,
      anchors: (doc.nodes[pathIds[0]]?.subpaths[0]?.anchors ?? []).map((a) => [Math.round(a.x * 1000) / 1000, Math.round(a.y * 1000) / 1000]),
    };
  })()`);
  const readDialog = () => evaluate(`(() => {
    const modal = document.querySelector('.doc-modal');
    if (!modal) return null;
    const all = document.querySelector('#doc-all-boards');
    const label = document.querySelector('.doc-all');
    const r = modal.getBoundingClientRect();
    return {
      name: document.querySelector('#doc-name')?.value,
      boardName: document.querySelector('#doc-board-name')?.value,
      width: document.querySelector('#doc-width')?.value,
      height: document.querySelector('#doc-height')?.value,
      background: document.querySelector('#doc-bg-hex')?.value,
      allChecked: !!all?.checked,
      allDisabled: !!all?.disabled,
      allText: label?.innerText.trim() ?? '',
      modal: { cw: modal.clientWidth, sw: modal.scrollWidth, w: Math.round(r.width), h: Math.round(r.height) },
      all: label ? { cw: label.clientWidth, sw: label.scrollWidth } : null,
    };
  })()`);
  const setInput = async (id, value) => evaluate(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const openSettings = async () => {
    await key(',', 188, 'Comma', 3);
    await waitFor(`document.querySelector('.doc-modal') !== null`, 8000);
    await sleep(250);
  };
  const closeSettings = async () => {
    await key('Escape', 27, 'Escape');
    await waitFor(`document.querySelector('.doc-modal') === null`, 6000);
    await sleep(250);
  };
  const submitSettings = async () => {
    await evaluate(`document.querySelector('.doc-modal .btn-primary').click()`);
    await sleep(500);
  };
  const undo = async () => {
    await evaluate(`document.querySelector('button[title="撤销"]').click()`);
    await sleep(600);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  // 画一个矩形，后面验证批量改画板不移动内容
  await key('r', 82, 'KeyR');
  await drag({ x: 350, y: 340 }, { x: 500, y: 430 });
  await key('v', 86, 'KeyV');
  await clickAt(420, 390);
  await sleep(300);
  let doc = await readDoc();
  assert(doc.artboards.length === 1, '初始只有一个画板');
  const beforeAnchors = doc.anchors;

  // 单画板时批量复选框应禁用
  await openSettings();
  const oneBoard = await readDialog();
  assert(oneBoard.allDisabled === true, '单画板时复选框禁用');
  assert(oneBoard.allText.includes('全部 1 个画板'), '单画板文案显示 1 个画板');
  await closeSettings();

  // 清空选择，露出画板面板，点“新建画板”
  await clickAt(150, 700);
  await sleep(400);
  const plus = await evaluate(`document.querySelector('button[title="新建画板"]')?.tagName ?? null`);
  assert(plus === 'BUTTON', '画板面板有新建画板按钮');
  await evaluate(`document.querySelector('button[title="新建画板"]').click()`);
  await sleep(600);
  doc = await readDoc();
  assert(doc.artboards.length === 2, '新建后有两个画板');
  const originalBoards = doc.artboards;

  // 切回第一块画板
  await evaluate(`document.querySelectorAll('.board-row')[0].click()`);
  await sleep(500);

  await openSettings();
  let dlg = await readDialog();
  console.log('dialog initial', JSON.stringify(dlg));
  assert(dlg.allDisabled === false, '两个画板时复选框可用');
  assert(dlg.allText.includes('全部 2 个画板'), '复选框文案显示 2 个画板');
  await setInput('doc-name', '批量文档');
  await setInput('doc-board-name', '主画板');
  await setInput('doc-width', '1000');
  await setInput('doc-height', '700');
  await setInput('doc-bg-hex', '#eef4ff');
  await evaluate(`document.querySelector('#doc-all-boards').click()`);
  await sleep(300);
  dlg = await readDialog();
  console.log('dialog filled', JSON.stringify(dlg));
  assert(dlg.allChecked === true, '复选框已勾选');
  assert(dlg.width === '1000' && dlg.height === '700' && dlg.background === '#eef4ff', '表单值写入');
  assert(dlg.modal.sw <= dlg.modal.cw + 1, '文档设置弹窗无横向溢出');
  assert(dlg.all.sw <= dlg.all.cw + 1, '批量画板行无溢出');
  await shot('docs-all-dialog.png');

  await submitSettings();
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已同步 2 个画板') === true`, 8000);
  doc = await readDoc();
  console.log('after all', JSON.stringify({ name: doc.name, boards: doc.artboards, anchors: doc.anchors }));
  assert(doc.name === '批量文档', '文档名已更新');
  assert(doc.artboards[0].name === '主画板', '当前画板名已更新');
  assert(doc.artboards[1].name === originalBoards[1].name, '第二画板名保持');
  assert(doc.artboards.every((b) => b.w === 1000 && b.h === 700 && b.bg === '#eef4ff'), '两块画板尺寸与背景同步');
  assert(JSON.stringify(doc.anchors) === JSON.stringify(beforeAnchors), '批量改画板不移动内容坐标');
  await shot('docs-all-applied.png');

  await undo();
  doc = await readDoc();
  assert(doc.artboards.every((b, i) => b.w === originalBoards[i].w && b.h === originalBoards[i].h && b.bg === originalBoards[i].bg), '撤销恢复两块画板');
  await sleep(2400);
  await shot('docs-all-undo.png');

  // 不勾选时只改当前画板
  await openSettings();
  await setInput('doc-width', '800');
  await setInput('doc-bg-hex', '#ffe9d8');
  dlg = await readDialog();
  assert(dlg.allChecked === false, '重新打开默认不勾选');
  await submitSettings();
  await waitFor(`document.querySelector('.toast')?.innerText.includes('文档设置已应用') === true`, 8000);
  doc = await readDoc();
  console.log('after single', JSON.stringify(doc.artboards));
  assert(doc.artboards[0].w === 800 && doc.artboards[0].bg === '#ffe9d8', '未勾选只改当前尺寸与背景');
  assert(doc.artboards[1].w === originalBoards[1].w && doc.artboards[1].bg === originalBoards[1].bg, '未勾选第二画板不变');
  await undo();
  await sleep(2200);

  // 1200×900 弹窗布局
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  await openSettings();
  dlg = await readDialog();
  console.log('narrow dialog', JSON.stringify(dlg));
  assert(dlg.modal.sw <= dlg.modal.cw + 1, '1200 宽弹窗无横向溢出');
  assert(dlg.all.sw <= dlg.all.cw + 1, '1200 宽批量行不截断');
  assert(dlg.modal.w <= 560, '1200 宽弹窗不超 560');
  await shot('docs-all-narrow.png');
  await closeSettings();
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  // 留一个 1920 弹窗给窗口截图
  await openSettings();
  await setInput('doc-width', '1000');
  await setInput('doc-height', '700');
  await setInput('doc-bg-hex', '#eef4ff');
  await evaluate(`document.querySelector('#doc-all-boards').click()`);
  await sleep(500);

  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
