const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const KEY = 'family-career-board-v1';
const PAGE_STEP = 30;
let state = { picked: [], decisions: {}, progress: {} };
let view = 'pending';
let renderLimit = PAGE_STEP;

function validate(x) {
  if (!x || typeof x !== 'object' || !Array.isArray(x.picked) || !x.decisions || typeof x.decisions !== 'object' || !x.progress || typeof x.progress !== 'object') {
    throw Error('格式不符');
  }
  const ids = new Set(DATA.jobs.map(j => String(j.id)));
  return {
    picked: [...new Set(x.picked.map(String).filter(id => ids.has(id)))],
    decisions: Object.fromEntries(Object.entries(x.decisions).filter(([id, v]) => ids.has(id) && v === 'skip')),
    progress: Object.fromEntries(Object.entries(x.progress).filter(([id, v]) => ids.has(id) && ['未投递', '本人已在猎聘投递', '面试中', '不合适'].includes(v)))
  };
}

try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = validate(JSON.parse(saved));
} catch (e) {
  $('#notice').textContent = '无法载入本机记录。请保留导出的备份；当前选择可能无法持久保存。';
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    $('#notice').textContent = '浏览器无法保存记录，请使用“导出选择记录”备份。';
  }
}

const isApplied = j => j.applicationStatus === '已投递';
const status = j => isApplied(j) ? '已投递（成功回执）' : (state.progress[j.id] || '未投递');
const isDirect = j => j.source === '实名企业直招';

function pending(j) {
  return j.action !== '暂缓' && !state.decisions[j.id] && !isApplied(j) && !['本人已在猎聘投递', '面试中', '不合适'].includes(status(j));
}

(function initSelects() {
  const cityCounts = {};
  for (const j of DATA.jobs) {
    const cg = j.cityGroup || j.city;
    cityCounts[cg] = (cityCounts[cg] || 0) + 1;
  }
  const orderedCities = Object.entries(cityCounts).sort((a, b) => {
    if (a[0] === '其他城市') return 1;
    if (b[0] === '其他城市') return -1;
    return b[1] - a[1];
  });
  for (const [cg, cnt] of orderedCities) {
    const o = document.createElement('option');
    o.value = cg;
    o.textContent = `${cg}（${cnt}）`;
    $('#city').append(o);
  }

  const dirs = DATA.directions.map(d => d.key || d.title);
  for (const d of dirs) {
    const o = document.createElement('option');
    o.value = d;
    o.textContent = d;
    $('#direction').append(o);
  }
})();

$('#strategy-banner').textContent = DATA.strategy || '';
$('#resume-status').textContent = DATA.resume?.summary || '待核实本人在线简历。';
$('#account-status').textContent = DATA.resume?.account || '待接入本人账号';
$('#attachment-status').textContent = DATA.resume?.attachment || '';
$('#method-note').textContent = DATA.method || '';

function matchesBaseFilters(j, ignoreDirection = false) {
  const q = $('#search').value.trim().toLowerCase();
  if (q && !`${j.title} ${j.company} ${j.city} ${j.cityGroup || ''} ${j.direction} ${j.what || ''} ${j.housingLabel || ''} ${j.benefits || ''}`.toLowerCase().includes(q)) {
    return false;
  }
  if ($('#city').value && (j.cityGroup || j.city) !== $('#city').value) return false;
  if (!ignoreDirection && $('#direction').value && j.direction !== $('#direction').value) return false;
  if ($('#fit').value && j.fit !== $('#fit').value) return false;
  if ($('#zero').checked && !j.zeroFriendly) return false;
  if ($('#strict').checked && !j.strict) return false;
  if ($('#housing').checked && !j.housing) return false;
  if ($('#direct').checked && !isDirect(j)) return false;

  switch (view) {
    case 'pending': return pending(j);
    case 'priority': return pending(j) && j.action === '优先了解';
    case 'pause': return j.action === '暂缓' && !state.decisions[j.id];
    case 'verify': return pending(j) && j.action === '先核条件';
    case 'picked': return state.picked.includes(String(j.id));
    case 'applied': return isApplied(j) || status(j) === '本人已在猎聘投递';
    case 'interview': return status(j) === '面试中';
    case 'skip': return !!state.decisions[j.id];
    default: return true;
  }
}

