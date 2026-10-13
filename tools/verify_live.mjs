/* 线上冒烟测试：JSON、旧图片路径 404、真实浏览器里远程图片渲染成功 */
const base = 'https://operators-guess.pages.dev/';

const checks = [
  ['json 含 torappu 链接',
    fetch(base + 'js/data/operators.json').then(r => r.text()).then(t =>
      t.includes('torappu.prts.wiki') && t.includes('avatarAlt') ? 0 : 1)],
  ['json 含 138 名干员',
    fetch(base + 'js/data/operators.json').then(r => r.json()).then(d => d.length === 138 ? 0 : 1)],
  ['源站不再托管图片（绕过边缘缓存）',
    fetch(base + 'assets/avatar/char_103_angel.png?cb=' + Date.now())
      .then(r => (r.status === 200 && r.headers.get('content-type').includes('text/html')) ? 0 : 1)],
];

const results = await Promise.all(checks.map(async ([, p]) => [await p.catch(() => 1)]));

// 真实浏览器验证远程图片在 pages.dev 页面上渲染
const created = await (await fetch('http://localhost:9222/json/new?' + encodeURIComponent('about:blank'),
  { method: 'PUT' })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await send('Page.enable');
await send('Page.navigate', { url: base });
await new Promise(r => setTimeout(r, 6000));
const r = await send('Runtime.evaluate', {
  expression: `(async () => {
    await new Promise(r => setTimeout(r, 1500));
    const imgs = [...document.querySelectorAll('.op-card img')].slice(0, 12);
    const loaded = imgs.filter(i => i.naturalWidth > 0).length;
    const src = imgs[0] && imgs[0].src;
    return { loaded, total: imgs.length, src, cards: document.querySelectorAll('.op-card').length };
  })()`,
  awaitPromise: true, returnByValue: true,
});
ws.close();

const browserOk = r.result.value.loaded >= 10 && r.result.value.cards === 138
  && r.result.value.src.includes('torappu.prts.wiki') ? 0 : 1;

let fail = 0;
checks.forEach(([name], i) => {
  const ok = results[i][0] === 0;
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) fail++;
});
console.log(browserOk === 0 ? 'PASS' : 'FAIL', '浏览器远程图片渲染', JSON.stringify(r.result.value));
if (browserOk !== 0) fail++;
console.log(fail === 0 ? '\nALL OK' : `\n${fail} failed`);
process.exit(fail ? 1 : 0);
