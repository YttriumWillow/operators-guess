'use strict';
/* 猜六星干员：纯前端单页应用，无依赖。 */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const LS_MODE = 'og_mode';
const LS_SELECTED = 'og_selected';

const state = {
  operators: [],
  byId: new Map(),
  mode: 'avatar',          // avatar | portrait
  prof: '全部',
  selected: new Set(),     // 出题界面勾选
  quizIds: [],             // 本局图片顺序（已打乱）
  slots: [],               // 每个槽位放置的 charId
  poolIds: [],             // 待选区中的 charId
  activeChip: null,        // 点选模式下当前选中的 chip
  startAt: 0,
  elapsed: 0,
  timerId: null,
  lastConfig: null,        // { ids, mode }
};

let draggingId = null;
let overEl = null;

/* ========== 小工具 ========== */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

/* 图片直链 PRTS：主源 torappu 游戏资源镜像，失败降级 media.wiki 上传库 */
const imgPath = (op, mode) => mode === 'avatar' ? op.avatar : op.portrait;
const imgAltPath = (op, mode) => mode === 'avatar' ? op.avatarAlt : op.portraitAlt;

function makeImg(op, mode) {
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = '';
  img.src = imgPath(op, mode);
  img.addEventListener('error', () => {
    if (img.dataset.fb === '1') { img.style.visibility = 'hidden'; return; }
    img.dataset.fb = '1';   // 主源失败，换 wiki 上传库直链
    img.src = imgAltPath(op, mode);
  });
  return img;
}

function showScreen(name) {
  for (const n of ['setup', 'play', 'result']) {
    $(`#screen-${n}`).hidden = n !== name;
  }
}

/* ========== 名字 chip ========== */

function chipEl(id, { draggable = true } = {}) {
  const op = state.byId.get(id);
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'chip';
  el.dataset.id = id;
  if (draggable) el.draggable = true;

  const zh = document.createElement('span');
  zh.className = 'chip__zh';
  zh.textContent = op.name;
  el.append(zh);

  if (op.en) {
    const en = document.createElement('span');
    en.className = 'chip__en';
    en.textContent = op.en;
    el.append(en);
  }
  return el;
}

/* ========== ① 出题界面 ========== */

function buildSetup() {
  const grid = $('#setup-grid');
  grid.classList.toggle('is-portrait', state.mode === 'portrait');
  const frag = document.createDocumentFragment();

  for (const op of state.operators) {
    const card = document.createElement('label');
    card.className = 'op-card';
    card.dataset.id = op.charId;

    const tick = document.createElement('span');
    tick.className = 'op-card__tick';
    tick.textContent = '✓';

    const input = document.createElement('input');
    input.type = 'checkbox';

    const img = makeImg(op, state.mode);

    const name = document.createElement('span');
    name.className = 'op-card__name';
    name.textContent = op.name;

    const en = document.createElement('span');
    en.className = 'op-card__en';
    en.textContent = op.en || '';

    card.append(tick, input, img, name, en);
    input.addEventListener('change', () => toggleSelect(op.charId, input.checked));
    frag.append(card);
  }
  grid.append(frag);

  // 职业筛选
  const profs = ['全部', ...new Set(state.operators.map(o => o.profession))];
  const chips = $('#prof-chips');
  for (const p of profs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'prof-chip' + (p === state.prof ? ' is-active' : '');
    b.textContent = p;
    b.addEventListener('click', () => {
      state.prof = p;
      $$('.prof-chip').forEach(x => x.classList.toggle('is-active', x.textContent === p));
      applyFilter();
    });
    chips.append(b);
  }
}

function toggleSelect(id, on) {
  if (on) state.selected.add(id); else state.selected.delete(id);
  syncCard(id);
  persistSelection();
  updateSetupCount();
}

function syncCard(id) {
  const card = $(`.op-card[data-id="${CSS.escape(id)}"]`);
  const on = state.selected.has(id);
  card.classList.toggle('is-selected', on);
  card.querySelector('input').checked = on;
}

function applyFilter() {
  const q = $('#search').value.trim().toLowerCase();
  for (const op of state.operators) {
    const card = $(`.op-card[data-id="${CSS.escape(op.charId)}"]`);
    const profOk = state.prof === '全部' || op.profession === state.prof;
    const qOk = !q
      || op.name.toLowerCase().includes(q)
      || (op.en || '').toLowerCase().includes(q);
    card.hidden = !(profOk && qOk);
  }
}