function sortJobs(list) {
  const mode = $('#sort').value;
  if (mode === 'default') return list;
  const fitRank = { '高': 0, '中': 1, '低': 2 };
  return [...list].sort((a, b) => {
    if (mode === 'salary' && (b.salaryHigh || 0) !== (a.salaryHigh || 0)) return (b.salaryHigh || 0) - (a.salaryHigh || 0);
    if (mode === 'zero' && Boolean(a.zeroFriendly) !== Boolean(b.zeroFriendly)) return a.zeroFriendly ? -1 : 1;
    if (mode === 'housing' && a.housing !== b.housing) return a.housing ? -1 : 1;
    return fitRank[a.fit] - fitRank[b.fit];
  });
}

function renderDirCards() {
  const activeDir = $('#direction').value;
  $('#clear-dir').hidden = !activeDir;
  const scopedWithoutDir = DATA.jobs.filter(j => matchesBaseFilters(j, true));

  $('#dir-cards').innerHTML = DATA.directions.map(d => {
    const key = d.key || d.title;
    const sub = scopedWithoutDir.filter(j => j.direction === key);
    const highCnt = sub.filter(j => j.fit === '高').length;
    const zeroCnt = sub.filter(j => j.zeroFriendly).length;
    const houseCnt = sub.filter(j => j.housing).length;
    const isAct = activeDir === key;
    return `<button type="button" class="dir-card ${isAct ? 'active' : ''}" data-dir="${esc(key)}">
      ${d.phase ? `<span class="phase-badge">${esc(d.phase)}</span>` : ''}
      <div class="dir-card-top">
        <span class="dir-card-title">${esc(d.title)}</span>
        <span class="dir-card-count">${sub.length} 岗</span>
      </div>
      <div class="dir-card-sub">${esc(d.salary)}</div>
      <div class="dir-card-pills">
        ${highCnt ? `<span class="mini-pill good">高匹配 ${highCnt}</span>` : ''}
        ${zeroCnt ? `<span class="mini-pill warm">经验不限/1年下 ${zeroCnt}</span>` : ''}
        ${houseCnt ? `<span class="mini-pill">住宿／补贴线索 ${houseCnt}</span>` : ''}
      </div>
    </button>`;
  }).join('');
}

