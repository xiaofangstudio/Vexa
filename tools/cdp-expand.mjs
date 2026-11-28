import fs from 'node:fs';

const port = process.env.CDP_PORT || '9320';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 扩展外观验收超时，强制退出');
    process.exit(2);
  }, 240000);
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
    if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params?.exceptionDetails?.exception?.description ?? msg.params?.exceptionDetails?.text ?? 'exception');
    }
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
  const assert = (cond, msg) => {
    if (!cond) throw new Error(`断言失败：${msg}`);
    console.log('PASS', msg);
  };
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
    const ok = await evaluate(`(() => {
      const el = [...document.querySelectorAll('.tool-btn')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(${JSON.stringify(label)}));
      if (!el) return false;
      el.click();
      return true;
    })()`);
    assert(ok, `切换到${label}工具`);
    await sleep(250);
  };
  const tab = async (index) => {
    await evaluate(`document.querySelectorAll('.dock-tab')[${index}]?.click()`);
    await sleep(350);
  };
  const tabNamed = async (name) => {
    const ok = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.dock-tab')].find((x) => x.innerText.includes(${JSON.stringify(name)}));
      if (!b) return false;
      b.click();
      return true;
    })()`);
    assert(ok, `切换到${name}标签`);
    await sleep(350);
  };
  const setPaint = async (section, color, width) => {
    const ok = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-body .dock-sec')].find((s) => s.querySelector('.dock-sec-head span')?.innerText.trim() === ${JSON.stringify(section)});
      if (!sec) return false;
      sec.scrollIntoView({ block: 'center' });
      const el = sec.querySelector('.paint-row .paint-swatch input[type="color"]');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(color)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const w = sec.querySelector('.paint-row input.field-input.num');
      if (w && ${width !== undefined}) {
        set.call(w, ${JSON.stringify(String(width ?? 0))});
        w.dispatchEvent(new Event('input', { bubbles: true }));
        w.focus();
      }
      return true;
    })()`);
    assert(ok, `属性坞设置${section}`);
    await sleep(250);
    await evaluate(`document.activeElement?.blur()`);
    await sleep(450);
  };
  const readDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    const groups = Object.values(d.nodes).filter((n) => n.kind === 'group');
    const g = groups[0];
    const kids = g ? g.children.map((id) => d.nodes[id]).filter(Boolean) : [];
    return {
      root: d.root.slice(),
      nodes: Object.keys(d.nodes).length,
      paths: Object.values(d.nodes).filter((n) => n.kind === 'path').length,
      groups: groups.length,
      group: g ? { id: g.id, name: g.name, children: g.children.length, opacity: g.opacity, blend: g.blend } : null,
      kids: kids.map((n) => ({
        kind: n.kind, id: n.id, name: n.name, opacity: n.opacity, visible: n.visible,
        fill: n.fill?.kind === 'none' ? 'none' : n.fill?.color,
        stroke: !n.stroke || n.stroke.kind === 'none' ? 'none' : n.stroke.color + '/' + n.stroke.width,
        appearance: (n.appearance ?? []).length,
      })),
      selected: [...document.querySelectorAll('.layer-row.is-on')].map((r) => r.getAttribute('data-layer-id')),
    };
  })()`);
  const panelState = () => evaluate(`(() => {
    const p = document.querySelector('.apr-panel');
    const body = document.querySelector('.dock-body');
    const tabs = document.querySelector('.dock-tabs');
    return {
      count: p ? p.querySelectorAll('.apr-item').length : -1,
      expandDisabled: p ? p.querySelector('.apr-expand')?.disabled : null,
      expandText: p ? p.querySelector('.apr-expand')?.innerText.trim() : '',
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      tabsOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      toast: document.querySelector('.toast')?.innerText ?? '',
    };
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);
  await key('1', 49, 'Digit1', 2);
  await sleep(500);

  const geom = await evaluate(`(() => { const r = document.querySelector('.cv-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const x1 = geom.x + geom.w * 0.34;
  const y1 = geom.y + geom.h * 0.38;
  const x2 = x1 + 250;
  const y2 = y1 + 170;

  await tool('矩形');
  await mouse('mouseMoved', x1, y1);
  await mouse('mousePressed', x1, y1, 1);
  await mouse('mouseMoved', x2, y2, 1);
  await mouse('mouseReleased', x2, y2);
  await sleep(800);
  await tool('选择');
  await key('V', 86, 'KeyV');
  await sleep(400);

  let d = await readDoc();
  assert(d && d.paths >= 1 && d.groups === 0, '矩形已创建且未扩展');

  await tab(0);
  await setPaint('填充', '#0f76d6');
  await setPaint('描边', '#111319', 6);
  d = await readDoc();
  assert(d.paths >= 1, '底层填充与描边已设置');

  await tabNamed('外观');
  await waitFor(`document.querySelector('.apr-panel') !== null`, 8000);
  let p = await panelState();
  assert(p.count === 0 && p.expandDisabled === true, '空叠加时扩展按钮禁用');
  await evaluate(`document.querySelector('.apr-add-fill').click()`);
  await sleep(500);
  await evaluate(`(() => {
    const el = document.querySelector('.apr-item[data-ap-id="ap1"] .apr-color');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '#e5484d'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await sleep(400);
  await evaluate(`document.querySelector('.apr-add-stroke').click()`);
  await sleep(500);
  await evaluate(`(() => {
    const row = document.querySelector('.apr-item[data-ap-id="ap2"]');
    const c = row.querySelector('.apr-color');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(c, '#f5b301'); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true }));
    const w = row.querySelector('.apr-width input');
    set.call(w, '8'); w.dispatchEvent(new Event('input', { bubbles: true }));
    w.focus();
  })()`);
  await sleep(250);
  await evaluate(`document.activeElement?.blur()`);
  await sleep(500);
  d = await readDoc();
  assert(d && d.groups === 0, '扩展前仍是单个路径');
  await tabNamed('外观');
  p = await panelState();
  assert(p.count === 2 && p.expandDisabled === false, '两层叠加后可扩展');

  await evaluate(`document.querySelector('.apr-expand').click()`);
  await sleep(800);
  d = await readDoc();
  assert(d.groups === 1, '已生成一个扩展组');
  assert(d.group && d.group.children === 4, '组内四层：底层填充、底层描边、叠加填充、叠加描边');
  assert(d.kids.every((k) => k.appearance === 0), '独立层不再带外观栈');
  assert(d.kids[0].fill === '#0f76d6' && d.kids[0].stroke === 'none', '第一层是底层填充');
  assert(d.kids[1].fill === 'none' && d.kids[1].stroke === '#111319/6', '第二层是底层描边');
  assert(d.kids[2].fill === '#e5484d' && d.kids[3].stroke === '#f5b301/8', '叠加层颜色与宽度保留');
  p = await panelState();
  assert(p.toast.includes('4 个独立图层'), '扩展提示显示层数');

  await tabNamed('图层');
  const opened = await evaluate(`(() => {
    const g = document.querySelector('.layer-row[data-layer-id="${d.group.id}"] .layer-caret');
    if (!g) return false;
    g.click();
    return true;
  })()`);
  assert(opened, '图层面板展开扩展组');
  await sleep(600);
  const layerRows = await evaluate(`(() => [...document.querySelectorAll('.layer-row')].map((r) => ({ id: r.getAttribute('data-layer-id'), text: r.innerText.replace(/\\s+/g, ' ').trim(), depth: parseInt(r.style.paddingLeft || '0', 10) })) )()`);
  assert(layerRows.length >= 5, '图层树显示组与四个子层');
  assert(layerRows.filter((r) => r.depth > 5).length === 4, '四个子层缩进显示');

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const narrow = await evaluate(`(() => {
    const body = document.querySelector('.dock-body');
    const tabs = document.querySelector('.dock-tabs');
    const rows = [...document.querySelectorAll('.layer-row')];
    return {
      body: body ? body.scrollWidth > body.clientWidth + 1 : false,
      tabs: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      rows: rows.map((r) => r.scrollWidth > r.clientWidth + 1),
    };
  })()`);
  assert(!narrow.body && !narrow.tabs && narrow.rows.every((v) => !v), '1200 宽图层树无溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  await tabNamed('图层');
  await evaluate(`document.querySelector('.layer-row[data-layer-id="${d.group.id}"]')?.click()`);
  await sleep(500);
  assert(errors.length === 0, '无运行时异常');
  await shot('expand-appearance.png');
  ws.close();
  clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
