import fs from 'node:fs';

const port = process.env.CDP_PORT || '9224';
const out = process.env.SHOT_OUT || 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots\\layers-drag.png';
const hoverOut = process.env.SHOT_HOVER_OUT || out.replace(/\\.png$/, '-hover.png');
const insideOut = process.env.SHOT_INSIDE_OUT || out.replace(/\\.png$/, '-inside.png');
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
  const rows = () => evaluate(`([...document.querySelectorAll('.layer-row')].map((row) => {
    const r = row.getBoundingClientRect();
    return { text: row.innerText.replace(/\\s+/g, ' ').trim(), indent: row.style.paddingLeft, x: r.x, y: r.y, w: r.width, h: r.height, cls: row.className };
  }))`);
  const waitRows = async () => {
    for (let i = 0; i < 20; i++) {
      if (await evaluate(`document.querySelectorAll('.layer-row').length`)) return;
      await sleep(250);
    }
    throw new Error('图层面板没有出现');
  };
  const shot = async (path) => {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(path.replace(/[\\\\/][^\\\\/]+$/, ''), { recursive: true });
    fs.writeFileSync(path, Buffer.from(res.data, 'base64'));
    console.log('screenshot', path, fs.statSync(path).size);
  };
  const drag = async (fromText, toText, zone, hoverPath) => {
    const list = await rows();
    const from = list.find((r) => r.text === fromText);
    const to = list.find((r) => r.text === toText);
    if (!from || !to) throw new Error(`找不到拖拽行：${fromText} -> ${toText}`);
    const toY = zone === 'inside' ? to.y + to.h / 2 : to.y + (zone === 'before' ? 5 : to.h - 5);
    const x = to.x + to.w * 0.55;
    console.log('drag', fromText, '->', toText, zone, { x, y: toY });
    await evaluate(`(() => {
      const from = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(fromText)});
      const dt = new DataTransfer();
      window.__layerDragData = dt;
      window.__layerDragSource = from;
      const r = from.getBoundingClientRect();
      from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      return { type: dt.types, id: dt.getData('text/plain') };
    })()`);
    await sleep(220);
    const hover = await evaluate(`(() => {
      const to = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(toText)}));
      if (!to) return false;
      window.__layerDropTarget = to;
      to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: window.__layerDragData, clientX: ${x}, clientY: ${toY} }));
      return to.className;
    })()`);
    console.log('hover class', hover);
    await sleep(400);
    if (hoverPath) await shot(hoverPath);
    const after = await evaluate(`(() => {
      const to = window.__layerDropTarget;
      const from = window.__layerDragSource;
      to?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: window.__layerDragData, clientX: ${x}, clientY: ${toY} }));
      from?.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: window.__layerDragData }));
      return { to: !!to, from: !!from };
    })()`);
    await sleep(900);
    console.log('events', JSON.stringify(await evaluate(`window.__layerLog.slice(-10)`), null, 2));
    return after;
  };

  await send('Runtime.enable');
  await sleep(800);
  await evaluate(`(() => {
    if (window.__layerLogReady) return;
    window.__layerLogReady = true;
    window.__layerLog = [];
    for (const type of ['dragstart', 'dragover', 'drop', 'dragend']) {
      document.addEventListener(type, (e) => {
        const row = e.target.closest?.('.layer-row');
        window.__layerLog.push({
          type, target: row?.innerText.replace(/\\s+/g, ' ').trim() ?? e.target?.tagName,
          y: e.clientY, types: [...(e.dataTransfer?.types ?? [])],
          data: (() => { try { return e.dataTransfer?.getData('text/plain') ?? null; } catch (err) { return 'ERR:' + err.message; } })(),
          cls: row?.className,
        });
      }, true);
    }
    window.addEventListener('error', (e) => window.__layerLog.push({ type: 'error', message: e.message }));
    window.addEventListener('unhandledrejection', (e) => window.__layerLog.push({ type: 'rejection', message: String(e.reason) }));
  })()`);
  await evaluate(`(() => {
    const tab = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === '图层');
    tab?.click();
    return !!tab;
  })()`);
  await waitRows();
  await evaluate(`(() => {
    const group = [...document.querySelectorAll('.layer-row')].find((row) => row.innerText.includes('卡片组'));
    group?.querySelector('.layer-caret')?.click();
    return !!group;
  })()`);
  await sleep(600);

  console.log('before', JSON.stringify(await rows(), null, 2));
  // 1) 组内排序：标题拖到副标题上方
  await drag('标题 T', '副标题 T', 'before', hoverOut);
  console.log('after-group-sort', JSON.stringify(await rows(), null, 2));
  // 2) 拖入组：操作提示放入图标组中间
  await drag('操作提示 T', '图标组 G', 'inside', insideOut);
  console.log('after-into-group', JSON.stringify(await rows(), null, 2));
  // 3) 拖出组：操作提示拖到根层背景上方
  await drag('操作提示 T', '背景 P', 'before', null);
  console.log('after-out-group', JSON.stringify(await rows(), null, 2));

  const state = await evaluate(`({
    status: [...document.querySelectorAll('*')].filter((x) => /已保存|未保存|foo/.test(x.innerText || '')).slice(0,3).map((x) => x.innerText),
    title: document.title,
    openGroups: [...document.querySelectorAll('.layer-row')].map((r) => r.className + '|' + r.style.paddingLeft),
  })`);
  console.log('state', JSON.stringify(state));
  await shot(out);
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
