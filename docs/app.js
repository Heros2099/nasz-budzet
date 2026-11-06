import { initEntrySearch } from './entry-search.js';
import { initReceipts } from './receipts.js?v=search1';
import { monthlyWorkbook } from './month-export.js';
import { rememberedCategory, rememberCategory, importedMerchantName, matchMerchantPattern, merchantKey, localMerchantPatterns } from './merchant-categories.js?v=shared-patterns1';
import { renderCharts } from './charts.js?v=daily-labels1';
import { initExpenseFilter, filterExpenses, resetExpenseFilter } from './category-filter.js?v=day-filter1';
import { initSettings, entryCategories, syncCategories } from './settings.js?v=account-categories1';
import { api, login, logout, hasSession, configured, friendlyError, accountId } from './cloud.js?v=search1';
import { parseAmount } from './budget.js';
import { readIngScreenshot } from './ing.js';
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n/100);
const localDate=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const openReceipt = initReceipts(api, friendlyError);
initEntrySearch(api, money, openReceipt, friendlyError);
let stateMonth;
let categoryRefreshAt = 0;
let state=null,tab='entries',mode='entry',loading=false,queued=false,epoch=0;
$('#month').value=localDate().slice(0,7);
initSettings([...$('#entryForm select[name="category"]').options].map(option => option.value), accountId, api);

