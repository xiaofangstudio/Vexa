import fs from 'node:fs';

const port = process.env.CDP_PORT || '9328';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => { console.error('CDP 描边对齐验收超时'); process.exit(2); }, 240000);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = targets.find((t) => t.type === 'page' && /tauri|localhost|127\.0\.0\.1/.test(t.url)) ?? targets.find((t) => t.type === 'page');
  if (!page) throw new Error('没有找到 Vexa 页面');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params?.exceptionDetails?.exception?.description ?? 'exception');
    if (!msg.id) return;
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result?.value;
  };
  const waitFor = async (expression, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(expression)) return true; await sleep(250); }
    throw new Error(`等待超时：${expression}`);
  };
  const shot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.mkdirSync(outDir, { recursive: true });
    const path = `${outDir}\\${name}`; fs.writeFileSync(path, Buffer.from(res.data, 'base64'));
    console.log('screenshot', path, fs.statSync(path).size);
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(`断言失败：${msg}`); console.log('PASS', msg); };
  const key = async (keyName, vk, code, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await sleep(180);
  };
  const mouse = async (type, x, y, buttons = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
    await sleep(70);
  };
  const tool = async (label) => {
    const ok = await evaluate(`(() => { const el=[...document.querySelectorAll('.tool-btn')].find((b)=>(b.getAttribute('aria-label')??'').startsWith(${JSON.stringify(label)})); if(!el)return false; el.click(); return true; })()`);
    assert(ok, `切换到${label}工具`);
    await sleep(250);
  };
  const tabNamed = async (name) => {
    const ok = await evaluate(`(() => { const b=[...document.querySelectorAll('.dock-tab')].find((x)=>x.innerText.includes(${JSON.stringify(name)})); if(!b)return false; b.click(); return true; })()`);
    assert(ok, `切换到${name}标签`);
    await sleep(350);
  };
  const section = (name) => `[...document.querySelectorAll('.dock-body .dock-sec')].find((s)=>s.querySelector('.dock-sec-head span')?.innerText.trim()===${JSON.stringify(name)})`;
  const setFillNone = async () => {
    const ok = await evaluate(`(() => { const sec=${section('填充')}; if(!sec)return false; sec.scrollIntoView({block:'center'}); const b=[...sec.querySelectorAll('.paint-mode')].find((x)=>x.innerText.trim()==='无'); if(!b)return false; b.click(); return true; })()`);
    assert(ok, '填充设为无');
    await sleep(400);
  };
  const setStroke = async (color, width) => {
    const ok = await evaluate(`(() => {
      const sec=${section('描边')}; if(!sec)return false; sec.scrollIntoView({block:'center'});
      const el=sec.querySelector('.paint-row .paint-swatch input[type="color"]'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,${JSON.stringify(color)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      const w=sec.querySelector('.paint-row input.field-input.num'); if(!w)return false;
      set.call(w,${JSON.stringify(String(width))}); w.dispatchEvent(new Event('input',{bubbles:true})); w.focus(); w.dispatchEvent(new Event('change',{bubbles:true})); w.blur(); return true;
    })()`);
    assert(ok, `描边设为 ${color} / ${width}px`);
    await sleep(650);
  };
  const setAlign = async (label) => {
    const ok = await evaluate(`(() => { const sec=${section('描边')}; const b=[...sec.querySelectorAll('.align-row .dash-chip')].find((x)=>x.innerText.trim()===${JSON.stringify(label)}); if(!b)return false; b.click(); return true; })()`);
    assert(ok, `描边对齐设为${label}`);
    await sleep(500);
  };
  const read = () => evaluate(`(() => {
    const cv=document.querySelector('.cv-canvas'); if(!cv)return null;
    const k=Object.keys(cv).find((x)=>x.includes('reactFiber')); let f=k?cv[k]:null; let shell=f;
    while(shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell=shell.return;
    const d=shell?.memoizedState?.memoizedState?.current;
    const paths=Object.values(d.nodes).filter((n)=>n.kind==='path');
    const last=paths.slice(-2);
    const bounds=(p)=>{ const xs=[],ys=[]; for(const sub of p.subpaths) for(const a of sub.anchors){xs.push(a.x);ys.push(a.y);} return {x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}; };
    return {
      paths: paths.length,
      items: last.map((p)=>({id:p.id, align:p.stroke?.align??'center', width:p.stroke?.width, color:p.stroke?.color, bounds:bounds(p), fill:p.fill?.kind})),
      panel: (() => {
        const sec=[...document.querySelectorAll('.dock-body .dock-sec')].find((s)=>s.querySelector('.dock-sec-head span')?.innerText.trim()==='描边');
        if(!sec)return null;
        const body=document.querySelector('.dock-body'); const tabs=document.querySelector('.dock-tabs');
        const align=sec.querySelector('.align-row');
        return {
          alignChips:[...align.querySelectorAll('.dash-chip')].map((b)=>({label:b.innerText.trim(),on:b.classList.contains('is-on')})),
          alignWidth:align?.scrollWidth??0, alignClient:align?.clientWidth??0,
          bodyOverflow:body ? body.scrollWidth > body.clientWidth + 1 : false,
          secOverflow:sec.scrollWidth > sec.clientWidth + 1,
          alignOverflow:align ? align.scrollWidth > align.clientWidth + 1 : false,
          tabsOverflow:tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
        };
      })(),
    };
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);
  await key('1', 49, 'Digit1', 2);

  const geom = await evaluate(`(() => { const r=document.querySelector('.cv-canvas').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const leftX = geom.x + geom.w * 0.28, y1 = geom.y + geom.h * 0.36;
  const rightX = leftX + 250;

  await tool('矩形');
  await mouse('mouseMoved', leftX, y1); await mouse('mousePressed', leftX, y1, 1);
  await mouse('mouseMoved', leftX + 180, y1 + 130, 1); await mouse('mouseReleased', leftX + 180, y1 + 130);
  await sleep(700);
  await tool('选择'); await key('V', 86, 'KeyV'); await sleep(350);
  await tabNamed('属性');
  await setFillNone();
  await setStroke('#e5484d', 20);
  await setAlign('内侧');

  await tool('矩形');
  await mouse('mouseMoved', rightX, y1); await mouse('mousePressed', rightX, y1, 1);
  await mouse('mouseMoved', rightX + 180, y1 + 130, 1); await mouse('mouseReleased', rightX + 180, y1 + 130);
  await sleep(700);
  await tool('选择'); await key('V', 86, 'KeyV'); await sleep(350);
  await tabNamed('属性');
  await setFillNone();
  await setStroke('#0f76d6', 20);
  await setAlign('外侧');

  let d = await read();
  assert(d.paths >= 2, '两个矩形已创建');
  assert(d.items[0]?.align === 'inside' && d.items[0]?.width === 20, '左矩形为 20px 内侧描边');
  assert(d.items[1]?.align === 'outside' && d.items[1]?.width === 20, '右矩形为 20px 外侧描边');
  assert(d.items[0]?.bounds.x1 - d.items[0]?.bounds.x0 === 180 && d.items[1]?.bounds.x1 - d.items[1]?.bounds.x0 === 180, '两矩形路径几何保持 180px');
  assert(d.panel?.alignChips.find((c) => c.on)?.label === '外侧', '对齐按钮回显外侧');
  assert(d.panel?.alignChips.length === 3, '对齐按钮共三个');
  assert(!d.panel?.bodyOverflow && !d.panel?.secOverflow && !d.panel?.alignOverflow && !d.panel?.tabsOverflow, '1600 宽描边与对齐行无溢出');
  assert(d.panel?.bodyOverflow === false && d.panel?.alignWidth <= d.panel?.alignClient, '对齐行宽度完整');

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  await tabNamed('属性');
  d = await read();
  assert(!d.panel?.bodyOverflow && !d.panel?.secOverflow && !d.panel?.alignOverflow && !d.panel?.tabsOverflow, '1200 宽描边与对齐行无溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  await tabNamed('属性');
  d = await read();
  assert(d.items[1]?.align === 'outside', '最终仍是外侧描边');
  assert(errors.length === 0, '无运行时异常');
  await shot('stroke-align.png');
  ws.close(); clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
