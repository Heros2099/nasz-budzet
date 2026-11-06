const $ = selector => document.querySelector(selector);
const percent = new Intl.NumberFormat('pl-PL', { style: 'percent', maximumFractionDigits: 1 });
const colors = ['#a8c9ed', '#efb2c5', '#b9d6a5', '#f2c29b', '#c8b5e8', '#9ed4ce', '#efd589', '#d6b2a8'];

export function renderCharts(entries, rules, totals, month, today, money, onCategory) {
  const outgoing = totals.expense + totals.fixed;
  const turnover = totals.income + outgoing;
  $('#summaryEmpty').hidden = turnover > 0;
  const chart = $('#summaryChart');
  chart.hidden = turnover === 0;
  chart.style.setProperty('--income-share', (turnover ? totals.income / turnover * 100 : 0) + '%');
  $('#summaryIncome').textContent = turnover ? money(totals.income) + ' · ' + percent.format(totals.income / turnover) : money(0);
  $('#summaryExpense').textContent = turnover ? money(outgoing) + ' · ' + percent.format(outgoing / turnover) : money(0);
  renderCategories([...entries.filter(entry => entry.kind === 'expense'), ...rules], outgoing, money, onCategory);
  renderDaily(entries, month, today, money);
}

function renderCategories(entries, total, money, onCategory) {
  const byCategory = new Map();
  for (const entry of entries) {
    const category = entry.category || 'Bez kategorii';
    byCategory.set(category, (byCategory.get(category) || 0) + entry.amount);
  }
  const chart = $('#categoryChart');
  chart.hidden = total === 0;
  $('#categoryChartEmpty').hidden = total > 0;
  let end = 0;
  const segments = [];
  const rows = [...byCategory].sort((a, b) => b[1] - a[1]).map(([category, amount], index) => {
    const color = colors[index % colors.length];
    const start = end;
    end += amount;
    segments.push(`${color} ${100 * start / total}% ${100 * end / total}%`);
    const row = document.createElement('div');
    row.style.setProperty('--swatch', color);
    const title = document.createElement('dt');
    const value = document.createElement('dd');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text chart-category';
    button.textContent = category;
    button.onclick = () => onCategory(category, entries.filter(entry => (entry.category || 'Bez kategorii') === category));
    title.append(button);
    value.textContent = money(amount) + ' · ' + percent.format(amount / total);
    row.append(title, value);
    return row;
  });
  chart.style.background = segments.length ? 'conic-gradient(' + segments.join(', ') + ')' : '';
  $('#categoryChartLegend').replaceChildren(...rows);
}

function renderDaily(entries, month, today, money) {
  const [year, monthNumber] = month.split('-').map(Number);
  const monthDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const current = today.slice(0, 7);
  const days = month === current ? Number(today.slice(8)) : month < current ? monthDays : 0;
  const amounts = Array(days).fill(0);
  for (const entry of entries) {
    const index = Number(entry.date.slice(8, 10)) - 1;
    if (entry.kind === 'expense' && entry.date.slice(0, 7) === month && index >= 0 && index < days) {
      amounts[index] += entry.amount;
    }
  }
  const maximum = Math.max(0, ...amounts);
  const width = Math.max(320, monthDays * 36 + 50);
  const svg = $('#dailyChart');
  $('#dailyPlot').hidden = false;
  $('#dailyPlotInner').style.minWidth = width + 'px';
  svg.setAttribute('viewBox', `0 0 ${width} 156`);
  $('#dailyGrid').setAttribute('d', [27, 79, 131].map(y => `M48 ${y}H${width - 48}`).join(' '));
  const dayX = index => 48 + (width - 96) * index / (monthDays - 1);
  $('#dailyTicks').replaceChildren(...Array.from({ length: monthDays }, (_, index) => {
    const tick = document.createElementNS(svg.namespaceURI, 'text');
    tick.setAttribute('x', dayX(index));
    tick.setAttribute('y', '150');
    tick.textContent = index + 1;
    return tick;
  }));
  const points = amounts.map((amount, index) => [
    dayX(index),
    maximum ? 131 - 104 * amount / maximum : 131,
  ]);
  $('#dailyLine').setAttribute('points', points.map(point => point.join(',')).join(' '));
  const peaks = points.flatMap(([x, y], index) => {
    const amount = amounts[index];
    if (!amount || amount <= (amounts[index - 1] || 0) || amount < (amounts[index + 1] || 0)) return [];
    const marker = document.createElementNS(svg.namespaceURI, 'circle');
    marker.setAttribute('cx', x);
    marker.setAttribute('cy', y);
    marker.setAttribute('r', '3');
    const label = document.createElementNS(svg.namespaceURI, 'text');
    label.setAttribute('x', x);
    label.setAttribute('y', y - 9);
    label.textContent = money(amount);
    return [marker, label];
  });
  $('#dailyPeaks').replaceChildren(...peaks);
  $('#dailyScale').textContent = !days ? 'Ten miesiąc jeszcze się nie rozpoczął.'
    : maximum ? 'Skala od 0 zł do ' + money(maximum) : 'Brak wydatków w tym okresie.';
  $('#dailyAmounts').replaceChildren(...amounts.map(amount => {
    const item = document.createElement('li');
    item.textContent = money(amount);
    return item;
  }));
}
