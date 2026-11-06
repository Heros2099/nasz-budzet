const filter = document.querySelector('#expenseFilter');
const options = document.querySelector('#expenseCategories');
const summary = document.querySelector('#expenseFilterTotal');
const selected = new Set();
const days = new Set();
const dayFilter = document.querySelector('#dayFilter');
const dayOptions = document.querySelector('#entryDays');
const clearDays = document.querySelector('#dayFilterClear');

export function initExpenseFilter(render) {
  dayOptions.onchange = event => {
    const checkbox = event.target;
    if (checkbox.checked) days.add(checkbox.value);
    else days.delete(checkbox.value);
    render();
  };
  clearDays.onclick = () => {
    days.clear();
    dayOptions.querySelectorAll('input').forEach(input => { input.checked = false; });
    render();
  };
  options.onchange = event => {
    const checkbox = event.target;
    if (checkbox.checked) selected.add(checkbox.value);
    else selected.delete(checkbox.value);
    render();
  };
  document.querySelector('#expenseFilterClear').onclick = () => {
    selected.clear();
    options.querySelectorAll('input').forEach(input => { input.checked = false; });
    render();
  };
}

export function resetExpenseFilter() {
  selected.clear();
  options.replaceChildren();
  delete options.dataset.categories;
  filter.open = false;
  days.clear();
  dayOptions.replaceChildren();
  delete dayOptions.dataset.month;
  dayFilter.open = false;
}

export function filterExpenses(entries, enabled, money, month) {
  filter.hidden = !enabled;
  dayFilter.hidden = !enabled;
  if (enabled && dayOptions.dataset.month !== month) {
    days.clear();
    const [year, monthNumber] = month.split('-').map(Number);
    const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    dayOptions.replaceChildren(...Array.from({length}, (_, index) => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(index + 1).padStart(2, '0');
      label.append(checkbox, String(index + 1));
      return label;
    }));
    dayOptions.dataset.month = month;
  }
  clearDays.hidden = !days.size;
  summary.hidden = !enabled || (!selected.size && !days.size);
  if (!enabled) return entries;

  const categories = [...new Set([
    ...entries.filter(entry => entry.kind === 'expense').map(entry => entry.category),
    ...selected,
  ])].sort((a, b) => a.localeCompare(b, 'pl'));
  const signature = JSON.stringify(categories);
  if (options.dataset.categories !== signature) {
    options.replaceChildren(...categories.map(category => {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = category;
      checkbox.checked = selected.has(category);
      label.append(checkbox, category);
      return label;
    }));
    options.dataset.categories = signature;
  }
  document.querySelector('#expenseFilterClear').hidden = !selected.size;
  document.querySelector('#expenseFilterEmpty').hidden = categories.length > 0;
  if (!selected.size && !days.size) return entries;

  const visible = entries.filter(entry =>
    (!days.size || days.has(entry.date.slice(8, 10))) &&
    (!selected.size || (entry.kind === 'expense' && selected.has(entry.category)))
  );
  const amount = visible.reduce((sum, entry) => sum + (entry.kind === 'expense' ? entry.amount : 0), 0);
  summary.querySelector('strong').textContent = money(amount);
  return visible;
}