function randomPick(n) {
  const pool = state.operators.filter(op =>
    !$(`.op-card[data-id="${CSS.escape(op.charId)}"]`).hidden);
  shuffle(pool);
  state.selected = new Set(pool.slice(0, Math.min(n, pool.length)).map(o => o.charId));
  for (const op of state.operators) syncCard(op.charId);
  persistSelection();
  updateSetupCount();
}

function persistSelection() {
  localStorage.setItem(LS_SELECTED, JSON.stringify([...state.selected]));
}

function updateSetupCount() {
  $('#setup-count').textContent = `已选 ${state.selected.size} 人`;
  $('#btn-start').disabled = state.selected.size < 2;
}

function setMode(mode) {
  state.mode = mode;
  localStorage.setItem(LS_MODE, mode);
  $$('#mode-seg button').forEach(b =>
    b.classList.toggle('is-active', b.dataset.mode === mode));

  // 出题页卡片随模式切换头像 / 半身图（重建 img 以重置降级状态）
  const grid = $('#setup-grid');
  grid.classList.toggle('is-portrait', mode === 'portrait');
  for (const card of $$('#setup-grid .op-card')) {
    const old = card.querySelector('img');
    old.replaceWith(makeImg(state.byId.get(card.dataset.id), mode));
  }
}

/* ========== 开局 / 交接遮罩 ========== */

function beginQuiz(ids, mode) {
  state.lastConfig = { ids: ids.slice(), mode };
  state.quizIds = shuffle(ids.slice());
  state.slots = state.quizIds.map(() => null);
  state.poolIds = shuffle(ids.slice());
  state.activeChip = null;

  history.replaceState(null, '', `#m=${mode}&ids=${ids.join(',')}`);
  $('#handoff-desc').textContent =
    `共 ${ids.length} 名六星干员 · ${mode === 'avatar' ? '头像图' : '半身图'} · 名字都在下方待选区`;
  $('#handoff').hidden = false;
}

function enterPlay() {
  $('#handoff').hidden = true;
  showScreen('play');
  renderPlay();
  startTimer();
}

/* ========== ② 答题界面 ========== */

function renderPlay() {
  const grid = $('#play-grid');
  grid.className = 'play-grid' + (state.mode === 'portrait' ? ' is-portrait' : '');
  grid.innerHTML = '';

  state.quizIds.forEach((id, i) => {
    const op = state.byId.get(id);
    const card = document.createElement('div');
    card.className = 'qcard';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'qcard__img';
    imgWrap.append(makeImg(op, state.mode));

    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.slot = i;
    slot.dataset.drop = 'slot';

    card.append(imgWrap, slot);
    grid.append(card);
  });

  renderSlots();
  renderPool();
  updatePlayProgress();
}

function renderSlots() {
  $$('#play-grid .slot').forEach(slotEl => {
    const i = Number(slotEl.dataset.slot);
    const id = state.slots[i];
    slotEl.innerHTML = '';
    if (id) {
      const c = chipEl(id);
      if (state.activeChip === id) c.classList.add('is-active');
      slotEl.append(c);
    } else {
      slotEl.textContent = '拖 / 点名字到这里';
    }
  });
}

function renderPool() {
  const pool = $('#pool');
  pool.innerHTML = '';
  for (const id of state.poolIds) {
    const c = chipEl(id);
    if (state.activeChip === id) c.classList.add('is-active');
    pool.append(c);
  }
  $('#pool-count').textContent = `${state.poolIds.length} 个未放置`;
  // 全部放上去后自动收起，给图片腾空间；有待选名字时展开
  setDockCollapsed(state.poolIds.length === 0);
}

function setDockCollapsed(collapsed) {
  const dock = $('#pool-dock');
  dock.classList.toggle('is-collapsed', collapsed);
  $('#btn-pool-toggle').textContent = collapsed ? '展开 ▴' : '收起 ▾';
}

function locate(id) {
  const i = state.slots.indexOf(id);
  return i >= 0 ? { type: 'slot', index: i } : { type: 'pool' };
}

function assign(id, toSlot) {
  const from = locate(id);
  if (from.type === 'slot' && from.index === toSlot) return;
  const occupant = state.slots[toSlot];

  state.slots[toSlot] = id;
  if (from.type === 'slot') {
    state.slots[from.index] = occupant || null;   // 槽位间交换
  } else {
    state.poolIds = state.poolIds.filter(x => x !== id);
    if (occupant) state.poolIds.push(occupant);   // 被挤回待选区
  }
  state.activeChip = null;
  renderSlots();
  renderPool();
  updatePlayProgress();
}

function returnToPool(slotIndex) {
  const id = state.slots[slotIndex];
  if (!id) return;
  state.slots[slotIndex] = null;
  state.poolIds.push(id);
  state.activeChip = null;
  renderSlots();
  renderPool();
  updatePlayProgress();
}

