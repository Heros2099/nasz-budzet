const $ = selector => document.querySelector(selector);
const dialog = $('#settings');
const appearance = $('#appearance');
const palette = $('#palette');
const rows = $('#categoryRows');
const system = matchMedia('(prefers-color-scheme: dark)');
let storageKey;
let categories;
let defaults;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function applyTheme() {
  document.documentElement.dataset.theme = appearance.value === 'auto'
    ? (system.matches ? 'dark' : 'light') : appearance.value;
  document.documentElement.dataset.palette = palette.value;
}

function addCategory(value = '') {
  const row = document.createElement('div');
  row.className = 'category-setting';
  const input = document.createElement('input');
  input.value = value;
  input.maxLength = 60;
  input.required = true;
  input.setAttribute('aria-label', 'Nazwa kategorii');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Usuń kategorię z listy');
  remove.onclick = () => row.remove();
  row.append(input, remove);
  rows.append(row);
  return input;
}

export function initSettings(defaultCategories, account = () => 'demo') {
  defaults = defaultCategories;
  storageKey = account;
  const theme = read('budget-theme', {});
  appearance.value = theme.mode || 'auto';
  palette.value = theme.palette || 'green';
  applyTheme();
  system.addEventListener('change', applyTheme);
  appearance.onchange = palette.onchange = () => {
    applyTheme();
    try { localStorage.setItem('budget-theme', JSON.stringify({ mode: appearance.value, palette: palette.value })); }
    catch { /* The theme still applies for this visit. */ }
  };
  $('#settingsOpen').onclick = () => {
    rows.replaceChildren();
    for (const name of entryCategories()) addCategory(name);
    $('#categoryStatus').textContent = '';
    dialog.showModal();
  };
  $('#settingsClose').onclick = () => dialog.close();
  $('#categoryAdd').onclick = () => addCategory().focus();
  $('#categorySettings').onsubmit = event => {
    event.preventDefault();
    const names = [...rows.querySelectorAll('input')].map(input => input.value.trim());
    const status = $('#categoryStatus');
    if (!names.length || names.some(name => !name) || new Set(names.map(name => name.toLocaleLowerCase('pl'))).size !== names.length) {
      status.textContent = 'Podaj co najmniej jedną kategorię. Nazwy muszą być różne i niepuste.';
      return;
    }
    const key = 'budget-categories-' + storageKey();
    try {
      localStorage.setItem(key, JSON.stringify(names));
      categories = { key, names };
      status.textContent = 'Zapisano kategorie.';
    } catch { status.textContent = 'Przeglądarka nie pozwoliła zapisać kategorii.'; }
  };
}

export function entryCategories() {
  const key = 'budget-categories-' + storageKey();
  return categories?.key === key ? categories.names : read(key, defaults);
}
