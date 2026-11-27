import fs from 'node:fs';

const port = process.env.CDP_PORT || '9246';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 区域文字验收超时，强制退出');
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
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, 1);
    }
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
    return n ? { id: n.id, text: n.text, textMode: n.textMode ?? 'point', boxW: n.boxW, boxH: n.boxH, x: n.x, y: n.y, size: n.size } : null;
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
  await drag(cx - 180, cy - 85, cx + 180, cy + 85);
  await waitFor(`document.querySelector('.dock-textarea') !== null`, 5000);
  let node = await textNode();
  console.log('node', JSON.stringify(node));
  assert(node && node.textMode === 'area', '文字工具拖框创建区域文字');
  assert(node.boxW > 200 && node.boxH > 150, `区域框已按拖动落尺寸（实际 ${Math.round(node.boxW)}×${Math.round(node.boxH)}）`);

  await evaluate(`(() => { const t = document.querySelector('.dock-textarea'); if (t) { t.focus(); t.select(); return true; } return false; })()`);
  const sample = '区域文字会按文本框宽度自动换行。拖动框角改尺寸，框内文字会实时重排。';
  await send('Input.insertText', { text: sample });
  await sleep(900);
  node = await textNode();
  console.log('node-after', JSON.stringify(node));
  assert(node && node.text === sample, '文本输入已完整写入区域文字节点');
  await evaluate(`document.activeElement?.blur()`);
  await sleep(300);
  await key('V', 86, 'KeyV');
  await sleep(700);

  const panel = await evaluate(`(() => ({
    mode: [...document.querySelectorAll('.char-row')].map((r) => r.innerText.replace(/\\n/g, ' ')).find((t) => t.includes('类型')) ?? '',
    hasBoxW: !!document.querySelector('.dock-sec .char-grid')?.innerText.includes('框宽'),
    hasBoxH: !!document.querySelector('.dock-sec .char-grid')?.innerText.includes('框高'),
    selected: Number(document.querySelector('.opt-sel-count')?.innerText || 0),
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  console.log('panel', JSON.stringify(panel));
  assert(panel.mode.includes('区域'), '属性坞显示区域文字类型');
  assert(panel.hasBoxW && panel.hasBoxH, '属性坞显示框宽/框高');
  assert(panel.selected === 1, '区域文字创建后保持选中');
  assert(panel.scrollX === 0, '窗口无横向溢出');

  const menuLabels = await evaluate(`(async () => {
    const b = [...document.querySelectorAll('.menubtn')].find((x) => x.textContent.trim() === '文字');
    if (!b) return [];
    b.click();
    await new Promise((r) => setTimeout(r, 350));
    return [...document.querySelectorAll('.menu-item .menu-item-label')].map((x) => x.textContent.trim());
  })()`);
  assert(menuLabels.includes('转区域文字') && menuLabels.includes('转单点文字'), '文字菜单提供单点/区域互转');
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.menu-item')].find((x) => x.querySelector('.menu-item-label')?.textContent.trim() === '转单点文字');
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(500);
  let conv = await textNode();
  assert(conv && (conv.textMode ?? 'point') === 'point' && !conv.boxW, '菜单转单点文字生效');
  await key('z', 90, 'KeyZ', 2);
  await sleep(600);
  conv = await textNode();
  assert(conv && conv.textMode === 'area' && Math.abs(conv.boxW - 360) < 2, '撤销恢复区域文字');

  await shot('area-text.png');
  clearTimeout(watchdog);
  ws.close();
  console.log('\n区域文字实机断言通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
