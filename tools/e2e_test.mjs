/* 通过 CDP 驱动无头浏览器做端到端点击测试。
   用法：node tools/e2e_test.mjs   （需要先以 --remote-debugging-port=9222 启动浏览器） */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(url) {
  // HTTP 创建标签页，直接连该目标的 ws（命令无需 sessionId）
  const created = await (await fetch(
    'http://localhost:9222/json/new?' + encodeURIComponent('about:blank'),
    { method: 'PUT' })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  let loaded = false;
  ws.addEventListener('message', h => {
    const m = JSON.parse(h.data);
    if (m.method === 'Page.loadEventFired') loaded = true;
  });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100 && !loaded; i++) await sleep(50);
  if (!loaded) throw new Error('page load timeout');

  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.value ?? ''));
    return r.result.value;
  };

  return { evaluate, close: () => ws.close() };
}

const SCENARIO = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wait = async (fn, t = 6000) => {
    const s = Date.now();
    while (Date.now() - s < t) { const r = fn(); if (r) return r; await sleep(50); }
    throw new Error('wait timeout');
  };
  const out = {};

  /* ---- 局 1：全部答对 ---- */
  document.querySelector('#mode-seg button[data-mode="avatar"]').click();
  document.getElementById('btn-clear').click();
  out.cardCount = document.querySelectorAll('.op-card').length;
  const cards = [...document.querySelectorAll('.op-card')];
  for (let i = 0; i < 6; i++) cards[i].querySelector('input').click();
  out.setupCount = document.getElementById('setup-count').textContent;
  out.startEnabledAfter6 = !document.getElementById('btn-start').disabled;
  document.getElementById('btn-start').click();
  await wait(() => !document.getElementById('handoff').hidden);
  out.shareHash = location.hash;
  out.handoffText = document.getElementById('handoff-desc').textContent;
  document.getElementById('btn-handoff-go').click();
  await wait(() => !document.getElementById('screen-play').hidden);
  out.slotCount = document.querySelectorAll('#play-grid .slot').length;
  out.initialPool = document.querySelectorAll('#pool .chip').length;

  const ids = [...document.querySelectorAll('#play-grid img')]
    .map(im => im.src.split('/').pop().replace('.png', ''));
  for (let i = 0; i < ids.length; i++) {
    const need = ids[i];
    const chip = document.querySelector('#pool .chip[data-id="' + need + '"]')
      || document.querySelector('.slot .chip[data-id="' + need + '"]');
    chip.click();
    document.querySelectorAll('#play-grid .slot')[i].click();
  }
  out.filledProgress = document.getElementById('play-progress').textContent;
  out.submitEnabledFull = !document.getElementById('btn-submit').disabled;
  await sleep(1100);
  out.timerShown = document.getElementById('timer').textContent;
  document.getElementById('btn-submit').click();
  await wait(() => !document.getElementById('screen-result').hidden);
  out.r1 = {
    x: document.getElementById('result-x').textContent,
    n: document.getElementById('result-n').textContent,
    rate: document.getElementById('result-rate').textContent,
    time: document.getElementById('result-time').textContent,
    greens: document.querySelectorAll('#result-grid .qcard.is-correct').length,
    reds: document.querySelectorAll('#result-grid .qcard.is-wrong').length,
  };

  /* ---- 局 2：重新出题，全部放错（循环移位） ---- */
  document.getElementById('btn-new').click();
  await wait(() => !document.getElementById('screen-setup').hidden);
  out.selectionKept = document.getElementById('setup-count').textContent;
  document.getElementById('btn-start').click();
  await wait(() => !document.getElementById('handoff').hidden);
  document.getElementById('btn-handoff-go').click();
  await wait(() => !document.getElementById('screen-play').hidden);

  const ids2 = [...document.querySelectorAll('#play-grid img')]
    .map(im => im.src.split('/').pop().replace('.png', ''));
  for (let i = 0; i < ids2.length; i++) {
    const need = ids2[(i + 1) % ids2.length];
    const chip = document.querySelector('#pool .chip[data-id="' + need + '"]')
      || document.querySelector('.slot .chip[data-id="' + need + '"]');
    chip.click();
    document.querySelectorAll('#play-grid .slot')[i].click();
  }
  document.getElementById('btn-submit').click();
  await wait(() => !document.getElementById('screen-result').hidden);
  out.r2 = {
    x: document.getElementById('result-x').textContent,
    rate: document.getElementById('result-rate').textContent,
    answerHints: document.querySelectorAll('#result-grid .qcard.is-wrong .answer b').length,
  };

  /* ---- 局 3：半身像模式 + 重置按钮 + 同一批复玩 ---- */
  document.getElementById('btn-new').click();
  await wait(() => !document.getElementById('screen-setup').hidden);
  document.querySelector('#mode-seg button[data-mode="portrait"]').click();
  document.getElementById('btn-start').click();
  await wait(() => !document.getElementById('handoff').hidden);
  document.getElementById('btn-handoff-go').click();
  await wait(() => !document.getElementById('screen-play').hidden);
  out.portraitGrid = document.getElementById('play-grid').className;
  const pids = [...document.querySelectorAll('#play-grid img')]
    .map(im => im.src.split('/').pop().replace('_1.png', ''));
  document.querySelector('#pool .chip[data-id="' + pids[0] + '"]').click();
  document.querySelector('#play-grid .slot[data-slot="0"]').click();
  out.afterOne = document.getElementById('play-progress').textContent;
  document.getElementById('btn-reset').click();
  out.afterReset = document.getElementById('play-progress').textContent;
  out.poolAfterReset = document.querySelectorAll('#pool .chip').length;
  document.getElementById('btn-new').click();
  await wait(() => !document.getElementById('screen-setup').hidden);

  /* ---- 局 4：半身缩略图 + 浮动 dock + 放弃按钮 ---- */
  out.r4 = {};
  document.querySelector('#mode-seg button[data-mode="avatar"]').click();
  out.r4.setupAvatarSrc = document.querySelector('.op-card img').src.includes('char_avatar/');
  document.querySelector('#mode-seg button[data-mode="portrait"]').click();
  out.r4.setupPortraitSrc = document.querySelector('.op-card img').src.includes('char_portrait/');
  out.r4.setupGridClass = document.getElementById('setup-grid').className;

  document.getElementById('btn-clear').click();
  const cs3 = [...document.querySelectorAll('.op-card')];
  for (let i = 0; i < 3; i++) cs3[i].querySelector('input').click();
  out.r4.count = document.getElementById('setup-count').textContent;
  document.getElementById('btn-start').click();
  await wait(() => !document.getElementById('handoff').hidden);
  document.getElementById('btn-handoff-go').click();
  await wait(() => !document.getElementById('screen-play').hidden);

  out.r4.dockPosition = getComputedStyle(document.getElementById('pool-dock')).position;
  out.r4.dockExpanded = !document.getElementById('pool-dock').classList.contains('is-collapsed');
  out.r4.poolCountText = document.getElementById('pool-count').textContent;
  out.r4.hasQuit = !!document.getElementById('btn-quit');
  await sleep(200);
  out.r4.padBefore = parseInt(getComputedStyle(document.getElementById('screen-play')).paddingBottom, 10);

  const ids4 = [...document.querySelectorAll('#play-grid img')]
    .map(im => im.src.split('/').pop().replace('_1.png', ''));
  document.querySelector('#pool .chip[data-id="' + ids4[0] + '"]').click();
  document.querySelector('#play-grid .slot[data-slot="0"]').click();
  out.r4.afterOneExpanded = !document.getElementById('pool-dock').classList.contains('is-collapsed');

  document.getElementById('pool-bar').click();
  out.r4.manualCollapsed = document.getElementById('pool-dock').classList.contains('is-collapsed');
  out.r4.btnLabel = document.getElementById('btn-pool-toggle').textContent;
  document.getElementById('pool-bar').click();

  for (let i = 1; i < 3; i++) {
    document.querySelector('#pool .chip[data-id="' + ids4[i] + '"]').click();
    document.querySelector('#play-grid .slot[data-slot="' + i + '"]').click();
  }
  out.r4.autoCollapsed = document.getElementById('pool-dock').classList.contains('is-collapsed');

  window.confirm = () => true;   // 自动接受放弃确认
  document.getElementById('btn-quit').click();
  await wait(() => !document.getElementById('screen-setup').hidden);
  out.r4.backToSetup = !document.getElementById('screen-setup').hidden;

  return out;
})()`;

const page = await newPage('http://localhost:8765/');
await sleep(500); // 确保 fetch 数据完成

let result;
try {
  result = await page.evaluate(SCENARIO);

  // 旧版长链接（charId）兼容性：设置 hash 后整页刷新触发 init/readHash
  await page.evaluate(
    `location.hash='#m=avatar&ids=char_103_angel,char_112_siege'; location.reload()`
  ).catch(() => {});
  await sleep(1200);
  result.legacyHash = await page.evaluate(
    `!document.getElementById('handoff').hidden && document.getElementById('handoff-desc').textContent`
  );
} finally {
  page.close();
}

console.log(JSON.stringify(result, null, 2));

const checks = [
  ['卡片总数 138', result.cardCount === 138],
  ['分享链接使用数字编号', /^#m=avatar&ids=\d+(,\d+){5}$/.test(result.shareHash)],
  ['旧版 charId 链接仍兼容', typeof result.legacyHash === 'string' && result.legacyHash.includes('2 名六星干员')],
  ['勾选计数 6', result.setupCount === '已选 6 人'],
  ['选 6 人后开始按钮可用', result.startEnabledAfter6 === true],
  ['交接提示出现', result.handoffText.includes('6 名六星干员')],
  ['答题槽位 6 个', result.slotCount === 6],
  ['初始待选 6 个', result.initialPool === 6],
  ['全部填满进度', result.filledProgress === '已放置 6/6'],
  ['填满后可提交', result.submitEnabledFull === true],
  ['计时器已启动', result.timerShown !== '00:00'],
  ['全对 6/6', result.r1.x === '6' && result.r1.n === '6'],
  ['全对正确率 100%', result.r1.rate === '正确率 100%'],
  ['结算有用时', result.r1.time.includes('用时') && result.r1.time !== '用时 00:00'],
  ['绿色卡片 6', result.r1.greens === 6],
  ['红色卡片 0', result.r1.reds === 0],
  ['返回后勾选保留', result.selectionKept === '已选 6 人'],
  ['全错 0/6', result.r2.x === '0'],
  ['全错正确率 0%', result.r2.rate === '正确率 0%'],
  ['错误提示 6 个', result.r2.answerHints === 6],
  ['半身像网格类名', result.portraitGrid.includes('is-portrait')],
  ['放置一个后进度', result.afterOne === '已放置 1/6'],
  ['重置后进度', result.afterReset === '已放置 0/6'],
  ['重置后待选回满', result.poolAfterReset === 6],
  ['头像模式卡片显示头像', result.r4.setupAvatarSrc === true],
  ['半身模式卡片显示半身图', result.r4.setupPortraitSrc === true],
  ['半身模式网格类名切换', result.r4.setupGridClass.includes('is-portrait')],
  ['局 4 共选 3 人', result.r4.count === '已选 3 人'],
  ['待选区浮动 fixed', result.r4.dockPosition === 'fixed'],
  ['开局待选区展开', result.r4.dockExpanded === true],
  ['待选区计数文本', result.r4.poolCountText === '3 个未放置'],
  ['放弃按钮存在', result.r4.hasQuit === true],
  ['内容底部为 dock 留白', result.r4.padBefore > 100],
  ['放一个后 dock 仍展开', result.r4.afterOneExpanded === true],
  ['手动收起 dock', result.r4.manualCollapsed === true],
  ['收起后按钮文案', result.r4.btnLabel.includes('展开')],
  ['全部放完自动收起', result.r4.autoCollapsed === true],
  ['放弃后返回出题页', result.r4.backToSetup === true],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name);
  if (!ok) failed++;
}
console.log(`\\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
