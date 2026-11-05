import { api, login, logout, hasSession, configured, friendlyError } from './cloud.js';
import { parseAmount } from './budget.js';
const $=s=>document.querySelector(s), money=n=>new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n/100);
const localDate=()=>{let d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let state=null,tab='entries',mode='entry',loading=false,queued=false,epoch=0;
$('#month').value=localDate().slice(0,7);
function toast(t){$('#toast').textContent=t;$('#toast').hidden=false;setTimeout(()=>$('#toast').hidden=true,4000)}
function showLogin() {epoch++; state=null; $('#login').hidden=false; $('#app').hidden=true; $('#list').replaceChildren(); if ($('#entryDialog').open) $('#entryDialog').close();}
async function refresh(){
 if (!hasSession()) {showLogin(); return;}
 if(loading){queued=true;return;}
 loading=true; const month=$('#month').value, version=epoch;
 try {
  const result=await api('state?month='+month);
  if(version!==epoch||!hasSession()||month!==$('#month').value)return;
  state=result; $('#app').hidden=false; $('#login').hidden=true; render();
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
const rules=tab==='rules';$('#sectionTitle').textContent=rules?'Wasze stałe opłaty':tab==='savings'?'Odłożone oszczędności':'Wszystkie wpisy';$('#sectionSubtitle').textContent=rules?'Uwzględniane co miesiąc, bez ponownego wpisywania.':tab==='savings'?'Wpłaty w tym miesiącu — bez łącznego salda oszczędności.':'Wasze codzienne finanse w jednym miejscu.';$('#add').textContent=rules?'＋ Stała opłata':'＋ Dodaj wpis';
const items=rules?state.rules:state.entries.filter(e=>tab!=='savings'||e.kind==='saving');const list=$('#list');list.replaceChildren();
if(!items.length){const empty=el('div','empty');empty.append(el('b','',rules?'↻':'＋'),el('strong','',rules?'Dodajcie pierwszą stałą opłatę':'Tu zaczyna się Wasz budżet'),el('p','',rules?'Czynsz, internet, raty — wpiszcie je tylko raz.':'Dodajcie przychód, wydatek lub odłożoną kwotę.'));list.append(empty);return}
for(const e of items){const row=el('div','row');row.append(el('div','symbol',rules?'↻':e.kind==='income'?'↗':e.kind==='saving'?'◒':'↘'));const info=el('div','info');info.append(el('strong','',e.name),el('small','',rules?`${e.category} · termin: ${e.due}. dzień · ${e.paid?'opłacone':'do opłacenia'}`:`${e.category} · ${e.date.split('-').reverse().join('.')}`));row.append(info,el('div','amount'+(e.kind==='income'?' positive':''),(e.kind==='income'?'+':'−')+money(e.amount)));
if(rules){const pay=el('button','',e.paid?'Cofnij':'Opłacone');pay.onclick=()=>action('paid',{id:e.id,month:$('#month').value,paid:!e.paid});row.append(pay);const stop=el('button','','×');stop.setAttribute('aria-label','Zakończ opłatę '+e.name);stop.onclick=()=>{if(confirm('Zakończyć opłatę „'+e.name+'” od wybranego miesiąca? Wcześniejsze miesiące pozostaną bez zmian.'))action('stop-rule',{id:e.id,month:$('#month').value})};row.append(stop)}else{const remove=el('button','','×');remove.setAttribute('aria-label','Usuń wpis '+e.name);remove.onclick=()=>{if(confirm('Usunąć wpis „'+e.name+'”?'))action('delete-entry',{id:e.id})};row.append(remove)}list.append(row)}}
$('#loginForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;$('#loginError').textContent='';try{await login($('#email').value.trim(),$('#password').value);$('#password').value='';await refresh()}catch(err){$('#loginError').textContent=friendlyError(err)}finally{b.disabled=false}};
$('#logout').onclick=async()=>{try{showLogin();await logout()}catch(e){toast(friendlyError(e))}};
function openForm(rule=false){mode=rule?'rule':'entry';const f=$('#entryForm');f.reset();f.dataset.pendingId=crypto.randomUUID();f.elements.date.value=$('#month').value===localDate().slice(0,7)?localDate():$('#month').value+'-01';f.elements.start.value=$('#month').value;f.elements.kind.value=tab==='savings'?'saving':'expense';f.elements.category.value=rule?'Dom i rachunki':tab==='savings'?'Oszczędności':'Zakupy';$('#kindLabel').hidden=rule;$('#dateLabel').hidden=rule;f.elements.date.required=!rule;$('#ruleFields').hidden=!rule;$('#dialogTitle').textContent=rule?'Nowa stała opłata':'Nowy wpis';$('#formError').textContent='';$('#entryDialog').showModal()}
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
