import fs from 'node:fs';

const port = process.env.CDP_PORT || '9223';
const out = process.env.SHOT_OUT || 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots\\layers-inspect.png';
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

  await send('Runtime.enable');
  await sleep(1000);
  await evaluate(`(() => {
    const tab = [...document.querySelectorAll('.right-tab, .dock-tab, button')].find((b) => b.innerText.trim() === '图层');
    tab?.click();
    return !!tab;
  })()`);
  await sleep(600);
  const info = await evaluate(`(() => {
    const text = document.body.innerText.slice(0, 900);
    const right = document.querySelector('.right-panel')?.innerText ?? '';
    const layerRows = [...document.querySelectorAll('.layer-row')].map((row) => ({
      text: row.innerText.replace(/\\s+/g, ' ').trim(),
      rect: (() => { const r = row.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
      cls: row.className,
      draggable: row.draggable,
    }));
    return { text, right, layerRows, title: document.title, size: { w: innerWidth, h: innerHeight } };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(out.replace(/[\\\\/][^\\\\/]+$/, ''), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('screenshot', out, fs.statSync(out).size);
  ws.close();
}

main().catch((error) => { console.error(error); process.exit(1); });
