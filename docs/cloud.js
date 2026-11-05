import { config } from './config.js';
import { monthStart, summarize } from './budget.js';

const storageKey = 'nasz-budzet-session-v1';
let session = null, refreshing = null;
let generation = 0;
function isPublicKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try { return JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role === 'anon'; } catch { return false; }
}
export const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl) && isPublicKey(config.publishableKey);
function invalid(message, code = 'UNKNOWN') { return Object.assign(new Error(message), { code }); }
try { session = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Safari can restrict storage. */ }
export function hasSession() { return Boolean(session?.refresh_token); }
function store(next) {
  session = next;
  try { if (next) localStorage.setItem(storageKey, JSON.stringify(next)); else localStorage.removeItem(storageKey); } catch { /* In-memory session remains usable. */ }
}
export function clearSession() { generation++; store(null); }
export function friendlyError(error) {
  if (error.message === 'Invalid login credentials') return 'Nieprawidłowy e-mail lub hasło.';
  if (error.message === 'Email not confirmed') return 'Potwierdź adres e-mail przed zalogowaniem.';
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'Połączenie trwa zbyt długo. Spróbuj ponownie.';
  if (error instanceof TypeError) return 'Brak połączenia. Sprawdź internet. Jeśli projekt Supabase jest uśpiony, trzeba go wznowić.';
  if (error.code === 'PGRST202' || error.code === '42P01') return 'Baza nie jest jeszcze przygotowana. Dokończ konfigurację projektu.';
  if (error.code === '42501') return 'Brak dostępu do danych. Sprawdź konfigurację konta.';
  if (error.status === 429) return 'Za dużo prób. Odczekaj chwilę i spróbuj ponownie.';
  if (error.status >= 500) return 'Usługa jest chwilowo niedostępna. Spróbuj ponownie.';
  return error.message || 'Nie udało się połączyć.';
}
async function request(path, { method = 'GET', body, token, prefer } = {}) {
  if (!configured) throw invalid('Aplikacja czeka na podłączenie Twojej bazy danych.', 'CONFIG');
  const r = await fetch(config.supabaseUrl + path, {
    method, headers: { apikey: config.publishableKey, ...(prefer ? { Prefer: prefer } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  let result;
  try { result = text ? JSON.parse(text) : null; } catch { throw invalid('Usługa zwróciła nieprawidłową odpowiedź.'); }
  if (!r.ok) throw Object.assign(invalid(result?.msg || result?.message || result?.error_description || 'Nie udało się wykonać operacji.', result?.code || result?.error_code), { status: r.status });
  return result;
}
async function token(force = false) {
  if (!hasSession()) throw invalid('Zaloguj się do wspólnego budżetu.', 'AUTH');
  if (!force && session.expires_at > Date.now() / 1000 + 60) return session.access_token;
  if (!refreshing) {
    const version = generation, refresh_token = session.refresh_token;
    refreshing = (async () => {
      try {
        const next = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token } });
        if (version !== generation) throw invalid('Sesja została zakończona.', 'AUTH');
        store({ ...next, expires_at: next.expires_at || Math.floor(Date.now() / 1000) + next.expires_in });
        return next.access_token;
      } catch (e) {
        if (version === generation && [400, 401, 403].includes(e.status)) clearSession();
        throw e;
      } finally { refreshing = null; }
    })();
  }
  return refreshing;
}
async function rest(path, options = {}) {
  const version = generation;
  try { return await request('/rest/v1/' + path, { ...options, token: await token() }); }
  catch (e) {
    // Retry reads after token expiry. Never retry a write whose outcome is uncertain.
    if (e.status === 401 && version === generation) {
      if (!options.method || options.method === 'GET') return request('/rest/v1/' + path, { ...options, token: await token(true) });
      clearSession();
    }
    throw e;
  }
}
export async function login(email, password) {
  const next = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  generation++;
  store({ ...next, expires_at: next.expires_at || Math.floor(Date.now() / 1000) + next.expires_in });
}
export async function logout() {
  const access = session?.access_token;
  clearSession();
  if (access) try { await request('/auth/v1/logout?scope=local', { method: 'POST', token: access }); } catch { /* Local logout always succeeds. */ }
}
export async function api(path, data) {
  if (path === 'export') return rest('rpc/budget_export', { method: 'POST', body: {} });
  if (path.startsWith('state?month=')) {
    const month = path.slice('state?month='.length);
    const snapshot = await rest('rpc/budget_snapshot', { method: 'POST', body: { selected_month: monthStart(month) } });
    return summarize(snapshot.entries || [], snapshot.rules || [], month);
  }
  if (path === 'entry') return rest('budget_entries', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { ...data, id: data.id || crypto.randomUUID() } });
  if (path === 'rule') return rest('budget_rules', { method: 'POST', prefer: 'resolution=ignore-duplicates', body: { ...data, id: data.id || crypto.randomUUID(), start: monthStart(data.start) } });
  if (path === 'delete-entry') return rest('budget_entries?id=eq.' + encodeURIComponent(data.id), { method: 'DELETE' });
  if (path === 'stop-rule') return rest('rpc/budget_stop_rule', { method: 'POST', body: { rule: data.id, from_month: monthStart(data.month) } });
  if (path === 'paid') {
    if (data.paid) return rest('rpc/budget_mark_paid', { method: 'POST', body: { rule: data.id, selected_month: monthStart(data.month), value: true } });
    return rest('rpc/budget_mark_paid', { method: 'POST', body: { rule: data.id, selected_month: monthStart(data.month), value: false } });
  }
  throw invalid('Nieznana operacja.');
}
window.addEventListener('storage', e => {
  if (e.key === storageKey) {
    generation++;
    try { session = JSON.parse(e.newValue); } catch { session = null; }
    window.dispatchEvent(new Event('budget-session-changed'));
  }
});
