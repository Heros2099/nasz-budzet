export function merchantKey(name) {
  return name.normalize('NFKC').toLocaleLowerCase('pl')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const knownMerchants = [
  [/\bmc\s*donald(?:\s*s|s)?\b/u, 'McDonald'],
  [/\blidl\b/u, 'Lidl'],
  [/\bbiedronka\b/u, 'Biedronka'],
  [/\brossmann\b/u, 'Rossmann'],
  [/\bdm\s+drogerie\b/u, 'dm'],
];

export function shortMerchantName(name) {
  const key = merchantKey(name);
  return knownMerchants.find(([pattern]) => pattern.test(key))?.[1] ?? name;
}

export function rememberedCategory(account, name) {
  const merchant = merchantKey(name);
  if (!account || !merchant) return null;
  const prefix = 'budget-merchant:' + account + ':';
  try {
    return localStorage.getItem(prefix + merchantKey(shortMerchantName(name)))
      ?? localStorage.getItem(prefix + merchant);
  }
  catch { return null; }
}

export function rememberCategory(account, name, category) {
  const merchant = merchantKey(shortMerchantName(name));
  if (!account || !merchant || !category) return;
  try { localStorage.setItem('budget-merchant:' + account + ':' + merchant, category); }
  catch { /* Saving the expense still succeeds without local storage. */ }
}

export function localMerchantPatterns(account) {
  if (!account) return [];
  try { return JSON.parse(localStorage.getItem('budget-merchant-patterns:' + account)) ?? []; }
  catch { return []; }
}

export function matchMerchantPattern(name, fragment) {
  return (' ' + merchantKey(name) + ' ').includes(' ' + merchantKey(fragment) + ' ');
}

export function importedMerchantName(patterns, name) {
  return patterns.find(({ fragment }) => matchMerchantPattern(name, fragment))?.name
    ?? shortMerchantName(name);
}
