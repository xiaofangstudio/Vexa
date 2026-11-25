import fs from 'node:fs';

const port = process.env.CDP_PORT || '9234';
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
  const readPath = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    for (let i = 0; f && i < 24; i++, f = f.return) {
      const p = f.memoizedProps;
      if (p && p.doc && p.doc.nodes && Array.isArray(p.selected)) {
        const id = p.selected.length === 1 ? p.selected[0] : null;
        const n = id ? p.doc.nodes[id] : null;
        return {
          selected: p.selected.length,
          kind: n ? n.kind : null,
          subpaths: n && n.kind === 'path' ? n.subpaths.map((s) => ({
            closed: !!s.closed,
            count: s.anchors.length,
            anchors: s.anchors.map((a) => [Math.round(a.x * 10) / 10, Math.round(a.y * 10) / 10]),
          })) : null,
        };
      }
    }
    return null;
  })()`);
  const readUI = () => evaluate(`(() => {
    const bar = document.querySelector('.ed-optbar');
    const sel = document.querySelector('.opt-selection');
    return {
      anchorText: (() => {
        const h = document.querySelector('.opt-hint')?.innerText.trim() ?? '';
        const m = h.match(/^锚点 (\\d+)/);
        return m ? '锚点 ' + m[1] : null;
      })(),
      hint: document.querySelector('.opt-hint')?.innerText.trim() ?? '',
      toast: document.querySelector('.toast')?.innerText.trim() ?? '',
      layout: {
        bar: bar ? { cw: bar.clientWidth, sw: bar.scrollWidth } : null,
        sel: sel ? { cw: sel.clientWidth, sw: sel.scrollWidth } : null,
      },
    };
  })()`);

  const readHistory = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const k = cv && Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null;
    while (f && !(f.memoizedProps && f.memoizedProps.initialDoc)) f = f.return;
    if (!f) return null;
    const stacks = [];
    let current = null;
    let h = f.memoizedState;
    let i = 0;
    while (h && i < 40) {
      const v = h.memoizedState;
      if (v && v.current && v.current.nodes) {
        const p = Object.values(v.current.nodes).find((n) => n.kind === 'path');
        current = p ? p.subpaths.map((s) => ({ closed: !!s.closed, anchors: s.anchors.map((a) => [a.x, a.y]) })) : null;
      }
      if (v && v.current && Array.isArray(v.current) && (v.current.length === 0 || typeof v.current[0] === 'string')) {
        let tail = null;
        if (v.current.length) {
          try {
            const d = JSON.parse(v.current[v.current.length - 1]);
            const p = Object.values(d.nodes || {}).find((n) => n.kind === 'path');
            tail = p ? p.subpaths[0].anchors.map((a) => [a.x, a.y]) : null;
          } catch {}
        }
        stacks.push({ hook: i, len: v.current.length, tail });
      }
      h = h.next;
      i++;
    }
    return { stacks, current };
  })()`);

  await send('Runtime.enable');
  await waitFor(`document.querySelectorAll('.create-actions .btn-primary').length > 0`, 20000);
  await evaluate(`document.querySelector('.create-actions .btn-primary').click()`);
  await waitFor(`document.querySelectorAll('.editor .cv-canvas').length > 0`, 20000);
  await sleep(900);

  const rect = await evaluate(`(() => { const r = document.querySelector('.cv-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const p1 = { x: cx - 220, y: cy - 150 };
  const p2 = { x: cx + 200, y: cy - 20 };
  const p3 = { x: cx - 110, y: cy + 170 };
  console.log('canvas', JSON.stringify(rect), 'points', JSON.stringify([p1, p2, p3]));

  await key('p', 80, 'KeyP');
  await clickAt(p1.x, p1.y);
  await clickAt(p2.x, p2.y);
  await clickAt(p3.x, p3.y);
  await key('Enter', 13, 'Enter');
  await sleep(500);

  await key('a', 65, 'KeyA');
  await sleep(350);
  await clickAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  await sleep(350);
  let ui = await readUI();
  assert(ui.anchorText === null, '直接选择命中路径且尚未点锚点');
  let path = await readPath();
  assert(path?.kind === 'path' && path.subpaths?.length === 1, '读到底层路径只有一条子路径');
  assert(path.subpaths[0].closed === false && path.subpaths[0].count === 3, '钢笔路径为 3 锚点开放子路径');
  const initialAnchors = path.subpaths[0].anchors;
  console.log('initial anchors', JSON.stringify(initialAnchors));

  // 1 个锚点：连接与对齐都禁用
  await clickAt(p1.x, p1.y);
  ui = await readUI();
  assert(ui.anchorText === '锚点 1', '点第一个锚点后计数 1');
  await openObjectMenu();
  let menu = await readMenu();
  assert(menu.items['锚点左对齐']?.disabled === true, '1 个锚点时锚点左对齐禁用');
  assert(menu.items['连接锚点']?.disabled === true, '1 个锚点时连接锚点禁用');
  await scrollMenuTo('连接锚点');
  await shot('anchorjoin-menu-disabled.png');
  await closeMenu();

  // 2 个锚点，但不是两个开放端点：对齐可用，连接仍禁用
  await clickAt(p2.x, p2.y, 8);
  ui = await readUI();
  assert(ui.anchorText === '锚点 2', 'Shift 加中点后计数 2');
  await openObjectMenu();
  menu = await readMenu();
  assert(menu.items['锚点左对齐']?.disabled === false, '2 个锚点时锚点左对齐启用');
  assert(menu.items['连接锚点']?.disabled === true, '非两个端点时连接锚点仍禁用');
  await closeMenu();

  // 选首尾端点：先点路径边清空现有两个锚点，再点首、Shift 点尾
  await clickAt((p1.x + p3.x) / 2, (p1.y + p3.y) / 2);
  await clickAt(p1.x, p1.y);
  await clickAt(p3.x, p3.y, 8);
  ui = await readUI();
  assert(ui.anchorText === '锚点 2', '重选首尾两个端点');
  await openObjectMenu();
  menu = await readMenu();
  assert(menu.items['连接锚点']?.disabled === false, '首尾开放端点时可连接');
  await scrollMenuTo('连接锚点');
  await shot('anchorjoin-menu-enabled.png');
  await clickMenu('锚点左对齐');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已对齐') === true`, 8000);
  ui = await readUI();
  path = await readPath();
  console.log('after align', JSON.stringify(path), JSON.stringify(ui));
  assert(path.subpaths[0].anchors[2][0] === path.subpaths[0].anchors[0][0], '锚点左对齐后首尾 X 相同');
  assert(path.subpaths[0].anchors[1][0] === initialAnchors[1][0], '未选中的中点锚点未移动');
  assert(ui.toast.includes('已对齐 1 个锚点'), '对齐提示说明移动了 1 个锚点');
  assert(ui.anchorText === '锚点 2', '对齐后仍保留 2 个锚点选择');
  await shot('anchorjoin-align.png');
  console.log('history after align', JSON.stringify(await readHistory()));
  // 再对齐一次：不加历史，撤销一步仍回到对齐前
  await openObjectMenu();
  await clickMenu('锚点左对齐');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已经对齐') === true`, 8000);
  ui = await readUI();
  assert(ui.toast.includes('已经对齐'), '重复对齐只提示已对齐');
  assert(ui.anchorText === '锚点 2', '重复对齐后锚点选择仍在');
  console.log('history after noop', JSON.stringify(await readHistory()));
  await clickAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  ui = await readUI();
  assert(ui.anchorText === null, '点路径边清空锚点');
  await evaluate(`document.querySelector('button[title="撤销"]').click()`);
  await sleep(450);
  let hist = await readHistory();
  console.log('after undo align', JSON.stringify(hist));
  const undoAnchors = hist?.current?.[0]?.anchors ?? null;
  assert(Math.abs((undoAnchors?.[2]?.[0] ?? Infinity) - initialAnchors[2][0]) < 0.2, '撤销对齐恢复尾锚点 X');

  // 撤销会清空选区：回直接选择、重选路径与首尾端点
  await key('a', 65, 'KeyA');
  await clickAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  console.log('after reselect path', JSON.stringify(await readUI()), JSON.stringify(await readPath()));
  await clickAt(p1.x, p1.y);
  console.log('after p1', JSON.stringify(await readUI()));
  await clickAt(p3.x, p3.y, 8);
  ui = await readUI();
  console.log('after p3 shift', JSON.stringify(ui));
  assert(ui.anchorText === '锚点 2', '撤销对齐后重新选中首尾端点');

  // 菜单连接
  await openObjectMenu();
  await clickMenu('连接锚点');
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已连接') === true`, 8000);
  ui = await readUI();
  path = await readPath();
  console.log('after menu join', JSON.stringify(path), JSON.stringify(ui));
  assert(path.subpaths.length === 1 && path.subpaths[0].count === 3, '连接后仍是一条子路径、3 个锚点');
  assert(path.subpaths[0].closed === true, '菜单连接后子路径闭合');
  assert(ui.anchorText === null, '连接后锚点选择清空');
  assert(ui.toast.includes('已连接 2 个锚点'), '连接成功提示');
  await shot('anchorjoin-joined.png');

  // 撤销连接 -> 重选 -> Ctrl+J
  await clickAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  await evaluate(`document.querySelector('button[title="撤销"]').click()`);
  await sleep(500);
  hist = await readHistory();
  console.log('after undo join', JSON.stringify(hist?.current ?? null));
  assert(hist?.current?.[0]?.closed === false, '撤销连接恢复开放子路径');
  await key('a', 65, 'KeyA');
  await clickAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  await clickAt(p1.x, p1.y);
  await clickAt(p3.x, p3.y, 8);
  ui = await readUI();
  assert(ui.anchorText === '锚点 2', '撤销后重新选中首尾端点');
  await key('j', 74, 'KeyJ', 2);
  await waitFor(`document.querySelector('.toast')?.innerText.includes('已连接') === true`, 8000);
  ui = await readUI();
  path = await readPath();
  assert(path.subpaths[0].closed === true, 'Ctrl+J 连接后子路径闭合');
  assert(ui.anchorText === null, 'Ctrl+J 连接后锚点选择清空');

  // 1200x900：长对象菜单受视口高度约束，不横向溢出
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  await openObjectMenu();
  await scrollMenuTo('连接锚点');
  menu = await readMenu();
  console.log('narrow menu', JSON.stringify(menu.box));
  assert(menu.box.bottom <= menu.box.vh + 1, '菜单底部不超出 1200x900 视口');
  assert(menu.box.sw <= menu.box.cw + 1, '菜单无横向溢出');
  await shot('anchorjoin-narrow.png');
  await closeMenu();
  ui = await readUI();
  assert(!ui.layout.bar || ui.layout.bar.sw <= ui.layout.bar.cw + 1, '1200 宽选项栏无横向溢出');
  assert(!ui.layout.sel || ui.layout.sel.sw <= ui.layout.sel.cw + 1, '1200 宽选择区无横向溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(700);

  ui = await readUI();
  path = await readPath();
  console.log('final', JSON.stringify(path), JSON.stringify(ui));
  assert(path.subpaths[0].closed === true, '最终窗口保持完成连接状态');
  clearTimeout(watchdog);
  ws.close();
}

main().catch((e) => {
  console.error(e?.stack ?? e);
  process.exit(1);
});
