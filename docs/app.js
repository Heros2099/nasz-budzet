import { rememberedCategory, rememberCategory } from './merchant-categories.js';
import { renderCharts } from './charts.js?v=charts3';
import { initExpenseFilter, filterExpenses, resetExpenseFilter } from './category-filter.js';
import { initSettings, entryCategories } from './settings.js?v=settings1';
import { api, login, logout, hasSession, configured, friendlyError, accountId } from './cloud.js?v=settings1';
import { parseAmount } from './budget.js';
import { readIngScreenshot } from './ing.js';
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n/100);
const localDate=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let stateMonth;
let state=null,tab='entries',mode='entry',loading=false,queued=false,epoch=0;
$('#month').value=localDate().slice(0,7);
initSettings([...$('#entryForm select[name="category"]').options].map(option => option.value), accountId);

function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4000)}
initExpenseFilter(render);
function showLogin() {resetExpenseFilter();epoch++; state=null; $('#login').hidden=false; $('#app').hidden=true; $('#list').replaceChildren(); if ($('#entryDialog').open) $('#entryDialog').close(); if ($('#importDialog').open) $('#importDialog').close(); if ($('#settings').open) $('#settings').close();}
async function refresh(){
 if (!hasSession()) {showLogin(); return;}
 if(loading){queued=true;return;}
 loading=true; const month=$('#month').value, version=epoch;
 try {
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
renderCharts(state.entries, state.rules, t, stateMonth, localDate(), money);

const rules=tab==='rules';$('#sectionTitle').textContent=rules?'Wasze stałe opłaty':tab==='savings'?'Odłożone oszczędności':'Wszystkie wpisy';$('#sectionSubtitle').textContent=rules?'Uwzględniane co miesiąc, bez ponownego wpisywania.':tab==='savings'?'Wpłaty w tym miesiącu — bez łącznego salda oszczędności.':'Wasze codzienne finanse w jednym miejscu.';$('#add').textContent=rules?'＋ Stała opłata':'＋ Dodaj wpis';
const items=filterExpenses(rules?state.rules:state.entries.filter(e=>tab!=='savings'||e.kind==='saving'),tab==='entries',money);const list=$('#list');list.replaceChildren();
if(!items.length && !$('#expenseFilterTotal').hidden){list.append(el('p','empty','Brak wydatków w wybranych kategoriach.'));return}
if(!items.length){const empty=el('div','empty');empty.append(el('b','',rules?'↻':'＋'),el('strong','',rules?'Dodajcie pierwszą stałą opłatę':'Tu zaczyna się Wasz budżet'),el('p','',rules?'Czynsz, internet, raty — wpiszcie je tylko raz.':'Dodajcie przychód, wydatek lub odłożoną kwotę.'));list.append(empty);return}
for(const e of items){const row=el('div','row');row.append(el('div','symbol',rules?'↻':e.kind==='income'?'↗':e.kind==='saving'?'◒':'↘'));const info=el('div','info');info.append(el('strong','',e.name),el('small','',rules?`${e.category} · termin: ${e.due}. dzień · ${e.paid?'opłacone':'do opłacenia'}`:`${e.category} · ${e.date.split('-').reverse().join('.')}`));row.append(info,el('div','amount'+(e.kind==='income'?' positive':''),(e.kind==='income'?'+':'−')+money(e.amount)));
if(rules){const pay=el('button','',e.paid?'Cofnij':'Opłacone');pay.onclick=()=>action('paid',{id:e.id,month:$('#month').value,paid:!e.paid});row.append(pay);const stop=el('button','','×');stop.setAttribute('aria-label','Zakończ opłatę '+e.name);stop.onclick=()=>{if(confirm('Zakończyć opłatę „'+e.name+'” od wybranego miesiąca? Wcześniejsze miesiące pozostaną bez zmian.'))action('stop-rule',{id:e.id,month:$('#month').value})};row.append(stop)}else{const edit=el('button','','Edytuj');edit.setAttribute('aria-label','Edytuj wpis '+e.name);edit.onclick=()=>openForm(false,e);row.append(edit);const remove=el('button','','×');remove.setAttribute('aria-label','Usuń wpis '+e.name);remove.onclick=()=>{if(confirm('Usunąć wpis „'+e.name+'”?'))action('delete-entry',{id:e.id})};row.append(remove)}list.append(row)}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('#loginError').textContent='';try{await login($('#email').value.trim(),$('#password').value);$('#password').value='';await refresh()}catch(err){$('#loginError').textContent=friendlyError(err)}finally{b.disabled=false}};
$('#logout').onclick=async()=>{try{showLogin();await logout()}catch(e){toast(friendlyError(e))}};
function openForm(rule=false, entry=null){mode=rule?'rule':entry?'edit-entry':'entry';const f=$('#entryForm');f.reset();f.dataset.pendingId=entry?.id ?? crypto.randomUUID();f.elements.date.value=$('#month').value===localDate().slice(0,7)?localDate():$('#month').value+'-01';f.elements.start.value=$('#month').value;f.elements.kind.value=tab==='savings'?'saving':'expense';const names=entryCategories();
const preferred=rule?'Dom i rachunki':tab==='savings'?'Oszczędności':'Zakupy';
const category=entry?.category || (names.includes(preferred)?preferred:names[0]);
f.elements.category.replaceChildren(...[...new Set([...names,category])].map(name=>new Option(name)));
f.elements.category.value=category;$('#kindLabel').hidden=rule;$('#dateLabel').hidden=rule;f.elements.date.required=!rule;$('#ruleFields').hidden=!rule;if(entry){
  for(const field of ['name','date','kind','category']) f.elements[field].value=entry[field];
  f.elements.amount.value=(entry.amount/100).toFixed(2).replace('.',',');
}
$('#dialogTitle').textContent=rule?'Nowa stała opłata':entry?'Edytuj wpis':'Nowy wpis';$('#formError').textContent='';$('#entryDialog').showModal()}
$('#add').onclick=()=>openForm(tab==='rules');$('#addMain').onclick=()=>openForm();$('#close').onclick=()=>$('#entryDialog').close();
$('#entryForm').onsubmit=async e=>{e.preventDefault();const f=e.target;let amount;try{amount=parseAmount(f.elements.amount.value)}catch(err){$('#formError').textContent=friendlyError(err);return}const data={id:f.dataset.pendingId,name:f.elements.name.value.trim(),amount,category:f.elements.category.value};if(mode==='rule'){data.start=f.elements.start.value;data.day=Number(f.elements.day.value)}else{data.kind=f.elements.kind.value;data.date=f.elements.date.value}$('#save').disabled=true;try{await api(mode,data);$('#entryDialog').close();toast('Zapisano we wspólnym budżecie.');await refresh()}catch(err){$('#formError').textContent=friendlyError(err)}finally{$('#save').disabled=false}};
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
    const existing = snapshots.flatMap(snapshot => snapshot.entries);
    const categories = entryCategories();
    for (const expense of expenses) {
      const duplicate = existing.some(entry => entry.kind === 'expense' && entry.date === expense.date && entry.amount === expense.amount);
      const row = $('#importRow').content.firstElementChild.cloneNode(true);
      row.dataset.id = crypto.randomUUID();
      row.querySelector('legend').textContent = expense.blocked ? 'Blokada karty' : 'Płatność kartą';
      row.querySelector('[name="include"]').checked = !duplicate;
      row.querySelector('[name="name"]').value = expense.name;
      row.querySelector('[name="date"]').value = expense.date;
      row.querySelector('[name="amount"]').value = (expense.amount / 100).toFixed(2).replace('.', ',');
      const category = row.querySelector('[name="category"]');
      for (const option of categories) category.append(new Option(option));
      const remembered = rememberedCategory(accountId(), expense.name);
      const suggested = categories.includes(remembered) ? remembered : expense.category;
      category.value = categories.includes(suggested) ? suggested : '';
      row.dataset.merchant = expense.name;
      row.dataset.suggestedCategory = category.value;
      row.querySelector('.import-duplicate').hidden = !duplicate;
      importRows.append(row);
    }
    importStatus.textContent = 'Sprawdź daty, kwoty i kategorie przed zapisem.';
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
  try {
    entries = selectedImports().map(row => {
      const name = row.querySelector('[name="name"]').value.trim();
      if (!name) throw new Error('Uzupełnij nazwy zaznaczonych wydatków.');
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
    toast('Zapisano wydatki we wspólnym budżecie.');
    await refresh();
  } catch (error) {
    importStatus.textContent = friendlyError(error);
  } finally {
    delete button.dataset.saving;
    button.disabled = importFile.disabled = $('#importClose').disabled = false;
    importRows.inert = false;
  }
};
