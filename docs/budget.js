export function monthStart(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Wybierz prawidłowy miesiąc.');
  return month + '-01';
}
export function parseAmount(value) {
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) throw new Error('Wpisz dodatnią kwotę, np. 125,50.');
  const [whole, fraction = ''] = text.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (amount <= 0) throw new Error('Kwota musi być większa od zera.');
  return amount;
}
export function summarize(entries, rules, month) {
  monthStart(month);
  const [year, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const activeRules = rules.filter(r => r.start.slice(0, 7) <= month && (!r.stop || r.stop.slice(0, 7) > month))
    .map(r => ({ ...r, due: Math.min(r.day, days) }));
  const currentEntries = entries.filter(e => e.date.slice(0, 7) === month);
  const total = kind => currentEntries.filter(e => e.kind === kind).reduce((sum, e) => sum + e.amount, 0);
  const income = total('income'), expense = total('expense'), savings = total('saving');
  const fixed = activeRules.reduce((sum, r) => sum + r.amount, 0);
  return { entries: currentEntries, rules: activeRules, totals: { income, expense, fixed, savings, available: income - expense - fixed - savings } };
}
