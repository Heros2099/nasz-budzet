function searchable(value) {
  return String(value ?? '').toLocaleLowerCase('pl').normalize('NFD')
    .replace(/\p{M}/gu, '').replaceAll('ł', 'l').replace(/[\u00a0\u202f]/g, ' ');
}

export function matchesEntry(entry, query, money) {
  const reversedDate = entry.date.split('-').reverse().join('.');
  const amount = (entry.amount / 100).toFixed(2);
  const source = searchable([
    entry.name, entry.note, entry.category, entry.date, reversedDate,
    reversedDate.replaceAll('.', '/'), amount, amount.replace('.', ','),
    money(entry.amount), 'zł',
  ].join(' '));
  const terms = searchable(query).trim().replace(/(\d) (?=\d{3}(?:\D|$))/g, '$1').split(/\s+/);
  return terms.every(term => source.includes(term));
}

export function initEntrySearch(api, money, openReceipt, friendlyError) {
  const dialog = document.querySelector('#entrySearchDialog');
  const input = document.querySelector('#entrySearchInput');
  const results = document.querySelector('#entrySearchResults');
  const status = document.querySelector('#entrySearchStatus');
  let version = 0;
  let entries = null;

  function render() {
    if (!entries) return;
    const query = input.value.trim();
    results.replaceChildren();
    if (!query) {
      status.textContent = 'Wpisz nazwę, notatkę, kwotę, kategorię lub datę.';
      return;
    }
    const matches = entries.filter(entry => matchesEntry(entry, query, money));
    status.textContent = matches.length ? 'Znalezione wpisy: ' + matches.length : 'Brak pasujących wpisów.';
    for (const entry of matches) {
      const row = document.createElement('article');
      row.className = 'search-result';
      const name = document.createElement('strong');
      name.textContent = entry.name + ' · ' + money(entry.amount);
      const meta = document.createElement('p');
      const kind = {expense:'Wydatek', income:'Przychód', saving:'Oszczędności'}[entry.kind];
      meta.textContent = [kind, entry.category, entry.date.split('-').reverse().join('.')].join(' · ');
      row.append(name, meta);
      if (entry.note) {
        const note = document.createElement('p');
        note.textContent = entry.note;
        row.append(note);
      }
      if (entry.kind === 'expense') {
        const receipt = document.createElement('button');
        receipt.type = 'button';
        receipt.className = 'text';
        receipt.textContent = 'Zdjęcie paragonu';
        receipt.onclick = () => openReceipt(entry.id);
        row.append(receipt);
      }
      results.append(row);
    }
  }

  document.querySelector('#closeEntrySearch').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    version++;
    entries = null;
    input.value = '';
    results.replaceChildren();
  });
  input.oninput = render;
  document.querySelector('#entrySearchOpen').onclick = async () => {
    const current = ++version;
    entries = null;
    results.replaceChildren();
    status.textContent = 'Pobieranie historii…';
    dialog.showModal();
    try {
      const history = await api('search-entries');
      if (current !== version || !dialog.open) return;
      entries = history;
      render();
    } catch (error) {
      if (current === version && dialog.open) status.textContent = friendlyError(error);
    }
  };
}
