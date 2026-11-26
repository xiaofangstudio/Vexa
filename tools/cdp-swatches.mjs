import fs from 'node:fs';

const port = process.env.CDP_PORT || '9239';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 150000);
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
    await sleep(300);
  };
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8, 1);
    await mouse('mouseReleased', to.x, to.y);
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
    const pathIds = Object.keys(doc.nodes).filter((id) => doc.nodes[id]?.kind === 'path');
    return {
      swatches: (doc.swatches ?? []).map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind })),
      pathIds,
      paths: pathIds.map((id) => ({
        id,
        fill: { color: doc.nodes[id].fill.color, swatch: doc.nodes[id].fill.swatch ?? null },
        stroke: { color: doc.nodes[id].stroke.color, swatch: doc.nodes[id].stroke.swatch ?? null },
      })),
    };
  })()`);
  const readDialog = () => evaluate(`(() => {
    const modal = document.querySelector('.swatch-modal');
    if (!modal) return null;
    const rows = [...modal.querySelectorAll('.swatch-row')];
    const r = modal.getBoundingClientRect();
    return {
      cw: modal.clientWidth, sw: modal.scrollWidth, h: modal.clientHeight, sh: modal.scrollHeight,
      w: Math.round(r.width), h: Math.round(r.height),
      rows: rows.length,
      names: rows.map((row) => row.querySelector('.swatch-name')?.value),
      colors: rows.map((row) => row.querySelector('.swatch-color')?.value),
      kinds: rows.map((row) => row.querySelector('.swatch-kind')?.value),
      rowOverflow: rows.map((row) => row.scrollWidth > row.clientWidth + 1),
      newCw: modal.querySelector('.swatch-new')?.clientWidth ?? 0,
      newSw: modal.querySelector('.swatch-new')?.scrollWidth ?? 0,
      notice: modal.querySelector('.swatch-notice')?.innerText ?? '',
      saveDisabled: rows.map((row) => !!row.querySelector('.btn-sm')?.disabled),
    };
  })()`);
  const setValue = async (selector, value, event = 'input') => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
    set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true }));
    return true;
  })()`);
  const openManager = async () => {
    const clicked = await evaluate(`(() => {
      const btn = document.querySelector('button[aria-label="管理文档色板"]');
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert(clicked, '属性坞有管理文档色板入口');
    await waitFor(`document.querySelector('.swatch-modal') !== null`, 8000);
    await sleep(300);
  };
  const closeManager = async () => {
    await evaluate(`(() => {
      const btn = [...document.querySelectorAll('.swatch-modal .modal-foot .btn')].find((b) => b.innerText.trim() === '关闭');
      btn?.click();
    })()`);
    await waitFor(`document.querySelector('.swatch-modal') === null`, 6000);
    await sleep(300);
  };
  const docChip = async (name, index = 0) => evaluate(`(() => {
    const chips = [...document.querySelectorAll('button[aria-label="使用文档色板 ${name}"]')];
    if (!chips[${index}]) return false;
    chips[${index}].click();
    return true;
  })()`);
  const addSwatchUI = async (name, color, kind) => {
    await setValue('.swatch-new-name', name);
    await setValue('.swatch-new .swatch-color', color);
    await setValue('.swatch-new .swatch-kind', kind, 'change');
    await evaluate(`document.querySelector('.swatch-new .btn-primary').click()`);
    await sleep(450);
  };
  const undo = async () => {
    await evaluate(`document.querySelector('button[title="撤销"]').click()`);
    await sleep(700);
  };
  const scrollPaletteIntoView = async () => {
    const ok = await evaluate(`(() => {
      const q = document.querySelector('.color-quick');
      const b = document.querySelector('.dock-body');
      if (!q || !b) return false;
      const qr = q.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const delta = qr.bottom - br.bottom + 14;
      if (delta > 0) b.scrollTop += delta;
      return true;
    })()`);
    assert(ok, '定位属性坞色板区');
    await sleep(350);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  // 两块矩形：第一块改填充，第二块改填充与描边
  await key('r', 82, 'KeyR');
  await drag({ x: 350, y: 360 }, { x: 470, y: 450 });
  await drag({ x: 520, y: 360 }, { x: 640, y: 450 });
  await key('v', 86, 'KeyV');
  let doc = await readDoc();
  assert(doc.pathIds.length === 2, '画布有两个矩形');
  const [id1, id2] = doc.pathIds;

  // 选中第一块矩形，打开文档色板
  await clickAt(410, 405);
  await sleep(300);
  await openManager();
  let dlg = await readDialog();
  assert(dlg.rows === 0, '初始没有文档色板');
  assert(dlg.notice === '' && dlg.cw === dlg.sw, '空色板弹窗无横向溢出');
  await shot('swatch-empty.png');

  await addSwatchUI('品牌蓝', '#0f76d6', 'process');
  await addSwatchUI('专色橙', '#ff7a00', 'spot');
  dlg = await readDialog();
  console.log('dialog after add', JSON.stringify(dlg));
  assert(dlg.rows === 2, '新建两个色板');
  assert(dlg.names.join(',') === '品牌蓝,专色橙', '色板名称正确');
  assert(dlg.kinds.join(',') === 'process,spot', '色板类型正确');
  assert(dlg.colors[0] === '#0f76d6' && dlg.colors[1] === '#ff7a00', '色板颜色正确');
  assert(dlg.rowOverflow.every((v) => !v), '色板行无横向溢出');
  assert(dlg.cw === dlg.sw && dlg.newCw === dlg.newSw, '弹窗与新建行不横向溢出');
  assert(dlg.notice.includes('已新建'), '新建反馈可见');
  await shot('swatch-dialog.png');
  await closeManager();

  // 用文档色板给第一块填充上全局链接
  assert(await docChip('品牌蓝', 0), '找到品牌蓝填充色板');
  await sleep(300);
  doc = await readDoc();
  const linked = doc.paths.find((p) => p.id === id1);
  assert(linked.fill.swatch === doc.swatches[0].id, '第一块填充链接 s1');
  assert(linked.fill.color === '#0f76d6', '第一块填充变品牌蓝');
  const linkNote = await evaluate(`document.querySelector('.color-link-note')?.innerText ?? ''`);
  assert(linkNote.includes('全局链接 · 品牌蓝'), '属性坞显示全局链接');
  assert((await evaluate(`document.querySelectorAll('.color-doc-chip').length`)) >= 2, '属性坞出现文档色板行');
  await scrollPaletteIntoView();
  await shot('swatch-linked.png');

  // 第二块填充也链接，描边链接专色
  await clickAt(580, 405);
  await sleep(300);
  assert(await docChip('品牌蓝', 0), '给第二块套品牌蓝');
  await sleep(250);
  assert(await docChip('专色橙', 1), '给第二块描边套专色橙');
  await sleep(300);
  doc = await readDoc();
  const second = doc.paths.find((p) => p.id === id2);
  assert(second.fill.swatch === doc.swatches[0].id, '第二块填充链接品牌蓝');
  assert(second.stroke.swatch === doc.swatches[1].id, '第二块描边链接专色橙');
  assert(second.stroke.color === '#ff7a00', '第二块描边变专色橙');

  // 改色板颜色，两个填充同步
  await openManager();
  dlg = await readDialog();
  assert(dlg.rows === 2, '重开保留两个色板');
  await setValue('.swatch-row .swatch-color', '#e5484d');
  await sleep(200);
  dlg = await readDialog();
  assert(dlg.colors[0] === '#e5484d', '色板颜色输入已改');
  assert(dlg.saveDisabled[0] === false, '改色后保存按钮可用');
  await evaluate(`document.querySelector('.swatch-row .btn-sm').click()`);
  await sleep(500);
  dlg = await readDialog();
  assert(dlg.notice.includes('已更新'), '改色板反馈可见');
  doc = await readDoc();
  assert(doc.paths.every((p) => p.fill.color === '#e5484d' && p.fill.swatch === doc.swatches[0].id), '两块填充同步变红并保持链接');
  assert(doc.paths.find((p) => p.id === id2).stroke.swatch === doc.swatches[1].id, '描边专色链接未被改色影响');
  await shot('swatch-recolor.png');

  // 删除品牌蓝，填充断开链接但颜色保留；撤销恢复
  await evaluate(`document.querySelector('.swatch-row .swatch-del').click()`);
  await sleep(500);
  doc = await readDoc();
  assert(doc.swatches.length === 1 && doc.swatches[0].name === '专色橙', '删除后只剩专色橙');
  assert(doc.paths.every((p) => p.fill.swatch === null && p.fill.color === '#e5484d'), '删除色板后填充断开链接、颜色保留');
  await closeManager();
  await undo();
  doc = await readDoc();
  assert(doc.swatches.length === 2 && doc.swatches[0].name === '品牌蓝', '撤销恢复品牌蓝');
  assert(doc.paths.every((p) => p.fill.swatch === doc.swatches[0].id), '撤销恢复填充链接');
  await scrollPaletteIntoView();
  await shot('swatch-undo.png');

  // 1200×900 弹窗布局
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  await openManager();
  dlg = await readDialog();
  console.log('narrow dialog', JSON.stringify(dlg));
  assert(dlg.w <= 620, '1200 宽弹窗不超过 620');
  assert(dlg.cw === dlg.sw, '1200 宽弹窗无横向溢出');
  assert(dlg.rowOverflow.every((v) => !v), '1200 宽色板行不截断');
  assert(dlg.newCw === dlg.newSw, '1200 宽新建行不截断');
  await shot('swatch-narrow.png');
  await closeManager();
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  // 留一个 1920 弹窗给真实窗口截图
  await openManager();

  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
