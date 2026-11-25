import fs from 'node:fs';

const port = process.env.CDP_PORT || '9224';
const mode = process.env.MODE || 'layers';
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
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result?.value;
  };
  const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const path = `${outDir}\\${name}`;
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path, Buffer.from(res.data, 'base64'));
    console.log('screenshot', path, fs.statSync(path).size);
  };
  const clickTab = async (label) => {
    const ok = await evaluate(`(() => {
      const tab = [...document.querySelectorAll('.dock-tab')].find((b) => b.innerText.trim() === ${JSON.stringify(label)});
      tab?.click();
      return !!tab;
    })()`);
    if (!ok) throw new Error(`找不到标签：${label}`);
    await sleep(700);
  };
  const rows = () => evaluate(`([...document.querySelectorAll('.layer-row')].map((row) => {
    const name = row.querySelector('.layer-name')?.innerText.replace(/\\s+/g, ' ').trim() ?? '';
    const eye = row.querySelector('.layer-eye')?.getAttribute('aria-label') ?? '';
    const lock = row.querySelector('.layer-lock')?.getAttribute('aria-label') ?? '';
    return { name, eye, lock, on: row.classList.contains('is-on'), text: row.innerText.replace(/\\s+/g, ' ').trim() };
  }))`);
  const clickRow = async (name, mods = {}) => {
    const ok = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === ${JSON.stringify(name)});
      const btn = row?.querySelector('.layer-name');
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ${!!mods.ctrlKey}, shiftKey: ${!!mods.shiftKey}, metaKey: ${!!mods.metaKey} }));
      return !!btn;
    })()`);
    if (!ok) throw new Error(`找不到图层行：${name}`);
    await sleep(450);
  };
  const selectedNames = async () => (await rows()).filter((r) => r.on).map((r) => r.name);
  const selectionCount = () => evaluate(`Number(document.querySelector('.opt-sel-count')?.innerText ?? -1)`);
  const toast = () => evaluate(`document.querySelector('.toast')?.innerText ?? ''`);
  const revealLayers = async () => {
    await clickTab('图层');
    for (let i = 0; i < 20; i++) {
      if (await evaluate(`document.querySelectorAll('.layer-row').length`)) break;
      await sleep(250);
    }
  };
  const expandCardGroup = async () => {
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === '卡片组');
      row?.querySelector('.layer-caret')?.click();
      return !!row;
    })()`);
    await sleep(650);
  };
  const batchButton = async (text) => {
    const ok = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('.layer-batch')].find((b) => b.innerText.includes(${JSON.stringify(text)}));
      btn?.click();
      return !!btn;
    })()`);
    if (!ok) throw new Error(`找不到批量按钮：${text}`);
    await sleep(550);
  };

  await send('Runtime.enable');
  await sleep(900);

  if (mode === 'layers') {
    await revealLayers();
    await expandCardGroup();
    await clickRow('标题');
    await clickRow('副标题', { ctrlKey: true });
    await clickRow('卡片底', { shiftKey: true });
    const selected = await selectedNames();
    console.log('multi selected', JSON.stringify(selected));
    console.log('selection count', await selectionCount());
    console.log('batch buttons', JSON.stringify(await evaluate(`([...document.querySelectorAll('.layer-batch')].map((b) => ({ text: b.innerText.trim(), disabled: b.disabled, on: b.classList.contains('is-on'), pressed: b.getAttribute('aria-pressed') })))`)));
    await shot('layers-multi.png');

    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === '标题');
      row?.querySelector('.layer-eye')?.click();
      return !!row;
    })()`);
    await sleep(700);
    console.log('after row eye hide', JSON.stringify(await rows()));
    console.log('toast', await toast());
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === '标题');
      row?.querySelector('.layer-eye')?.click();
      return !!row;
    })()`);
    await sleep(700);
    console.log('after row eye show', JSON.stringify((await rows()).filter((r) => selected.includes(r.name))));
    console.log('toast', await toast());

    await batchButton('锁定');
    console.log('after batch lock', JSON.stringify(await rows()));
    console.log('toast', await toast());
    await shot('layers-batch.png');
    await batchButton('锁定');
    console.log('after batch unlock', JSON.stringify((await rows()).filter((r) => selected.includes(r.name))));
  } else if (mode === 'props') {
    await revealLayers();
    await expandCardGroup();
    await clickRow('标题');
    await clickRow('副标题', { ctrlKey: true });
    await clickTab('属性');
    const multi = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.includes('位置') && s.innerText.includes('尺寸'));
      const inputs = [...(sec?.querySelectorAll('input') ?? [])].map((i) => i.value);
      return { found: !!sec, inputs, head: sec?.querySelector('.dock-sec-head .faint.num')?.innerText ?? '', note: document.querySelector('.dock-multi-note')?.innerText ?? '' };
    })()`);
    console.log('multi transform before', JSON.stringify(multi));
    await shot('props-transform.png');

    await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.includes('位置') && s.innerText.includes('尺寸'));
      const input = [...(sec?.querySelectorAll('input') ?? [])][2];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '260');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.blur();
    })()`);
    await sleep(800);
    const multiAfter = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.includes('位置') && s.innerText.includes('尺寸'));
      return { inputs: [...(sec?.querySelectorAll('input') ?? [])].map((i) => i.value), head: sec?.querySelector('.dock-sec-head .faint.num')?.innerText ?? '' };
    })()`);
    console.log('multi transform after W=260', JSON.stringify(multiAfter));
    await shot('props-transform-after.png');

    await revealLayers();
    await clickRow('标题');
    await clickTab('属性');
    await evaluate(`(() => {
      const body = document.querySelector('.dock-body');
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.trim().startsWith('填充'));
      if (body && sec) body.scrollTop = Math.max(0, sec.offsetTop - 120);
      return sec?.innerText.replace(/\\s+/g, ' ').trim() ?? '';
    })()`);
    await sleep(500);
    const before = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.trim().startsWith('填充'));
      return { swatch: sec?.querySelector('.paint-swatch')?.style.background ?? '', chips: sec?.querySelectorAll('.color-chip').length ?? 0, recentRows: sec?.querySelectorAll('.color-quick-row').length ?? 0 };
    })()`);
    console.log('palette before', JSON.stringify(before));
    const picked = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.trim().startsWith('填充'));
      const chip = [...(sec?.querySelectorAll('.color-chip') ?? [])].find((c) => c.title === '#ff9f0a');
      chip?.click();
      return !!chip;
    })()`);
    if (!picked) throw new Error('找不到橙色色板');
    await sleep(700);
    const after = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.innerText.trim().startsWith('填充'));
      return {
        swatch: sec?.querySelector('.paint-swatch')?.style.background ?? '',
        chips: sec?.querySelectorAll('.color-chip').length ?? 0,
        recentRows: sec?.querySelectorAll('.color-quick-row').length ?? 0,
        recent: JSON.parse(localStorage.getItem('vexa.recent-colors') ?? '[]'),
        quickText: sec?.querySelector('.color-quick')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      };
    })()`);
    console.log('palette after', JSON.stringify(after));
    await shot('props-palette.png');
  } else {
    throw new Error(`未知 MODE：${mode}`);
  }

  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
