function xml(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function worksheet(name, rows) {
  return `<Worksheet ss:Name="${name}"><Table>${rows.map(row =>
    '<Row>' + row.map(value => `<Cell><Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xml(value)}</Data></Cell>`).join('') + '</Row>'
  ).join('')}</Table></Worksheet>`;
}

export function monthlyWorkbook(entries, rules, month) {
  const kinds = { expense: 'Wydatek', income: 'Przychód', saving: 'Oszczędności' };
  const rows = entries.map(entry => [
    entry.date, kinds[entry.kind], entry.name, entry.category, entry.amount / 100, entry.one_off ? 'Tak' : '',
  ]);
  for (const rule of rules) rows.push([
    month + '-' + String(rule.due).padStart(2, '0'), 'Stała opłata', rule.name, rule.category, rule.amount / 100, '',
  ]);
  const categories = new Map();
  for (const item of [...entries.filter(entry => entry.kind === 'expense'), ...rules]) {
    const category = item.category || 'Bez kategorii';
    categories.set(category, (categories.get(category) ?? 0) + item.amount);
  }
  const summary = [...categories].sort((a, b) => b[1] - a[1]).map(([name, amount]) => [name, amount / 100]);
  summary.push(['Razem', [...categories.values()].reduce((sum, amount) => sum + amount, 0) / 100]);
  return '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    worksheet('Wpisy', [['Data', 'Rodzaj', 'Nazwa', 'Kategoria', 'Kwota (PLN)', 'Jednorazowy'], ...rows]) +
    worksheet('Wydatki według kategorii', [['Kategoria', 'Wydatki (PLN)'], ...summary]) + '</Workbook>';
}
