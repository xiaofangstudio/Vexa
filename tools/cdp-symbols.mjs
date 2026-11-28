import fs from 'node:fs';

const port = process.env.CDP_PORT || '9313';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 240000);
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
      const el = document.querySelector('.dock-body .paint-row .paint-swatch input[type="color"]');
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
    const symbols = (doc.symbols ?? []).map((s) => ({
      id: s.id, name: s.name, w: s.w, h: s.h,
      roots: s.root.length, nodes: Object.keys(s.nodes).length,
    }));
    const symbolNodes = Object.values(doc.nodes).filter((n) => n.kind === 'symbol').map((n) => ({
      id: n.id, symbolId: n.symbolId, name: n.name, x: n.x, y: n.y, w: n.w, h: n.h, visible: n.visible,
    }));
    return {
      symbols,
      symbolNodes,
      groups: Object.values(doc.nodes).filter((n) => n.kind === 'group').length,
      paths: Object.values(doc.nodes).filter((n) => n.kind === 'path').length,
      root: [...doc.root],
      tab: document.querySelector('.dock-tab.is-on')?.innerText.trim() ?? '',
      tabs: [...document.querySelectorAll('.dock-tab')].map((b) => b.innerText.trim()),
    };
  })()`);
  const panel = () => evaluate(`(() => {
    const p = document.querySelector('.sym-panel');
    if (!p) return null;
    const body = document.querySelector('.dock-body');
    const cards = [...p.querySelectorAll('.sym-card')];
    const tabs = document.querySelector('.dock-tabs');
    return {
      cards: cards.length,
      names: cards.map((c) => c.querySelector('.gs-meta b')?.innerText.trim() ?? ''),
      usages: cards.map((c) => c.querySelector('.gs-meta em')?.innerText.trim() ?? ''),
      active: cards.filter((c) => c.classList.contains('is-active')).length,
      empty: !!p.querySelector('.gs-empty'),
      thumbSvgs: cards.map((c) => !!c.querySelector('.sym-thumb svg')),
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      panelOverflow: p.scrollWidth > p.clientWidth + 1,
      cardOverflow: cards.map((c) => c.scrollWidth > c.clientWidth + 1),
      tabOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      btnDisabled: [...p.querySelectorAll('.gs-actions .gs-btn')].map((b) => b.disabled),
      toast: document.querySelector('.toast')?.innerText ?? '',
    };
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

  // 符号空态与四标签
  await tab(3);
  await waitFor(`document.querySelector('.sym-panel') !== null`, 8000);
  let doc = await readDoc();
  let p = await panel();
  assert(doc.tab === '符号', '符号标签为当前页');
  assert(doc.tabs.join(',') === '属性,图层,样式,符号', 'Dock 四标签为属性/图层/样式/符号');
  assert(p.empty && p.cards === 0, '初始为空态');
  assert(!p.bodyOverflow && !p.panelOverflow && !p.tabOverflow, '空态与四标签无横向溢出');

  // 两块矩形组成徽标
  await key('r', 82, 'KeyR');
  await drag({ x: 330, y: 300 }, { x: 410, y: 380 });
  await drag({ x: 390, y: 330 }, { x: 450, y: 380 });
  await key('v', 86, 'KeyV');
  doc = await readDoc();
  assert(doc.paths >= 2, '画布有两块源图形');
  const srcIds = await evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    return Object.values(d.nodes).filter((n) => n.kind === 'path').map((n) => n.id);
  })()`);
  assert(srcIds.length === 2, '读取两个源路径 id');

  await selectLayerId(srcIds[0]);
  await selectLayerId(srcIds[1], true);
  await tab(3);
  await setValue('.sym-panel .gs-actions .gs-name', '品牌徽标');
  await evaluate(`document.querySelector('.sym-panel .gs-primary').click()`);
  await sleep(700);
  doc = await readDoc();
  p = await panel();
  assert(doc.symbols.length === 1 && doc.symbols[0].name === '品牌徽标', '从多选新建品牌徽标');
  assert(doc.symbols[0].w > 20 && doc.symbols[0].h > 20, '符号定义有尺寸');
  const defBefore = { w: doc.symbols[0].w, h: doc.symbols[0].h };
  assert(p.cards === 1 && p.thumbSvgs[0], '面板出现符号卡与缩略预览');
  assert(p.toast.includes('已新建符号'), '新建反馈可见');

  // 删除源图形，置入实例 A 并缩放定位
  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(500);
  doc = await readDoc();
  assert(doc.symbolNodes.length === 0 && doc.symbols.length === 1, '删除源图形后只剩符号定义');
  await tab(3);
  await evaluate(`document.querySelector('.sym-card .sym-place').click()`);
  await sleep(600);
  await tab(0);
  await setNumber('W', 260);
  await setNumber('H', 130);
  await setNumber('X', 220);
  await setNumber('Y', 150);
  doc = await readDoc();
  assert(doc.symbolNodes.length === 1 && doc.symbolNodes[0].w === 260 && doc.symbolNodes[0].x === 220, '实例 A 尺寸与位置正确');

  // 置入实例 B 并定位
  await tab(3);
  await evaluate(`document.querySelector('.sym-card .sym-place').click()`);
  await sleep(600);
  await tab(0);
  await setNumber('W', 260);
  await setNumber('H', 130);
  await setNumber('X', 600);
  await setNumber('Y', 150);
  doc = await readDoc();
  assert(doc.symbolNodes.length === 2, '同一符号有两个实例');
  await tab(3);
  p = await panel();
  assert(p.usages[0] === '2 个实例', '符号卡显示两个实例');

  // 椭圆创建第二个符号「角标」
  await key('l', 76, 'KeyL');
  await drag({ x: 300, y: 470 }, { x: 380, y: 550 });
  await key('v', 86, 'KeyV');
  await tab(3);
  await setValue('.sym-panel .gs-actions .gs-name', '角标');
  await evaluate(`document.querySelector('.sym-panel .gs-primary').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.symbols.length === 2 && doc.symbols[1].name === '角标', '新建第二个符号角标');
  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(450);
  await tab(3);
  await evaluate(`document.querySelectorAll('.sym-card')[1].querySelector('.sym-place').click()`);
  await sleep(600);
  await tab(0);
  await setNumber('W', 90);
  await setNumber('H', 90);
  await setNumber('X', 780);
  await setNumber('Y', 440);
  doc = await readDoc();
  await tab(3);
  p = await panel();
  assert(doc.symbolNodes.length === 3 && p.cards === 2, '三个实例、两张符号卡');
  assert(p.usages.join(',') === '2 个实例,1 个实例', '两卡实例数分别为 2 与 1');

  // 重定义品牌徽标：新绿色长条同步所有实例
  await key('r', 82, 'KeyR');
  await drag({ x: 320, y: 520 }, { x: 460, y: 580 });
  await key('v', 86, 'KeyV');
  await tab(0);
  await setFill('#2f9e6f');
  await tab(3);
  await evaluate(`document.querySelector('.sym-card').click()`);
  await sleep(300);
  const updated = await clickText('.sym-panel .gs-actions .gs-btn', '用选中重定义');
  assert(updated, '点击用选中重定义');
  await sleep(700);
  doc = await readDoc();
  p = await panel();
  const firstDef = doc.symbols[0];
  assert(firstDef.nodes === 1, '重定义后定义内容换为单个路径');
  assert(firstDef.w !== defBefore.w || firstDef.h !== defBefore.h, '重定义后符号尺寸随新内容变化');
  assert(p.toast.includes('同步 2 个实例'), '重定义反馈含同步实例数');
  await evaluate(`document.activeElement?.blur()`);
  await key('Delete', 46, 'Delete');
  await sleep(450);
  doc = await readDoc();
  assert(doc.symbolNodes.every((n) => n.symbolId === 'sym1' || n.w === 90), '源图形删除后实例保留');

  // 画面选中实例 A，符号卡高亮第一张，先截图
  const instA = (await readDoc()).symbolNodes.find((n) => n.symbolId === 'sym1');
  await selectLayerId(instA.id);
  await tab(3);
  await evaluate(`document.querySelector('.sym-card').click()`);
  await sleep(400);
  p = await panel();
  assert(p.active === 1 && !p.bodyOverflow && !p.panelOverflow, '符号面板高亮且无横向溢出');
  assert(p.cardOverflow.every((v) => !v), '符号卡片无横向溢出');

  // 1200 宽四标签与面板收口
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  p = await panel();
  assert(!p.bodyOverflow && !p.panelOverflow && !p.tabOverflow, '1200 宽符号面板与四标签无溢出');
  assert(p.cardOverflow.every((v) => !v), '1200 宽符号卡不截断');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  // 断开链接：实例变普通组，撤销恢复
  doc = await readDoc();
  const instB = doc.symbolNodes.find((n) => n.symbolId === 'sym1' && n.id !== instA.id);
  await selectLayerId(instB.id);
  await tab(0);
  const unlinked = await clickText('.dock-body .gs-btn', '断开链接');
  assert(unlinked, '属性坞点击断开链接');
  await sleep(600);
  doc = await readDoc();
  assert(doc.symbolNodes.filter((n) => n.symbolId === 'sym1').length === 1, '断开后该实例不再链接');
  assert(doc.groups >= 1, '断开后生成普通组');
  assert((await evaluate(`document.querySelector('.toast')?.innerText ?? ''`)).includes('已断开链接'), '断开反馈可见');
  await evaluate(`document.querySelector('button[title="撤销"]').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.symbolNodes.some((n) => n.id === instB.id), '撤销恢复符号实例');

  // 删除角标：实例先展开为组，定义移除；撤销恢复
  await tab(3);
  await evaluate(`document.querySelectorAll('.sym-card')[1].querySelector('.gs-del').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.symbols.length === 1, '删除角标后剩一个符号');
  assert(!doc.symbolNodes.some((n) => n.symbolId === 'sym2'), '角标实例已展开');
  assert((await panel()).toast.includes('已删除符号'), '删除反馈可见');
  await evaluate(`document.querySelector('button[title="撤销"]').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.symbols.length === 2 && doc.symbolNodes.some((n) => n.symbolId === 'sym2'), '撤销恢复角标定义与实例');

  // 回到最终展示态：选中实例 A、品牌徽标高亮，等提示消失
  await sleep(3600);
  await selectLayerId(instA.id);
  await tab(3);
  await evaluate(`document.querySelectorAll('.sym-card')[0].click()`);
  await sleep(500);
  p = await panel();
  assert(p.active === 1, '最终截图第一张符号卡高亮');
  assert(!p.bodyOverflow && !p.panelOverflow, '最终截图面板无溢出');
  await shot('symbols.png');

  clearTimeout(watchdog);
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


