const filter = document.querySelector('#expenseFilter');
const options = document.querySelector('#expenseCategories');
const summary = document.querySelector('#expenseFilterTotal');
const selected = new Set();

export function initExpenseFilter(render) {
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
}

export function filterExpenses(entries, enabled, money) {
  filter.hidden = !enabled;
  summary.hidden = !enabled || !selected.size;
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
  if (!selected.size) return entries;

  const visible = entries.filter(entry => entry.kind === 'expense' && selected.has(entry.category));
  const amount = visible.reduce((sum, entry) => sum + entry.amount, 0);
  summary.querySelector('strong').textContent = money(amount);
  return visible;
}
