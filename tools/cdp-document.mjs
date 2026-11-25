import fs from 'node:fs';

const port = process.env.CDP_PORT || '9225';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
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
  const clickMenu = async (menu, item) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.menubtn')].find((x) => x.innerText.trim() === ${JSON.stringify(menu)});
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到菜单：${menu}`);
    await sleep(220);
    const itemOk = await evaluate(`(() => {
      const i = [...document.querySelectorAll('.menu-item')].find((x) => x.querySelector('.menu-item-label')?.innerText.trim() === ${JSON.stringify(item)});
      i?.click();
      return !!i;
    })()`);
    if (!itemOk) throw new Error(`找不到菜单项：${item}`);
    await sleep(350);
  };
  const setValue = async (selector, value) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      desc.set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`找不到输入框：${selector}`);
    await sleep(120);
  };
  const readDialog = () => evaluate(`(() => {
    const d = document.querySelector('.doc-modal');
    if (!d) return null;
    const v = (sel) => d.querySelector(sel)?.value ?? null;
    return {
      title: d.querySelector('#doc-settings-title')?.innerText ?? '',
      name: v('#doc-name'),
      boardName: v('#doc-board-name'),
      width: v('#doc-width'),
      height: v('#doc-height'),
      background: v('#doc-bg-hex'),
      error: d.querySelector('.doc-error')?.innerText ?? '',
      meta: [...d.querySelectorAll('.doc-meta-item')].map((x) => x.innerText.replace(/\\s+/g, ' ').trim()),
      focus: document.activeElement?.id ?? '',
    };
  })()`);
  const clickDialog = async (text) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.doc-modal button')].find((x) => x.innerText.trim() === ${JSON.stringify(text)});
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到文档设置按钮：${text}`);
    await sleep(450);
  };
  const toast = () => evaluate(`document.querySelector('.toast')?.innerText ?? ''`);
  const undo = async () => {
    const ok = await evaluate(`(() => { const b = document.querySelector('.icon-btn[title="撤销"]'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    if (!ok) throw new Error('撤销不可用');
    await sleep(550);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.menubtn').length > 0`, 20000);
  await waitFor(`document.querySelectorAll('.tab-name').length > 0`, 20000);

  await clickMenu('文件', '文档设置…');
  await waitFor(`document.querySelectorAll('.doc-modal').length > 0`);
  console.log('initial dialog', JSON.stringify(await readDialog()));
  console.log('initial focus', await evaluate(`document.activeElement?.id ?? ''`));
  await shot('doc-settings-panel.png');

  await setValue('#doc-width', '0');
  await clickDialog('应用更改');
  await waitFor(`document.querySelectorAll('.doc-error').length > 0`);
  console.log('error state', JSON.stringify(await readDialog()));
  console.log('dialog still open after invalid', await evaluate(`document.querySelectorAll('.doc-modal').length > 0`));
  await shot('doc-settings-error.png');

  await setValue('#doc-width', '1000');
  await setValue('#doc-height', '700');
  await setValue('#doc-bg-hex', '#eef4ff');
  await setValue('#doc-name', '文档设置验收');
  await setValue('#doc-board-name', '主画板');
  console.log('filled before apply', JSON.stringify(await readDialog()));
  await clickDialog('应用更改');
  await waitFor(`document.querySelectorAll('.doc-modal').length === 0`);
  console.log('swatch immediately after apply', await evaluate(`document.querySelector('.paint-swatch')?.style.background ?? ''`));
  console.log('board dot immediately after apply', await evaluate(`document.querySelector('.board-dot')?.style.background ?? ''`));
  console.log('apply toast', await toast());
  console.log('status count', await evaluate(`document.querySelector('.status-count')?.innerText ?? ''`));
  await sleep(800);
  await shot('doc-settings-applied.png');

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await waitFor(`document.querySelectorAll('.doc-modal').length > 0`);
  console.log('reopened after apply', JSON.stringify(await readDialog()));
  console.log('board swatch after apply', await evaluate(`document.querySelector('.paint-swatch')?.style.background ?? ''`));
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
  await waitFor(`document.querySelectorAll('.doc-modal').length === 0`);

  await undo();
  console.log('undo toast', await evaluate(`document.querySelector('.toast')?.innerText ?? ''`));

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await waitFor(`document.querySelectorAll('.doc-modal').length > 0`);
  console.log('reopened after undo', JSON.stringify(await readDialog()));
  await sleep(350);
  const layout = await evaluate(`(() => {
    const d = document.querySelector('.doc-modal');
    const b = d?.querySelector('.modal-body');
    const inputs = [...(d?.querySelectorAll('input') ?? [])];
    return {
      modal: d ? { cw: d.clientWidth, sw: d.scrollWidth } : null,
      body: b ? { cw: b.clientWidth, sw: b.scrollWidth } : null,
      inputs: inputs.map((i) => ({ id: i.id || i.className, cw: i.clientWidth, sw: i.scrollWidth, value: i.value })),
      overflowX: !!(d && d.scrollWidth > d.clientWidth + 1),
    };
  })()`);
  console.log('layout', JSON.stringify(layout));
  await shot('doc-settings-undo.png');

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }))`);
  await waitFor(`document.querySelectorAll('.doc-modal').length === 0`);
  console.log('escape closed', true);
  await sleep(300);
  console.log('focus after close', await evaluate(`document.activeElement?.className ?? ''`));

  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }))`);
  await waitFor(`document.querySelectorAll('.doc-modal').length > 0`);
  console.log('window capture ready', true);

  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