function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4000)}
initExpenseFilter(render);
function showLogin() {categoryRefreshAt=0;resetExpenseFilter();epoch++; state=null; $('#login').hidden=false; $('#app').hidden=true; $('#list').replaceChildren(); if ($('#receiptDialog').open) $('#receiptDialog').close(); if ($('#entrySearchDialog').open) $('#entrySearchDialog').close(); if ($('#entryDialog').open) $('#entryDialog').close(); if ($('#importDialog').open) $('#importDialog').close(); if ($('#settings').open) $('#settings').close(); if ($('#splitDialog').open) $('#splitDialog').close(); if ($('#categoryDetails').open) $('#categoryDetails').close();}
async function refresh(){
 if (!hasSession()) {showLogin(); return;}
 if(loading){queued=true;return;}
 loading=true; const month=$('#month').value, version=epoch;
 try {
  if (Date.now() >= categoryRefreshAt) {
    categoryRefreshAt = Date.now() + 15000;
    syncCategories().catch(() => {});
  }
  const result=await api('state?month='+month);
  if(version!==epoch||!hasSession()||month!==$('#month').value)return;
  state=result; stateMonth=month; $('#app').hidden=false; $('#login').hidden=true; render();
  $('#status').textContent='● Zaktualizowano o '+new Date().toLocaleTimeString('pl-PL');
 }catch(e){
  if(version!==epoch)return;
  const message=friendlyError(e);
  if(!hasSession()){showLogin(); $('#loginError').textContent='Zaloguj się ponownie.';}
  else { $('#status').textContent='Brak synchronizacji — '+message; if($('#app').hidden) $('#loginError').textContent=message; }
 }finally{loading=false;if(queued){queued=false;queueMicrotask(refresh);}}
}
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
async function action(path,data){try{await api(path,data);await refresh()}catch(e){toast(friendlyError(e))}}
function render(){if(!state)return;const t=state.totals;$('#available').textContent=money(t.available);$('#income').textContent=money(t.income);$('#expense').textContent=money(t.expense+t.fixed);$('#savings').textContent=money(t.savings);
const chartEntries = $('#excludeOneOff').checked ? state.entries.filter(entry => entry.kind !== 'expense' || !entry.one_off) : state.entries;
const chartExpense = chartEntries.reduce((sum, entry) => sum + (entry.kind === 'expense' ? entry.amount : 0), 0);
renderCharts(chartEntries, state.rules, {...t, expense: chartExpense}, stateMonth, localDate(), money, showCategoryDetails, showDayDetails);

const rules=tab==='rules';$('#sectionTitle').textContent=rules?'Wasze stałe opłaty':tab==='savings'?'Odłożone oszczędności':'Wszystkie wpisy';$('#sectionSubtitle').textContent=rules?'Uwzględniane co miesiąc, bez ponownego wpisywania.':tab==='savings'?'Wpłaty w tym miesiącu — bez łącznego salda oszczędności.':'Wasze codzienne finanse w jednym miejscu.';$('#add').textContent=rules?'＋ Stała opłata':'＋ Dodaj wpis';
const items=filterExpenses(rules?state.rules:state.entries.filter(e=>tab!=='savings'||e.kind==='saving'),tab==='entries',money,stateMonth);const list=$('#list');list.replaceChildren();
if(!items.length && !$('#expenseFilterTotal').hidden){list.append(el('p','empty','Brak wpisów pasujących do filtrów.'));return}
if(!items.length){const empty=el('div','empty');empty.append(el('b','',rules?'↻':'＋'),el('strong','',rules?'Dodajcie pierwszą stałą opłatę':'Tu zaczyna się Wasz budżet'),el('p','',rules?'Czynsz, internet, raty — wpiszcie je tylko raz.':'Dodajcie przychód, wydatek lub odłożoną kwotę.'));list.append(empty);return}
for(const e of items){const row=el('div','row');row.append(el('div','symbol',rules?'↻':e.kind==='income'?'↗':e.kind==='saving'?'◒':'↘'));const info=el('div','info');info.append(el('strong','',e.name),el('small','',rules?`${e.category} · termin: ${e.due}. dzień · ${e.paid?'opłacone':'do opłacenia'}`:`${e.category} · ${e.date.split('-').reverse().join('.')}${e.one_off ? ' · Jednorazowy' : ''}`));if (!rules && e.note) info.append(el('small', '', e.note));
row.append(info,el('div','amount'+(e.kind==='income'?' positive':''),(e.kind==='income'?'+':'−')+money(e.amount)));
if(rules){const pay=el('button','',e.paid?'Cofnij':'Opłacone');pay.onclick=()=>action('paid',{id:e.id,month:$('#month').value,paid:!e.paid});row.append(pay);const stop=el('button','','×');stop.setAttribute('aria-label','Zakończ opłatę '+e.name);stop.onclick=()=>{if(confirm('Zakończyć opłatę „'+e.name+'” od wybranego miesiąca? Wcześniejsze miesiące pozostaną bez zmian.'))action('stop-rule',{id:e.id,month:$('#month').value})};row.append(stop)}else{const edit=el('button');edit.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 6 4 4M4 20l4-1L20 7l-3-3L5 16z"/></svg>';edit.setAttribute('aria-label','Edytuj wpis '+e.name);edit.onclick=()=>openForm(false,e);row.append(edit);
const remove=el('button','','×');remove.setAttribute('aria-label','Usuń wpis '+e.name);remove.onclick=()=>{if(confirm('Usunąć wpis „'+e.name+'”?'))action('delete-entry',{id:e.id})};row.append(remove)}list.append(row)}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('#loginError').textContent='';try{await login($('#email').value.trim(),$('#password').value);$('#password').value='';await refresh()}catch(err){$('#loginError').textContent=friendlyError(err)}finally{b.disabled=false}};
$('#logout').onclick=async()=>{if(!confirm('Czy na pewno chcesz się wylogować?'))return;try{showLogin();await logout()}catch(e){toast(friendlyError(e))}};
function openForm(rule=false, entry=null){mode=rule?'rule':entry?'edit-entry':'entry';const f=$('#entryForm');f.reset();f.dataset.pendingId=entry?.id ?? crypto.randomUUID();f.elements.date.value=$('#month').value===localDate().slice(0,7)?localDate():$('#month').value+'-01';f.elements.start.value=$('#month').value;f.elements.kind.value=tab==='savings'?'saving':'expense';const names=entryCategories();
const preferred=rule?'Dom i rachunki':tab==='savings'?'Oszczędności':'Zakupy';
const category=entry?.category || (names.includes(preferred)?preferred:names[0]);
f.elements.category.replaceChildren(...[...new Set([...names,category])].map(name=>new Option(name)));
f.elements.category.value=category;$('#kindLabel').hidden=rule;$('#dateLabel').hidden=rule;f.elements.date.required=!rule;$('#ruleFields').hidden=!rule;if(entry){
  for(const field of ['name','date','kind','category']) f.elements[field].value=entry[field];
  f.elements.amount.value=(entry.amount/100).toFixed(2).replace('.',',');
}
f.elements.oneOff.checked=Boolean(entry?.one_off);
f.elements.note.value = entry?.note ?? '';
$('#openReceipt').onclick = () => openReceipt(entry.id);
$('#openSplit').onclick = () => openSplit(entry);
const updateOneOff=()=>{
  const expense = !rule && f.elements.kind.value === 'expense';
  $('#oneOffLabel').hidden = $('#entryNoteLabel').hidden = !expense;
  $('#openReceipt').hidden = $('#openSplit').hidden = !expense || entry?.kind !== 'expense';
};
f.elements.kind.onchange=updateOneOff;
updateOneOff();
$('#dialogTitle').textContent=rule?'Nowa stała opłata':entry?'Edytuj wpis':'Nowy wpis';$('#formError').textContent='';$('#entryDialog').showModal()}
$('#add').onclick=()=>openForm(tab==='rules');$('#addMain').onclick=()=>openForm();$('#close').onclick=()=>$('#entryDialog').close();
$('#entryForm').onsubmit=async e=>{e.preventDefault();const f=e.target;let amount;try{amount=parseAmount(f.elements.amount.value)}catch(err){$('#formError').textContent=friendlyError(err);return}const data={id:f.dataset.pendingId,name:f.elements.name.value.trim(),amount,category:f.elements.category.value};if(mode==='rule'){data.start=f.elements.start.value;data.day=Number(f.elements.day.value)}else{data.kind=f.elements.kind.value;data.date=f.elements.date.value;data.one_off=data.kind==='expense' && f.elements.oneOff.checked;data.note=f.elements.note.value.trim()}$('#save').disabled=true;try{await api(mode,data);$('#entryDialog').close();toast('Zapisano we wspólnym budżecie.');await refresh()}catch(err){$('#formError').textContent=friendlyError(err)}finally{$('#save').disabled=false}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));render()});
$('#month').onchange=()=>{if($('#month').value)refresh()};function shift(n){const [y,m]=$('#month').value.split('-').map(Number);const d=new Date(y,m-1+n,1);$('#month').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;refresh()}$('#prev').onclick=()=>shift(-1);$('#next').onclick=()=>shift(1);
setInterval(()=>{if(!document.hidden&&hasSession()&&state)refresh()},3000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state)refresh()});window.addEventListener('online',()=>{if(hasSession())refresh()});
window.addEventListener('budget-session-changed',()=>{epoch++;if(hasSession())refresh();else showLogin()});
$('#setupNotice').hidden=configured;$('#loginForm').hidden=!configured;
if(configured)refresh();

