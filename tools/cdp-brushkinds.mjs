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

  // 六标签与画笔空态
  await tab(5);
  await waitFor(`document.querySelector('.brh-panel') !== null`, 8000);
  let doc = await readDoc();
  let bp = await brushPanel();
  assert(doc.tabs.join(',') === '属性,图层,样式,符号,图案,画笔', 'Dock 六标签为属性/图层/样式/符号/图案/画笔');
  assert(bp.cards === 0 && !bp.bodyOverflow && !bp.panelOverflow && !bp.tabOverflow, '画笔初始空态无溢出');
  assert(bp.tabWidths.every((t) => t[2] <= t[3] + 1), '六标签各自不横向溢出');

  // 先建一块蓝红竖纹图案
  await tool('矩形');
  await drag({ x: 300, y: 270 }, { x: 400, y: 330 });
  await tool('选择');
  await tool('矩形');
  await drag({ x: 352, y: 270 }, { x: 372, y: 330 });
  await tool('选择');
  await tab(0);
  await setFill('#e5484d');
  const ids = await pathIds();
  assert(ids.length === 2, '画布有两块图案源图形');
  await selectLayerId(ids[0]);
  await selectLayerId(ids[1], true);
  await tab(4);
  await evaluate(`document.querySelector('.pat-panel .gs-primary').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.patterns.length === 1, '从两块源图形建出图案砖');
  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(450);


  // 四类画笔依次新建
  await tab(5);
  await evaluate(`document.querySelector('.brh-panel .gs-actions .gs-primary').click()`);
  await sleep(650);
  doc = await brushDoc();
  assert(doc.brushes.length === 1 && doc.brushes[0].kind === 'pattern', '新建图案画笔');
  for (const kind of ['art', 'scatter', 'calligraphic']) {
    await setSelect('.brh-panel select.brh-kind', kind);
    await evaluate(`document.querySelector('.brh-panel .gs-actions .gs-primary').click()`);
    await sleep(650);
  }
  doc = await brushDoc();
  assert(doc.brushes.length === 4, '四类画笔都建好');
  assert(doc.brushes.map((b) => b.kind).join(',') === 'pattern,art,scatter,calligraphic', '画笔类型顺序正确');
  assert(doc.brushes[3].patternId === undefined && doc.brushes[3].name.startsWith('书法画笔'), '书法画笔不绑图案砖');
  bp = await brushPanel();
  assert(bp.cards === 4 && bp.thumbs.every(Boolean) && bp.toast.includes('已新建画笔'), '四张画笔卡与缩略图可见');

  // 调小三种图案类画笔，书法笔宽拉到 1000%，让四条样例在画板上分得开
  for (const id of ['br1', 'br2', 'br3']) {
    await evaluate(`document.querySelector('.brh-card[data-brush-id="${id}"]')?.click()`);
    await sleep(300);
    await setValue('.brh-detail .brh-fields label:nth-child(1) input', '30');
    await sleep(350);
  }
  await evaluate(`document.querySelector('.brh-card[data-brush-id="br4"]')?.click()`);
  await sleep(300);
  await setValue('.brh-detail .brh-fields label:nth-child(1) input', '1000');
  await sleep(450);

  const drawWave = async (y) => {
    await tool('铅笔');
    await mouse('mouseMoved', 285, y);
    await mouse('mousePressed', 285, y, 1);
    for (let i = 1; i <= 18; i++) {
      await mouse('mouseMoved', 285 + i * 14, y + Math.sin(i / 3.6) * 24, 1);
    }
    await mouse('mouseReleased', 537, y);
    await tool('选择');
    await sleep(450);
  };
  const applyBrush = async (id) => {
    await tab(5);
    await evaluate(`document.querySelector('.brh-card[data-brush-id="${id}"] .brh-apply').click()`);
    await sleep(600);
  };

  // 四行样例：图案 / 艺术 / 散点 / 书法
  await drawWave(230);
  await applyBrush('br1');
  await drawWave(300);
  await applyBrush('br2');
  await drawWave(370);
  await applyBrush('br3');
  await drawWave(440);
  await applyBrush('br4');
  doc = await brushDoc();
  assert(doc.paths === 4, '四条样例路径');
  assert(doc.brushNodes.length === 4, '四条路径分别套上四类画笔');
  assert(new Set(doc.brushNodes.map((n) => n.brushId)).size === 4, '四个画笔 id 都落到描边');

  // 书法参数即时联动
  await tab(5);
  await evaluate(`document.querySelector('.brh-card[data-brush-id="br4"]')?.click()`);
  await sleep(350);
  await setValue('.brh-detail .brh-fields label:nth-child(2) input', '45');
  await sleep(400);
  await setValue('.brh-detail .brh-fields label:nth-child(3) input', '90');
  await sleep(600);
  doc = await brushDoc();
  assert(doc.brushes[3].angle === 45 && doc.brushes[3].roundness === 90, '书法笔锋改为 45° / 90%');

  // 1200 宽面板
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  bp = await brushPanel();
  assert(!bp.bodyOverflow && !bp.panelOverflow && !bp.tabOverflow, '1200 宽四类画笔面板无溢出');
  assert(bp.cardOverflow.every((v) => !v), '1200 宽四类画笔卡不截断');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(600);

  // 删除散点画笔，路径恢复普通描边；撤销恢复
  await tab(5);
  doc = await brushDoc();
  await evaluate(`document.querySelector('.brh-card[data-brush-id="br3"] .gs-del').click()`);
  await sleep(550);
  doc = await brushDoc();
  assert(doc.brushes.length === 3 && doc.brushNodes.length === 3, '删除散点画笔后一处描边恢复');
  await evaluate(`document.activeElement?.blur()`);
  await key('z', 90, 'KeyZ', 2);
  await sleep(650);
  await tab(5);
  doc = await brushDoc();
  assert(doc.brushes.length === 4 && doc.brushNodes.length === 4, '撤销恢复散点画笔与描边');

  // 最终态：书法卡高亮
  await tab(5);
  await evaluate(`document.querySelector('.brh-card[data-brush-id="br4"]')?.click()`);
  await sleep(500);
  bp = await brushPanel();
  assert(bp.cards === 4 && bp.active === 1, '最终截图书法画笔卡高亮');
  assert(!bp.bodyOverflow && !bp.panelOverflow && !bp.tabOverflow, '最终四类画笔面板无横向溢出');
  assert(bp.thumbs.every(Boolean), '四类画笔缩略图全部渲染');
  assert(errors.length === 0, '无运行时异常');
  await shot('brush-kinds.png');
  ws.close();
  clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });




