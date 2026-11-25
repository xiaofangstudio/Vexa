import fs from 'node:fs';

const port = process.env.CDP_PORT || '9228';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 90000);
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
    await sleep(120);
  };
  const clickAt = async (x, y, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, modifiers });
    await sleep(260);
  };
  const dragAt = async (x1, y1, x2, y2) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1, buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 6; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 6, y: y1 + ((y2 - y1) * i) / 6, button: 'left', buttons: 1 });
      await sleep(40);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(300);
  };
  const readState = () => evaluate(`(() => {
    const fields = {};
    for (const f of document.querySelectorAll('.ed-dock .field')) {
      const label = f.querySelector('.field-label')?.innerText.trim();
      const input = f.querySelector('.field-input');
      if (label && input) fields[label] = input.value;
    }
    const bar = document.querySelector('.ed-optbar');
    const sel = document.querySelector('.opt-selection');
    return {
      editor: !!document.querySelector('.editor'),
      tool: document.querySelector('.opt-tool-chip')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      selCount: document.querySelector('.opt-sel-count')?.innerText.trim() ?? null,
      size: document.querySelector('.opt-size')?.innerText.trim() ?? null,
      anchorText: (() => {
        const h = document.querySelector('.opt-hint')?.innerText.trim() ?? '';
        const m = h.match(/^锚点 (\\d+)/);
        return m ? '锚点 ' + m[1] : null;
      })(),
      hint: document.querySelector('.opt-hint')?.innerText.trim() ?? '',
      fields,
      layout: {
        bar: bar ? { cw: bar.clientWidth, sw: bar.scrollWidth } : null,
        sel: sel ? { cw: sel.clientWidth, sw: sel.scrollWidth } : null,
        editor: (() => { const e = document.querySelector('.editor'); return e ? { cw: e.clientWidth, sw: e.scrollWidth } : null; })(),
      },
    };
  })()`);
  const readFields = async () => (await readState()).fields;

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const rect = await evaluate(`(() => { const r = document.querySelector('.cv-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const p1 = { x: cx - 220, y: cy - 110 };
  const p2 = { x: cx + 180, y: cy - 20 };
  const p3 = { x: cx - 120, y: cy + 140 };
  console.log('canvas', JSON.stringify(rect), 'points', JSON.stringify([p1, p2, p3]));

  await key('p', 80, 'KeyP');
  await clickAt(p1.x, p1.y);
  await clickAt(p2.x, p2.y);
  await clickAt(p3.x, p3.y);
  await key('Enter', 13, 'Enter');
  await sleep(500);
  console.log('pen path committed');

  await key('a', 65, 'KeyA');
  await sleep(350);
  await clickAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  await sleep(400);
  let s = await readState();
  console.log('path selected', JSON.stringify(s));
  assert(s.selCount === '1', '直接选择命中路径，已选 1 个对象');
  assert(s.anchorText === null, '尚未点锚点时没有锚点计数');
  const initial = s.fields;

  await clickAt(p2.x, p2.y);
  s = await readState();
  assert(s.anchorText === '锚点 1', '点击锚点后计数为 1');
  await clickAt(p3.x, p3.y, 8);
  s = await readState();
  console.log('two anchors', JSON.stringify(s));
  assert(s.anchorText === '锚点 2', 'Shift 点第二个锚点后计数为 2');
  assert(s.hint.includes('Shift 多选'), '直接选择提示说明 Shift 多选');
  assert(s.hint.includes('方向键微移'), '直接选择提示说明方向键微移');
  assert(!s.layout.bar || s.layout.bar.sw <= s.layout.bar.cw + 1, '选项栏无横向溢出');
  await shot('anchors-multi.png');

  const beforeArrows = s.fields;
  await key('ArrowRight', 39, 'ArrowRight');
  await key('ArrowRight', 39, 'ArrowRight');
  await sleep(450);
  s = await readState();
  console.log('after arrows', JSON.stringify(s));
  assert(s.anchorText === '锚点 2', '方向键微移后仍选中 2 个锚点');
  assert(Number(s.fields.W) === Number(beforeArrows.W) + 2, '右侧两个锚点各右移 2 px，包围盒 W +2');
  assert(Number(s.fields.X) === Number(beforeArrows.X), '对象整体未被方向键推动，X 不变');
  assert(Number(s.fields.Y) === Number(beforeArrows.Y), 'Y 不变');
  assert(Number(s.fields.H) === Number(beforeArrows.H), 'H 不变');
  await shot('anchors-nudged.png');

  await key('z', 90, 'KeyZ', 2);
  await key('z', 90, 'KeyZ', 2);
  await sleep(450);
  s = await readState();
  assert(Number(s.fields.W) === Number(initial.W), '两次 Ctrl+Z 逐步撤销两次锚点微移');
  assert(Number(s.fields.X) === Number(initial.X), '撤销后 X 回到初始');

  const dragBefore = s.fields;
  await dragAt(p2.x, p2.y, p2.x + 40, p2.y);
  await sleep(450);
  s = await readState();
  console.log('after drag', JSON.stringify(s));
  assert(s.anchorText === '锚点 2', '拖动后仍保持 2 个锚点');
  const dragDelta = Number(s.fields.W) - Number(dragBefore.W);
  assert(dragDelta >= 60 && dragDelta <= 72, '多锚点拖动按 40 屏幕 px 一起右移，W 增加约 65 文档 px');
  assert(Number(s.fields.X) === Number(dragBefore.X), '多锚点拖动没有整体移动对象，X 不变');
  await shot('anchors-drag.png');

  await key('z', 90, 'KeyZ', 2);
  await sleep(450);
  s = await readState();
  assert(Number(s.fields.W) === Number(initial.W), '撤销拖动恢复初始 W');

  await clickAt(p3.x, p3.y, 8);
  s = await readState();
  assert(s.anchorText === '锚点 1', 'Shift 再点已选锚点取消一个，计数 1');
  await clickAt(p3.x, p3.y, 8);
  s = await readState();
  assert(s.anchorText === '锚点 2', 'Shift 再点回来恢复 2 个锚点');

  await key('v', 86, 'KeyV');
  await sleep(350);
  s = await readState();
  assert(s.selCount === '1', '切到选择工具后对象仍在选');
  assert(s.anchorText === null, '切到选择工具后锚点计数清空');
  await key('a', 65, 'KeyA');
  await sleep(300);
  await clickAt(p2.x, p2.y);
  await clickAt(p3.x, p3.y, 8);
  s = await readState();
  assert(s.anchorText === '锚点 2', '切回直接选择后可重新点选两个锚点');

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  s = await readState();
  console.log('narrow layout', JSON.stringify(s.layout));
  assert(!s.layout.bar || s.layout.bar.sw <= s.layout.bar.cw + 1, '1200 宽选项栏无横向溢出');
  assert(!s.layout.sel || s.layout.sel.sw <= s.layout.sel.cw + 1, '1200 宽选择区无横向溢出');
  await shot('anchors-narrow.png');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  s = await readState();
  console.log('final', JSON.stringify(s));
  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
