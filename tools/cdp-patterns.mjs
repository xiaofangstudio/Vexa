import fs from 'node:fs';

const port = process.env.CDP_PORT || '9315';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 图案验收超时，强制退出');
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
  const setNumber = async (label, value) => {
    const ok = await evaluate(`(() => {
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

  // 空态与五标签
  await tab(4);
  await waitFor(`document.querySelector('.pat-panel') !== null`, 8000);
  let doc = await readDoc();
  let p = await panel();
  assert(doc.tab === '图案', '图案标签为当前页');
  assert(doc.tabs.join(',') === '属性,图层,样式,符号,图案', 'Dock 五标签为属性/图层/样式/符号/图案');
  assert(p.empty && p.cards === 0, '图案初始为空态');
  assert(!p.bodyOverflow && !p.panelOverflow && !p.tabOverflow, '空态与五标签无横向溢出');

  // 第一块图案砖：蓝底 + 红色竖条
  await tool('矩形');
  await drag({ x: 300, y: 270 }, { x: 380, y: 330 });
  await tool('选择');
  await tool('矩形');
  await drag({ x: 344, y: 270 }, { x: 364, y: 330 });
  await tool('选择');
  await tab(0);
  await setFill('#e5484d');
  doc = await readDoc();
  assert(doc.paths === 2, '画布有两块图案源图形');
  const src = await evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    return Object.values(d.nodes).filter((n) => n.kind === 'path').map((n) => n.id);
  })()`);
  assert(src.length === 2, '读取两块源路径 id');
  await selectLayerId(src[0]);
  await selectLayerId(src[1], true);
  await tab(4);
  await setValue('.pat-panel .gs-actions .gs-name', '蓝红竖纹');
  await evaluate(`document.querySelector('.pat-panel .gs-primary').click()`);
  await sleep(700);
  doc = await readDoc();
  p = await panel();
  assert(doc.patterns.length === 1 && doc.patterns[0].name === '蓝红竖纹', '从多选新建蓝红竖纹');
  assert(doc.patterns[0].w >= 70 && doc.patterns[0].h >= 50, '图案砖尺寸取自选区包围盒');
  assert(p.cards === 1 && p.thumbSvgs[0], '面板出现图案卡与 SVG 缩略图');
  assert(p.toast.includes('已新建图案'), '新建反馈可见');

  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(500);

  // 先留下重定义用的金色圆形源
  await tool('椭圆');
  await drag({ x: 300, y: 270 }, { x: 400, y: 310 });
  await tool('选择');
  await tab(0);
  await setFill('#e0a12f');
  const goldId = (await pathIds())[0];
  assert(!!goldId, '读取金色重定义源 id');

  // 目标矩形套图案
  await tool('矩形');
  await drag({ x: 300, y: 250 }, { x: 580, y: 320 });
  await tool('选择');
  doc = await readDoc();
  const targetId = (await pathIds()).find((id) => id !== goldId);
  assert(!!targetId, '读取目标矩形 id');
  await tab(4);
  const applied = await evaluate(`document.querySelectorAll('.pat-card')[0].querySelector('.pat-apply').click(); true`);
  assert(applied, '点击图案卡填充选中');
  await sleep(700);
  doc = await readDoc();
  assert(doc.patternNodes.length === 1 && doc.patternNodes[0].patternId === doc.patterns[0].id, '目标矩形已有图案填充');
  assert((await panel()).toast.includes('填充 1 个对象'), '填充反馈含对象数');

  // 砖排切换、缩放
  await evaluate(`[...document.querySelectorAll('.pat-tile-btn')].find((b) => b.innerText.trim() === '砖排')?.click()`);
  await sleep(500);
  doc = await readDoc();
  assert(doc.patterns[0].tile === 'brick' && doc.patterns[0].rev >= 2, '切换砖排并递增图案版本');
  await setValue('.pat-scale input', '50');
  await sleep(300);
  await evaluate(`document.querySelector('.pat-panel .gs-btns .gs-btn:nth-child(3)').click()`);
  await sleep(600);
  doc = await readDoc();
  assert(doc.patternNodes[0].scale === 0.5, '按 50% 重新填充选区');

  // 第二个图案：绿色圆点
  await tool('椭圆');
  await drag({ x: 300, y: 570 }, { x: 360, y: 630 });
  await tool('选择');
  await tab(0);
  await setFill('#2f9e6f');
  await tab(4);
  await setValue('.pat-panel .gs-actions .gs-name', '绿色圆点');
  await evaluate(`document.querySelector('.pat-panel .gs-primary').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.patterns.length === 2 && doc.patterns[1].name === '绿色圆点', '新建第二个图案绿色圆点');
  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(450);

  // 第二个目标矩形
  await tool('矩形');
  await drag({ x: 300, y: 400 }, { x: 480, y: 460 });
  await tool('选择');
  await tab(4);
  await evaluate(`document.querySelectorAll('.pat-card')[1].querySelector('.pat-apply').click(); true`);
  await sleep(650);
  doc = await readDoc();
  p = await panel();
  assert(doc.patternNodes.length === 2 && doc.patternNodes.filter((n) => n.patternId === doc.patterns[1].id).length === 1, '第二块目标套用绿色圆点');
  assert(p.cards === 2, '两张图案卡');
  const secondTargetId = doc.patternNodes.find((n) => n.patternId === doc.patterns[1].id).id;
  assert(!!secondTargetId, '读取第二块目标 id');

  // 选中金色矩形，用选中重定义第一块图案
  await selectLayerId(goldId);
  await tab(4);
  await evaluate(`document.querySelectorAll('.pat-card')[0].querySelector('.gs-meta')?.click()`);
  await sleep(300);
  const redef = await clickText('.pat-panel .gs-actions .gs-btn', '用选中重定义');
  assert(redef, '点击用选中重定义');
  await sleep(700);
  doc = await readDoc();
  assert(doc.patterns[0].nodes === 1, '重定义后砖内容换为单个路径');
  assert(doc.patterns[0].rev >= 3, '重定义递增图案版本');
  assert((await panel()).toast.includes('已重定义图案'), '重定义反馈可见');
  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(450);
  doc = await readDoc();
  assert(doc.patternNodes.length === 2, '重定义源图形删除后两处图案填充保留');

  // 1200 宽五标签与面板
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  p = await panel();
  assert(!p.bodyOverflow && !p.panelOverflow && !p.tabOverflow, '1200 宽图案面板与五标签无溢出');
  assert(p.cardOverflow.every((v) => !v), '1200 宽图案卡不截断');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  // 删除第二块图案：椭圆填充降级实色；撤销恢复
  await evaluate(`document.querySelectorAll('.pat-card')[1].querySelector('.gs-del').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.patterns.length === 1 && doc.patternNodes.length === 1, '删除第二块图案后只剩一处图案填充');
  assert((await panel()).toast.includes('转为实色'), '删除反馈含降级实色');
  await evaluate(`document.querySelector('button[title="撤销"]').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.patterns.length === 2, '撤销恢复两块图案');

  // 最终展示：选中目标矩形，第一张图案卡高亮
  await sleep(3500);
  await selectLayerId(targetId);
  await tab(4);
  await evaluate(`document.querySelectorAll('.pat-card')[0].click()`);
  await sleep(500);
  p = await panel();
  assert(p.active === 1 && !p.bodyOverflow && !p.panelOverflow && !p.tabOverflow, '最终截图图案卡高亮且无溢出');
  assert(p.cardOverflow.every((v) => !v), '最终截图图案卡无横向溢出');
  assert(p.thumbSvgs.every(Boolean), '两张图案缩略图都渲染');
  const noErrors = errors.filter((e) => !/ResizeObserver|favicon/i.test(e));
  assert(noErrors.length === 0, `无运行时异常${noErrors.length ? `：${noErrors[0]}` : ''}`);
  await shot('patterns.png');

  clearTimeout(watchdog);
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

