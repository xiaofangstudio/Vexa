import fs from 'node:fs';

const port = process.env.CDP_PORT || '9321';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => { console.error('CDP 外观混合验收超时'); process.exit(2); }, 240000);
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
  const setPaint = async (section, color, width) => {
    const ok = await evaluate(`(() => {
      const sec=[...document.querySelectorAll('.dock-body .dock-sec')].find((s)=>s.querySelector('.dock-sec-head span')?.innerText.trim()===${JSON.stringify(section)});
      if(!sec)return false; sec.scrollIntoView({block:'center'});
      const el=sec.querySelector('.paint-row .paint-swatch input[type="color"]'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,${JSON.stringify(color)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
      const w=sec.querySelector('.paint-row input.field-input.num');
      if(w && ${width !== undefined}){ set.call(w,${JSON.stringify(String(width??0))}); w.dispatchEvent(new Event('input',{bubbles:true})); w.focus(); }
      return true;
    })()`);
    assert(ok, `属性坞设置${section}`);
    await sleep(250); await evaluate(`document.activeElement?.blur()`); await sleep(450);
  };
  const setColor = async (id, color) => {
    const ok = await evaluate(`(() => {
      const el=document.querySelector('.apr-item[data-ap-id="${id}"] .apr-color'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,${JSON.stringify(color)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;
    })()`);
    assert(ok, `设置 ${id} 颜色`);
    await sleep(400);
  };
  const setNumber = async (id, cls, value) => {
    const ok = await evaluate(`(() => {
      const el=document.querySelector('.apr-item[data-ap-id="${id}"] .${cls} input'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
      set.call(el,${JSON.stringify(String(value))}); el.dispatchEvent(new Event('input',{bubbles:true})); return true;
    })()`);
    assert(ok, `设置 ${id} ${cls}`);
    await sleep(400);
  };
  const setBlend = async (id, value) => {
    const ok = await evaluate(`(() => {
      const el=document.querySelector('.apr-item[data-ap-id="${id}"] .apr-blend'); if(!el)return false;
      const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
      set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;
    })()`);
    assert(ok, `设置 ${id} 混合模式 ${value}`);
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
      appearances: (p?.appearance ?? []).map((a)=>({id:a.id, kind:a.kind, blend:a.blend, opacity:a.opacity, fill:a.fill?.color, stroke:a.stroke?{color:a.stroke.color,width:a.stroke.width}:null})),
      panel: (() => {
        const panel=document.querySelector('.apr-panel'); if(!panel)return null;
        const rows=[...panel.querySelectorAll('.apr-item')];
        const body=document.querySelector('.dock-body'); const tabs=document.querySelector('.dock-tabs');
        return {
          rows: rows.length,
          rowHeight: rows[0]?.getBoundingClientRect().height ?? 0,
          blends: rows.map((r)=>r.querySelector('.apr-blend')?.value ?? ''),
          labels: rows.map((r)=>r.querySelector('.apr-sub-label')?.innerText.trim() ?? ''),
          options: rows[0]?.querySelectorAll('.apr-blend option').length ?? 0,
          bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
          panelOverflow: panel.scrollWidth > panel.clientWidth + 1,
          rowOverflow: rows.map((r)=>r.scrollWidth > r.clientWidth + 1),
          tabsOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
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
  const x1 = geom.x + geom.w * 0.34, y1 = geom.y + geom.h * 0.38;
  await tool('矩形');
  await mouse('mouseMoved', x1, y1); await mouse('mousePressed', x1, y1, 1);
  await mouse('mouseMoved', x1 + 260, y1 + 180, 1); await mouse('mouseReleased', x1 + 260, y1 + 180);
  await sleep(800);
  await tool('选择'); await key('V', 86, 'KeyV'); await sleep(400);
  assert((await read()).paths >= 1, '矩形已创建');

  await tabNamed('属性');
  await setPaint('填充', '#0f76d6');
  await setPaint('描边', '#111319', 6);

  await tabNamed('外观');
  await waitFor(`document.querySelector('.apr-panel') !== null`, 8000);
  await evaluate(`document.querySelector('.apr-add-fill').click()`); await sleep(500);
  await setColor('ap1', '#e5484d');
  await setNumber('ap1', 'apr-opacity', 90);
  await setBlend('ap1', 'multiply');
  await evaluate(`document.querySelector('.apr-add-stroke').click()`); await sleep(500);
  await setColor('ap2', '#f5b301');
  await setNumber('ap2', 'apr-width', 8);
  await setBlend('ap2', 'screen');

  let d = await read();
  assert(d.appearances.length === 2, '两层外观已建立');
  assert(d.appearances[0].blend === 'multiply' && d.appearances[1].blend === 'screen', '混合模式落到文档');
  assert(d.appearances[0].fill === '#e5484d' && d.appearances[1].stroke.width === 8, '颜色与描边宽度保留');
  assert(d.panel && d.panel.rows === 2, '外观面板显示两层');
  assert(d.panel.blends.join(',') === 'screen,multiply', '面板顶层优先且混合下拉回显');
  assert(d.panel.labels.every((x) => x === '混合'), '每层都有混合行');
  assert(d.panel.options === 16, '混合下拉包含 16 种模式');
  assert(d.panel.rowHeight >= 46, '双行外观项高度足够');
  assert(!d.panel.bodyOverflow && !d.panel.panelOverflow && !d.panel.tabsOverflow, '1600 宽外观面板无溢出');
  assert(d.panel.rowOverflow.every((v) => !v), '1600 宽双行外观项不截断');

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  await tabNamed('外观');
  d = await read();
  assert(!d.panel.bodyOverflow && !d.panel.panelOverflow && !d.panel.tabsOverflow, '1200 宽外观面板无溢出');
  assert(d.panel.rowOverflow.every((v) => !v), '1200 宽双行外观项不截断');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  await tabNamed('外观');
  d = await read();
  assert(d.appearances.length === 2, '最终截图仍是两层外观');
  assert(errors.length === 0, '无运行时异常');
  await shot('appearance-blend.png');
  ws.close(); clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