function setActive(id) {
  state.activeChip = id;
  renderSlots();
  renderPool();
}

function onSlotClick(slotEl) {
  const i = Number(slotEl.dataset.slot);
  if (state.activeChip) {
    if (state.slots[i] === state.activeChip) setActive(null);
    else assign(state.activeChip, i);
  } else if (state.slots[i]) {
    returnToPool(i);
  }
}

function updatePlayProgress() {
  const filled = state.slots.filter(Boolean).length;
  $('#play-progress').textContent = `已放置 ${filled}/${state.quizIds.length}`;
  $('#btn-submit').disabled = filled !== state.quizIds.length;
}

function quitQuiz() {
  if (!window.confirm('确定放弃本局并返回出题界面吗？')) return;
  stopTimer();
  history.replaceState(null, '', location.pathname + location.search);
  showScreen('setup');
  window.scrollTo(0, 0);
}

function resetPlay() {
  state.slots = state.quizIds.map(() => null);
  state.poolIds = shuffle(state.quizIds.slice());
  state.activeChip = null;
  renderSlots();
  renderPool();
  updatePlayProgress();
}

/* ========== 计时器 ========== */

function startTimer() {
  stopTimer();
  state.startAt = Date.now();
  state.elapsed = 0;
  $('#timer').textContent = fmtTime(0);
  state.timerId = setInterval(() => {
    state.elapsed = Date.now() - state.startAt;
    $('#timer').textContent = fmtTime(state.elapsed);
  }, 500);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

/* ========== ③ 提交 / 结果 ========== */

function submitQuiz() {
  if (state.slots.some(s => !s)) return;
  stopTimer();
  state.elapsed = Date.now() - state.startAt;

  const correctFlags = state.quizIds.map((id, i) => state.slots[i] === id);
  const correct = correctFlags.filter(Boolean).length;

  const grid = $('#result-grid');
  grid.className = 'play-grid is-locked' + (state.mode === 'portrait' ? ' is-portrait' : '');
  grid.innerHTML = '';

  state.quizIds.forEach((id, i) => {
    const op = state.byId.get(id);
    const ok = correctFlags[i];

    const card = document.createElement('div');
    card.className = 'qcard ' + (ok ? 'is-correct' : 'is-wrong');

    const imgWrap = document.createElement('div');
    imgWrap.className = 'qcard__img';
    imgWrap.append(makeImg(op, state.mode));

    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.append(chipEl(state.slots[i], { draggable: false }));

    const answer = document.createElement('div');
    answer.className = 'answer';
    if (ok) {
      answer.textContent = '✓ 正确';
    } else {
      const b = document.createElement('b');
      b.textContent = '正确：' + op.name;
      answer.append(b);
      if (op.en) {
        const es = document.createElement('span');
        es.className = 'answer-en';
        es.textContent = ' ' + op.en;
        answer.append(es);
      }
    }

    card.append(imgWrap, slot, answer);
    grid.append(card);
  });

  $('#result-x').textContent = String(correct);
  $('#result-n').textContent = String(state.quizIds.length);
  const rate = Math.round((correct / state.quizIds.length) * 1000) / 10;
  $('#result-rate').textContent = `正确率 ${rate}%`;
  $('#result-time').textContent = `用时 ${fmtTime(state.elapsed)}`;

  showScreen('result');
  window.scrollTo(0, 0);
}

/* ========== 拖拽（HTML5，鼠标） ========== */

function setOver(el) {
  if (overEl === el) return;
  if (overEl) overEl.classList.remove('is-over');
  overEl = el;
  if (el) el.classList.add('is-over');
}

document.addEventListener('dragstart', e => {
  const chip = e.target.closest('.chip');
  if (!chip || !chip.closest('#screen-play')) return;
  draggingId = chip.dataset.id;
  e.dataTransfer.setData('text/plain', draggingId);
  e.dataTransfer.effectAllowed = 'move';
  chip.classList.add('is-dragging');
});

document.addEventListener('dragover', e => {
  const slotEl = e.target.closest && e.target.closest('#screen-play [data-drop="slot"]');
  const poolEl = !slotEl && e.target.closest && e.target.closest('#pool');
  if (!slotEl && !poolEl) { setOver(null); return; }
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  setOver(slotEl || poolEl);
});

document.addEventListener('drop', e => {
  const id = (e.dataTransfer.getData('text/plain') || draggingId);
  const slotEl = e.target.closest && e.target.closest('#screen-play [data-drop="slot"]');
  const poolEl = !slotEl && e.target.closest && e.target.closest('#pool');
  if ((slotEl || poolEl) && id) {
    e.preventDefault();
    if (slotEl) {
      assign(id, Number(slotEl.dataset.slot));
    } else {
      const loc = locate(id);
      if (loc.type === 'slot') returnToPool(loc.index);
    }
  }
  setOver(null);
});

document.addEventListener('dragend', () => {
  draggingId = null;
  setOver(null);
  $$('.chip.is-dragging').forEach(c => c.classList.remove('is-dragging'));
});

/* ========== 点选兜底（触屏 / 鼠标） ========== */

document.addEventListener('click', e => {
  if (!e.target.closest) return;

  const chip = e.target.closest('#screen-play .chip');
  if (chip) {
    const id = chip.dataset.id;
    setActive(state.activeChip === id ? null : id);
    e.preventDefault();
    return;
  }

  const slotEl = e.target.closest('#screen-play .slot');
  if (slotEl) {
    onSlotClick(slotEl);
    e.preventDefault();
    return;
  }

  const poolBg = e.target.closest('#pool');
  if (poolBg && state.activeChip) setActive(null);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.activeChip) setActive(null);
});

