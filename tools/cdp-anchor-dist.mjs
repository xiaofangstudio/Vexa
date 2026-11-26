import fs from 'node:fs';

const port = process.env.CDP_PORT || '9235';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 验收超时，强制退出');
    process.exit(2);
  }, 120000);
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
  const waitFor = async (expression, timeout = 20000) => {
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
    await sleep(140);
  };
  const clickAt = async (x, y, modifiers = 0) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, modifiers });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, modifiers });
    await sleep(300);
  };
  const readUI = () => evaluate(`(() => {
    const bar = document.querySelector('.ed-optbar');
    const sel = document.querySelector('.opt-selection');
    return {
      anchorText: (() => {
        const h = document.querySelector('.opt-hint')?.innerText.trim() ?? '';
        const m = h.match(/^锚点 (\\d+)/);
        return m ? '锚点 ' + m[1] : null;
      })(),
      selCount: document.querySelector('.opt-sel-count')?.innerText.trim() ?? null,
      toast: document.querySelector('.toast')?.innerText.trim() ?? '',
      tool: document.querySelector('.opt-tool-chip')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      layout: {
        bar: bar ? { cw: bar.clientWidth, sw: bar.scrollWidth } : null,
        sel: sel ? { cw: sel.clientWidth, sw: sel.scrollWidth } : null,
      },
    };
  })()`);
  const readPaths = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    while (f && !(f.memoizedProps && f.memoizedProps.initialDoc)) f = f.return;
    if (!f) return null;
    const v = f.memoizedState?.memoizedState;
    const doc = v?.current;
    if (!doc || !doc.nodes) return null;
    const ids = Object.keys(doc.nodes).filter((id) => doc.nodes[id]?.kind === 'path');
    return {
      ids,
      root: doc.root.slice(),
      paths: ids.map((id) => ({
        id,
        subpaths: doc.nodes[id].subpaths.map((s) => ({
          closed: !!s.closed,
          anchors: s.anchors.map((a) => [Math.round(a.x * 100) / 100, Math.round(a.y * 100) / 100]),
        })),
      })),
    };
  })()`);
  const undo = async () => {
    await evaluate(`document.querySelector('button[title="撤销"]').click()`);
    await sleep(500);
  };
  const redo = async () => {
    await evaluate(`document.querySelector('button[title="重做"]').click()`);
    await sleep(500);
  };
  const openObjectMenu = async () => {
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.menubtn')].find((x) => x.textContent.trim() === '对象');
      if (!b) throw new Error('没有对象菜单');
      b.click();
    })()`);
    await waitFor(`document.querySelectorAll('.menu-pop').length > 0`, 8000);
    await sleep(300);
  };
  const closeMenu = async () => {
    await evaluate(`(() => {
      const b = [...document.querySelectorAll('.menubtn')].find((x) => x.textContent.trim() === '对象');
      if (b) b.click();
    })()`);
    await waitFor(`document.querySelectorAll('.menu-pop').length === 0`, 8000);
  };
  const scrollMenuTo = async (label) => {
    const found = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.menu-item')].find((b) => b.querySelector('.menu-item-label')?.textContent.trim() === ${JSON.stringify(label)});
      if (!item) return false;
      const pop = document.querySelector('.menu-pop');
      if (pop) pop.scrollTop = Math.max(0, item.offsetTop - 8);
      return true;
    })()`);
    assert(found === true, `菜单中存在“${label}”`);
    await sleep(220);
  };
  const readMenu = () => evaluate(`(() => {
    const pop = document.querySelector('.menu-pop');
    if (!pop) return null;
    const items = {};
    for (const b of pop.querySelectorAll('.menu-item')) {
      const label = b.querySelector('.menu-item-label')?.textContent.trim();
      if (label) items[label] = { disabled: !!b.disabled, key: b.querySelector('.menu-item-key')?.textContent.trim() ?? '' };
    }
    const r = pop.getBoundingClientRect();
    return {
      items,
      box: { top: Math.round(r.top), bottom: Math.round(r.bottom), cw: pop.clientWidth, sw: pop.scrollWidth, ch: pop.clientHeight, sh: pop.scrollHeight, vh: window.innerHeight },
    };
  })()`);
  const clickMenu = async (label) => {
    const ok = await evaluate(`(() => {
      const item = [...document.querySelectorAll('.menu-item')].find((b) => b.querySelector('.menu-item-label')?.textContent.trim() === ${JSON.stringify(label)});
      if (!item || item.disabled) return false;
      item.click();
      return true;
    })()`);
    assert(ok === true, `点击菜单项“${label}”`);
    await waitFor(`document.querySelectorAll('.menu-pop').length === 0`, 8000);
    await sleep(300);
  };

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const rect = await evaluate(`(() => { const r = document.querySelector('.cv-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const a0 = { x: cx - 250, y: cy - 170 };
  const a1 = { x: cx - 120, y: cy - 120 };
  const a2 = { x: cx + 40, y: cy + 160 };
  const a3 = { x: cx + 220, y: cy - 30 };
  const b0 = { x: cx + 250, y: cy + 30 };
  const b1 = { x: cx + 310, y: cy + 100 };
  const b2 = { x: cx + 235, y: cy + 170 };
  console.log('canvas', JSON.stringify(rect), 'A', JSON.stringify([a0, a1, a2, a3]), 'B', JSON.stringify([b0, b1, b2]));

  // 路径 A：4 锚点开放折线
  await key('p', 80, 'KeyP');
  await clickAt(a0.x, a0.y);
  await clickAt(a1.x, a1.y);
  await clickAt(a2.x, a2.y);
  await clickAt(a3.x, a3.y);
  await key('Enter', 13, 'Enter');
  await sleep(500);

  await key('a', 65, 'KeyA');
  await clickAt((a0.x + a1.x) / 2, (a0.y + a1.y) / 2);
  await sleep(350);
  let ui = await readUI();
  assert(ui.selCount === '1', '直接选择命中路径 A');
  let doc = await readPaths();
  assert(doc.paths.length === 1 && doc.paths[0].subpaths[0].anchors.length === 4, '路径 A 为 4 锚点开放子路径');
  const beforeDistribute = doc.paths[0].subpaths[0].anchors;
  console.log('A anchors before distribute', JSON.stringify(beforeDistribute));

  // 选 0/1/3 三个锚点，1 不在中间
  await clickAt(a0.x, a0.y);
  await clickAt(a1.x, a1.y, 8);
  await clickAt(a3.x, a3.y, 8);
  ui = await readUI();
  assert(ui.anchorText === '锚点 3', '选中 A 的三个锚点');
  await openObjectMenu();
  let menu = await readMenu();
  assert(menu.items['锚点水平分布']?.disabled === false, '三个锚点时水平分布启用');
  assert(menu.items['锚点垂直分布']?.disabled === false, '三个锚点时垂直分布启用');
  assert(menu.items['连接锚点']?.disabled === true, '选中中点锚点时连接禁用');
  await scrollMenuTo('连接锚点');
  await shot('anchor-dist-menu.png');
  await clickMenu('锚点水平分布');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已分布') === true`, 8000);
  ui = await readUI();
  doc = await readPaths();
  const afterDistribute = doc.paths[0].subpaths[0].anchors;
  console.log('A anchors after distribute', JSON.stringify(afterDistribute));
  const sortedX = [afterDistribute[0][0], afterDistribute[1][0], afterDistribute[3][0]].sort((x, y) => x - y);
  assert(Math.abs(afterDistribute[1][0] - (sortedX[0] + sortedX[2]) / 2) < 0.2, '中间锚点 X 落到首尾中点');
  assert(afterDistribute[1][1] === beforeDistribute[1][1], '分布不改变中间锚点 Y');
  assert(afterDistribute[2][0] === beforeDistribute[2][0], '未选中的第 3 个锚点不动');
  assert(ui.toast.includes('已分布 1 个锚点'), '分布提示说明移动 1 个锚点');
  await shot('anchor-dist-result.png');

  // 重复分布不写空历史：再分布一次后一次撤销应回到分布前
  await openObjectMenu();
  await clickMenu('锚点水平分布');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已经分布') === true`, 8000);
  ui = await readUI();
  assert(ui.toast.includes('已经分布'), '重复分布只提示已分布');
  await undo();
  doc = await readPaths();
  console.log('A after undo distribute', JSON.stringify(doc.paths[0].subpaths[0].anchors));
  assert(Math.abs(doc.paths[0].subpaths[0].anchors[1][0] - beforeDistribute[1][0]) < 0.2, '一次撤销恢复分布前位置');

  // 路径 B：3 锚点开放折线
  await key('p', 80, 'KeyP');
  await clickAt(b0.x, b0.y);
  await clickAt(b1.x, b1.y);
  await clickAt(b2.x, b2.y);
  await key('Enter', 13, 'Enter');
  await sleep(500);
  await key('a', 65, 'KeyA');
  await clickAt((a0.x + a1.x) / 2, (a0.y + a1.y) / 2);
  await clickAt((b0.x + b1.x) / 2, (b0.y + b1.y) / 2, 8);
  await sleep(400);
  ui = await readUI();
  doc = await readPaths();
  console.log('selected two paths', JSON.stringify(ui), JSON.stringify(doc.paths.map((p) => p.id)));
  assert(doc.paths.length === 2, '文档有两条路径');
  assert(ui.selCount === '2', 'Shift 点路径 B 后选中两个对象');

  // 跨节点端点：A 的末锚点 + B 的首锚点
  await clickAt(a3.x, a3.y);
  await clickAt(b0.x, b0.y, 8);
  ui = await readUI();
  assert(ui.anchorText === '锚点 2', '跨节点选中两个端点');
  await openObjectMenu();
  menu = await readMenu();
  assert(menu.items['连接锚点']?.disabled === false, '跨节点首尾端点时连接启用');
  await scrollMenuTo('连接锚点');
  await shot('anchor-cross-menu.png');
  await clickMenu('连接锚点');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已连接') === true`, 8000);
  ui = await readUI();
  doc = await readPaths();
  console.log('after cross join', JSON.stringify(ui), JSON.stringify(doc));
  assert(doc.paths.length === 1, '跨节点连接后只剩一条路径节点');
  assert(doc.root.filter((id) => doc.ids.includes(id)).length === 1, '根层只剩合并后的路径');
  assert(doc.paths[0].subpaths.length === 1, '跨节点连接后一条子路径');
  assert(doc.paths[0].subpaths[0].anchors.length === 7, '跨节点连接后锚点 4+3=7');
  assert(doc.paths[0].subpaths[0].closed === false, '跨节点连接保持开放');
  assert(ui.anchorText === null && ui.toast.includes('已连接 2 个锚点'), '跨节点连接后清空锚点并提示');
  await shot('anchor-cross-joined.png');

  await undo();
  doc = await readPaths();
  console.log('after undo cross', JSON.stringify(doc.paths.map((p) => ({ id: p.id, n: p.subpaths[0].anchors.length }))));
  assert(doc.paths.length === 2, '撤销跨节点连接恢复两个节点');
  await redo();
  doc = await readPaths();
  assert(doc.paths.length === 1 && doc.paths[0].subpaths[0].anchors.length === 7, '重做恢复跨节点连接');

  // 1200x900：菜单限高与选项栏
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  await openObjectMenu();
  await scrollMenuTo('连接锚点');
  menu = await readMenu();
  console.log('narrow menu', JSON.stringify(menu.box));
  assert(menu.box.bottom <= menu.box.vh + 1, '跨节点菜单底部不超出 1200x900 视口');
  assert(menu.box.sw <= menu.box.cw + 1, '跨节点菜单无横向溢出');
  await shot('anchor-dist-narrow.png');
  await closeMenu();
  ui = await readUI();
  assert(!ui.layout.bar || ui.layout.bar.sw <= ui.layout.bar.cw + 1, '1200 宽选项栏无横向溢出');
  assert(!ui.layout.sel || ui.layout.sel.sw <= ui.layout.sel.cw + 1, '1200 宽选择区无横向溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  doc = await readPaths();
  ui = await readUI();
  console.log('final', JSON.stringify(ui), JSON.stringify(doc));
  assert(doc.paths.length === 1 && doc.paths[0].subpaths[0].anchors.length === 7, '最终窗口保持跨节点连接');
  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
