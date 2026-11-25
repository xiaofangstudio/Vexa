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
  const clickText = async (selector, text) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.innerText.trim() === ${JSON.stringify(text)});
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到按钮：${text}`);
    await sleep(420);
  };
  const readBoard = () => evaluate(`(() => {
    const inputs = [...document.querySelectorAll('.dock-grid input')];
    return {
      boardName: [...document.querySelectorAll('.board-row')].find((b) => b.className.includes('is-on'))?.querySelector('.board-name')?.innerText ?? '',
      boardSize: [...document.querySelectorAll('.board-row')].find((b) => b.className.includes('is-on'))?.querySelector('.faint')?.innerText ?? '',
      w: inputs[0]?.value ?? null,
      h: inputs[1]?.value ?? null,
      customChips: [...document.querySelectorAll('.custom-board-presets .board-preset')].map((c) => ({
        label: c.innerText.trim(),
        on: c.className.includes('is-on'),
      })),
      toast: document.querySelector('.toast')?.innerText ?? '',
      focus: document.activeElement?.className ?? '',
    };
  })()`);
  const readDialog = () => evaluate(`(() => {
    const d = document.querySelector('.preset-modal');
    if (!d) return null;
    return {
      rows: [...d.querySelectorAll('.preset-row')].map((r) => ({
        name: r.querySelector('.preset-row-name')?.innerText ?? '',
        size: r.querySelector('.preset-row-size')?.innerText ?? '',
      })),
      formW: d.querySelectorAll('.preset-form input.num')[0]?.value ?? null,
      formH: d.querySelectorAll('.preset-form input.num')[1]?.value ?? null,
      notice: d.querySelector('.preset-notice')?.innerText ?? '',
      counter: d.querySelector('.preset-sec-head .num')?.innerText ?? '',
      focus: document.activeElement?.className ?? '',
      layout: {
        modal: { cw: d.clientWidth, sw: d.scrollWidth },
        body: (() => { const b = d.querySelector('.preset-body'); return { cw: b?.clientWidth, sw: b?.scrollWidth }; })(),
        rows: [...d.querySelectorAll('.preset-row')].map((r) => ({ cw: r.clientWidth, sw: r.scrollWidth })),
        inputs: [...d.querySelectorAll('input:not([type=file])')].map((i) => ({ cls: i.className, cw: i.clientWidth, sw: i.scrollWidth })),
        overflowX: d.scrollWidth > d.clientWidth + 1,
      },
    };
  })()`);
  const applyRow = async (name) => {
    const ok = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.preset-row')].find((r) => r.querySelector('.preset-row-name')?.innerText.trim() === ${JSON.stringify(name)});
      const b = row ? [...row.querySelectorAll('button')].find((x) => x.innerText.trim() === '应用') : null;
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到预设行：${name}`);
    await sleep(500);
  };

  await send('Runtime.enable');
  await send('DOM.enable');
  await waitFor(`document.querySelectorAll('.board-preset-actions').length > 0`, 25000);
  console.log('initial board', JSON.stringify(await readBoard()));

  const initialCustom = await evaluate(`document.querySelectorAll('.custom-board-presets .board-preset').length`);
  if (initialCustom < 2) {
    await evaluate(`document.querySelector('.board-preset-open').click()`);
    await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
    const root = await send('DOM.getDocument', { depth: -1 });
    const inputNode = await send('DOM.querySelector', { nodeId: root.root.nodeId, selector: '.preset-modal input[type=file]' });
    await send('DOM.setFileInputFiles', { files: [importPath], nodeId: inputNode.nodeId });
    await sleep(800);
    await evaluate(`document.querySelector('.preset-x').click()`);
    await waitFor(`document.querySelectorAll('.preset-modal').length === 0`);
    console.log('seeded presets while editor lacked them', await evaluate(`document.querySelectorAll('.custom-board-presets .board-preset').length`));
  }

  await clickText('.board-preset-actions .btn-link', '存当前尺寸');
  await waitFor(`document.querySelectorAll('.custom-board-presets .board-preset').length >= 3`);
  console.log('after saving current board', JSON.stringify(await readBoard()));

  await evaluate(`document.querySelector('.board-preset-open').click()`);
  await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
  await sleep(350);
  console.log('editor dialog', JSON.stringify(await readDialog()));
  await shot('presets-editor-dialog.png');

  await applyRow('海报');
  await waitFor(`document.querySelectorAll('.preset-modal').length === 0`);
  await sleep(500);
  console.log('after apply poster', JSON.stringify(await readBoard()));

  await clickText('.board-tools .panel-btn', '适配内容');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('适配')`);
  await sleep(600);
  console.log('after fit content', JSON.stringify(await readBoard()));
  await shot('presets-editor-panel.png');

  await evaluate(`document.querySelector('.board-preset-open').click()`);
  await waitFor(`document.querySelectorAll('.preset-modal').length > 0`);
  await sleep(400);
  console.log('editor reopen for window', JSON.stringify(await readDialog()));
  console.log('window capture ready', true);

  ws.close();
  clearTimeout(watchdog);
  setTimeout(() => process.exit(0), 150);
}

main().catch((error) => { console.error(error); process.exit(1); });
