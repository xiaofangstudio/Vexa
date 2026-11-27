import fs from 'node:fs';

const port = process.env.CDP_PORT || '9250';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 文字转路径验收超时，强制退出');
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
    const groups = nodes.filter((n) => n.kind === 'group');
    const paths = nodes.filter((n) => n.kind === 'path');
    const outline = groups.find((g) => g.name.includes('轮廓'));
    return {
      texts: texts.map((n) => ({ id: n.id, text: n.text, size: n.size, font: n.font })),
      paths: paths.length,
      groups: groups.map((g) => ({ id: g.id, name: g.name, children: g.children.length })),
      outline: outline ? { id: outline.id, name: outline.name, children: outline.children.length, fill: doc.nodes[outline.children[0]]?.fill } : null,
      root: doc.root,
      seq: doc.seq,
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
    const cv = document.querySelector('.cv-canvas');
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const cx = geom.x + geom.w * 0.5;
  const cy = geom.y + geom.h * 0.5;

  await key('T', 84, 'KeyT');
  await click(cx - 210, cy - 20);
  await waitFor(`document.querySelector('.dock-textarea') !== null`, 5000);
  await evaluate(`(() => { const t = document.querySelector('.dock-textarea'); if (t) { t.focus(); t.select(); return true; } return false; })()`);
  await send('Input.insertText', { text: 'Vexa 矢量文字' });
  await sleep(800);
  let info = await docInfo();
  console.log('text-before', JSON.stringify(info));
  assert(info && info.texts.length === 1, '文字工具落下一个文本对象');
  assert(info.texts[0].text === 'Vexa 矢量文字', '文字内容已写入');

  await setNumField('字号', 64);
  info = await docInfo();
  assert(info.texts[0].size === 64, '字号已改为 64px');
  await evaluate(`document.activeElement?.blur()`);
  await sleep(400);
  await key('V', 86, 'KeyV');
  await sleep(600);

  const dockOutlineBtn = await evaluate(`([...document.querySelectorAll('.char-row button')].some((b) => b.textContent.trim() === '转路径'))`);
  assert(dockOutlineBtn, '属性坞显示「转路径」按钮');

  const menuLabels = await evaluate(`(async () => {
    const b = [...document.querySelectorAll('.menubtn')].find((x) => x.textContent.trim() === '文字');
    if (!b) return [];
    b.click();
    await new Promise((r) => setTimeout(r, 350));
    return [...document.querySelectorAll('.menu-item .menu-item-label')].map((x) => x.textContent.trim());
  })()`);
  assert(menuLabels.includes('文字转路径'), '文字菜单提供「文字转路径」');
  const clicked = await evaluate(`(() => {
    const item = [...document.querySelectorAll('.menu-item')].find((x) => x.querySelector('.menu-item-label')?.textContent.trim() === '文字转路径');
    if (!item) return false;
    item.click();
    return true;
  })()`);
  assert(clicked, '点击文字菜单的转路径命令');
  await waitFor(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let shell = k ? cv[k] : null;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    return !!doc && Object.values(doc.nodes).some((n) => n.kind === 'group' && n.name.includes('轮廓'));
  })()`, 20000);
  await sleep(700);
  info = await docInfo();
  console.log('outline-after', JSON.stringify(info));
  assert(info && info.texts.length === 0, '原文字节点已消失');
  assert(info.outline && info.outline.children >= 5, `每个字形已生成路径（${info.outline?.children} 个子路径）`);
  assert(info.outline.name.endsWith(' 轮廓'), '轮廓组名称正确');
  assert(info.outline.fill && info.outline.fill.kind === 'solid', '路径继承文字实色填充');
  assert(info.paths === info.outline.children, '没有遗留多余路径');
  const selected = await evaluate(`Number(document.querySelector('.opt-sel-count')?.innerText || 0)`);
  assert(selected === 1, '转路径后轮廓组保持选中');

  const layout = await evaluate(`(() => ({
    scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dock: !!document.querySelector('.dock-sec'),
    canvasW: document.querySelector('.cv-canvas')?.getBoundingClientRect().width,
  }))()`);
  assert(layout.scrollX === 0, '窗口无横向溢出');
  assert(layout.dock, '右侧面板正常显示');

  await evaluate(`(() => {
    const b = [...document.querySelectorAll('.dock-tab')].find((x) => x.textContent.includes('图层'));
    if (b) b.click();
  })()`);
  await sleep(500);
  await evaluate(`document.querySelector('.layer-row .layer-caret')?.click()`);
  await sleep(500);
  const layerInfo = await evaluate(`(() => ({
    rows: document.querySelectorAll('.layer-row').length,
    text: document.querySelector('.layer-list')?.innerText ?? '',
  }))()`);
  assert(layerInfo.rows >= 8 && layerInfo.text.includes('字形'), '图层面板显示轮廓组与每个字形子层');

  await shot('text-outline.png');

  await key('z', 90, 'KeyZ', 2);
  await sleep(700);
  info = await docInfo();
  assert(info && info.texts.length === 1 && !info.outline, '撤销恢复原文字');
  await key('y', 89, 'KeyY', 2);
  await sleep(700);
  info = await docInfo();
  assert(info && info.texts.length === 0 && info.outline, '重做恢复文字轮廓');

  clearTimeout(watchdog);
  ws.close();
  console.log('\n文字转路径实机断言通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
