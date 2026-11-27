import fs from 'node:fs';

const port = process.env.CDP_PORT || '9251';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 路径文字验收超时，强制退出');
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
  const click = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, 1);
    await mouse('mouseReleased', x, y);
    await sleep(500);
  };
  const drag = async (x0, y0, x1, y1) => {
    await mouse('mouseMoved', x0, y0);
    await mouse('mousePressed', x0, y0, 1);
    for (let i = 1; i <= 10; i++) await mouse('mouseMoved', x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10, 1);
    await mouse('mouseReleased', x1, y1);
    await sleep(600);
  };
  const docInfo = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let shell = k ? cv[k] : null;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const nodes = Object.values(doc.nodes);
    const texts = nodes.filter((n) => n.kind === 'text');
    const paths = nodes.filter((n) => n.kind === 'path');
    const n = texts[0];
    return {
      texts: texts.length,
      paths: paths.length,
      text: n ? { id: n.id, text: n.text, size: n.size, mode: n.textMode ?? 'point', pathStart: n.pathStart ?? 0, pathSide: n.pathSide ?? 'left', pathSubpaths: n.pathSubpaths?.length ?? 0, fill: n.fill, x: n.x, y: n.y, locked: !!n.locked, visible: n.visible !== false, bbox: (() => { const ps = (n.pathSubpaths ?? []).flatMap((s) => s.anchors); if (!ps.length) return null; return { x0: Math.min(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), x1: Math.max(...ps.map((p) => p.x)), y1: Math.max(...ps.map((p) => p.y)) }; })() } : null,
      root: doc.root,
    };
  })()`);
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
    await sleep(500);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);
  await key('1', 49, 'Digit1', 2);
  await sleep(900);

  const geom = await evaluate(`(() => {
    const cv = document.querySelector('.cv-wrap');
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const cx = geom.x + geom.w * 0.5;
  const cy = geom.y + geom.h * 0.5;

  await key('L', 76, 'KeyL');
  await drag(cx - 220, cy - 145, cx + 220, cy + 145);
  let info = await docInfo();
  assert(info && info.paths === 1, '椭圆路径已创建并选中');

  const menuClick = async (label) => evaluate(`(() => {
    const item = [...document.querySelectorAll('.menu-item')].find((x) => x.querySelector('.menu-item-label')?.textContent.trim() === ${JSON.stringify(label)});
    if (!item) return false;
    item.click();
    return true;
  })()`);
  await evaluate(`([...document.querySelectorAll('.menubtn')].find((x) => x.textContent.trim() === '文字')).click()`);
  await sleep(350);
  const hasPathMenuItem = await evaluate(`([...document.querySelectorAll('.menu-item-label')].some((x) => x.textContent.trim() === '转为路径文字'))`);
  assert(hasPathMenuItem, '文字菜单提供「转为路径文字」');
  assert(await menuClick('转为路径文字'), '点击转为路径文字');
  await waitFor(`document.querySelector('.dock-textarea') !== null`, 8000);
  await sleep(600);
  info = await docInfo();
  console.log('after-convert', JSON.stringify(info));
  assert(info && info.texts === 1 && info.paths === 0, '路径已变成路径文字对象');
  assert(info.text.mode === 'path' && info.text.pathSubpaths > 0, '路径几何写入文字节点');
  assert(info.text.text === '路径文字', '新路径文字带占位文字');
  assert(info.text.fill.kind === 'solid', '路径文字继承原路径实色填充');

  await key('z', 90, 'KeyZ', 2);
  await sleep(700);
  info = await docInfo();
  assert(info && info.paths === 1 && info.texts === 0, '撤销恢复原路径');
  await key('y', 89, 'KeyY', 2);
  await sleep(700);
  info = await docInfo();
  assert(info && info.texts === 1 && info.text.mode === 'path', '重做恢复路径文字');
  console.log('redo-state', JSON.stringify(info), 'click', cx + 60, cy - 145);
  await key('V', 86, 'KeyV');
  await sleep(500);
  await click(cx + 60, cy - 145);
  await sleep(500);
  const pickedOnCanvas = await evaluate(`document.querySelector('.dock-textarea') !== null && document.querySelector('.status-count')?.textContent.includes('已选 1')`);
  assert(pickedOnCanvas, '切回选择工具后点击路径文字可重新选中');
  await waitFor(`document.querySelector('.dock-textarea') !== null`, 6000);

  await evaluate(`(() => { const t = document.querySelector('.dock-textarea'); if (t) { t.focus(); t.select(); return true; } return false; })()`);
  const sample = 'Vexa 路径文字沿椭圆自动排布，字体跟着切线转向。';
  await send('Input.insertText', { text: sample });
  await sleep(800);
  info = await docInfo();
  assert(info && info.text.text === sample, '路径文字内容已写入');
  await setNumField('字号', 34);
  await setNumField('起点', 10);
  const pathPanel = await evaluate(`(() => ({
    type: [...document.querySelectorAll('.char-row')].map((r) => r.innerText.replace(/\\n/g, ' ')).find((t) => t.includes('类型')) ?? '',
    hasStart: [...document.querySelectorAll('.field-label')].some((x) => x.textContent.trim() === '起点'),
    hasSide: [...document.querySelectorAll('.char-row')].some((r) => r.innerText.includes('路径侧')),
    selected: document.querySelector('.status-count')?.textContent || '',
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))()`);
  console.log('panel', JSON.stringify(pathPanel));
  assert(pathPanel.type.includes('路径'), '属性坞显示路径文字类型');
  assert(pathPanel.hasStart && pathPanel.hasSide, '属性坞显示起点与路径侧');
  assert(pathPanel.selected.includes('已选 1'), '路径文字保持选中');
  assert(pathPanel.scrollX === 0, '窗口无横向溢出');

  await evaluate(`document.activeElement?.blur()`);
  await sleep(300);
  await key('V', 86, 'KeyV');
  await sleep(700);
  await shot('path-text.png');

  clearTimeout(watchdog);
  ws.close();
  console.log('\n路径文字实机断言通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
