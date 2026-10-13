/* 验证线上短链接：数字序号 hash 与旧版 charId hash 都能进入交接遮罩 */
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

async function probe(url) {
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 5000));
  const r = await send('Runtime.evaluate', {
    expression: `!document.getElementById('handoff').hidden
      ? document.getElementById('handoff-desc').textContent : 'NO HANDOFF'`,
    returnByValue: true,
  });
  return r.result.value;
}

const base = 'https://operators-guess.pages.dev/';
const a = await probe(base + '?cb=1#m=avatar&ids=73,74,75');
const b = await probe(base + '?cb=2#m=portrait&ids=char_103_angel,char_112_siege,char_134_ifrit');
ws.close();

console.log('数字短链接:', a);
console.log('旧版长链接:', b);
const ok = a.includes('3 名') && b.includes('3 名') && b.includes('半身图');
console.log(ok ? 'ALL OK' : 'FAIL');
process.exit(ok ? 0 : 1);
