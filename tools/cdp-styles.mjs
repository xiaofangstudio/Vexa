import fs from 'node:fs';

const port = process.env.CDP_PORT || '9304';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 180000);
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
  const clickAt = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, 1);
    await mouse('mouseReleased', x, y);
    await sleep(320);
  };
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1);
    await mouse('mouseReleased', to.x, to.y);
    await sleep(350);
  };
  const setValue = async (selector, value, event = 'input') => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
    set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    return true;
  })()`);
  const tab = async (index) => {
    await evaluate(`document.querySelectorAll('.dock-tab')[${index}]?.click()`);
    await sleep(320);
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
    const pathIds = Object.keys(doc.nodes).filter((id) => doc.nodes[id]?.kind === 'path');
    const styles = (doc.styles ?? []).map((s) => ({
      id: s.id, name: s.name, fill: s.fill.color, fillKind: s.fill.kind, stroke: s.stroke?.color ?? null, strokeWidth: s.stroke?.width ?? null,
    }));
    return {
      styles,
      pathIds,
      paths: pathIds.map((id) => {
        const n = doc.nodes[id];
        return { id, fill: n.fill.color, fillKind: n.fill.kind, width: n.stroke.width, stroke: n.stroke.color, link: n.graphicStyle ?? null };
      }),
      tab: document.querySelector('.dock-tab.is-on')?.innerText.trim() ?? '',
      tabs: [...document.querySelectorAll('.dock-tab')].map((b) => b.innerText.trim()),
    };
  })()`);
  const panel = () => evaluate(`(() => {
    const p = document.querySelector('.gs-panel');
    if (!p) return null;
    const body = document.querySelector('.dock-body');
    const cards = [...p.querySelectorAll('.gs-card')];
    return {
      cards: cards.length,
      names: cards.map((c) => c.querySelector('.gs-meta b')?.innerText.trim() ?? ''),
      usages: cards.map((c) => c.querySelector('.gs-meta em')?.innerText.trim() ?? ''),
      active: cards.filter((c) => c.classList.contains('is-active')).length,
      empty: !!p.querySelector('.gs-empty'),
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      panelOverflow: p.scrollWidth > p.clientWidth + 1,
      cardOverflow: cards.map((c) => c.scrollWidth > c.clientWidth + 1),
      btnDisabled: [...p.querySelectorAll('.gs-btn')].map((b) => b.disabled),
      toast: document.querySelector('.toast')?.innerText ?? '',
    };
  })()`);
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
  const setStrokeWidth = async (width) => {
    const ok = await evaluate(`(() => {
      const fields = [...document.querySelectorAll('.dock-body .num-inline, .dock-body .field')];
      const field = fields.find((f) => f.innerText.includes('粗细'));
      const el = field?.querySelector('input');
      if (!el) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, ${JSON.stringify(String(width))});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      el.blur();
      return true;
    })()`);
    assert(ok, '属性坞找到描边粗细');
    await sleep(500);
  };
  const createStyle = async (name) => {
    await setValue('.gs-name', name);
    await evaluate(`document.querySelector('.gs-primary').click()`);
    await sleep(500);
  };
  const applyCard = async (index) => {
    await evaluate(`document.querySelectorAll('.gs-card')[${index}]?.click()`);
    await sleep(500);
  };
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

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  // 三块矩形，收进画板内
  await key('r', 82, 'KeyR');
  await drag({ x: 330, y: 350 }, { x: 400, y: 420 });
  await drag({ x: 430, y: 350 }, { x: 500, y: 420 });
  await drag({ x: 530, y: 350 }, { x: 600, y: 420 });
  await key('v', 86, 'KeyV');
  let doc = await readDoc();
  assert(doc.pathIds.length === 3, '画布有三块矩形');

  // 样式标签与空态
  await tab(2);
  await waitFor(`document.querySelector('.gs-panel') !== null`, 8000);
  doc = await readDoc();
  let p = await panel();
  assert(doc.tab === '样式', '样式标签为当前页');
  assert(doc.tabs.join(',') === '属性,图层,样式', 'Dock 三标签为属性/图层/样式');
  assert(p.cards === 0 && p.empty, '初始为空态');
  assert(!p.bodyOverflow && !p.panelOverflow, '空态无横向溢出');
  assert(p.btnDisabled[1] === true, '无链接样式时更新按钮禁用');

  // 第一块：蓝色样式
  await selectLayerId(doc.pathIds[0]);
  await tab(2);
  await createStyle('品牌蓝');
  p = await panel();
  doc = await readDoc();
  assert(doc.styles.length === 1 && doc.styles[0].name === '品牌蓝', '从第一块新建品牌蓝');
  assert(doc.styles[0].strokeWidth > 0, '样式捕获描边宽度');
  assert(p.cards === 1, '面板出现一张样式卡');
  assert(p.toast.includes('已新建'), '新建反馈可见');

  // 第二块：改红 + 8px 描边，存为警示红
  await selectLayerId(doc.pathIds[1]);
  await tab(0);
  await setFill('#e5484d');
  await setStrokeWidth(8);
  await tab(2);
  await createStyle('警示红');
  doc = await readDoc();
  assert(doc.styles.length === 2 && doc.styles[1].fillKind === 'solid', '第二张样式为实色警示红');
  assert(doc.styles[1].fill === '#e5484d' && doc.styles[1].strokeWidth === 8, '警示红捕获红填充与 8px 描边');

  // 第三张：回到第一块改绿，存为辅助绿
  await selectLayerId(doc.pathIds[0]);
  await tab(0);
  await setFill('#2f9e6f');
  await tab(2);
  await createStyle('辅助绿');
  doc = await readDoc();
  assert(doc.styles.length === 3, '三张图形样式');
  assert(doc.styles[2].fill === '#2f9e6f', '辅助绿捕获绿色填充');

  // 第二、三块图层多选套品牌蓝；第一块单独套警示红
  await selectLayerId(doc.pathIds[1]);
  await selectLayerId(doc.pathIds[2], true);
  await tab(2);
  await applyCard(0);
  await selectLayerId(doc.pathIds[0]);
  await tab(2);
  await applyCard(1);
  p = await panel();
  doc = await readDoc();
  assert(doc.paths.every((x) => x.link), '三块都链接了样式');
  assert(doc.paths[1].fill === '#0f76d6' && doc.paths[2].fill === '#0f76d6', '第二三块变品牌蓝');
  assert(doc.paths[0].fill === '#e5484d' && doc.paths[0].width === 8, '第一块变警示红 8px');
  assert(p.usages.join(',') === '2 个链接对象,1 个链接对象,0 个链接对象', '样式卡链接数正确');
  assert(p.active === 1, '当前选中对象的样式高亮');

  // 更新品牌蓝：选中第二块改深蓝 10px，再更新样式，第三块同步
  doc = await readDoc();
  await selectLayerId(doc.pathIds[1]);
  await tab(0);
  await setFill('#1d4ed8');
  await setStrokeWidth(10);
  await tab(2);
  p = await panel();
  assert(p.btnDisabled[1] === false, '链接对象可更新样式');
  await evaluate(`document.querySelectorAll('.gs-btn')[1].click()`);
  await sleep(600);
  p = await panel();
  doc = await readDoc();
  assert(doc.styles[0].fill === '#1d4ed8' && doc.styles[0].strokeWidth === 10, '品牌蓝更新为深蓝 10px');
  assert(doc.paths[2].fill === '#1d4ed8' && doc.paths[2].width === 10, '第三块同步更新');
  assert(doc.paths[0].fill === '#e5484d' && doc.paths[0].width === 8, '警示红对象不受影响');
  assert(p.toast.includes('同步'), '更新反馈含同步数量');
  assert(!p.bodyOverflow && !p.panelOverflow && p.cardOverflow.every((v) => !v), '样式面板与卡片无横向溢出');

  await shot('graphic-styles.png');

  // 删除警示红：解链保留红色；撤销恢复
  await evaluate(`document.querySelectorAll('.gs-card')[1].querySelector('.gs-del').click()`);
  await sleep(600);
  doc = await readDoc();
  assert(doc.styles.length === 2, '删除后剩两张样式');
  assert(doc.paths[0].link === null && doc.paths[0].fill === '#e5484d', '删除只解链，红色保留');
  assert((await panel()).toast.includes('已删除'), '删除反馈可见');
  await evaluate(`document.querySelector('button[title="撤销"]').click()`);
  await sleep(700);
  doc = await readDoc();
  assert(doc.styles.length === 3 && doc.paths[0].link === 'gs2', '撤销恢复警示红与链接');

  // 1200×900 收口
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  p = await panel();
  assert(!p.bodyOverflow && !p.panelOverflow, '1200 宽样式面板无横向溢出');
  assert(p.cardOverflow.every((v) => !v), '1200 宽卡片不截断');
  assert(await evaluate(`(() => { const t = document.querySelector('.dock-tabs'); return t && t.scrollWidth <= t.clientWidth + 1; })()`), '1200 宽三标签不溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  // 回到真实窗口，选择第二块让品牌蓝高亮
  doc = await readDoc();
  await selectLayerId(doc.pathIds[1]);
  await tab(2);
  await sleep(300);
  p = await panel();
  assert(p.active === 1, '最终截图品牌蓝高亮');

  clearTimeout(watchdog);
  ws.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