$('#export').onclick=async()=>{
 const button=$('#export');button.disabled=true;
 try{
  const data=await api('export');
  const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),...data},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='nasz-budzet-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  toast('Kopia zawiera prywatne dane finansowe. Zapisz ją w bezpiecznym miejscu.');
 }catch(e){toast(friendlyError(e))}finally{button.disabled=false}
};

const importDialog = $('#importDialog');
const importFile = $('#importFile');
const importForm = $('#importForm');
const importRows = $('#importRows');
const importStatus = $('#importStatus');

function selectedImports() {
  return [...importRows.children].filter(row => row.querySelector('[name="include"]').checked);
}

function updateImportTotal() {
  let total = 0;
  for (const row of importRows.children) {
    const include = row.querySelector('[name="include"]').checked;
    for (const field of row.querySelectorAll('input:not([type="checkbox"]), select')) field.disabled = !include;
    if (include) {
      try { total += parseAmount(row.querySelector('[name="amount"]').value); }
      catch { /* The amount must be corrected before saving. */ }
    }
  }
  const count = selectedImports().length;
  $('#importTotal').textContent = `Zaznaczone wydatki: ${count} · ${money(total)}`;
  $('#importSave').disabled = count === 0;
}

$('#importOpen').onclick = () => {
  importFile.value = '';
  importRows.replaceChildren();
  importStatus.textContent = '';
  importForm.hidden = true;
  importDialog.showModal();
};
$('#importClose').onclick = () => importDialog.close();
importDialog.oncancel = event => { if ($('#importSave').dataset.saving) event.preventDefault(); };
importForm.oninput = updateImportTotal;