function render() {
  const picked = DATA.jobs.filter(j => state.picked.includes(String(j.id)) && pending(j));
  state.picked = picked.map(j => String(j.id));

  const pendList = DATA.jobs.filter(pending);
  const counts = [
    ['待核候选岗位', pendList.length],
    ['深圳／东莞主阵地', pendList.filter(j => j.cityGroup === '深圳' || j.cityGroup === '东莞').length],
    ['核心条件已核实（高）', pendList.filter(j => j.fit === '高').length],
    ['经验不限／1年下', pendList.filter(j => j.zeroFriendly).length],
    ['已勾选待投', picked.length],
    ['成功投递回执', DATA.jobs.filter(isApplied).length]
  ];
  $('#stats').innerHTML = counts.map(([s, n]) => `<div class="stat"><b>${n}</b><span>${s}</span></div>`).join('');
  $('#receipt-count').textContent = DATA.jobs.filter(isApplied).length;
  $('#selection').hidden = !picked.length;
  $('#selected-count').textContent = `已勾选 ${picked.length} 个岗位`;

  renderDirCards();

  const allMatching = sortJobs(DATA.jobs.filter(j => matchesBaseFilters(j, false)));
  const shown = allMatching.slice(0, renderLimit);
  const activeDirText = $('#direction').value ? ` · 当前赛道：${$('#direction').value}` : '';
  const activeCityText = $('#city').value ? ` · 当前城市：${$('#city').value}` : '';
  $('#count').textContent = `筛选命中 ${allMatching.length} 条（已展开 ${shown.length} 条，精选总库 ${DATA.jobs.length} 条）${activeDirText}${activeCityText}`;

  $('#jobs').innerHTML = shown.length ? shown.map(j => `<article class="job" data-id="${j.id}">
    <div class="job-head">
      <input class="pick" type="checkbox" aria-label="勾选 ${esc(j.company)} ${esc(j.title)}" ${state.picked.includes(String(j.id)) ? 'checked' : ''} ${pending(j) ? '' : 'disabled'}>
      <div class="job-title">
        <div class="company">${esc(j.company)} · ${esc(j.city)} · 经验要求：${esc(j.experienceLabel || '经验不限')} · ${esc(j.educationLabel || '')}</div>
        <h3>${esc(j.title)}</h3>
      </div>
      <strong class="salary">${esc(j.salary)}</strong>
    </div>
    <div class="tags">
      <span class="tag ${j.fit === '高' ? 'high' : j.fit === '低' ? 'low' : 'mid'}">${esc(j.fit)}匹配 · ${esc(j.action)}</span>
      <span class="tag">${esc(j.direction)}</span>
      ${j.strict ? '<span class="tag high">正文明确接受无经验</span>' : ''}
      <span class="tag ${j.housing ? 'housing-tag' : ''}">${esc(j.housingLabel)}</span>
      <span class="tag">${esc(j.source)}</span>
      <span class="tag">${esc(status(j))}</span>
    </div>
    <p class="reason">${esc(j.fitReason)}</p>
    <div class="info">
      <p><b>工作内容</b> · ${esc(j.what)}</p>
      <p><b>成长路径</b> · ${esc(j.growth || '')}</p>
      <p><b>门槛依据</b> · ${esc(j.evidence)}</p>
      <p><b>薪资食宿</b> · ${esc(j.benefits)}</p>
    </div>
    <details>
      <summary>查看完整JD与投前确认项</summary>
      <p><b>投前建议确认：</b>${esc(j.questions)}</p>
      <p>${esc(j.source)} · 核对日期 ${esc(j.reviewedAt)} · 职位ID ${j.id}</p>
      <div class="jd">${esc(j.jd)}</div>
    </details>
    <div class="job-actions">
      <a href="${esc(j.url)}" target="_blank" rel="noopener noreferrer">打开猎聘原网页核实 ↗</a>
      <button type="button" data-action="skip">${state.decisions[j.id] ? '恢复待考虑' : '跳过此岗'}</button>
      <label>个人进度
        <select aria-label="${esc(j.company)} 个人进度" data-action="progress" ${isApplied(j) ? 'disabled' : ''}>
          ${['未投递', '本人已在猎聘投递', '面试中', '不合适'].map(v => `<option ${status(j) === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
    </div>
  </article>`).join('') : '<div class="empty">当前筛选条件下没有岗位。可点击“重置筛选”查看全部候选记录。</div>';

  const remaining = allMatching.length - shown.length;
  $('#pager').hidden = remaining <= 0;
  if (remaining > 0) {
    $('#load-more').textContent = `加载更多岗位（还有 ${remaining} 条）`;
  }
}

$('#dir-cards').addEventListener('click', e => {
  const card = e.target.closest('[data-dir]');
  if (!card) return;
  const dir = card.dataset.dir;
  $('#direction').value = ($('#direction').value === dir) ? '' : dir;
  renderLimit = PAGE_STEP;
  render();
});

$('#clear-dir').onclick = () => {
  $('#direction').value = '';
  renderLimit = PAGE_STEP;
  render();
};

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-view]');
  if (!b) return;
  view = b.dataset.view;
  renderLimit = PAGE_STEP;
  $('#tabs').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  render();
});

['search', 'city', 'direction', 'fit', 'sort', 'zero', 'strict', 'housing', 'direct'].forEach(id => {
  $('#' + id).addEventListener(id === 'search' ? 'input' : 'change', () => {
    renderLimit = PAGE_STEP;
    render();
  });
});

$('#load-more').onclick = () => {
  renderLimit += PAGE_STEP;
  render();
};

$('#load-all').onclick = () => {
  renderLimit = 9999;
  render();
};

$('#jobs').addEventListener('change', e => {
  const a = e.target.closest('.job');
  if (!a) return;
  const id = a.dataset.id;
  if (e.target.classList.contains('pick')) {
    state.picked = e.target.checked ? [...new Set([...state.picked, id])] : state.picked.filter(x => x !== id);
  }
  if (e.target.dataset.action === 'progress') {
    state.progress[id] = e.target.value;
  }
  render();
  save();
  $('#handoff').hidden = true;
});

$('#jobs').addEventListener('click', e => {
  const b = e.target.closest('[data-action="skip"]');
  if (!b) return;
  const id = b.closest('.job').dataset.id;
  if (state.decisions[id]) delete state.decisions[id];
  else state.decisions[id] = 'skip';
  state.picked = state.picked.filter(x => x !== id);
  render();
  save();
  $('#handoff').hidden = true;
});

$('#reset').onclick = () => {
  for (const id of ['search', 'city', 'direction', 'fit']) $('#' + id).value = '';
  $('#sort').value = 'default';
  for (const id of ['zero', 'strict', 'housing', 'direct']) $('#' + id).checked = false;
  renderLimit = PAGE_STEP;
  render();
};

$('#clear').onclick = () => {
  state.picked = [];
  save();
  render();
  $('#handoff').hidden = true;
};

async function handoff(t) {
  $('#handoff').hidden = false;
  $('#handoff-text').value = t;
  try {
    await navigator.clipboard.writeText(t);
    $('#notice').textContent = '清单已复制，可直接粘贴微信发给家人。当前尚未发起投递。';
  } catch (e) {
    $('#handoff-text').focus();
    $('#handoff-text').select();
    $('#notice').textContent = '请长按复制下方文本框内容发给家人。当前尚未发起投递。';
  }
}

$('#copy-list').onclick = () => {
  const pickedJobs = DATA.jobs.filter(j => state.picked.includes(String(j.id)) && pending(j));
  if (!pickedJobs.length) return;
  handoff(
    '这是我选定的意向岗位清单（共 ' + pickedJobs.length + ' 个）。请先使用哥哥本人独立猎聘连接回读核对身份（严禁使用家人账号），先核实下列投前待核条件，未核清不要申请。条件确认且在线简历属实可用后，仅申请以下清单内岗位；只有明确收到投递成功回执才记录为已投递：\n\n' +
    pickedJobs.map((j, idx) => `${idx + 1}. 【${j.direction}】${j.company} | ${j.title} | ${j.city} | ${j.salary}\n${j.url}\njobId=${j.id}, jobKind=${j.jobKind}\n投前待核：${j.questions}`).join('\n\n')
  );
};

$('#copy-resume').onclick = () => handoff(
  '请使用哥哥本人独立猎聘连接回读在线简历核对本人身份（不要使用家人账号），按最新PDF核对原四段工作、合伙经营、教育与证书。本人已确认VLOOKUP、SUMIFS及透视表可独立使用，熟悉电脑和AI工具；进销存、ERP、采购及海外单证不推定为已有经验。在线简历保持真实通用经历，期望城市薪资由本人确认再改；附件按岗位从私有定向版本中选择，由本人上传或发送。完成后回读确认。'
);

$('#resume-open').onclick = () => {
  $('#resume-panel').hidden = !$('#resume-panel').hidden;
};

$('#export').onclick = () => {
  const b = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
  const u = URL.createObjectURL(b);
  const a = document.createElement('a');
  a.href = u;
  a.download = '求职工作台-个人选择备份.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
};

$('#import').onchange = async e => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 100000) throw Error('文件过大');
    const x = validate(JSON.parse(await f.text()));
    state = {
      picked: [...new Set([...state.picked, ...x.picked])],
      decisions: { ...state.decisions, ...x.decisions },
      progress: { ...state.progress, ...x.progress }
    };
    save();
    render();
    $('#notice').textContent = '已导入并合并选择记录；正式投递回执未改变。';
  } catch (err) {
    $('#notice').textContent = '导入失败：请选择本工作台导出的JSON备份文件。';
  }
  e.target.value = '';
};

$('#cities').innerHTML = (DATA.cities || []).map(c => `<article class="city-card">
  <small>${esc(c.label)}</small>
  <h3>${esc(c.name)}</h3>
  <p>${esc(c.note)}</p>
</article>`).join('');

$('#directions').innerHTML = DATA.directions.map(d => `<article class="dir-detail-card">
  <small>${esc(d.phase || d.status)} · 当前 ${d.count || 0} 岗</small>
  <h3>${esc(d.title)}</h3>
  <p><b>薪资口径：</b>${esc(d.salary)}</p>
  <p><b>重点城市：</b>${esc(d.city)}</p>
  <p><b>核心工作：</b>${esc(d.what)}</p>
  <p><b>入门条件：</b>${esc(d.condition)}</p>
</article>`).join('');

render();
