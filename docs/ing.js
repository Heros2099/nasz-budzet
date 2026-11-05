import { parseAmount } from './budget.js';

export function parseIngExpenses(text) {
  const lines = text.replace(/[−–—]/g, '-').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const payments = lines.flatMap((line, index) => {
    const date = line.match(/p[łl]atno[śs][ćc]\s+kart[ąa]\s+(\d{2})[.\/-](\d{2})[.\/-](\d{4})/i);
    return date ? [{ index, date: `${date[3]}-${date[2]}-${date[1]}` }] : [];
  });
  return payments.flatMap(({ index, date }, position) => {
    const parsedDate = new Date(date);
    if (!Number.isFinite(+parsedDate) || parsedDate.toISOString().slice(0, 10) !== date) return [];
    const details = lines.slice(index, payments[position + 1]?.index).join(' ');
    const amounts = [...details.matchAll(/-\s*(\d+(?:[ \u00a0\u202f]+\d{3})*[,\.]\d{2})\s*PLN\b/gi)];
    if (amounts.length !== 1) return [];
    const previous = lines[index - 1] || '';
    const name = (/^\d+$/.test(previous) ? lines[index - 2] : previous)?.slice(0, 100) || 'Płatność kartą';
    const category = /zdrowie|drogeri|apteka/i.test(name + ' ' + details) ? 'Zdrowie'
      : /wydatki podstawowe|\blidl\b|biedronka|aldi|kaufland/i.test(name + ' ' + details) ? 'Zakupy' : '';
    const value = amounts[0][1].replace(/\s/g, '').replace(',', '.');
    if (!Number(value)) return [];
    return [{ name, date, category, amount: parseAmount(value), blocked: /blokada/i.test(details) }];
  });
}

export async function readIngScreenshot(image) {
  if (!globalThis.Tesseract) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL('./ocr/tesseract.min.js', import.meta.url);
      script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error('Nie udało się uruchomić odczytu obrazu.')); };
      document.head.append(script);
    });
  }
  const asset = file => new URL('./ocr/' + file, import.meta.url).href;
  const worker = await Tesseract.createWorker('pol', 1, {
    workerPath: asset('worker.min.js'),
    corePath: asset('tesseract-core-lstm.wasm.js'),
    langPath: asset(''),
    workerBlobURL: false,
  });
  try {
    const { data } = await worker.recognize(image);
    return parseIngExpenses(data.text);
  } finally {
    await worker.terminate();
  }
}
