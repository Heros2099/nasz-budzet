const $ = selector => document.querySelector(selector);
const dialog = $('#settings');
const appearance = $('#appearance');
const palette = $('#palette');
const rows = $('#categoryRows');
const system = matchMedia('(prefers-color-scheme: dark)');
let storageKey;
let categories;
let defaults;
let categoryApi;
let pendingSync;

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

export function initSettings(defaultCategories, account = () => 'demo', api) {
  defaults = defaultCategories;
  categoryApi = api;
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
  let draft;
  let editorVersion = 0;
  const status = $('#categoryStatus');
  const form = $('#categorySettings');
  function renderCategoryEditor() {
    rows.replaceChildren();
    for (const name of draft?.names ?? entryCategories()) addCategory(name);
  }
  $('#settingsOpen').onclick = async () => {
    const version = ++editorVersion;
    const owner = storageKey();
    draft = null;
    form.inert = true;
    rows.replaceChildren();
    status.textContent = 'Pobieranie kategorii z konta…';
    dialog.showModal();
    try {
      const synced = await syncCategories();
      if (version !== editorVersion || owner !== storageKey() || !dialog.open) return;
      draft = synced;
      renderCategoryEditor();
      form.inert = false;
      status.textContent = '';
    } catch {
      if (version === editorVersion && owner === storageKey()) status.textContent = 'Nie udało się pobrać kategorii. Otwórz ustawienia ponownie.';
    }
  };
  $('#settingsClose').onclick = () => dialog.close();
  $('#categoryAdd').onclick = () => addCategory().focus();
  form.onsubmit = async event => {
    event.preventDefault();
    const names = [...rows.querySelectorAll('input')].map(input => input.value.trim());
    if (!names.length || names.some(name => !name) || new Set(names.map(name => name.toLocaleLowerCase('pl'))).size !== names.length) {
      status.textContent = 'Podaj co najmniej jedną kategorię. Nazwy muszą być różne i niepuste.';
      return;
    }
    const owner = storageKey();
    const version = editorVersion;
    form.inert = true;
    try {
      const saved = await categoryApi('account-categories-save', {names, revision: draft?.revision});
      if (owner !== storageKey() || version !== editorVersion) return;
      if (!saved) {
        draft = await syncCategories();
        if (owner !== storageKey() || version !== editorVersion) return;
        renderCategoryEditor();
        status.textContent = 'Lista zmieniła się na innym urządzeniu. Sprawdź aktualne kategorie i wprowadź poprawki ponownie.';
        return;
      }
      draft = saved;
      categories = {owner, names: saved.names};
      status.textContent = 'Zapisano kategorie na koncie.';
    } catch {
      if (owner === storageKey() && version === editorVersion) status.textContent = 'Nie udało się zapisać kategorii. Spróbuj ponownie.';
    } finally {
      if (owner === storageKey() && version === editorVersion) form.inert = false;
    }
  };
}

export function entryCategories() {
  const owner = storageKey();
  return categories?.owner === owner ? categories.names : read('budget-categories-' + owner, defaults);
}

export function syncCategories() {
  const owner = storageKey();
  if (!owner) return Promise.resolve(null);
  if (pendingSync?.owner === owner) return pendingSync.promise;
  const promise = loadAccountCategories(owner).finally(() => {
    if (pendingSync?.promise === promise) pendingSync = null;
  });
  pendingSync = {owner, promise};
  return promise;
}

async function loadAccountCategories(owner) {
  const key = 'budget-categories-' + owner;
  const legacy = read(key, null);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (owner !== storageKey()) throw Error('Sesja została zmieniona.');
    let current = await categoryApi('account-categories');
    if (owner !== storageKey()) throw Error('Sesja została zmieniona.');
    if (legacy?.length) {
      const names = current ? [...current.names] : [...legacy];
      const seen = new Set([...names, ...defaults].map(name => name.toLocaleLowerCase('pl')));
      for (const name of legacy) {
        const normalized = name.toLocaleLowerCase('pl');
        if (seen.has(normalized)) continue;
        names.push(name);
        seen.add(normalized);
      }
      if (!current || names.length !== current.names.length) {
        current = await categoryApi('account-categories-save', {names, revision: current?.revision});
        if (!current) continue;
      }
      try { localStorage.removeItem(key); } catch { /* A later sync can retry safely. */ }
    }
    if (owner !== storageKey()) throw Error('Sesja została zmieniona.');
    categories = {owner, names: current?.names ?? defaults};
    return current;
  }
  throw Error('Lista kategorii zmieniła się podczas synchronizacji.');
}