importFile.onchange = async () => {
  const image = importFile.files[0];
  const version = epoch;
  const isCurrent = () => version === epoch && importDialog.open && image === importFile.files[0];
  importRows.replaceChildren();
  importForm.hidden = true;
  importStatus.textContent = '';
  if (!image) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type)) {
    importStatus.textContent = 'Wybierz plik PNG, JPEG lub WebP.';
    return;
  }
  importFile.disabled = true;
  importStatus.textContent = 'Odczytywanie zrzutu na urządzeniu…';
  try {
    const expenses = await readIngScreenshot(image);
    if (!isCurrent()) return;
    if (!expenses.length) {
      importStatus.textContent = 'Nie udało się odczytać płatności. Spróbuj użyć pełnego zrzutu z widocznymi datami i kwotami.';
      return;
    }
    const months = [...new Set(expenses.map(expense => expense.date.slice(0, 7)))];
    const snapshots = await Promise.all(months.map(month => api('state?month=' + month)));
    if (!isCurrent()) return;
    let sharedPatterns = [];
    let patternWarning = '';
    try { sharedPatterns = await loadPatterns(); }
    catch { patternWarning = ' Nie udało się pobrać wzorów z konta.'; }
    if (!isCurrent()) return;
    const existing = snapshots.flatMap(snapshot => snapshot.entries);
    await syncCategories().catch(() => {});
    if (!isCurrent()) return;
    const categories = entryCategories();
    for (const expense of expenses) {
      const duplicate = existing.some(entry => entry.kind === 'expense' && entry.date === expense.date && entry.amount === expense.amount);
      const row = $('#importRow').content.firstElementChild.cloneNode(true);
      row.dataset.id = crypto.randomUUID();
      row.querySelector('legend').textContent = expense.blocked ? 'Blokada karty' : 'Płatność kartą';
      row.querySelector('[name="include"]').checked = !duplicate;
      row.querySelector('[name="name"]').value = importedMerchantName(sharedPatterns, expense.name);
      row.querySelector('[name="date"]').value = expense.date;
      row.querySelector('[name="amount"]').value = (expense.amount / 100).toFixed(2).replace('.', ',');
      const category = row.querySelector('[name="category"]');
      for (const option of categories) category.append(new Option(option));
      const remembered = rememberedCategory(accountId(), expense.name);
      const suggested = categories.includes(remembered) ? remembered : expense.category;
      category.value = categories.includes(suggested) ? suggested : '';
      row.dataset.merchant = expense.name;
      row.querySelector('.import-original').textContent = expense.name;
      row.dataset.suggestedCategory = category.value;
      row.querySelector('.import-duplicate').hidden = !duplicate;
      importRows.append(row);
    }
    importStatus.textContent = 'Sprawdź daty, kwoty i kategorie przed zapisem.' + patternWarning;
    importForm.hidden = false;
    updateImportTotal();
  } catch (error) {
    if (isCurrent()) importStatus.textContent = friendlyError(error);
  } finally {
    importFile.disabled = false;
  }
};

