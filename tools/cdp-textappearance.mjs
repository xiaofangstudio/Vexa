import fs from 'node:fs';

const port = process.env.CDP_PORT || '9319';
const outDir = 'D:\\20533\\deskbox\\fangwork\\Vexa\\docs\\shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const watchdog = setTimeout(() => {
    console.error('CDP 文字外观验收超时，强制退出');
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
  const click = async (x, y) => {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y, 1);
    await mouse('mouseReleased', x, y);
    await sleep(650);
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
    await sleep(420);
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
  const setTextStroke = async (color, width) => {
    const ok = await evaluate(`(() => {
      const sec = [...document.querySelectorAll('.dock-body .dock-sec')].find((s) => s.querySelector('.dock-sec-head span')?.innerText.trim() === '文字描边');
      if (!sec) return false;
      sec.scrollIntoView({ block: 'center' });
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
    assert(ok, '属性坞找到文字描边颜色输入');
    await sleep(250);
    await evaluate(`document.activeElement?.blur()`);
    await sleep(450);
  };
  const readText = () => evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    if (!cv) return null;
    const k = Object.keys(cv).find((x) => x.includes('reactFiber'));
    let f = k ? cv[k] : null; let shell = f;
    while (shell && !(shell.memoizedProps && shell.memoizedProps.initialDoc)) shell = shell.return;
    const d = shell?.memoizedState?.memoizedState?.current;
    const t = Object.values(d.nodes).find((n) => n.kind === 'text' && n.text);
    const style = (d.styles ?? []).find((s) => s.id === t?.graphicStyle);
    return {
      tabs: [...document.querySelectorAll('.dock-tab')].map((b) => b.innerText.trim()),
      text: t ? {
        id: t.id, text: t.text, size: t.size, fill: t.fill.color, bold: !!t.bold,
        stroke: t.stroke ? { color: t.stroke.color, width: t.stroke.width } : null,
        appearance: (t.appearance ?? []).map((a) => ({
          id: a.id, kind: a.kind, opacity: a.opacity, visible: a.visible,
          fill: a.fill?.color, stroke: a.stroke ? { color: a.stroke.color, width: a.stroke.width } : undefined,
        })),
        graphicStyle: t.graphicStyle,
      } : null,
      style: style ? { id: style.id, name: style.name, appearance: style.appearance?.length ?? 0, firstFill: style.appearance?.[0]?.fill?.color } : null,
      styles: (d.styles ?? []).length,
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
      baseRows: p.querySelectorAll('.apr-base-row').length,
      baseStroke: p.querySelectorAll('.apr-base-row')[1]?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
      empty: !!p.querySelector('.apr-empty'),
      fills: [...p.querySelectorAll('.apr-item-fill')].length,
      strokes: [...p.querySelectorAll('.apr-item-stroke')].length,
      bodyOverflow: body ? body.scrollWidth > body.clientWidth + 1 : false,
      panelOverflow: p.scrollWidth > p.clientWidth + 1,
      rowOverflow: [...p.querySelectorAll('.apr-item, .apr-base-row')].map((r) => r.scrollWidth > r.clientWidth + 1),
      tabOverflow: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : false,
      tabWidths: tabs ? [...tabs.querySelectorAll('.dock-tab')].map((b) => [b.innerText.trim(), Math.round(b.getBoundingClientRect().width), b.scrollWidth, b.clientWidth]) : [],
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
  const stylePanel = () => evaluate(`(() => {
    const p = document.querySelector('.gs-panel');
    if (!p) return null;
    const cards = [...p.querySelectorAll('.gs-card')];
    return {
      cards: cards.length,
      names: cards.map((c) => c.querySelector('.gs-meta b')?.innerText.trim() ?? ''),
      metas: cards.map((c) => c.querySelector('.gs-meta em')?.innerText.trim() ?? ''),
      active: cards.filter((c) => c.classList.contains('is-active')).length,
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

  const geom = await evaluate(`(() => {
    const cv = document.querySelector('.cv-canvas');
    const r = cv.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  })()`);
  const cx = geom.x + geom.w * 0.38;
  const cy = geom.y + geom.h * 0.55;

  await tool('文字');
  await click(cx, cy - 10);
  await waitFor(`document.querySelector('.dock-textarea') !== null`, 5000);
  await evaluate(`(() => { const t = document.querySelector('.dock-textarea'); if (t) { t.focus(); t.select(); return true; } return false; })()`);
  await send('Input.insertText', { text: 'VEXA' });
  await sleep(700);
  await key('Escape', 27, 'Escape');
  await sleep(300);
  await tool('选择');
  await key('V', 86, 'KeyV');
  await sleep(400);

  let state = await readText();
  assert(!!state.text && state.text.text === 'VEXA', '文字对象已创建');
  await tab(0);
  await setNum('字号', 120);
  await evaluate(`document.querySelector('button[title="粗体"]')?.click()`);
  await sleep(450);
  await setFill('#0f76d6');
  await setTextStroke('#111319', 4);
  state = await readText();
  assert(state.text.fill === '#0f76d6', '文字底层填充写入');
  assert(state.text.bold, '文字粗体开启');
  assert(!!state.text.stroke && state.text.stroke.width === 4 && state.text.stroke.color === '#111319', '文字底层描边写入');

  await tab(6);
  await waitFor(`document.querySelector('.apr-panel') !== null`, 8000);
  let ap = await aprPanel();
  assert(ap.count === 0 && ap.baseRows === 2, '选中文字显示底层填充/描边与空叠加栈');
  assert(ap.baseStroke.includes('4 px'), '底层描边行显示 4 px');
  assert(!ap.bodyOverflow && !ap.panelOverflow && !ap.tabOverflow, '文字外观空态无溢出');

  await addItem('fill');
  await setItemColor('ap1', '#e5484d');
  await setItemNumber('ap1', 'apr-opacity', 55);
  await addItem('stroke');
  await setItemColor('ap2', '#f5b301');
  await setItemNumber('ap2', 'apr-width', 8);
  await addItem('stroke');
  await setItemColor('ap3', '#ffffff');
  await setItemNumber('ap3', 'apr-width', 4);
  await setItemNumber('ap3', 'apr-opacity', 75);
  state = await readText();
  assert(state.text.appearance.length === 3, '文字三层叠加外观已建立');
  assert(state.text.appearance.map((a) => a.kind).join(',') === 'fill,stroke,stroke', '文字叠加类型顺序正确');
  assert(state.text.appearance[0].fill === '#e5484d' && state.text.appearance[1].stroke.width === 8 && state.text.appearance[2].stroke.color === '#ffffff', '文字叠加参数落到文档');
  ap = await aprPanel();
  assert(ap.count === 3 && ap.fills === 1 && ap.strokes === 2, '文字面板显示一填充两描边');
  assert(ap.ids.join(',') === 'ap3,ap2,ap1', '文字叠加栈顶层优先展示');

  await tab(2);
  await sleep(350);
  await evaluate(`(() => {
    const el = document.querySelector('.gs-name');
    if (!el) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '文字双描边');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await evaluate(`document.querySelector('.gs-primary')?.click()`);
  await sleep(650);
  state = await readText();
  assert(state.styles === 1, '文字样式已创建');
  const sp = await stylePanel();
  assert(sp.cards === 1 && sp.names[0] === '文字双描边' && sp.metas[0].includes('外观 3'), '样式卡显示三层外观');
  await evaluate(`document.querySelector('.gs-card')?.click()`);
  await sleep(650);
  state = await readText();
  assert(!!state.text.graphicStyle, '套用样式后文字建立链接');
  assert(state.style && state.style.appearance === 3, '图形样式保存三层外观');

  await tab(6);
  await setItemColor('ap1', '#0f9d8a');
  await setItemNumber('ap1', 'apr-opacity', 35);
  state = await readText();
  assert(state.text.appearance[0].fill === '#0f9d8a', '样式来源文字改叠加色');
  await tab(2);
  await evaluate(`document.querySelector('.gs-btn:not(.gs-primary)')?.click()`);
  await sleep(700);
  state = await readText();
  assert(state.style && state.style.firstFill === '#0f9d8a', '更新样式同步叠加填充色');
  assert(state.text.appearance[0].fill === '#0f9d8a', '更新后来源文字保持新外观');

  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  await tab(6);
  ap = await aprPanel();
  assert(!ap.bodyOverflow && !ap.panelOverflow && !ap.tabOverflow, '1200 宽文字外观面板无溢出');
  assert(ap.rowOverflow.every((v) => !v), '1200 宽文字外观行不截断');
  assert(ap.tabWidths.every((t) => t[2] <= t[3] + 1), '1200 宽七标签不溢出');
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(600);

  await tab(6);
  ap = await aprPanel();
  assert(ap.count === 3 && ap.fills === 1 && ap.strokes === 2, '最终截图文字三层外观');
  assert(!ap.bodyOverflow && !ap.panelOverflow, '最终文字外观面板无溢出');
  assert(errors.length === 0, '无运行时异常');
  await shot('text-appearance.png');
  ws.close();
  clearTimeout(watchdog);
}

main().catch((err) => { console.error('Error:', err.message); process.exit(1); });
