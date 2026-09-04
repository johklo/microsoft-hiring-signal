/* Hallmark · Grid theme — all colour comes from CSS tokens; this file draws
 * geometry and text only. */

const nf = new Intl.NumberFormat('en-US');
const $ = (id) => document.getElementById(id);

/** Neutral, locale-independent stamp — the page is English and the tone technical. */
const pad2 = (n) => String(n).padStart(2, '0');
const stamp = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

const clear = (node) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- figures --

/** Ranked rows: name, hairline bar on a shared scale, the number itself. */
function renderRank(node, items, opts = {}) {
  clear(node);
  if (!items || !items.length) {
    node.appendChild(el('p', 'empty', 'No data in this batch.'));
    return;
  }
  const max = Math.max(...items.map((i) => i.count)) || 1;
  const limit = opts.limit ?? items.length;

  for (const item of items.slice(0, limit)) {
    const row = el('div', 'rank__row');

    const name = el('div', 'rank__name');
    name.appendChild(document.createTextNode(item.label ?? item.key));
    if (opts.sub && item.sub) name.appendChild(el('span', 'rank__sub', item.sub));
    row.appendChild(name);

    const track = el('div', 'rank__track');
    const fill = el('span', 'rank__fill');
    fill.style.width = `${Math.max(1.5, (item.count / max) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(track);

    row.appendChild(el('div', 'rank__val', nf.format(item.count)));
    node.appendChild(row);
  }

  // A bar without a scale is decoration. Say what full width means — but only
  // where there are enough rows for the bars to be doing comparison work.
  const shown = Math.min(limit, items.length);
  if (shown >= 5) {
    node.appendChild(
      el('p', 'rank__scale', `Full width = ${nf.format(max)}${opts.unit ? ' ' + opts.unit : ''}`)
    );
  }
}

/**
 * Dot plot on a 0–2 index scale with the 1.00 parity rule drawn through it.
 * A stem runs from parity to the value, so over- and under-representation read
 * as direction rather than as bar length.
 */
function renderMomentum(node, items, emptyMsg) {
  clear(node);
  if (!items || !items.length) {
    node.appendChild(el('p', 'empty', emptyMsg));
    return;
  }

  const wrap = el('div', 'dots');
  const pos = (v) => (Math.max(0, Math.min(2, v)) / 2) * 100;

  const scale = el('div', 'dots__scale');
  scale.appendChild(el('div', 'label', 'Index'));
  const ticks = el('div', 'dots__ticks');
  for (const t of [0, 0.5, 1, 1.5, 2]) {
    const s = el('span', null, t.toFixed(t === 1 ? 2 : 1));
    s.style.left = `${pos(t)}%`;
    if (t === 1) s.dataset.base = 'true';
    ticks.appendChild(s);
  }
  scale.appendChild(ticks);
  scale.appendChild(el('div', 'label', ''));
  wrap.appendChild(scale);

  for (const it of items) {
    const row = el('div', 'dots__row');
    row.appendChild(el('div', 'dots__label', it.label));

    const track = el('div', 'dots__track');
    const base = el('i', 'dots__base');
    base.style.left = `${pos(1)}%`;
    track.appendChild(base);

    const dir = it.index >= 1 ? 'up' : 'down';
    const from = Math.min(pos(1), pos(it.index));
    const stem = el('i', 'dots__stem');
    stem.style.left = `${from}%`;
    stem.style.width = `${Math.abs(pos(it.index) - pos(1))}%`;
    stem.dataset.dir = dir;
    track.appendChild(stem);

    const dot = el('b', 'dots__dot');
    dot.style.left = `${pos(it.index)}%`;
    dot.dataset.dir = dir;
    // An index past the end of the scale must not sit where 2.00 sits.
    if (it.index > 2) dot.dataset.off = 'true';
    track.appendChild(dot);

    track.setAttribute('role', 'img');
    track.setAttribute(
      'aria-label',
      `${it.label}: index ${it.index.toFixed(2)}, ${dir === 'up' ? 'above' : 'below'} parity`
    );
    row.appendChild(track);

    row.appendChild(el('div', 'idx', it.index.toFixed(2)));
    wrap.appendChild(row);
  }

  node.appendChild(wrap);
}

const SVG = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/** Round a maximum up to a readable gridline value. */
function niceMax(v) {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (v <= step * mag) return step * mag;
  }
  return 10 * mag;
}

/** Centred moving average. Undefined where the window does not fit. */
function movingAverage(values, window) {
  const half = Math.floor(window / 2);
  return values.map((_, i) => {
    if (i < half || i >= values.length - half) return null;
    let sum = 0;
    for (let k = i - half; k <= i + half; k++) sum += values[k];
    return sum / window;
  });
}

/**
 * Daily posting volume: a dated x-axis with month ticks, a labelled y-axis, the
 * raw daily series, and a 7-day mean in the signal ink so the trend is legible
 * through the day-of-week noise.
 */
function renderTrend(node, series) {
  clear(node);
  if (!series || series.length < 2) {
    node.appendChild(el('p', 'empty', 'Not enough dated postings to plot a trend.'));
    return null;
  }

  const W = 900;
  const H = 240;
  const pad = { t: 14, r: 12, b: 30, l: 40 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const counts = series.map((d) => d.count);
  const peak = Math.max(...counts);
  const top = niceMax(peak);
  const x = (i) => pad.l + (i / (series.length - 1)) * innerW;
  const y = (v) => pad.t + innerH - (v / top) * innerH;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label':
      `Postings created per day from ${series[0].date} to ${series[series.length - 1].date}. ` +
      `Peak ${peak} in one day; the seven-day mean is drawn over the daily series.`,
  });

  // horizontal gridlines + y labels
  for (const v of [0, top / 2, top]) {
    svg.appendChild(
      svgEl('line', {
        x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v),
        class: v === 0 ? 'axis' : 'grid',
      })
    );
    const t = svgEl('text', { x: pad.l - 7, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' });
    t.textContent = String(Math.round(v));
    svg.appendChild(t);
  }

  // month ticks along the base
  let lastMonth = '';
  series.forEach((d, i) => {
    const month = d.date.slice(0, 7);
    if (month === lastMonth) return;
    lastMonth = month;
    if (i === 0 && series.length > 20) return;
    svg.appendChild(svgEl('line', { x1: x(i), x2: x(i), y1: y(0), y2: y(0) + 4, class: 'axis' }));
    const t = svgEl('text', { x: x(i), y: y(0) + 17, class: 'tick', 'text-anchor': 'middle' });
    t.textContent = new Date(`${d.date}T00:00:00Z`).toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    });
    svg.appendChild(t);
  });

  const line = series.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(' ');
  svg.appendChild(
    svgEl('path', {
      d: `${line} L${x(series.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`,
      class: 'series--fill',
    })
  );
  svg.appendChild(svgEl('path', { d: line, class: 'series' }));

  const mean = movingAverage(counts, 7);
  const meanPath = mean
    .map((v, i) => (v === null ? null : `${i && mean[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  if (meanPath) svg.appendChild(svgEl('path', { d: meanPath, class: 'series--mean' }));

  // mark the peak so the y-axis has an anchor the reader can name
  const peakIndex = counts.indexOf(peak);
  svg.appendChild(svgEl('circle', { cx: x(peakIndex), cy: y(peak), r: 3, class: 'marker' }));
  // Flip the label to the left once the peak sits in the right third, so it is
  // never cut off by the plot edge.
  const flip = x(peakIndex) > pad.l + innerW * 0.66;
  const peakLabel = svgEl('text', {
    x: x(peakIndex) + (flip ? -8 : 8),
    y: y(peak) - 6,
    class: 'tick tick--accent',
    'text-anchor': flip ? 'end' : 'start',
  });
  peakLabel.textContent = `peak ${peak} · ${series[peakIndex].date.slice(5)}`;
  svg.appendChild(peakLabel);

  node.appendChild(svg);

  const legend = el('div', 'legend');
  const item = (kind, text) => {
    const s = el('span');
    const i = el('i');
    if (kind) i.dataset.kind = kind;
    s.appendChild(i);
    s.appendChild(document.createTextNode(text));
    return s;
  };
  legend.appendChild(item(null, 'Postings per day'));
  legend.appendChild(item('mean', '7-day mean'));
  node.appendChild(legend);

  return { max: peak, from: series[0].date, to: series[series.length - 1].date };
}

/**
 * Small multiples. Rows share one vertical scale so they are comparable, the
 * month axis is printed once, and the tallest bar is named — without that the
 * bars are shapes rather than quantities.
 */
function renderSpark(node, series, months) {
  clear(node);
  if (!series || !series.length || months.length < 2) {
    node.appendChild(el('p', 'empty', 'Not enough dated postings to plot a monthly composition.'));
    return;
  }
  const max = Math.max(...series.flatMap((s) => s.counts)) || 1;
  const mid = months[Math.floor((months.length - 1) / 2)];

  const axis = el('div', 'spark__axis');
  axis.appendChild(el('span', null, months[0]));
  axis.appendChild(el('span', null, mid));
  axis.appendChild(el('span', null, months[months.length - 1]));
  node.appendChild(axis);

  for (const s of series) {
    const row = el('div', 'spark__row');
    row.appendChild(el('div', 'rank__name', s.label));

    const bars = el('div', 'spark__bars');
    bars.setAttribute('role', 'img');
    bars.setAttribute(
      'aria-label',
      `${s.label}: ${months.map((m, i) => `${m} ${s.counts[i]}`).join(', ')}`
    );
    s.counts.forEach((c) => {
      const b = el('i');
      b.style.height = `${Math.max(1, (c / max) * 100)}%`;
      bars.appendChild(b);
    });
    row.appendChild(bars);
    row.appendChild(el('div', 'rank__val', nf.format(s.total)));
    node.appendChild(row);
  }

  node.appendChild(
    el(
      'p',
      'rank__scale',
      `${months.length} months · one shared scale, tallest bar = ${nf.format(max)} postings · ` +
        `last bar is the current, partial month`
    )
  );
}

/** Diverging bars around a zero rule, with the range of the axis printed. */
function renderShift(node, rows) {
  clear(node);
  if (!rows || !rows.length) {
    node.appendChild(el('p', 'empty', 'Not enough months of postings to compare two windows yet.'));
    return;
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.delta))) || 1;
  const bound = Math.ceil(max);

  const scale = el('div', 'shift__scale');
  scale.appendChild(el('div', 'label', 'Row'));
  const ticks = el('div', 'dots__ticks');
  for (const [left, text] of [
    [0, `−${bound}pp`],
    [50, '0'],
    [100, `+${bound}pp`],
  ]) {
    const s = el('span', null, text);
    s.style.left = `${left}%`;
    if (left === 50) s.dataset.base = 'true';
    ticks.appendChild(s);
  }
  scale.appendChild(ticks);
  scale.appendChild(el('div', 'label', ''));
  node.appendChild(scale);

  for (const r of rows) {
    const row = el('div', 'shift__row');
    const name = el('div', 'rank__name');
    name.appendChild(document.createTextNode(r.label));
    name.appendChild(el('span', 'rank__sub', `${r.priorShare}% → ${r.recentShare}% of postings`));
    row.appendChild(name);

    const track = el('div', 'shift__track');
    const bar = el('i');
    const w = (Math.abs(r.delta) / bound) * 50;
    bar.style.width = `${w}%`;
    if (r.delta >= 0) bar.style.left = '50%';
    else bar.style.left = `${50 - w}%`;
    bar.dataset.dir = r.delta >= 0 ? 'up' : 'down';
    track.appendChild(bar);
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', `${r.label}: ${r.delta >= 0 ? '+' : ''}${r.delta} percentage points`);
    row.appendChild(track);

    row.appendChild(el('div', 'shift__val', `${r.delta >= 0 ? '+' : ''}${r.delta}`));
    node.appendChild(row);
  }
}

function renderCrosstab(table, ct, opts = {}) {  clear(table);
  if (!ct || !ct.rows.length) return;

  // Drop all-zero columns so the table stays readable.
  const keep = ct.cols
    .map((c, i) => ({ c, i, total: ct.matrix.reduce((a, r) => a + r[i], 0) }))
    .filter((x) => x.total > 0);

  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', null, ''));
  for (const k of keep) {
    const th = el('th', null, k.c);
    th.scope = 'col';
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = el('tbody');
  ct.rows.forEach((rowName, ri) => {
    const tr = el('tr');
    const th = el('th', null, rowName);
    th.scope = 'row';
    tr.appendChild(th);
    const rowMax = Math.max(...keep.map((k) => ct.matrix[ri][k.i])) || 1;
    for (const k of keep) {
      const v = ct.matrix[ri][k.i];
      const td = el('td', null, v ? `${nf.format(v)}${opts.suffix ?? ''}` : '·');
      if (v) {
        // Intensity is derived from the single signal ink, never a new colour.
        const pctv = Math.round((v / rowMax) * 22);
        td.style.background = `color-mix(in oklab, var(--color-accent) ${pctv}%, transparent)`;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
}

/**
 * A small comparison table: one row per group, one column per measure. Unlike
 * the crosstab the cells are already-computed percentages, so shading is scaled
 * per column — the question is always "which group leans hardest on this".
 */
function renderProfile(table, spec) {
  clear(table);
  if (!spec || !spec.rows?.length) return;

  const thead = el('thead');
  const hr = el('tr');
  hr.appendChild(el('th', null, ''));
  for (const c of spec.cols) {
    const th = el('th', null, c.label);
    th.scope = 'col';
    hr.appendChild(th);
  }
  thead.appendChild(hr);
  table.appendChild(thead);

  const colMax = new Map(
    spec.cols.map((c) => [c.key, Math.max(...spec.rows.map((r) => Number(r[c.key]) || 0)) || 1])
  );

  const tbody = el('tbody');
  for (const r of spec.rows) {
    const tr = el('tr');
    const th = el('th', null, r.label);
    th.scope = 'row';
    tr.appendChild(th);
    for (const c of spec.cols) {
      const v = Number(r[c.key]) || 0;
      const td = el('td', null, c.format === 'pct' ? `${v}%` : nf.format(v));
      if (v) {
        const intensity = Math.round((v / colMax.get(c.key)) * 22);
        td.style.background = `color-mix(in oklab, var(--color-accent) ${intensity}%, transparent)`;
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

// ------------------------------------------------------------------ hero ---

/**
 * Newsprint is a print metaphor, so the headline figure is set, not counted up.
 * An animating number is a dashboard tell and it delays the one fact the reader
 * came for.
 */
function setFigure(node, target) {
  node.textContent = nf.format(target);
}

// ----------------------------------------------------------------- index ---

const PAGE = 40;

function daysAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor((Date.now() - ts * 1000) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return '1 day ago';
  if (d < 60) return `${d} days ago`;
  return `${Math.round(d / 30)} months ago`;
}

function fillSelect(sel, values, allLabel) {
  clear(sel);
  sel.appendChild(new Option(allLabel, ''));
  for (const v of values) sel.appendChild(new Option(v.label, v.value));
}

function setupIndex(jobs, themeLabels, orgLabels, industryLabels) {
  const body = $('index-body');
  const countEl = $('index-count');
  const moreBtn = $('more');
  let shown = PAGE;

  const uniq = (arr) => [...new Set(arr)].filter(Boolean).sort((a, b) => a.localeCompare(b));

  fillSelect(
    $('f-theme'),
    [...new Set(jobs.flatMap((j) => j.themes))]
      .map((k) => ({ value: k, label: themeLabels.get(k) || k }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    'All clusters'
  );
  fillSelect(
    $('f-org'),
    [...new Set(jobs.map((j) => j.org).filter(Boolean))]
      .map((k) => ({ value: k, label: orgLabels.get(k) || k }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .concat([{ value: '__none', label: 'Not stated' }]),
    'All business units'
  );
  fillSelect(
    $('f-industry'),
    [...new Set(jobs.flatMap((j) => j.industries || []))]
      .map((k) => ({ value: k, label: industryLabels.get(k) || k }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    'All verticals'
  );
  fillSelect(
    $('f-profession'),
    uniq(jobs.map((j) => j.profession)).map((v) => ({ value: v, label: v })),
    'All professions'
  );
  fillSelect(
    $('f-country'),
    uniq(jobs.flatMap((j) => j.countries)).map((v) => ({ value: v, label: v })),
    'All countries'
  );
  fillSelect(
    $('f-seniority'),
    uniq(jobs.map((j) => j.seniority)).map((v) => ({ value: v, label: v })),
    'All seniorities'
  );

  function current() {
    const q = $('f-q').value.trim().toLowerCase();
    const theme = $('f-theme').value;
    const org = $('f-org').value;
    const industry = $('f-industry').value;
    const prof = $('f-profession').value;
    const country = $('f-country').value;
    const sen = $('f-seniority').value;
    const sort = $('f-sort').value;

    let out = jobs.filter((j) => {
      if (theme && !j.themes.includes(theme)) return false;
      if (org === '__none' && j.org) return false;
      if (org && org !== '__none' && j.org !== org) return false;
      if (industry && !(j.industries || []).includes(industry)) return false;
      if (prof && j.profession !== prof) return false;
      if (country && !j.countries.includes(country)) return false;
      if (sen && j.seniority !== sen) return false;
      if (q) {
        const hay = `${j.title} ${j.profession} ${j.discipline} ${j.location} ${j.overview} ${j.products.join(' ')} ${
          orgLabels.get(j.org) || ''
        }`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'old') out.sort((a, b) => (a.creationTs || 0) - (b.creationTs || 0));
    else out.sort((a, b) => (b.creationTs || 0) - (a.creationTs || 0));
    return out;
  }

  function render() {
    const rows = current();
    clear(body);
    countEl.textContent = `${nf.format(rows.length)} of ${nf.format(jobs.length)} roles`;

    for (const j of rows.slice(0, shown)) {
      const tr = el('tr');

      const tdTitle = el('td');
      const a = el('a', 'index__title', j.title);
      a.href = j.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      tdTitle.appendChild(a);
      tdTitle.appendChild(
        el('span', 'index__meta', [j.discipline, j.seniority, j.roleType, j.employmentType].filter(Boolean).join(' · '))
      );
      tr.appendChild(tdTitle);

      const tdOrg = el('td');
      tdOrg.appendChild(
        el('span', 'index__meta', j.org ? orgLabels.get(j.org) || j.org : 'Not stated')
      );
      tr.appendChild(tdOrg);

      const tdTheme = el('td');
      const tags = el('div', 'tags');
      for (const t of j.themes.slice(0, 3)) tags.appendChild(el('span', 'tag', themeLabels.get(t) || t));
      if (!j.themes.length) tags.appendChild(el('span', 'rank__sub', '—'));
      tdTheme.appendChild(tags);
      tr.appendChild(tdTheme);

      const tdLoc = el('td');
      tdLoc.appendChild(el('span', 'index__meta', j.location || '—'));
      tr.appendChild(tdLoc);

      tr.appendChild(el('td', null, daysAgo(j.creationTs)));
      body.appendChild(tr);
    }

    moreBtn.disabled = shown >= rows.length;
    moreBtn.textContent = shown >= rows.length ? 'All roles shown' : 'Show more roles';
  }

  for (const id of ['f-q', 'f-theme', 'f-org', 'f-industry', 'f-profession', 'f-country', 'f-seniority', 'f-sort']) {
    $(id).addEventListener('input', () => {
      shown = PAGE;
      render();
    });
  }
  moreBtn.addEventListener('click', () => {
    shown += PAGE;
    render();
  });

  render();
}

// --------------------------------------------------------------- changes ---

function renderChanges(node, runs) {
  clear(node);
  if (!runs || !runs.length) {
    node.appendChild(el('p', 'empty', 'No batches recorded yet.'));
    return;
  }
  for (const r of runs) {
    const row = el('div', 'log__row');

    const left = el('div');
    left.appendChild(el('p', 'label', r.date));
    const delta = el('div', 'delta');
    delta.appendChild(el('span', 'up', `+${r.addedCount}`));
    delta.appendChild(el('span', 'down', `−${r.removedCount}`));
    delta.appendChild(el('span', null, `~${r.updatedCount}`));
    left.appendChild(delta);
    row.appendChild(left);

    const right = el('div');
    if (r.added.length) {
      right.appendChild(el('p', 'label', 'Opened'));
      const ul = el('ul', 'log__items');
      for (const a of r.added.slice(0, 8)) {
        ul.appendChild(el('li', null, `${a.title}${a.profession ? ' — ' + a.profession : ''}`));
      }
      if (r.addedCount > 8) ul.appendChild(el('li', null, `…and ${r.addedCount - 8} more`));
      right.appendChild(ul);
    }
    if (r.removed.length) {
      right.appendChild(el('p', 'label', 'Closed'));
      const ul = el('ul', 'log__items');
      for (const a of r.removed.slice(0, 6)) ul.appendChild(el('li', null, a.title));
      if (r.removedCount > 6) ul.appendChild(el('li', null, `…and ${r.removedCount - 6} more`));
      right.appendChild(ul);
    }
    if (!r.added.length && !r.removed.length) {
      right.appendChild(el('p', 'empty', 'First batch — this is the baseline snapshot.'));
    }
    row.appendChild(right);
    node.appendChild(row);
  }
}

// -------------------------------------------------------------- frontier ---

/** "1.8× the rest of the book", or "only here" when nothing else mentions it. */
const liftNote = (index) => {
  if (index === null || index === undefined) return 'only in this cohort';
  const n = index >= 10 ? Math.round(index) : index.toFixed(2);
  return `${n}\u00d7 the rest of the book`;
};

function renderFrontier(fr) {
  const section = document.getElementById('s03');
  if (!section) return;

  if (!fr || fr.empty) {
    $('fr-standfirst').textContent =
      fr?.note ?? 'No advert in this batch identifies itself as part of the Frontier organisation.';
    for (const id of [
      'fr-units', 'fr-industries', 'fr-archetypes', 'fr-capabilities', 'fr-clusters',
      'fr-initiatives', 'fr-solutionareas', 'fr-seniority', 'fr-travel', 'fr-countries',
      'fr-language', 'fr-surface',
    ]) {
      const node = $(id);
      if (node) {
        clear(node);
        node.appendChild(el('p', 'empty', 'No data in this batch.'));
      }
    }
    return;
  }

  const cells = $('fr-kpis');
  clear(cells);
  for (const k of fr.kpis) {
    const cell = el('div', 'kpi');
    cell.appendChild(el('p', 'kpi__value', k.value));
    cell.appendChild(el('p', 'kpi__label', k.label));
    cell.appendChild(el('p', 'kpi__sub', k.sub));
    cells.appendChild(cell);
  }

  $('fr-standfirst').textContent = fr.reading[0] ?? '';

  renderRank(
    $('fr-units'),
    fr.units.map((u) => ({ label: u.label, count: u.count, sub: `${u.share}% of the cohort · ${u.blurb}` })),
    { sub: true }
  );

  renderRank(
    $('fr-industries'),
    fr.industries.map((v) => ({
      label: v.label,
      count: v.count,
      sub: `${v.share}% of the cohort · ${liftNote(v.index)}`,
    })),
    { sub: true }
  );
  $('fr-industry-note').textContent = fr.industries.length
    ? `Verticals are read from the advert's own text. A role can name more than one, so these do not sum to ${fr.cohortSize}.`
    : 'No vertical is named often enough in this cohort to report.';

  renderRank(
    $('fr-archetypes'),
    fr.archetypes.map((a) => ({
      label: a.label,
      count: a.count,
      sub: `${a.share}% of the cohort · ${liftNote(a.index)}`,
    })),
    { sub: true }
  );

  renderRank(
    $('fr-capabilities'),
    fr.capabilities.map((c) => ({ label: c.label, count: c.count, sub: liftNote(c.index) })),
    { sub: true, limit: 12 }
  );

  renderProfile($('fr-contrast'), fr.contrast);

  renderMomentum(
    $('fr-rising-archetype'),
    fr.momentum.byArchetype.slice(0, 6),
    'Too few dated postings in this cohort to compute a recency index.'
  );
  renderMomentum(
    $('fr-rising-industry'),
    fr.momentum.byIndustry.slice(0, 6),
    'Too few dated postings naming a vertical to compute a recency index.'
  );
  $('fr-momentum-note').textContent =
    `Index above 1.00 means over-represented in the cohort's last ${fr.momentum.windowDays} days ` +
    `(${nf.format(fr.momentum.recent30)} of ${nf.format(fr.cohortSize)} postings) against its own baseline. ` +
    `A row needs at least three postings to appear, so a thin month simply shows nothing.`;

  renderRank(
    $('fr-seniority'),
    fr.seniority.map((s) => ({ label: s.label, count: s.count, sub: `${s.share}% · ${liftNote(s.index)}` })),
    { sub: true }
  );
  renderRank(
    $('fr-travel'),
    fr.travel.map((t) => ({ label: t.label, count: t.count, sub: `${t.share}% · ${liftNote(t.index)}` })),
    { sub: true, limit: 6 }
  );

  const months = fr.timeline.months;
  renderRank(
    $('fr-clusters'),
    fr.clusterMix.map((c) => ({ label: c.label, count: c.count, sub: `${c.share}% · ${liftNote(c.index)}` })),
    { sub: true, limit: 8 }
  );
  renderRank(
    $('fr-initiatives'),
    fr.initiatives.map((i) => ({ label: i.label, count: i.count, sub: `${i.share}% · ${liftNote(i.index)}` })),
    { sub: true }
  );
  renderRank(
    $('fr-solutionareas'),
    fr.solutionAreas.map((s) => ({ label: s.label, count: s.count, sub: `${s.share}% · ${liftNote(s.index)}` })),
    { sub: true }
  );

  renderSpark($('fr-tl-unit'), fr.timeline.byUnit, months);  
  renderSpark($('fr-tl-industry'), fr.timeline.byIndustry, months);
  renderShift(
    $('fr-shift'),
    [...(fr.timeline.shift.archetype || []), ...(fr.timeline.shift.industry || [])]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 10)
  );

  renderRank(
    $('fr-countries'),
    fr.countries.map((c) => ({ label: c.label, count: c.count, sub: liftNote(c.index) })),
    { sub: true, limit: 12 }
  );

  renderRank(
    $('fr-language'),
    fr.language.map((t) => ({
      label: t.term,
      count: t.count,
      sub: `${t.lift}\u00d7 lift · ${t.share}% of Frontier adverts vs ${t.restShare}% elsewhere`,
    })),
    { sub: true }
  );

  renderRank(
    $('fr-surface'),
    (fr.surface?.byProfession || []).map((p) => ({ label: p.label, count: p.count })),
    { limit: 8 }
  );
  $('fr-surface-note').textContent = fr.surface?.count
    ? `${nf.format(fr.surface.count)} adverts (${fr.surface.share}% of the book) name Frontier, ISD or FDE without ` +
      `claiming membership — roles told to work with the delivery arm rather than inside it. Shown by profession.`
    : 'No advert outside the cohort names Frontier, ISD or FDE.';

  const body = $('fr-pipeline');
  clear(body);
  for (const r of fr.pipeline) {
    const tr = el('tr');

    const tdTitle = el('td');
    const a = el('a', 'index__title', r.title);
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    tdTitle.appendChild(a);
    tdTitle.appendChild(el('span', 'index__meta', [r.archetype, r.seniority].filter(Boolean).join(' · ')));
    tr.appendChild(tdTitle);

    const tdUnit = el('td');
    tdUnit.appendChild(el('span', 'index__meta', r.unit || '—'));
    tr.appendChild(tdUnit);

    const tdInd = el('td');
    const tags = el('div', 'tags');
    for (const v of r.industries.slice(0, 2)) tags.appendChild(el('span', 'tag', v));
    if (!r.industries.length) tags.appendChild(el('span', 'rank__sub', '—'));
    tdInd.appendChild(tags);
    tr.appendChild(tdInd);

    const tdLoc = el('td');
    tdLoc.appendChild(el('span', 'index__meta', r.location || '—'));
    tr.appendChild(tdLoc);

    tr.appendChild(el('td', null, daysAgo(r.creationTs)));
    body.appendChild(tr);
  }

  const reading = $('fr-reading');
  clear(reading);
  for (const line of fr.reading.slice(1)) reading.appendChild(el('li', null, line));
}

/**
 * A single measure over months: an axis with the range named, a line, a dot on
 * every observation and the last value labelled. Small enough to sit two to a
 * row and still be read as a quantity rather than a shape.
 */
function renderMonthlyLine(node, months, values, opts = {}) {
  clear(node);
  const points = months
    .map((m, i) => ({ month: m, value: values[i] }))
    .filter((p) => p.value !== null && p.value !== undefined);

  if (points.length < 2) {
    node.appendChild(el('p', 'empty', 'Not enough months carry sizeable postings to plot this yet.'));
    return;
  }

  const W = 440;
  const H = 170;
  const pad = { t: 14, r: 46, b: 26, l: 34 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const top = opts.max ?? niceMax(Math.max(...points.map((p) => p.value)));
  const x = (i) => pad.l + (i / (points.length - 1)) * innerW;
  const y = (v) => pad.t + innerH - (v / top) * innerH;
  const fmt = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)}${opts.unit ?? ''}`;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'chart',
    role: 'img',
    'aria-label': `${opts.aria ?? 'Monthly series'}: ${points.map((p) => `${p.month} ${fmt(p.value)}`).join(', ')}`,
  });

  for (const v of [0, top / 2, top]) {
    svg.appendChild(
      svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), class: v === 0 ? 'axis' : 'grid' })
    );
    const t = svgEl('text', { x: pad.l - 6, y: y(v) + 3.5, class: 'tick', 'text-anchor': 'end' });
    t.textContent = fmt(v);
    svg.appendChild(t);
  }

  // first and last month only — a two-to-a-row chart cannot carry twelve labels
  for (const [i, anchor] of [
    [0, 'start'],
    [points.length - 1, 'end'],
  ]) {
    const t = svgEl('text', { x: x(i), y: y(0) + 16, class: 'tick', 'text-anchor': anchor });
    t.textContent = points[i].month;
    svg.appendChild(t);
  }

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  svg.appendChild(svgEl('path', { d: path, class: 'series--mean' }));

  points.forEach((p, i) => {
    svg.appendChild(svgEl('circle', { cx: x(i), cy: y(p.value), r: 2.5, class: 'marker' }));
  });

  const last = points[points.length - 1];
  const label = svgEl('text', {
    x: x(points.length - 1) + 6,
    y: y(last.value) + 3.5,
    class: 'tick tick--accent',
    'text-anchor': 'start',
  });
  label.textContent = fmt(last.value);
  svg.appendChild(label);

  node.appendChild(svg);
}

// ---------------------------------------------------------------- skills ---

function renderSkills(sk) {
  if (!document.getElementById('s05')) return;

  const blanks = [
    'sk-categories', 'sk-skills', 'sk-openlist', 'sk-years', 'sk-bands', 'sk-degrees', 'sk-pairs',
  ];
  if (!sk || sk.empty) {
    $('sk-standfirst').textContent =
      sk?.note ?? 'No advert in this batch carries a qualifications block yet.';
    for (const id of blanks) {
      const node = $(id);
      if (node) {
        clear(node);
        node.appendChild(el('p', 'empty', 'No data in this batch.'));
      }
    }
    return;
  }

  const cells = $('sk-kpis');
  clear(cells);
  for (const k of sk.kpis) {
    const cell = el('div', 'kpi');
    cell.appendChild(el('p', 'kpi__value', k.value));
    cell.appendChild(el('p', 'kpi__label', k.label));
    cell.appendChild(el('p', 'kpi__sub', k.sub));
    cells.appendChild(cell);
  }

  $('sk-standfirst').textContent = sk.reading[0] ?? '';

  renderRank(
    $('sk-categories'),
    sk.categories.map((c) => ({ label: c.label, count: c.count, sub: `${c.share}% of adverts` })),
    { sub: true, unit: 'adverts' }
  );
  renderRank(
    $('sk-skills'),
    sk.skills.map((s) => ({ label: s.label, count: s.count, sub: `${s.share}% · ${s.category}` })),
    { sub: true, unit: 'adverts' }
  );
  renderRank(
    $('sk-openlist'),
    (sk.openList || []).map((o) => ({ label: o.label, count: o.count, sub: `${o.share}% · ${o.note}` })),
    { sub: true, unit: 'adverts' }
  );

  renderMomentum($('sk-rising'), sk.demand.rising, 'Too few adverts state requirements to index demand.');
  renderMomentum($('sk-fading'), sk.demand.fading, 'Too few adverts state requirements to index demand.');

  renderRank(
    $('sk-years'),
    sk.experience.buckets.map((b) => ({ label: b.label, count: b.count, sub: `${b.share}%` })),
    { sub: true, unit: 'adverts' }
  );
  renderRank(
    $('sk-bands'),
    sk.experience.byBand.map((b) => ({
      label: b.label,
      count: b.median,
      sub: `median of ${nf.format(b.count)} adverts stating a number`,
    })),
    { sub: true, unit: 'years' }
  );

  // ---- market trend
  const mk = sk.market;
  $('sk-market-note').textContent =
    `Each point is one month of postings, and only months carrying at least ${mk.minPostings} of them are ` +
    `plotted. Because just currently-open roles are visible, the earlier months are a ` +
    `survivorship-biased sample — a role posted in spring is only here if it is still unfilled. ` +
    `Read the recent end of these lines, and the demand index above, rather than the slope from the start.`;
  renderMonthlyLine($('sk-ai-line'), mk.months, mk.aiShare, {
    unit: '%',
    aria: 'Share of postings naming the AI stack',
  });
  renderMonthlyLine($('sk-years-line'), mk.months, mk.medianYears, {
    aria: 'Median years of experience demanded',
    max: 8,
  });

  const tl = sk.timeline;
  renderSpark($('sk-tl-skill'), tl.bySkill, tl.months);
  renderSpark($('sk-tl-category'), tl.byCategory, tl.months);
  renderShift(
    $('sk-shift'),
    [...(tl.shift.category || []), ...(tl.shift.skill || [])]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 12)
  );

  renderRank(
    $('sk-degrees'),
    sk.degrees.map((d) => ({ label: d.label, count: d.count, sub: `${d.share}% of adverts` })),
    { sub: true, unit: 'adverts' }
  );
  renderRank(
    $('sk-pairs'),
    sk.pairs.map((p) => ({ label: `${p.a} + ${p.b}`, count: p.count, sub: `${p.share}% of adverts` })),
    { sub: true, unit: 'adverts' }
  );

  renderCrosstab($('sk-gradient'), sk.gradient, { suffix: '%' });

  const reading = $('sk-reading');
  clear(reading);
  for (const line of sk.reading.slice(1)) reading.appendChild(el('li', null, line));
}

// -------------------------------------------------------------- rail sync --

function trackSections() {
  const links = [...document.querySelectorAll('.sectionbar__link')];
  const map = new Map(links.map((l) => [l.getAttribute('href').slice(1), l]));
  const targets = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (!targets.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        for (const l of links) l.removeAttribute('aria-current');
        map.get(e.target.id)?.setAttribute('aria-current', 'true');
      }
    },
    { rootMargin: '-20% 0px -70% 0px' }
  );
  for (const t of targets) io.observe(t);
}

// ------------------------------------------------------------------ boot ---

async function boot() {
  let stats;
  let jobs;
  try {
    [stats, jobs] = await Promise.all([loadJson('./data/stats.json'), loadJson('./data/jobs.min.json')]);
  } catch (err) {
    $('hero-standfirst').textContent =
      'No data yet. Run "npm run batch" to collect the first snapshot, then reload this page.';
    console.error(err);
    return;
  }

  const brief = stats.brief;
  const m = brief.metrics;
  const themeLabels = new Map(stats.themes.map((t) => [t.key, t.label]));
  const orgLabels = new Map(stats.orgs.map((o) => [o.key, o.label]));
  const industryLabels = new Map((stats.industries || []).map((v) => [v.key, v.label]));

  // ---- hero
  document.title = `${nf.format(m.openRoles)} open roles — Microsoft hiring signal`;
  setFigure($('hero-figure'), m.openRoles);
  $('a11y-headline').textContent = `${nf.format(m.openRoles)} open roles advertised`;
  $('hero-standfirst').textContent = brief.headline;
  $('k-date').textContent = `Batch ${stamp(stats.meta.generatedAt)}`;
  $('k-scope').textContent = `${nf.format(stats.meta.totalOpen)} open · ${nf.format(
    stats.meta.totalClosedTracked
  )} closed since tracking began`;
  $('masthead-meta').textContent =
    `${nf.format(m.openRoles)} open roles\n${stats.meta.generatedAt.slice(0, 10)} · ` +
    `${stats.meta.countries} countries`;

  const kpis = $('kpis');
  clear(kpis);
  for (const k of brief.kpis) {
    const cell = el('div', 'kpi');
    cell.appendChild(el('p', 'kpi__value', k.value));
    cell.appendChild(el('p', 'kpi__label', k.label));
    cell.appendChild(el('p', 'kpi__sub', k.sub));
    kpis.appendChild(cell);
  }

  // ---- the plate
  $('plate-figure').textContent = `${m.infraBetShare}%`;
  $('plate-note').textContent =
    `AI platform, datacenter capacity and silicon together account for ${m.infraBetShare}% of everything advertised ` +
    `(AI ${m.aiShare}% · datacenter ${m.datacenterShare}% · silicon ${m.siliconShare}%). ` +
    `A role can serve more than one of the three.`;

  // ---- findings
  const findings = $('findings');
  clear(findings);
  for (const s of brief.sections) {
    const col = el('div', 'col-6');
    col.appendChild(el('p', 'subhead', s.title));
    s.points.forEach((p, i) => {
      const f = el('div', 'finding');
      f.appendChild(el('div', 'finding__n', String(i + 1).padStart(2, '0')));
      f.appendChild(el('div', 'finding__text', p));
      col.appendChild(f);
    });
    findings.appendChild(col);
  }

  const outlook = $('outlook');
  clear(outlook);
  for (const o of brief.outlook) outlook.appendChild(el('li', null, o));

  // ---- clusters
  renderRank(
    $('themes'),
    stats.themes.map((t) => ({ label: t.label, count: t.count, sub: `${t.share}% · ${t.blurb}` })),
    { sub: true }
  );
  renderRank($('products'), stats.breakdowns.product.map((p) => ({ label: p.key, count: p.count })), { limit: 16 });

  // ---- organisation
  const notStated = stats.orgs.find((o) => o.key === 'not_stated');
  const namedOrgs = stats.orgs.filter((o) => o.key !== 'not_stated');

  const parents = $('orgparents');
  clear(parents);
  for (const p of (stats.orgParents || []).filter((x) => x.key !== 'not_stated')) {
    const cell = el('div', 'cell');
    cell.appendChild(el('p', 'cell__value', `${p.share}%`));
    cell.appendChild(el('p', 'cell__label', p.label));
    cell.appendChild(el('p', 'cell__note', `${nf.format(p.count)} roles`));
    parents.appendChild(cell);
  }

  renderRank(
    $('orgs'),
    namedOrgs.map((o) => ({
      label: o.label,
      count: o.count,
      sub: `${o.parentLabel ? o.parentLabel + ' · ' : ''}${o.blurb}`,
    })),
    { sub: true }
  );
  $('org-note').textContent =
    `Read from the posting's structured department where that names the team outright — a Cloud ` +
    `Solution Architecture posting is a Customer Success Unit posting — and otherwise from the way ` +
    `the advert describes itself in its Overview ("within X", "X is a global organisation"), never ` +
    `from Responsibilities, which lists teams the role merely works with. ` +
    `${stats.meta.orgCoverage}% of roles (${nf.format(stats.meta.orgIdentified)}) resolve: ` +
    `${nf.format(stats.meta.orgFromDepartment)} by department, ` +
    `${nf.format(stats.meta.orgFromSelfDescription)} by self-description. The other ` +
    `${nf.format(notStated ? notStated.count : 0)} are reported as not stated rather than guessed, ` +
    `so these totals are a floor, not a census.`;
  renderRank($('solutionareas'), stats.solutionAreas.map((s) => ({ label: s.label, count: s.count })));
  renderRank(
    $('initiatives'),
    stats.initiatives.map((i) => ({ label: i.label, count: i.count, sub: i.blurb })),
    { sub: true }
  );
  renderCrosstab($('orgtab'), stats.crosstabs.orgBySeniority);

  // ---- frontier deep dive
  renderFrontier(stats.frontier);

  // ---- skills market
  renderSkills(stats.skills);

  // ---- shape
  const fm = $('functionmix');
  clear(fm);
  for (const f of brief.functionMix) {
    const cell = el('div', 'cell');
    cell.appendChild(el('p', 'cell__value', `${f.share}%`));
    cell.appendChild(el('p', 'cell__label', f.label));
    cell.appendChild(el('p', 'cell__note', `${nf.format(f.count)} roles`));
    fm.appendChild(cell);
  }

  renderRank($('seniority'), stats.breakdowns.seniority.map((s) => ({ label: s.key, count: s.count })));
  renderCrosstab($('crosstab'), stats.crosstabs.professionByRoleType);
  renderRank($('professions'), stats.breakdowns.profession.map((s) => ({ label: s.key, count: s.count })), {
    limit: 14,
  });
  renderRank($('disciplines'), stats.breakdowns.discipline.map((s) => ({ label: s.key, count: s.count })), {
    limit: 14,
  });

  // ---- momentum
  renderMomentum($('rising'), brief.rising, 'Nothing is materially over-represented — hiring is broad-based.');
  renderMomentum($('cooling'), brief.cooling, 'Nothing is materially under-represented.');
  const t = renderTrend($('trend'), stats.trend);
  if (t) {
    $('trend-note').textContent =
      `Daily count of postings created, ${t.from} to ${t.to}, with a centred 7-day mean drawn over ` +
      `it. Peak ${t.max} in a single day. Only currently-open roles appear, so older days are ` +
      `progressively understated as roles close — read the shape of the mean, not the level.`;
  }
  renderRank($('age'), stats.breakdowns.age.map((a) => ({ label: a.key, count: a.count })));

  // ---- monthly composition
  const tl = stats.timeline;
  if (tl && tl.months.length) {
    $('timeline-head').textContent = `Monthly composition — ${tl.months[0]} to ${tl.months[tl.months.length - 1]}`;
    $('timeline-note').textContent =
      `Postings grouped by the month they were created. Bars share one scale across rows, and the ` +
      `final bar is the current month, which is still filling. Because only currently-open roles ` +
      `are visible, earlier months are progressively understated as roles close. Read the shape and ` +
      `the share shift below, not the absolute level.`;
    renderSpark($('tl-theme'), tl.byTheme, tl.months);
    renderSpark($('tl-org'), tl.byOrg, tl.months);

    const shift = [...(tl.shift.theme || []), ...(tl.shift.org || [])]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 12);
    renderShift($('shift'), shift);
  }

  // ---- geography
  renderRank($('countries'), stats.breakdowns.country.map((c) => ({ label: c.key, count: c.count })), { limit: 14 });
  renderRank($('cities'), stats.breakdowns.city.map((c) => ({ label: c.key, count: c.count })), { limit: 14 });
  renderRank($('worksite'), stats.breakdowns.workSite.map((w) => ({ label: w.key, count: w.count })));
  renderRank($('travel'), stats.breakdowns.travel.map((w) => ({ label: w.key, count: w.count })), { limit: 8 });

  // ---- index + changes
  setupIndex(jobs, themeLabels, orgLabels, industryLabels);
  renderChanges($('changes'), stats.recentChanges);

  const caveats = $('caveats');
  clear(caveats);
  for (const c of brief.caveats) caveats.appendChild(el('li', null, c));

  const run = stats.meta.lastRun;
  $('colophon-run').textContent = run
    ? `Mode ${run.mode} · ${nf.format(run.openCount)} open · +${run.addedCount} −${run.removedCount} ~${run.updatedCount} · ` +
      `${stats.meta.runCount} batch(es) recorded · generated ${stamp(stats.meta.generatedAt)}`
    : `Generated ${stamp(stats.meta.generatedAt)}`;

  trackSections();
}

boot();
