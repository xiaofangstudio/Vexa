import fs from 'node:fs';

const port = process.env.CDP_PORT || '9224';
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
  const clickTab = async (label) => {
    const ok = await evaluate(`(() => {
      const tab = [...document.querySelectorAll('.dock-tab')].find((b) => b.innerText.trim() === ${JSON.stringify(label)});
      tab?.click();
      return !!tab;
    })()`);
    if (!ok) throw new Error(`找不到标签：${label}`);
    await sleep(500);
  };
  const boardRows = () => evaluate(`([...document.querySelectorAll('.board-row')].map((r) => ({
    name: r.querySelector('.board-name')?.innerText.trim() ?? '',
    size: [...r.querySelectorAll('.faint')].map((x) => x.innerText.trim()).join(' '),
    on: r.classList.contains('is-on'),
  })))`);
  const clickText = async (selector, text) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((x) => x.innerText.trim() === ${JSON.stringify(text)});
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到按钮：${text}`);
    await sleep(550);
  };
  const clickTitle = async (title) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.board-actions .mini-btn')].find((x) => x.title === ${JSON.stringify(title)});
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到画板按钮：${title}`);
    await sleep(550);
  };
  const toast = () => evaluate(`document.querySelector('.toast')?.innerText ?? ''`);
  const state = () => evaluate(`(() => {
    const t = (s) => document.querySelector(s)?.innerText.replace(/\\s+/g, ' ').trim() ?? '';
    return {
      activePreset: t('.board-preset.is-on'),
      presets: [...document.querySelectorAll('.board-preset')].map((b) => ({ label: b.innerText.trim(), on: b.classList.contains('is-on') })),
      tools: [...document.querySelectorAll('.board-tools .panel-btn')].map((b) => b.innerText.trim()),
      disabled: [...document.querySelectorAll('.board-actions .mini-btn')].map((b) => ({ title: b.title, disabled: b.disabled })),
    };
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.dock-tab').length > 0`, 20000);
  await clickTab('属性');
  await waitFor(`document.querySelectorAll('.board-row').length > 0`, 15000);
  console.log('initial boards', JSON.stringify(await boardRows()));
  console.log('initial state', JSON.stringify(await state()));
  console.log('initial layout', JSON.stringify(await evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => { const e = q(s); return e ? { cw: e.clientWidth, sw: e.scrollWidth, ch: e.clientHeight, sh: e.scrollHeight } : null; };
    return { dock: box('.ed-dock'), body: box('.dock-body'), presets: box('.board-presets'), tools: box('.board-tools'), viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } };
  })()`)));
  await shot('boards-presets.png');

  await clickText('.board-preset', 'A4 竖版');
  console.log('after preset boards', JSON.stringify(await boardRows()));
  console.log('after preset state', JSON.stringify(await state()));
  await shot('boards-preset-a4.png');

  await clickText('.board-tools .panel-btn', '适配内容');
  console.log('fit toast', await toast());
  console.log('after fit boards', JSON.stringify(await boardRows()));
  console.log('after fit state', JSON.stringify(await state()));

  await clickText('.board-tools .panel-btn', '复制画板');
  console.log('copy toast', await toast());
  console.log('after copy boards', JSON.stringify(await boardRows()));
  console.log('after copy state', JSON.stringify(await state()));
  await shot('boards-copy.png');

  await clickTitle('上移画板');
  console.log('after up boards', JSON.stringify(await boardRows()));
  await clickTitle('下移画板');
  console.log('after down boards', JSON.stringify(await boardRows()));

  console.log('final layout', JSON.stringify(await evaluate(`(() => {
    const all = [...document.querySelectorAll('.ed-dock, .dock-body, .board-presets, .board-tools, .board-list')];
    return all.map((e) => ({ cls: e.className, cw: e.clientWidth, sw: e.scrollWidth, overflowX: e.scrollWidth > e.clientWidth + 1 }));
  })()`)));
  console.log('final boards', JSON.stringify(await boardRows()));
  await shot('boards-final.png');

  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
