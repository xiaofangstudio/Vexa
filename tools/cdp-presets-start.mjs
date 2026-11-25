import fs from 'node:fs';

const port = process.env.CDP_PORT || '9225';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const importPath = 'D:\\20533\\deskbox\\fangwork\\Vexa\\scripts\\fixtures\\presets-import.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 60000);
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
  const setNth = async (selector, index, value) => {
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
      if (!el) return false;
      const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      desc.set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`找不到第 ${index + 1} 个输入框：${selector}`);
    await sleep(120);
  };
  const clickDialog = async (text) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.preset-modal button')].find((x) => x.innerText.trim() === ${JSON.stringify(text)});
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到弹窗按钮：${text}`);
    await sleep(420);
  };
  const readForm = () => evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.create-fields .field-input')];
    return { w: inputs[0]?.value ?? null, h: inputs[1]?.value ?? null, name: inputs[2]?.value ?? null };
  })()`);
  const readDialog = () => evaluate(`(() => {
    const d = document.querySelector('.preset-modal');
    if (!d) return null;
    return {
      rows: [...d.querySelectorAll('.preset-row')].map((r) => ({
        name: r.querySelector('.preset-row-name')?.innerText ?? '',
        size: r.querySelector('.preset-row-size')?.innerText ?? '',
        applySize: r.querySelector('.preset-mini')?.getBoundingClientRect().width ?? 0,
      })),
      notice: d.querySelector('.preset-notice')?.innerText ?? '',
      counter: d.querySelector('.preset-sec-head .num')?.innerText ?? '',
      focus: document.activeElement?.className ?? '',
      layout: {
        modal: { cw: d.clientWidth, sw: d.scrollWidth },
        body: (() => { const b = d.querySelector('.preset-body'); return { cw: b?.clientWidth, sw: b?.scrollWidth }; })(),
        form: (() => { const f = d.querySelector('.preset-form'); return { cw: f?.clientWidth, sw: f?.scrollWidth }; })(),
        inputs: [...d.querySelectorAll('input:not([type=file])')].map((i) => ({ cls: i.className, cw: i.clientWidth, sw: i.scrollWidth })),
        overflowX: d.scrollWidth > d.clientWidth + 1,
      },
    };
  })()`);
  const readPage = () => evaluate(`(() => ({
    w: document.querySelectorAll('.create-fields .field-input')[0]?.value ?? null,
    h: document.querySelectorAll('.create-fields .field-input')[1]?.value ?? null,
    preview: document.querySelector('.preview-meta .num')?.innerText ?? '',
    customChips: [...document.querySelectorAll('.custom-presets .chip')].map((c) => ({
      label: c.querySelector('.chip-label')?.innerText ?? '',
      note: c.querySelector('.chip-note')?.innerText ?? '',
      on: c.className.includes('is-on'),
    })),
    focus: document.activeElement?.className ?? '',
  }))()`);
  const clickChip = async (label) => {
    const ok = await evaluate(`(() => {
      const c = [...document.querySelectorAll('.custom-presets .chip')].find((x) => x.querySelector('.chip-label')?.innerText.trim() === ${JSON.stringify(label)});
      c?.click();
      return !!c;
    })()`);
    if (!ok) throw new Error(`找不到自定义预设：${label}`);
    await sleep(350);
  };
  const applyRow = async (name) => {
    const ok = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.preset-row')].find((r) => r.querySelector('.preset-row-name')?.innerText.trim() === ${JSON.stringify(name)});
      const b = row ? [...row.querySelectorAll('button')].find((x) => x.innerText.trim() === '应用') : null;
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到预设行：${name}`);
    await sleep(450);
  };

  await send('Runtime.enable');
  await send('DOM.enable');
  await evaluate(`localStorage.removeItem('vexa.board-presets.v1'); location.reload(); true`);
  await sleep(1800);
  await waitFor(`document.querySelectorAll('.preset-open').length > 0`, 20000);
  console.log('initial page', JSON.stringify(await readPage()));

  await evaluate(`document.querySelector('.preset-open').click()`);
  await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
  console.log('empty dialog', JSON.stringify(await readDialog()));
  console.log('initial focus', await evaluate(`document.activeElement?.className ?? ''`));

  await setNth('.preset-form .field-input', 0, '名片');
  await setNth('.preset-form input.num', 0, '90');
  await setNth('.preset-form input.num', 1, '54');
  await clickDialog('保存');
  await waitFor(`document.querySelectorAll('.preset-row').length === 1`);
  console.log('after save', JSON.stringify(await readDialog()));

  await setNth('.preset-form .field-input', 0, '重复名片');
  await clickDialog('保存');
  await waitFor(`document.querySelector('.preset-notice')?.innerText.includes('已在预设中')`);
  console.log('duplicate error', JSON.stringify(await readDialog()));
  await shot('presets-start-error.png');

  const root = await send('DOM.getDocument', { depth: -1 });
  const inputNode = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '.preset-modal input[type=file]' });
  await send('DOM.setFileInputFiles', { files: [importPath], nodeId: inputNode.nodeId });
  await sleep(600);
  if (!(await evaluate(`document.querySelectorAll('.preset-row').length >= 2`))) {
    await evaluate(`document.querySelector('.preset-modal input[type=file]').dispatchEvent(new Event('change', { bubbles: true }))`);
  }
  await waitFor(`document.querySelectorAll('.preset-row').length === 2`, 8000);
  console.log('after import', JSON.stringify(await readDialog()));
  await shot('presets-start-dialog.png');

  await applyRow('海报');
  await waitFor(`document.querySelectorAll('.preset-modal').length === 0`);
  console.log('after apply', JSON.stringify(await readPage()));
  console.log('custom chips', await evaluate(`document.querySelectorAll('.custom-presets .chip').length`));
  await sleep(350);
  await shot('presets-start-applied.png');

  await evaluate(`document.querySelector('.preset-open').click()`);
  await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
  await sleep(400);
  console.log('reopen for window capture', JSON.stringify(await readDialog()));
  console.log('window capture ready', true);

  ws.close();
  clearTimeout(watchdog);
  setTimeout(() => process.exit(0), 150);
}

main().catch((error) => { console.error(error); process.exit(1); });