importForm.onsubmit = async event => {
  event.preventDefault();
  let entries;
  const patterns = [];
  try {
    entries = selectedImports().map(row => {
      const name = row.querySelector('[name="name"]').value.trim();
      if (!name) throw new Error('Uzupełnij nazwy zaznaczonych wydatków.');
      const fragment = row.querySelector('[name="merchantPattern"]').value.trim();
      if (fragment) {
        if (!/[\p{L}\p{N}]{3}/u.test(fragment) || !matchMerchantPattern(row.dataset.merchant, fragment)) {
          throw new Error('Wzór musi zawierać co najmniej trzy litery lub cyfry obok siebie i pasować do odczytanej nazwy.');
        }
        patterns.push({fragment: merchantKey(fragment), name});
      }
      return {
        id: row.dataset.id,
        kind: 'expense',
        name,
        amount: parseAmount(row.querySelector('[name="amount"]').value),
        date: row.querySelector('[name="date"]').value,
        category: row.querySelector('[name="category"]').value,
      };
    });
  } catch (error) {
    importStatus.textContent = friendlyError(error);
    return;
  }
  const account = accountId();
  const corrections = selectedImports().flatMap((row, index) => {
    const category = entries[index].category;
    return category !== row.dataset.suggestedCategory ? [[row.dataset.merchant, category]] : [];
  });
  const button = $('#importSave');
  if (!entries.length || button.dataset.saving) return;
  button.dataset.saving = 'true';
  button.disabled = importFile.disabled = $('#importClose').disabled = true;
  importRows.inert = true;
  importStatus.textContent = 'Zapisywanie wydatków…';
  try {
    await api('import-entries', entries);
    for (const [merchant, category] of corrections) rememberCategory(account, merchant, category);
    importDialog.close();
    let patternSaved = true;
    if (patterns.length) {
      try {
        if (!account || account !== accountId()) throw new Error('Sesja została zmieniona.');
        await api('merchant-patterns-save', [...new Map(patterns.map(pattern => [pattern.fragment, pattern])).values()]);
      } catch { patternSaved = false; }
    }
    toast(patternSaved ? 'Zapisano wydatki we wspólnym budżecie.' : 'Zapisano wydatki. Nie udało się zapisać wzorów nazw na koncie.');
    await refresh();
  } catch (error) {
    importStatus.textContent = friendlyError(error);
  } finally {
    delete button.dataset.saving;
    button.disabled = importFile.disabled = $('#importClose').disabled = false;
    importRows.inert = false;
  }
};

async function loadPatterns() {
  const account = accountId();
  const legacy = localMerchantPatterns(account);
  if (legacy.length) {
    await api('merchant-patterns-migrate', legacy.map(([fragment, name]) => ({fragment, name})));
    try { localStorage.removeItem('budget-merchant-patterns:' + account); }
    catch { /* Retrying the migration preserves existing account patterns. */ }
  }
  if (account !== accountId()) throw new Error('Sesja została zmieniona.');
  const patterns = await api('merchant-patterns');
  return patterns.sort((a, b) => b.fragment.length - a.fragment.length);
}

const patternRows = $('#merchantPatternRows');
const patternStatus = $('#merchantPatternStatus');
$('#settingsOpen').addEventListener('click', () => {
  patternRows.replaceChildren();
  patternStatus.textContent = '';
});
$('#loadMerchantPatterns').onclick = showPatterns;

async function showPatterns() {
  const account = accountId();
  patternStatus.textContent = 'Pobieranie wzorów…';
  try {
    const patterns = await loadPatterns();
    if (account !== accountId() || !$('#settings').open) return;
    patternRows.replaceChildren(...patterns.map(pattern => patternEditor(pattern, account)));
    patternStatus.textContent = patterns.length ? '' : 'Nie zapisano jeszcze żadnego wzoru.';
  } catch (error) {
    if (account === accountId()) patternStatus.textContent = friendlyError(error);
  }
}

