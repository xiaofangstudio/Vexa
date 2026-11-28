import fs from 'node:fs';

const port = process.env.CDP_PORT || '9250';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 段落缩进验收超时，强制退出');
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
    return n ? { id: n.id, text: n.text, textMode: n.textMode ?? 'point', boxW: n.boxW, boxH: n.boxH, size: n.size, kinsoku: n.kinsoku === true, hangingIndent: n.hangingIndent ?? 0, leftIndent: n.leftIndent ?? 0, rightIndent: n.rightIndent ?? 0 } : null;
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
  const sample = '左右缩进把整段文字收进版心，行首行尾都留出稳定边距。分栏时每栏同样生效，长文不会贴住文本框。继续测试第三行与第四行，检查右边界是否整齐。';
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
  await setNumField('字号', 24);
  await setNumField('框宽', 380);
  await setNumField('框高', 300);
  await setNumField('首行', 0);
  await setNumField('悬挂', 0);
  await setNumField('左缩进', 24);
  await setNumField('右缩进', 32);
  node = await textNode();
  assert(node && node.textMode === 'area', '区域框创建成功');
  assert(node.size === 24 && node.boxW >= 370 && node.boxH >= 290, '字号与框尺寸写入节点');
  assert(node.leftIndent === 24 && node.rightIndent === 32, '左右缩进写入节点');

  const panel = await evaluate(`(() => {
    const labels = [...document.querySelectorAll('.field-label')].map((x) => x.textContent.trim());
    return {
      hasLeft: labels.includes('左缩进'),
      hasRight: labels.includes('右缩进'),
      selected: document.querySelector('.status-count')?.textContent ?? '',
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  })()`);
  console.log('panel', JSON.stringify(panel));
  assert(panel.hasLeft && panel.hasRight, '属性坞显示左右缩进');
  assert(panel.selected.includes('已选 1'), '区域文字保持选中');
  assert(panel.scrollX === 0, '窗口无横向溢出');

  const kinsoku = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('.char-row .char-btn')].find((b) => (b.getAttribute('title') ?? '').includes('避头尾'));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  assert(kinsoku, '开启避头尾避免行首标点');
  await sleep(500);

  await evaluate(`document.activeElement?.blur()`);
  await sleep(200);
  await key('V', 86, 'KeyV');
  await sleep(700);
  await evaluate(`(() => {
    const lab = [...document.querySelectorAll('.field-label')].find((x) => x.textContent.trim() === '左缩进');
    lab?.closest('.field')?.scrollIntoView({ block: 'center' });
  })()`);
  await sleep(500);

  await shot('text-paragraph-indents.png');
  clearTimeout(watchdog);
  ws.close();
  console.log('\n段落左右缩进实机断言通过');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
