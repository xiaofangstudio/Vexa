import fs from 'node:fs';

const port = process.env.CDP_PORT || '9250';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 分栏文字验收超时，强制退出');
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
    await sleep(60);
  };
  const drag = async (x0, y0, x1, y1) => {
    await mouse('mouseMoved', x0, y0);
    await mouse('mousePressed', x0, y0, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8, 1);
    await mouse('mouseReleased', x1, y1);
    await sleep(500);
  };
  const textNode = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let shell = k ? cv[k] : null;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const n = Object.values(doc.nodes).find((x) => x.kind === 'text');
    return n ? { id: n.id, text: n.text, textMode: n.textMode ?? 'point', boxW: n.boxW, boxH: n.boxH, size: n.size, columns: n.columns ?? 1, columnGutter: n.columnGutter ?? 0, areaVAlign: n.areaVAlign ?? 'top' } : null;
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);
  await key('1', 49, 'Digit1', 2);
  await sleep(900);
  const geom = await evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const cx = geom.x + geom.w * 0.5;
  const cy = geom.y + geom.h * 0.5;

  await key('T', 84, 'KeyT');
  await drag(cx - 230, cy - 125, cx + 230, cy + 125);
  await waitFor(`document.querySelector('.dock-textarea') !== null`, 5000);
  await evaluate(`(() => { const t = document.querySelector('.dock-textarea'); if (t) { t.focus(); t.select(); return true; } return false; })()`);
  const sample = '区域文字分栏：先把第一栏从上到下填满，再流到第二栏。跨栏时保留段落顺序、首行缩进与行距，长文也能在窄框里排得干净。\n\n分栏不是简单裁剪，每栏宽度独立换行；第一栏到底后余下的字自动进入下一栏，第二栏重新起行。\n第三段继续沿栏流动，最后一行不会把栏挤破；栏距把两栏分开，框内垂直对齐仍然生效。';
  await send('Input.insertText', { text: sample });
  await sleep(900);
  let node = await textNode();
  assert(node && node.textMode === 'area', '拖框创建区域文字');
  assert(node.text === sample, '分栏样本完整写入');

  const setNumField = async (label, value) => {
    const ok = await evaluate(`(() => {
      const lab = [...document.querySelectorAll('.field-label')].find((x) => x.textContent.trim() === ${JSON.stringify(label)});
      const input = lab?.closest('.field')?.querySelector('input');
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(String(value))});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.blur();
      return true;
    })()`);
    assert(ok, `找到并设置「${label}」数值`);
    await sleep(450);
  };
  await setNumField('字号', 22);
  await setNumField('框宽', 520);
  await setNumField('框高', 340);
  await setNumField('分栏', 2);
  await setNumField('栏距', 24);
  await setNumField('首行', 24);
  await setNumField('段距', 12);
  node = await textNode();
  assert(node && node.columns === 2 && node.columnGutter === 24, '分栏数与栏距写入节点');
  assert(node.boxW >= 500 && node.boxH >= 320, '区域框尺寸同步');
  assert(node.areaVAlign === 'top', '分栏默认从框顶起排');

  const panel = await evaluate(`(() => {
    const grid = document.querySelector('.dock-sec .char-grid');
    const row = [...document.querySelectorAll('.char-row')].map((r) => r.innerText.replace(/\\n/g, ' ')).find((t) => t.includes('类型')) ?? '';
    return {
      mode: row,
      hasColumns: grid?.innerText.includes('分栏') ?? false,
      hasGutter: grid?.innerText.includes('栏距') ?? false,
      selected: document.querySelector('.status-count')?.textContent ?? '',
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  console.log('panel', JSON.stringify(panel));
  assert(panel.mode.includes('区域'), '属性坞显示区域文字');
  assert(panel.hasColumns && panel.hasGutter, '属性坞显示分栏/栏距');
  assert(panel.selected.includes('已选 1'), '区域文字保持选中');
  assert(panel.scrollX === 0, '窗口无横向溢出');

  await evaluate(`document.querySelector('.dock-textarea')?.closest('.dock-sec')?.scrollIntoView({ block: 'start' })`);
  await sleep(400);
  let undos = 0;
  let undone = null;
  for (; undos < 10; undos++) {
    await key('z', 90, 'KeyZ', 2);
    await sleep(350);
    undone = await textNode();
    if (undone && (undone.columns ?? 1) !== 2) break;
  }
  assert(undone && (undone.columns ?? 1) !== 2, '撤销可回到单栏');
  for (let i = 0; i < undos + 1; i++) {
    await key('y', 89, 'KeyY', 2);
    await sleep(300);
  }
  node = await textNode();
  assert(node && node.columns === 2, '重做恢复两栏');
  await evaluate(`document.activeElement?.blur()`);
  await sleep(200);
  await key('V', 86, 'KeyV');
  await sleep(700);
  await evaluate(`(() => {
    const lab = [...document.querySelectorAll('.field-label')].find((x) => x.textContent.trim() === '分栏');
    lab?.closest('.field')?.scrollIntoView({ block: 'center' });
  })()`);
  await sleep(500);

  await shot('text-columns.png');
  clearTimeout(watchdog);
  ws.close();
  console.log('\n分栏文字实机断言通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
