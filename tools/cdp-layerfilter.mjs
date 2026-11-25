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
  const rows = () => evaluate(`([...document.querySelectorAll('.layer-row')].map((row) => ({
    name: row.querySelector('.layer-name')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
    on: row.classList.contains('is-on'),
    tag: row.querySelector('.layer-tag')?.dataset.layerTag ?? '',
    text: row.innerText.replace(/\\s+/g, ' ').trim(),
  })))`);
  const clickRow = async (name, mods = {}) => {
    const ok = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === ${JSON.stringify(name)});
      const btn = row?.querySelector('.layer-name');
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ${!!mods.ctrlKey}, shiftKey: ${!!mods.shiftKey}, metaKey: ${!!mods.metaKey} }));
      return !!btn;
    })()`);
    if (!ok) throw new Error(`找不到图层行：${name}`);
    await sleep(350);
  };
  const clearFilter = async () => {
    const ok = await evaluate(`(() => { const b = document.querySelector('.layer-filter-clear'); b?.click(); return !!b; })()`);
    if (!ok) throw new Error('找不到清除筛选按钮');
    await sleep(500);
  };
  const setSearch = async (value) => {
    await evaluate(`(() => {
      const input = document.querySelector('.layer-search input');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return !!input;
    })()`);
    await sleep(600);
  };
  const toast = () => evaluate(`document.querySelector('.toast')?.innerText ?? ''`);
  const expandCardGroup = async () => {
    await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === '卡片组');
      if (row && !row.querySelector('.layer-caret.is-open')) row.querySelector('.layer-caret')?.click();
      return !!row;
    })()`);
    await sleep(550);
  };
  const tagLayer = async (name, tag) => {
    await clickRow(name);
    await clickTab('属性');
    await waitFor(`[...document.querySelectorAll('.layer-tag-choice')].some((b) => b.dataset.tag === ${JSON.stringify(tag)})`);
    await evaluate(`(() => { const b = [...document.querySelectorAll('.layer-tag-choice')].find((x) => x.dataset.tag === ${JSON.stringify(tag)}); b?.click(); return !!b; })()`);
    await sleep(500);
    console.log(`tag ${name} ${tag}`, await toast());
    await clickTab('图层');
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.dock-tab').length > 0`, 20000);
  await clickTab('图层');
  await waitFor(`document.querySelectorAll('.layer-row').length > 0`, 15000);

  console.log('initial rows', JSON.stringify(await rows()));
  console.log('initial layout', JSON.stringify(await evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => { const e = q(s); return e ? { cw: e.clientWidth, sw: e.scrollWidth, ch: e.clientHeight, sh: e.scrollHeight } : null; };
    return { dock: box('.ed-dock'), body: box('.layers-body'), filter: box('.layer-filter'), viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio } };
  })()`)));

  await expandCardGroup();
  await tagLayer('标题', 'red');
  await tagLayer('副标题', 'blue');
  await tagLayer('卡片组', 'green');
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === '卡片组');
    if (!row?.querySelector('.layer-caret.is-open')) row?.querySelector('.layer-caret')?.click();
    return true;
  })()`);
  await sleep(500);
  console.log('tagged rows', JSON.stringify(await rows()));
  console.log('chips', JSON.stringify(await evaluate(`([...document.querySelectorAll('.layer-tag-filter')].map((b) => ({ tag: b.dataset.tag ?? 'all', text: b.innerText.trim(), on: b.classList.contains('is-on'), disabled: b.disabled })))`)));
  console.log('tag layout', JSON.stringify(await evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const box = (s) => { const e = q(s); return e ? { cw: e.clientWidth, sw: e.scrollWidth, ch: e.clientHeight, sh: e.scrollHeight } : null; };
    return { picker: box('.layer-tag-picker'), filters: box('.layer-tag-filters'), body: box('.layers-body'), filter: box('.layer-filter') };
  })()`)));
  await shot('layerfilter-tags.png');

  await clickRow('标题');
  await clickTab('属性');
  await waitFor(`document.querySelectorAll('.layer-tag-choice').length >= 7`);
  console.log('props picker', JSON.stringify(await evaluate(`(() => {
    const el = document.querySelector('.layer-tag-picker');
    return { text: el?.innerText.replace(/\\s+/g, ' ').trim(), sw: el?.scrollWidth, cw: el?.clientWidth, choices: [...document.querySelectorAll('.layer-tag-choice')].map((b) => ({ tag: b.dataset.tag ?? 'clear', on: b.classList.contains('is-on') })) };
  })()`)));
  await shot('layerfilter-props.png');
  await clickTab('图层');

  await setSearch('操作提示');
  console.log('search rows', JSON.stringify(await rows()));
  console.log('search state', JSON.stringify(await evaluate(`({ head: document.querySelector('.layers-head-tools .num')?.innerText, state: document.querySelector('.layer-filter-state')?.innerText.replace(/\\s+/g, ' ').trim(), empty: document.querySelector('.layer-filter-empty')?.innerText.replace(/\\s+/g, ' ').trim() ?? '', caretDisabled: document.querySelectorAll('.layer-row .layer-caret:disabled').length })`)));
  await shot('layerfilter-search.png');

  await clearFilter();
  await evaluate(`(() => { const b = document.querySelector('.layer-tag-filter[data-tag="red"]'); b?.click(); return !!b; })()`);
  await sleep(500);
  console.log('red rows', JSON.stringify(await rows()));
  console.log('red state', JSON.stringify(await evaluate(`({ head: document.querySelector('.layers-head-tools .num')?.innerText, state: document.querySelector('.layer-filter-state')?.innerText.replace(/\\s+/g, ' ').trim() })`)));
  await shot('layerfilter-red.png');

  await setSearch('操作提示');
  console.log('red+search rows', JSON.stringify(await rows()));
  console.log('red+search empty', JSON.stringify(await evaluate(`document.querySelector('.layer-filter-empty')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`)));
  await shot('layerfilter-empty.png');

  await clearFilter();
  console.log('restored rows', JSON.stringify(await rows()));
  await clickRow('标题');
  await clickRow('副标题', { ctrlKey: true });
  console.log('multi selected', JSON.stringify((await rows()).filter((r) => r.on).map((r) => r.name)));
  console.log('batch', JSON.stringify(await evaluate(`([...document.querySelectorAll('.layer-batch')].map((b) => ({ text: b.innerText.trim(), disabled: b.disabled })))`)));

  await clickTab('属性');
  await waitFor(`[...document.querySelectorAll('.layer-tag-choice')].some((b) => b.dataset.tag === 'purple')`);
  await evaluate(`(() => { const b = [...document.querySelectorAll('.layer-tag-choice')].find((x) => x.dataset.tag === 'purple'); b?.click(); return !!b; })()`);
  await sleep(500);
  console.log('multi tag toast', await toast());
  await clickTab('图层');
  console.log('multi tag rows', JSON.stringify((await rows()).filter((r) => ['标题', '副标题'].includes(r.name))));
  console.log('multi tag chips', JSON.stringify(await evaluate(`([...document.querySelectorAll('.layer-tag-filter')].map((b) => ({ tag: b.dataset.tag ?? 'all', text: b.innerText.trim(), disabled: b.disabled })))`)));

  console.log('final overflow', JSON.stringify(await evaluate(`(() => {
    const all = [...document.querySelectorAll('.layers-body, .layer-filter, .layer-tag-filters, .layer-tag-picker, .layer-search')];
    return all.map((e) => ({ cls: e.className, cw: e.clientWidth, sw: e.scrollWidth, overflowX: e.scrollWidth > e.clientWidth + 1 }));
  })()`)));
  await shot('layerfilter-final.png');

  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
