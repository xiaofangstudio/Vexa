import fs from 'node:fs';

const port = process.env.CDP_PORT || '9322';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => { console.error('CDP 渐变描边验收超时'); process.exit(2); }, 240000);
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
  const setStrokeMode = async (mode) => {
    const ok = await evaluate(`(() => { const sec=${section('描边')}; if(!sec)return false; sec.scrollIntoView({block:'center'}); const b=[...sec.querySelectorAll('.paint-mode')].find((x)=>x.innerText.trim()===${JSON.stringify(mode)}); if(!b)return false; b.click(); return true; })()`);
    assert(ok, `描边切换到${mode}`);
    await sleep(450);
  };
  const setFillNone = async () => {
    const ok = await evaluate(`(() => { const sec=${section('填充')}; if(!sec)return false; sec.scrollIntoView({block:'center'}); const b=[...sec.querySelectorAll('.paint-mode')].find((x)=>x.innerText.trim()==='无'); if(!b)return false; b.click(); return true; })()`);
    assert(ok, '填充设为无');
    await sleep(400);
  };
  const setWidth = async (v) => {
    const ok = await evaluate(`(() => {
      const sec=${section('描边')}; const w=sec?.querySelector('.paint-row input.field-input.num'); if(!w)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(w,${JSON.stringify(String(v))}); w.dispatchEvent(new Event('input',{bubbles:true})); w.focus(); w.dispatchEvent(new Event('change',{bubbles:true})); w.blur(); return true;
    })()`);
    assert(ok, `描边宽度设为 ${v}`);
    await sleep(600);
  };
  const setStopColor = async (i, color) => {
    const ok = await evaluate(`(() => {
      const sec=${section('描边')}; const stops=sec?.querySelectorAll('.grad-stop'); const el=stops?.[${i}]?.querySelector('input[type="color"]'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,${JSON.stringify(color)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;
    })()`);
    assert(ok, `色标 ${i + 1} 设为 ${color}`);
    await sleep(350);
  };
  const addStop = async () => {
    const ok = await evaluate(`(() => { const sec=${section('描边')}; const b=[...sec.querySelectorAll('.grad-stop-actions .btn')].find((x)=>x.innerText.includes('添加色标')); if(!b)return false; b.click(); return true; })()`);
    assert(ok, '添加第三色标');
    await sleep(400);
  };
  const setAngle = async (v) => {
    const ok = await evaluate(`(() => {
      const sec=${section('描边')}; const el=sec?.querySelector('.grad-angle input'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,${JSON.stringify(String(v))}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.blur(); return true;
    })()`);
    assert(ok, `渐变角度设为 ${v}`);
    await sleep(500);
  };
  const read = () => evaluate(`(() => {
    const cv=document.querySelector('.cv-canvas'); if(!cv)return null;
    const k=Object.keys(cv).find((x)=>x.includes('reactFiber')); let f=k?cv[k]:null; let shell=f;
    while(shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell=shell.return;
    const d=shell?.memoizedState?.memoizedState?.current;
    const paths=Object.values(d.nodes).filter((n)=>n.kind==='path');
    const p=paths[paths.length-1];
    return {
      paths: paths.length,
      fill: p?.fill?.kind,
      stroke: p?.stroke ? { kind:p.stroke.kind, width:p.stroke.width, color:p.stroke.color, angle:p.stroke.grad?.angle, stops:(p.stroke.grad?.stops??[]).map((s)=>({offset:s.offset,color:s.color,alpha:s.alpha??1})) } : null,
      panel: (() => {
        const sec=[...document.querySelectorAll('.dock-body .dock-sec')].find((s)=>s.querySelector('.dock-sec-head span')?.innerText.trim()==='描边');
        if(!sec)return null;
        const rows=[...sec.querySelectorAll('.grad-stop')];
        const body=document.querySelector('.dock-body');
        const tabs=document.querySelector('.dock-tabs');
        return {
          modes:[...sec.querySelectorAll('.paint-mode')].map((b)=>({label:b.innerText.trim(),on:b.classList.contains('is-on')})),
          rows:rows.length,
          colors:rows.map((r)=>r.querySelector('input[type="color"]')?.value ?? ''),
          offsets:rows.map((r)=>r.querySelector('.grad-position input')?.value ?? ''),
          alphas:rows.map((r)=>r.querySelector('.grad-alpha input')?.value ?? ''),
          bar:sec.querySelector('.grad-bar')?.getBoundingClientRect().height ?? 0,
          angle:sec.querySelector('.grad-angle input')?.value ?? '',
          bodyOverflow:body ? body.scrollWidth > body.clientWidth + 1 : false,
          secOverflow:sec.scrollWidth > sec.clientWidth + 1,
          rowOverflow:rows.map((r)=>r.scrollWidth > r.clientWidth + 1),
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
  await sleep(500);

  const geom = await evaluate(`(() => { const r=document.querySelector('.cv-canvas').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })()`);
  const x1 = geom.x + geom.w * 0.38, y1 = geom.y + geom.h * 0.32;
  await tool('椭圆');
  await mouse('mouseMoved', x1, y1); await mouse('mousePressed', x1, y1, 1);
  await mouse('mouseMoved', x1 + 320, y1 + 240, 1); await mouse('mouseReleased', x1 + 320, y1 + 240);
  await sleep(800);
  await tool('选择'); await key('V', 86, 'KeyV'); await sleep(400);
  assert((await read()).paths >= 1, '椭圆已创建');

  await tabNamed('属性');
  await setFillNone();
  await setStrokeMode('线性');
  await setWidth(20);
  await setStopColor(0, '#ff4d6d');
  await setStopColor(1, '#ffc24b');
  await addStop();
  await setStopColor(1, '#ffc24b');
  await setStopColor(2, '#12c2a0');
  await setAngle(30);

  let d = await read();
  assert(d.stroke?.kind === 'linear', '描边为线性渐变');
  assert(d.stroke?.width === 20, '描边宽度 20');
  assert(d.stroke?.stops.length === 3, '三个渐变色标');
  assert(d.stroke?.stops[2]?.color === '#12c2a0', '第三色标颜色落地');
  assert(d.stroke?.angle === 30, '渐变角度落地');
  assert(d.panel?.modes.find((m) => m.on)?.label === '线性', '描边模式按钮回显线性');
  assert(d.panel?.rows === 3, '面板显示三个色标');
  assert(d.panel?.colors[0] === '#ff4d6d' && d.panel?.colors[1] === '#ffc24b', '面板色标颜色回显');
  assert(d.panel?.bar >= 10, '渐变预览条可见');
  assert(d.panel?.angle === '30', '角度输入回显 30');
  assert(!d.panel?.bodyOverflow && !d.panel?.secOverflow && !d.panel?.tabsOverflow, '1600 宽描边渐变无溢出');
  assert(d.panel?.rowOverflow.every((v) => !v), '1600 宽色标行不截断');

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  await tabNamed('属性');
  d = await read();
  assert(!d.panel?.bodyOverflow && !d.panel?.secOverflow && !d.panel?.tabsOverflow, '1200 宽描边渐变无溢出');
  assert(d.panel?.rowOverflow.every((v) => !v), '1200 宽色标行不截断');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  await tabNamed('属性');
  d = await read();
  assert(d.stroke?.stops.length === 3, '最终仍是渐变描边');
  assert(errors.length === 0, '无运行时异常');
  await shot('gradient-stroke.png');
  ws.close(); clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
