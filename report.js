'use strict';

const baseline = window.BASELINE;
const byId = id => document.getElementById(id);
const platforms = ['ChatGPT', 'Perplexity', 'Gemini', 'Copilot'];
function node(tag, className, content) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (content !== undefined) result.textContent = String(content);
  return result;
}
function appendText(container, tag, className, text) {
  const item = node(tag, className, text);
  container.append(item);
  return item;
}
function safeLink(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw, location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function link(raw, label, className) {
  const href = safeLink(raw);
  if (!href) return null;
  const anchor = node('a', className, label);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer';
  return anchor;
}
function runsFor(question) {
  return platforms.map(platform => (question.runs || []).find(run => run.platform === platform)
    || { platform, status: 'untested', mention: null, citation: null });
}
function state(run) {
  if (run.processing && run.status === 'untested') return ['等待回答', 'pending'];
  if (run.status === 'blocked') return ['受阻', 'blocked'];
  if (run.status !== 'done') return ['未测', 'pending'];
  if (run.mention === true) return ['有提及', 'ok'];
  if (run.mention === false) return ['未提及', 'neutral'];
  return ['待标注', 'neutral'];
}
function renderRun(run) {
  const box = node('article', 'run');
  const head = node('header');
  appendText(head, 'b', '', run.platform);
  const [label, kind] = state(run);
  appendText(head, 'span', 'state ' + kind, label);
  box.append(head);
  if (run.excerpt) appendText(box, 'p', 'quote', run.excerpt);
  if (run.status === 'done') {
    const source = run.citation === true ? '已引用官网' : run.citation === false ? '未引用官网' : '官网引用待核验';
    appendText(box, 'p', '', source);
  }
  if (run.competitors?.length) appendText(box, 'p', '', '回答中提及的其他品牌：' + (Array.isArray(run.competitors) ? run.competitors.join('、') : run.competitors));
  if (run.sources?.length) appendText(box, 'p', '', '回答所列来源：' + (Array.isArray(run.sources) ? run.sources.join('、') : run.sources));
  if (run.note) appendText(box, 'p', '', run.note);
  const sources = node('div', 'run-links');
  const recordLink = link(run.url, '查看实测入口／记录');
  if (recordLink) sources.append(recordLink);
  (run.citationLinks || []).forEach((item, i) => {
    const href = typeof item === 'string' ? item : item.url || item.href;
    const ref = link(href, '引用 ' + (i + 1));
    if (ref) sources.append(ref);
  });
  if (sources.childNodes.length) box.append(sources);
  return box;
}
function questionRow(question) {
  const row = node('details', 'qrow');
  const summary = node('summary', 'q-summary');
  const name = node('span', 'question');
  appendText(name, 'span', 'qid', question.id);
  const title = appendText(name, 'span', '', question.question);
  title.lang = 'en';
  summary.append(name);
  const runs = runsFor(question);
  for (const run of runs) {
    const [label, kind] = state(run);
    const cell = node('span', 'state ' + kind);
    cell.setAttribute('aria-label', run.platform + '，' + label);
    appendText(cell, 'span', 'platform-mobile', run.platform);
    cell.append(document.createTextNode(label));
    summary.append(cell);
  }
  const chevron = node('i', 'chev');chevron.setAttribute('aria-hidden', 'true');summary.append(chevron);
  row.append(summary);
  const grid = node('div', 'run-grid');
  runs.forEach(run => grid.append(renderRun(run)));
  row.append(grid);
  return row;
}
function matches(question, filter) {
  const runs = runsFor(question);
  if (filter === 'done') return runs.some(run => run.status === 'done');
  if (filter === 'mention') return runs.some(run => run.status === 'done' && run.mention === true);
  if (filter === 'incomplete') return runs.some(run => run.status !== 'done');
  return true;
}
function metric(id, value, unit) {
  const element = byId(id);
  element.replaceChildren(document.createTextNode(value));
  appendText(element, 'small', '', unit);
}
function setup() {
  if (!baseline || !Array.isArray(baseline.geo)) {
    byId('matrix').append(node('p', 'empty', '本次未能读取测试记录，请刷新后重试。'));
    byId('coverage').textContent = '记录未载入';
    return;
  }
  const questions = baseline.geo;
  const allRuns = questions.flatMap(runsFor);
  const done = allRuns.filter(run => run.status === 'done');
  const blocked = allRuns.filter(run => run.status === 'blocked').length;
  const missing = allRuns.length - done.length - blocked;
  const completedQuestions = questions.filter(q => runsFor(q).some(r => r.status === 'done'));
  const mentioned = completedQuestions.filter(q => runsFor(q).some(r => r.status === 'done' && r.mention === true));
  const citationKnown = done.filter(run => typeof run.citation === 'boolean');
  const geoCount = byId('geo-count');
  geoCount.textContent = done.length;
  byId('geo-foot').textContent = completedQuestions.length + ' / ' + questions.length + ' 个问题取得回答';
  metric('mentions', completedQuestions.length ? mentioned.length : '—', ' / ' + completedQuestions.length + ' 个已答问题');
  metric('cites', citationKnown.length ? citationKnown.filter(r => r.citation).length : '—', ' / ' + citationKnown.length + ' 个可核验回答');
  const pending = allRuns.filter(r => r.status === 'untested' && r.processing).length;
  byId('coverage').textContent = done.length + ' 已答 · ' + blocked + ' 受阻 · ' + (missing - pending) + ' 未测' + (pending ? ' · ' + pending + ' 等待回答' : '');
  const complete = questions.filter(q => runsFor(q).every(r => r.status === 'done' && typeof r.mention === 'boolean'));
  const frozen = byId('frozen-status');
  if (complete.length === questions.length && complete.length) {
    const count = complete.filter(q => runsFor(q).some(r => r.mention === true)).length;
    frozen.textContent = '四端基线已冻结。' + questions.length + ' 道题均完成四端测试，其中 ' + count + ' 道至少有一个平台提到 Kopi。';
  } else {
    frozen.textContent = '四端完整覆盖 ' + complete.length + ' / ' + questions.length + ' 题。当前提及数是已答样本的观察值，完整周基线仍待补测。';
  }
  const platformCounts = byId('platform-counts');
  for (const platform of platforms) {
    const own = allRuns.filter(r => r.platform === platform);
    const completeCount = own.filter(r => r.status === 'done').length;
    const item = appendText(platformCounts, 'span', '', platform + ' ');
    appendText(item, 'b', '', completeCount + ' / ' + own.length);
  }
  const toolCounts = new Map();
  for (const run of done) {
    const brands = Array.isArray(run.competitors) ? run.competitors : [];
    const normalized = new Set(brands.map(brand => String(brand).trim().toLowerCase()).filter(Boolean));
    for (const key of normalized) {
      const item = toolCounts.get(key) || {name: brands.find(b => String(b).trim().toLowerCase() === key), count: 0};
      toolCounts.set(key, {...item, count: item.count + 1});
    }
  }
  const featured = [...toolCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);
  if (featured.length) {
    const tools = byId('other-tools');
    tools.hidden = false;
    appendText(tools, 'h3', '', '回答中常见的其他工具');
    const list = appendText(tools, 'div', 'tool-list', '');
    for (const brand of featured) {
      const item = appendText(list, 'span', '', brand.name + ' ');
      appendText(item, 'b', '', brand.count + ' 条');
    }
    appendText(tools, 'p', 'fine', '按已答样本中实际记录的工具名称计数，同一回答内去重。');
  }
  const view = byId('view');
  function drawMatrix() {
    const entries = questions.filter(q => matches(q, view.value));
    const matrix = byId('matrix');
    matrix.replaceChildren(...entries.map(questionRow));
    if (!entries.length) matrix.append(node('p', 'empty', '当前筛选下没有记录。'));
  }
  drawMatrix();
  view.addEventListener('change', drawMatrix);
  const actions = byId('actions');
  for (const item of baseline.actions || []) {
    const row = node('article', 'action');
    const name = node('div', 'action-name', item.name);
    if (item.status) appendText(name, 'small', '', item.status);
    row.append(name);
    appendText(row, 'p', '', item.detail);
    actions.append(row);
  }
  if (!actions.childNodes.length) appendText(actions, 'p', 'empty', '尚无已记录的操作。');
  const files = byId('files');
  for (const item of baseline.files || []) {
    const anchor = link(item.href, item.label, 'file-link');
    if (anchor) files.append(anchor);
  }
}
setup();
