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
    await sleep(450);
  };
  const clickRow = async (name, ctrl = false) => {
    const ok = await evaluate(`(() => {
      const row = [...document.querySelectorAll('.layer-row')].find((r) => r.querySelector('.layer-name')?.innerText.trim() === ${JSON.stringify(name)});
      const btn = row?.querySelector('.layer-name');
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ${ctrl} }));
      return !!btn;
    })()`);
    if (!ok) throw new Error(`找不到图层：${name}`);
    await sleep(380);
  };
  const clickBtn = async (text) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.panel-btn')].find((x) => x.innerText.trim() === ${JSON.stringify(text)} && !x.disabled);
      b?.click();
      return !!b;
    })()`);
    if (!ok) throw new Error(`找不到可用按钮：${text}`);
    await sleep(500);
  };
  const undo = async () => {
    const ok = await evaluate(`(() => { const b = document.querySelector('.icon-btn[title="撤销"]'); if (!b || b.disabled) return false; b.click(); return true; })()`);
    if (!ok) throw new Error('撤销不可用');
    await sleep(550);
  };
  const toast = () => evaluate(`document.querySelector('.toast')?.innerText ?? ''`);
  const status = () => evaluate(`document.querySelector('.status-count')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`);
  const rowCount = () => evaluate(`document.querySelectorAll('.layer-row').length`);
  const pathfinder = () => evaluate(`(() => {
    const sec = [...document.querySelectorAll('.dock-sec')].find((s) => s.querySelector('.dock-sec-head span')?.innerText.trim() === '路径查找器');
    return {
      head: sec?.querySelector('.dock-sec-head')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      buttons: [...(sec?.querySelectorAll('.panel-btn') ?? [])].map((b) => ({ text: b.innerText.trim(), disabled: b.disabled, title: b.title })),
      overflow: sec ? { cw: sec.clientWidth, sw: sec.scrollWidth } : null,
    };
  })()`);
  const scrollPanel = async () => {
    await evaluate(`(() => { const b = document.querySelector('.dock-body'); if (b) b.scrollTop = b.scrollHeight; return true; })()`);
    await sleep(300);
  };
  const selectPair = async (a, b = '') => {
    await clickTab('图层');
    await clickRow(a);
    if (b) await clickRow(b, true);
    await clickTab('属性');
  };
  const reselect = async (a, b = '') => {
    await selectPair(a, b);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.dock-tab').length > 0`, 20000);
  await clickTab('图层');
  console.log('initial rows', await rowCount(), await status());
  await selectPair('红块', '蓝块');
  console.log('selected two', await status());
  await scrollPanel();
  console.log('pathfinder ui', JSON.stringify(await pathfinder()));
  await shot('pathfinder-panel.png');

  await clickBtn('分割');
  console.log('divide toast', await toast(), 'status', await status());
  await clickTab('图层');
  console.log('divide rows', await rowCount());
  await shot('pathfinder-divide.png');
  await undo();
  console.log('after undo', await status());

  await reselect('红块', '蓝块');
  await clickBtn('修边');
  console.log('trim toast', await toast(), 'status', await status());
  await clickTab('图层');
  console.log('trim rows', await rowCount());
  await shot('pathfinder-trim.png');
  await undo();
  console.log('after undo trim', await status());

  await reselect('红块', '红块 2');
  await clickBtn('合并');
  console.log('merge toast', await toast(), 'status', await status());
  await clickTab('图层');
  console.log('merge rows', await rowCount());
  await shot('pathfinder-merge.png');
  await undo();
  console.log('after undo merge', await status());

  await reselect('红块', '蓝块');
  await clickBtn('裁剪');
  console.log('crop toast', await toast(), 'status', await status());
  await clickTab('图层');
  console.log('crop rows', await rowCount());
  await shot('pathfinder-crop.png');
  await undo();
  console.log('after undo crop', await status());

  await reselect('红块');
  await clickBtn('轮廓');
  console.log('outline toast', await toast(), 'status', await status());
  await clickTab('图层');
  console.log('outline rows', await rowCount());
  await shot('pathfinder-outline.png');
  await undo();
  console.log('after undo outline', await status());

  await clickTab('属性');
  await scrollPanel();
  console.log('final pathfinder ui', JSON.stringify(await pathfinder()));
  console.log('final layout', JSON.stringify(await evaluate(`(() => {
    const all = [...document.querySelectorAll('.ed-dock, .dock-body, .dock-sec, .pathfinder-extra')];
    return all.map((e) => ({ cls: e.className, cw: e.clientWidth, sw: e.scrollWidth, overflowX: e.scrollWidth > e.clientWidth + 1 }));
  })()`)));
  await shot('pathfinder-final.png');

  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