/* ========== 事件绑定 ========== */

function bindEvents() {
  $$('#mode-seg button').forEach(b =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));

  $$('[data-rand]').forEach(b =>
    b.addEventListener('click', () => randomPick(Number(b.dataset.rand))));

  $('#search').addEventListener('input', applyFilter);

  $('#btn-clear').addEventListener('click', () => {
    state.selected.clear();
    for (const op of state.operators) syncCard(op.charId);
    persistSelection();
    updateSetupCount();
  });

  $('#btn-start').addEventListener('click', () => {
    const ids = [...state.selected];
    if (ids.length < 2) return;
    beginQuiz(ids, state.mode);
  });

  $('#btn-handoff-go').addEventListener('click', enterPlay);
  $('#btn-reset').addEventListener('click', resetPlay);
  $('#btn-submit').addEventListener('click', submitQuiz);
  $('#btn-quit').addEventListener('click', quitQuiz);
  $('#pool-bar').addEventListener('click', () =>
    setDockCollapsed(!$('#pool-dock').classList.contains('is-collapsed')));

  $('#btn-replay').addEventListener('click', () =>
    beginQuiz(state.lastConfig.ids, state.lastConfig.mode));

  $('#btn-new').addEventListener('click', () => {
    $('#handoff').hidden = true;
    history.replaceState(null, '', location.pathname + location.search);
    showScreen('setup');
    window.scrollTo(0, 0);
  });
}

/* ========== 友链 hash ========== */

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const mode = params.get('m');
  const ids = (params.get('ids') || '').split(',').filter(Boolean);
  const valid = ids.filter(id => state.byId.has(id));
  if ((mode === 'avatar' || mode === 'portrait') && valid.length >= 2) {
    state.mode = mode;
    $$('#mode-seg button').forEach(b =>
      b.classList.toggle('is-active', b.dataset.mode === mode));
    beginQuiz(valid, mode);
    return true;
  }
  return false;
}

/* ========== 启动 ========== */

async function init() {
  let operators;
  try {
    const resp = await fetch('js/data/operators.json');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    operators = await resp.json();
  } catch (err) {
    $('#setup-grid').innerHTML =
      '<p style="color:var(--red)">数据加载失败：' + err.message +
      '<br>请通过本地静态服务器打开（如 python -m http.server），不要直接双击 index.html。</p>';
    return;
  }

  state.operators = operators;
  for (const op of operators) state.byId.set(op.charId, op);

  // 恢复本地偏好
  const savedMode = localStorage.getItem(LS_MODE);
  if (savedMode === 'avatar' || savedMode === 'portrait') state.mode = savedMode;
  let savedSelected = [];
  try { savedSelected = JSON.parse(localStorage.getItem(LS_SELECTED) || '[]'); } catch { /* ignore */ }
  state.selected = new Set(savedSelected.filter(id => state.byId.has(id)));

  buildSetup();
  bindEvents();
  $$('#mode-seg button').forEach(b =>
    b.classList.toggle('is-active', b.dataset.mode === state.mode));
  for (const id of state.selected) syncCard(id);
  updateSetupCount();

  // 浮动面板高度变化时同步内容底部留白
  const dock = $('#pool-dock');
  new ResizeObserver(() => {
    $('#screen-play').style.setProperty('--dock-h',
      dock.getBoundingClientRect().height + 'px');
  }).observe(dock);

  // 友链打开则直接进入交接遮罩
  readHash();
}

init();
