function merchantKey(name) {
  return name.normalize('NFKC').toLocaleLowerCase('pl')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function rememberedCategory(account, name) {
  const merchant = merchantKey(name);
  if (!account || !merchant) return null;
  try { return localStorage.getItem('budget-merchant:' + account + ':' + merchant); }
  catch { return null; }
}

export function rememberCategory(account, name, category) {
  const merchant = merchantKey(name);
  if (!account || !merchant || !category) return;
  try { localStorage.setItem('budget-merchant:' + account + ':' + merchant, category); }
  catch { /* Saving the expense still succeeds without local storage. */ }
}