function patternEditor(pattern, account) {
  const form = $('#merchantPatternEditor').content.firstElementChild.cloneNode(true);
  form.elements.fragment.value = pattern.fragment;
  form.elements.name.value = pattern.name;
  async function save(remove) {
    if (account !== accountId()) return;
    const raw = form.elements.fragment.value.trim();
    const fragment = merchantKey(raw);
    const name = form.elements.name.value.trim();
    if (!remove && (!/[\p{L}\p{N}]{3}/u.test(raw) || !name)) {
      patternStatus.textContent = 'Wpisz krótką nazwę i fragment zawierający co najmniej trzy litery lub cyfry obok siebie.';
      return;
    }
    const buttons = form.querySelectorAll('button');
    buttons.forEach(button => { button.disabled = true; });
    try {
      await api('merchant-pattern-edit', {
        original: pattern.fragment,
        fragment: remove ? pattern.fragment : fragment,
        name: remove ? null : name,
      });
      await showPatterns();
    } catch (error) {
      if (account === accountId()) patternStatus.textContent = error.code === '23505'
        ? 'Ten fragment jest już zapisany. Zmień istniejący wzór.' : friendlyError(error);
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }
  form.onsubmit = event => { event.preventDefault(); save(false); };
  form.querySelector('[data-remove-pattern]').onclick = () => {
    if (confirm('Usunąć wzór „' + pattern.fragment + '” z konta?')) save(true);
  };
  return form;
}

$('#excludeOneOff').onchange = render;
$('#closeCategoryDetails').onclick = () => $('#categoryDetails').close();

function showDayDetails(date) {
  if (!state || date.slice(0, 7) !== stateMonth) return;
  const excludeOneOff = $('#excludeOneOff').checked;
  const entries = state.entries.filter(entry => entry.kind === 'expense' && entry.date === date && (!excludeOneOff || !entry.one_off));
  showCategoryDetails('Wydatki z ' + date.split('-').reverse().join('.'), entries);
}

function showCategoryDetails(category, entries) {
  $('#categoryDetailsTitle').textContent = category;
  $('#categoryDetailRows').replaceChildren(...entries.map(entry => {
    const row = el('div', 'row');
    const date = entry.date || `${entry.due}. dzień · Stała opłata`;
    const info = el('div', 'info');
    info.append(el('strong', '', entry.name), el('small', '', date));
    if (entry.note) info.append(el('small', '', entry.note));
    row.append(info, el('div', 'amount', money(entry.amount)));
    return row;
  }));
  $('#categoryDetailTotal').textContent = 'Razem ' + money(entries.reduce((total, entry) => total + entry.amount, 0));
  $('#categoryDetails').showModal();
}

const splitDialog = $('#splitDialog');
let splitEntry;
function addSplitPart(category) {
  const row = el('div', 'split-part');
  const amountLabel = el('label', '', 'Kwota (zł)');
  const amount = el('input');
  amount.name = 'amount';
  amount.inputMode = 'decimal';
  amount.required = true;
  amountLabel.append(amount);
  const categoryLabel = el('label', '', 'Kategoria');
  const select = el('select');
  select.replaceChildren(...[...new Set([...entryCategories(), splitEntry.category])].map(name => new Option(name)));
  select.value = category;
  categoryLabel.append(select);
  const remove = el('button', '', '×');
  remove.type = 'button';
  remove.setAttribute('aria-label', 'Usuń część');
  remove.onclick = () => { if ($('#splitRows').children.length > 2) row.remove(); };
  row.append(amountLabel, categoryLabel, remove);
  $('#splitRows').append(row);
}

function openSplit(entry) {
  splitEntry = entry;
  $('#splitOriginal').textContent = entry.name + ' · ' + money(entry.amount);
  $('#splitRows').replaceChildren();
  addSplitPart(entry.category);
  addSplitPart(entry.category);
  $('#splitStatus').textContent = '';
  splitDialog.showModal();
}

$('#addSplitPart').onclick = () => {
  if ($('#splitRows').children.length < 20) addSplitPart(splitEntry.category);
};
$('#closeSplit').onclick = () => splitDialog.close();
splitDialog.oncancel = event => { if ($('#saveSplit').disabled) event.preventDefault(); };

$('#splitForm').onsubmit = async event => {
  event.preventDefault();
  const button = $('#saveSplit');
  if (button.disabled) return;
  const status = $('#splitStatus');
  try {
    const parts = [...$('#splitRows').children].map(row => ({
      amount: parseAmount(row.querySelector('input').value),
      category: row.querySelector('select').value,
    }));
    if (parts.reduce((sum, part) => sum + part.amount, 0) !== splitEntry.amount) {
      throw new Error('Suma części musi wynosić ' + money(splitEntry.amount) + '.');
    }
    button.disabled = $('#closeSplit').disabled = $('#addSplitPart').disabled = true;
    $('#splitRows').inert = true;
    await api('split-expense', {entry_id: splitEntry.id, expected_amount: splitEntry.amount, parts});
    splitDialog.close();
    $('#entryDialog').close();
    toast('Zapisano podział wydatku.');
    await refresh();
  } catch (error) {
    status.textContent = friendlyError(error);
  } finally {
    button.disabled = $('#closeSplit').disabled = $('#addSplitPart').disabled = false;
    $('#splitRows').inert = false;
  }
};

$('#exportMonth').onclick = () => {
  if (!state || stateMonth !== $('#month').value) return;
  const content = monthlyWorkbook(state.entries, state.rules, stateMonth);
  const url = URL.createObjectURL(new Blob([content], {type:'application/xml;charset=utf-8'}));
  const link = el('a');
  link.href = url;
  link.download = 'nasz-budzet-' + stateMonth + '.xml';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
