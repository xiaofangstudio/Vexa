import fs from 'node:fs';

const port = process.env.CDP_PORT || '9317';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 画笔类型验收超时，强制退出');
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
    await sleep(150);
  };
  const mouse = async (type, x, y, buttons = 0) => {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
    await sleep(80);
  };
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1);
    await mouse('mouseReleased', to.x, to.y);
    await sleep(350);
  };
  const setValue = async (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const setSelect = async (selector, value) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    if (!ok) throw new Error(`找不到下拉框 ${selector}`);
    await sleep(250);
  };
  const setNumber = async (label, value) => {    const ok = await evaluate(`(() => {
      const fields = [...document.querySelectorAll('.dock-body .field')];
      const field = fields.find((f) => f.querySelector('.field-label')?.innerText.trim() === ${JSON.stringify(label)});
      const el = field?.querySelector('input');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      el.blur();
      return true;
    })()`);
    assert(ok, `属性坞找到 ${label} 字段`);
    await sleep(450);
  };
  const setFill = async (color) => {
    const ok = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-body .dock-sec')].find((s) => s.querySelector('.dock-sec-head span')?.innerText.trim() === '填充');
      const el = sec?.querySelector('.paint-row .paint-swatch input[type="color"]');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(color)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert(ok, '属性坞找到填充颜色输入');
    await sleep(450);
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
  const readDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const doc = shell?.memoizedState?.memoizedState?.current;
    if (!doc || !doc.nodes) return null;
    const patterns = (doc.patterns ?? []).map((p) => ({
      id: p.id, name: p.name, w: p.w, h: p.h, tile: p.tile, rev: p.rev,
      roots: p.root.length, nodes: Object.keys(p.nodes).length,
    }));
    const patternNodes = Object.values(doc.nodes).filter((n) => (n.kind === 'path' || n.kind === 'text') && n.fill?.kind === 'pattern').map((n) => ({
      id: n.id, kind: n.kind, patternId: n.fill.patternId, scale: n.fill.patternScale,
    }));
    return {
      patterns,
      patternNodes,
      groups: Object.values(doc.nodes).filter((n) => n.kind === 'group').length,
      paths: Object.values(doc.nodes).filter((n) => n.kind === 'path').length,
      root: [...doc.root],
      tab: document.querySelector('.dock-tab.is-on')?.innerText.trim() ?? '',
      tabs: [...document.querySelectorAll('.dock-tab')].map((b) => b.innerText.trim()),
    };
  })()`);
  const panel = () => evaluate(`(() => {
    const p = document.querySelector('.pat-panel');
    if (!p) return null;
    const body = document.querySelector('.dock-body');
    const cards = [...p.querySelectorAll('.pat-card')];
    const tabs = document.querySelector('.dock-tabs');
    return {
      cards: cards.length,
      names: cards.map((c) => c.querySelector('.gs-meta b')?.innerText.trim() ?? ''),
      metas: cards.map((c) => c.querySelector('.gs-meta em')?.innerText.trim() ?? ''),
      active: cards.filter((c) => c.classList.contains('is-active')).length,
      empty: !!p.querySelector('.gs-empty'),
      thumbSvgs: cards.map((c) => !!c.querySelector('.pat-thumb svg')),
      tile: p.querySelector('.pat-tile-btn.is-on')?.innerText.trim() ?? '',
      detail: !!p.querySelector('.pat-detail'),
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      panelOverflow: p.scrollWidth > p.clientWidth + 1,
      cardOverflow: cards.map((c) => c.scrollWidth > c.clientWidth + 1),
      tabOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      toast: document.querySelector('.toast')?.innerText ?? '',
    };
  })()`);
  const pathIds = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    return Object.values(d.nodes).filter((n) => n.kind === 'path').map((n) => n.id);
  })()`);
  const selectLayerId = async (id, ctrl = false) => {
    await tab(1);
    const ok = await evaluate(`(() => {
      const row = document.querySelector('[data-layer-id="${id}"] .layer-name');
      if (!row) return false;
      if (${ctrl}) row.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
      else row.click();
      return true;
    })()`);
    assert(ok, `图层面板选中 ${id}`);
    await sleep(400);
  };
  const clickText = async (selector, text) => evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((b) => b.innerText.trim().includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);


  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const brushPanel = () => evaluate(`(() => {
    const p = document.querySelector('.brh-panel');
    if (!p) return null;
    const body = document.querySelector('.dock-body');
    const cards = [...p.querySelectorAll('.brh-card')];
    const tabs = document.querySelector('.dock-tabs');
    return {
      cards: cards.length,
      names: cards.map((c) => c.querySelector('.gs-meta b')?.innerText.trim() ?? ''),
      metas: cards.map((c) => c.querySelector('.gs-meta em')?.innerText.trim() ?? ''),
      active: cards.filter((c) => c.classList.contains('is-active')).length,
      thumbs: cards.map((c) => !!c.querySelector('.brh-thumb svg')),
      detail: !!p.querySelector('.brh-detail'),
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      panelOverflow: p.scrollWidth > p.clientWidth + 1,
      cardOverflow: cards.map((c) => c.scrollWidth > c.clientWidth + 1),
      tabOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      tabWidths: [...document.querySelectorAll('.dock-tab')].map((b) => [b.innerText.trim(), Math.round(b.getBoundingClientRect().width), b.scrollWidth, b.clientWidth]),
      toast: document.querySelector('.toast')?.innerText ?? '',
    };
  })()`);
  const brushDoc = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    return {
      brushes: (d.brushes ?? []).map((b) => ({ id: b.id, name: b.name, kind: b.kind, patternId: b.patternId, scale: b.scale, spacing: b.spacing, angle: b.angle, roundness: b.roundness, jitter: b.jitter, spread: b.spread, rev: b.rev })),
      brushNodes: Object.values(d.nodes).filter((n) => n.kind === 'path' && n.stroke?.brushId).map((n) => ({ id: n.id, brushId: n.stroke.brushId, w: n.stroke.width })),
      paths: Object.values(d.nodes).filter((n) => n.kind === 'path').length,
      patterns: (d.patterns ?? []).length,
      tabs: [...document.querySelectorAll('.dock-tab')].map((b) => b.innerText.trim()),
    };
  })()`);


  const setBaseStroke = async (color, width) => {
    const ok = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-body .dock-sec')].find((s) => s.querySelector('.dock-sec-head span')?.innerText.trim() === '描边');
      if (!sec) return false;
      const el = sec.querySelector('.paint-row .paint-swatch input[type="color"]');
      if (el) {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, ${JSON.stringify(color)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const w = sec.querySelector('.paint-row input.field-input.num');
      if (w) {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(w, ${JSON.stringify(String(width))});
        w.dispatchEvent(new Event('input', { bubbles: true }));
        w.focus();
      }
      return !!el;
    })()`);
    assert(ok, '属性坞找到描边颜色输入');
    await sleep(250);
    await evaluate(`document.activeElement?.blur()`);
    await sleep(450);
  };

  const setNum = async (label, value) => {
    const ok = await evaluate(`(() => {
      const field = [...document.querySelectorAll('.dock-body .field')].find((f) => f.querySelector('.field-label')?.innerText.trim() === ${JSON.stringify(label)});
      const el = field?.querySelector('input');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      return true;
    })()`);
    assert(ok, `属性坞找到 ${label}`);
    await sleep(250);
    await evaluate(`document.activeElement?.blur()`);
    await sleep(400);
  };

  const readAppearance = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    const p = Object.values(d.nodes).find((n) => n.kind === 'path');
    return {
      tabs: [...document.querySelectorAll('.dock-tab')].map((b) => b.innerText.trim()),
      path: p ? { id: p.id, fill: p.fill.color, stroke: { color: p.stroke.color, width: p.stroke.width } } : null,
      appearance: (p?.appearance ?? []).map((a) => ({
        id: a.id, kind: a.kind, opacity: a.opacity, visible: a.visible,
        fill: a.fill?.color, fillKind: a.fill?.kind,
        stroke: a.stroke ? { color: a.stroke.color, width: a.stroke.width } : undefined,
      })),
    };
  })()`);

  const aprPanel = () => evaluate(`(() => {
    const p = document.querySelector('.apr-panel');
    if (!p) return null;
    const body = document.querySelector('.dock-body');
    const tabs = document.querySelector('.dock-tabs');
    return {
      count: p.querySelectorAll('.apr-item').length,
      ids: [...p.querySelectorAll('.apr-item')].map((r) => r.getAttribute('data-ap-id')),
      empty: !!p.querySelector('.apr-empty'),
      emptyStack: !!p.querySelector('.apr-empty-stack'),
      fills: [...p.querySelectorAll('.apr-item-fill')].length,
      strokes: [...p.querySelectorAll('.apr-item-stroke')].length,
      visibleRows: [...p.querySelectorAll('.apr-item')].filter((r) => !r.classList.contains('is-off')).length,
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      panelOverflow: p.scrollWidth > p.clientWidth + 1,
      rowOverflow: [...p.querySelectorAll('.apr-item, .apr-base-row')].map((r) => r.scrollWidth > r.clientWidth + 1),
      tabOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      tabWidths: [...tabs.querySelectorAll('.dock-tab')].map((b) => [b.innerText.trim(), Math.round(b.getBoundingClientRect().width), b.scrollWidth, b.clientWidth]),
      toast: document.querySelector('.toast')?.innerText ?? '',
    };
  })()`);

  const addItem = async (kind) => {
    const sel = kind === 'fill' ? '.apr-add-fill' : '.apr-add-stroke';
    await evaluate(`document.querySelector('${sel}').click()`);
    await sleep(550);
  };
  const setItemColor = async (id, color) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector('.apr-item[data-ap-id="${id}"] .apr-color');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(color)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    assert(ok, `找到叠加项 ${id} 颜色输入`);
    await sleep(400);
  };
  const setItemNumber = async (id, cls, value) => {
    const ok = await evaluate(`(() => {
      const el = document.querySelector('.apr-item[data-ap-id="${id}"] .${cls} input');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(String(value))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    assert(ok, `找到叠加项 ${id} 的 ${cls}`);
    await sleep(400);
  };

  // 七标签与外观空态
  await tab(6);
  await waitFor(`document.querySelector('.apr-panel') !== null`, 8000);
  let doc = await readDoc();
  let ap = await aprPanel();
  assert(doc.tabs.join(',') === '属性,图层,样式,符号,图案,画笔,外观', 'Dock 七标签为属性/图层/样式/符号/图案/画笔/外观');
  assert(ap.empty && ap.count === 0, '未选中路径时显示外观空态');
  assert(!ap.bodyOverflow && !ap.panelOverflow && !ap.tabOverflow, '外观空态面板无溢出');
  assert(ap.tabWidths.every((t) => t[2] <= t[3] + 1), '七标签各自不横向溢出');

  // 画一个矩形作为底层外观
  await tool('矩形');
  await drag({ x: 520, y: 300 }, { x: 680, y: 430 });
  await tool('选择');
  await tab(0);
  await setNum('X', 520);
  await setNum('Y', 260);
  await setFill('#0f76d6');
  await setBaseStroke('#111319', 6);
  let node = await readAppearance();
  assert(!!node.path && node.path.fill === '#0f76d6' && node.path.stroke.width === 6, '矩形底层填充与描边就绪');

  await tab(6);
  ap = await aprPanel();
  assert(!ap.empty && ap.count === 0 && ap.emptyStack, '选中路径后显示底层外观与空叠加栈');

  // 两填充两描边
  await addItem('fill');
  await setItemColor('ap1', '#e5484d');
  await setItemNumber('ap1', 'apr-opacity', 45);
  await addItem('stroke');
  await setItemColor('ap2', '#f5b301');
  await setItemNumber('ap2', 'apr-width', 18);
  await addItem('stroke');
  await setItemColor('ap3', '#ffffff');
  await setItemNumber('ap3', 'apr-width', 7);
  await setItemNumber('ap3', 'apr-opacity', 80);
  await addItem('fill');
  await setItemColor('ap4', '#0f9d8a');
  await setItemNumber('ap4', 'apr-opacity', 30);
  node = await readAppearance();
  assert(node.appearance.length === 4, '四层叠加外观已建立');
  assert(node.appearance.map((a) => a.kind).join(',') === 'fill,stroke,stroke,fill', '叠加类型顺序正确');
  assert(node.appearance[0].fill === '#e5484d' && node.appearance[1].stroke.width === 18 && node.appearance[2].stroke.color === '#ffffff', '叠加填充/描边参数落到文档');
  assert(node.appearance[0].opacity === 0.45 && node.appearance[3].opacity === 0.3, '叠加项透明度写入');
  ap = await aprPanel();
  assert(ap.count === 4 && ap.fills === 2 && ap.strokes === 2, '面板显示两填充两描边');
  assert(ap.ids.join(',') === 'ap4,ap3,ap2,ap1', '叠加栈面板按顶层优先展示');

  // 排序：ap2 上移一层再下移复位
  await evaluate(`document.querySelector('.apr-item[data-ap-id="ap2"] .apr-up').click()`);
  await sleep(450);
  node = await readAppearance();
  assert(node.appearance.map((a) => a.id).join(',') === 'ap1,ap3,ap2,ap4', '上移一层改变绘制顺序');
  await evaluate(`document.querySelector('.apr-item[data-ap-id="ap2"] .apr-down').click()`);
  await sleep(450);
  node = await readAppearance();
  assert(node.appearance.map((a) => a.id).join(',') === 'ap1,ap2,ap3,ap4', '下移一层恢复顺序');

  // 显隐
  await evaluate(`document.querySelector('.apr-item[data-ap-id="ap1"] .apr-eye').click()`);
  await sleep(400);
  node = await readAppearance();
  assert(node.appearance[0].visible === false, '隐藏叠加填充写入文档');
  ap = await aprPanel();
  assert(ap.visibleRows === 3, '隐藏后只有三行高亮可见');
  await evaluate(`document.querySelector('.apr-item[data-ap-id="ap1"] .apr-eye').click()`);
  await sleep(400);

  // 1200 宽
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(650);
  ap = await aprPanel();
  assert(!ap.bodyOverflow && !ap.panelOverflow && !ap.tabOverflow, '1200 宽外观面板无溢出');
  assert(ap.rowOverflow.every((v) => !v), '1200 宽外观行不截断');
  assert(ap.tabWidths.every((t) => t[2] <= t[3] + 1), '1200 宽七标签不溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(600);

  // 删除一层并撤销
  await tab(6);
  await evaluate(`document.querySelector('.apr-item[data-ap-id="ap4"] .apr-del').click()`);
  await sleep(500);
  node = await readAppearance();
  assert(node.appearance.length === 3, '删除一层叠加填充');
  await evaluate(`document.activeElement?.blur()`);
  await key('z', 90, 'KeyZ', 2);
  await sleep(650);
  node = await readAppearance();
  assert(node.appearance.length === 4, '撤销恢复被删叠加层');

  // 最终态：选中外观页
  await tab(6);
  ap = await aprPanel();
  assert(ap.count === 4 && ap.fills === 2 && ap.strokes === 2, '最终截图四层外观');
  assert(!ap.bodyOverflow && !ap.panelOverflow && !ap.tabOverflow, '最终七标签与外观面板无溢出');
  assert(errors.length === 0, '无运行时异常');
  await shot('appearance.png');
  ws.close();
  clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
