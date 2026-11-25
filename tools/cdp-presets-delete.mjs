import fs from 'node:fs';

const port = process.env.CDP_PORT || '9225';
const importPath = 'D:\\20533\\deskbox\\fangwork\\Vexa\\scripts\\fixtures\\presets-import.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => { console.error('probe timeout'); process.exit(2); }, 30000);
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
  const waitFor = async (expression, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(expression)) return true;
      await sleep(200);
    }
    throw new Error(`等待超时：${expression}`);
  };

  await send('Runtime.enable');
  await send('DOM.enable');
  await waitFor(`document.querySelectorAll('.preset-open').length > 0`, 20000);
  await evaluate(`document.querySelector('.preset-open').click()`);
  await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
  await sleep(300);
  const before = await evaluate(`document.querySelectorAll('.preset-row').length`);
  console.log('before delete', before);
  if (before >= 3) {
    const deleted = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.preset-row')].find((r) => r.querySelector('.preset-row-name')?.innerText.trim() === '名片');
      const b = row ? [...row.querySelectorAll('button')].find((x) => x.innerText.trim() === '删除') : null;
      b?.click();
      return !!b;
    })()`);
    if (!deleted) throw new Error('删除按钮不可用');
    await sleep(450);
    console.log('after delete', await evaluate(`document.querySelectorAll('.preset-row').length`));
    console.log('delete notice', await evaluate(`document.querySelector('.preset-notice')?.innerText ?? ''`));
  } else {
    console.log('delete skipped: list already restored to two rows');
  }

  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await waitFor(`document.querySelectorAll('.preset-modal').length === 0`);
  await sleep(250);
  console.log('escape focus', await evaluate(`document.activeElement?.className ?? ''`));

  await evaluate(`document.querySelector('.preset-open').click()`);
  await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
  const root = await send('DOM.getDocument', { depth: -1 });
  const inputNode = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '.preset-modal input[type=file]' });
  await send('DOM.setFileInputFiles', { files: [importPath], nodeId: inputNode.nodeId });
  await sleep(700);
  if (!(await evaluate(`document.querySelectorAll('.preset-row').length >= 3`))) {
    await evaluate(`document.querySelector('.preset-modal input[type=file]').dispatchEvent(new Event('change', { bubbles: true }))`);
  }
  await waitFor(`document.querySelectorAll('.preset-row').length === 3`, 8000);
  console.log('restored rows', await evaluate(`document.querySelectorAll('.preset-row').length`));
  console.log('restore notice', await evaluate(`document.querySelector('.preset-notice')?.innerText ?? ''`));
  console.log('final names', await evaluate(`[...document.querySelectorAll('.preset-row-name')].map((x) => x.innerText).join('|')`));

  ws.close();
  clearTimeout(watchdog);
  setTimeout(() => process.exit(0), 120);
}

main().catch((error) => { console.error(error); process.exit(1); });
