/* Statement date, weekday cutoff, and saved period controls. */
(()=>{'use strict';
const root=document.getElementById('statementCyclePeriods');if(!root)return;
const names={A:'Cycle A — Monthly',B:'Cycle B — Weekly',C:'Cycle C — 15th to month end',E:'Exceptional — Manual'};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const today=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return parts.year+'-'+parts.month+'-'+parts.day;};
const dateInput=document.getElementById('statementBatchDate');
const dateContainer=dateInput?.parentElement;
root.innerHTML='<h3>Statement periods</h3><p>Choose the statement date and weekly cutoff. The date ranges below use the previous completed month and the last completed weekly cutoff. You can adjust a range before saving.</p><div class="sm-period-setup"><div class="sm-statement-date"><label for="statementBatchDate">Statement date</label></div><label for="statementWeeklyCutoff">Weekly cutoff day<select id="statementWeeklyCutoff">'+weekdays.map((name,day)=>'<option value="'+day+'">'+name+'</option>').join('')+'</select></label></div><p class="sm-cutoff-help">A weekly period has seven complete days, ending on the last cutoff day before the statement date.</p><label class="sm-include"><input type="checkbox" data-sm-fleet checked> Include fleet cards and transactions</label><div class="sm-periods">'+Object.entries(names).map(([c,name])=>'<fieldset><legend>'+name+'</legend><div class="sm-period-fields"><label>From<input type="date" data-cycle="'+c+'" data-bound="from"></label><label>Start time<input type="time" step="1" data-cycle="'+c+'" data-bound="fromTime"></label><label>To<input type="date" data-cycle="'+c+'" data-bound="to"></label><label>End time<input type="time" step="1" data-cycle="'+c+'" data-bound="toTime"></label></div></fieldset>').join('')+'</div><div class="actions"><button type="button" class="secondary" data-sm-defaults disabled>Use date defaults</button><button type="button" class="secondary" data-sm-save disabled>Save periods</button></div><p data-sm-status role="status"></p><p class="note">Account balances use the latest imported data. Recent payments follow “Last Payments to Show.” Fleet transactions use each customer’s period, with gallons only. Saving these settings does not send statements.</p>';
if(dateContainer&&dateInput){root.querySelector('.sm-statement-date').append(dateInput);dateContainer.remove();}
const cutoff=root.querySelector('#statementWeeklyCutoff'),save=root.querySelector('[data-sm-save]'),reset=root.querySelector('[data-sm-defaults]'),status=root.querySelector('[data-sm-status]');
if(dateInput&&!dateInput.value)dateInput.value=today();
let loadedKey='',pending=null,baseline='',saving=false;
const key=()=>document.getElementById('adminKey')?.value.trim()||'';
const read=()=>Object.fromEntries(Object.keys(names).map(c=>[c,Object.fromEntries([...root.querySelectorAll('[data-cycle="'+c+'"]')].map(i=>[i.dataset.bound,i.value.length===5&&i.type==='time'?i.value+':00':i.value]))]));
const state=()=>JSON.stringify({date:dateInput.value,cutoff:cutoff.value,periods:read()});
function write(periods){for(const i of root.querySelectorAll('[data-cycle]'))i.value=periods[i.dataset.cycle][i.dataset.bound];}
function defaults(date,day){
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 if(!valid(date))throw Error('Choose a complete statement date.');
 const current=new Date(date+'T00:00:00Z'),end=new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth(),0));
 const endDay=end.toISOString().slice(0,10),first=endDay.slice(0,7)+'-01';
 const daysBack=(current.getUTCDay()-Number(day)+7)%7||7;
 const weeklyEnd=new Date(current.getTime()-daysBack*86400000);
 const weeklyStart=new Date(weeklyEnd.getTime()-6*86400000);
 const range=(from,to)=>({from,to,fromTime:'00:00:00',toTime:'23:59:59'});
 return {A:range(first,endDay),B:range(weeklyStart.toISOString().slice(0,10),weeklyEnd.toISOString().slice(0,10)),C:range(endDay.slice(0,7)+'-15',endDay),E:range(first,endDay)};
}
function changed(){save.disabled=saving||!loadedKey||state()===baseline;reset.disabled=saving||!loadedKey;}
async function api(body){const session=key();if(!session)throw Error('Sign in to load statement periods.');const r=await fetch('/api/admin/statement-management',{method:body?'POST':'GET',cache:'no-store',headers:{'X-Admin-Key':session,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(session!==key())throw Error('Admin session changed.');if(!r.ok||!d.success)throw Error(d.error||'Statement periods could not be loaded.');return {data:d,session};}
async function ready(){if(loadedKey&&loadedKey===key())return;if(pending)return pending;
 pending=(async()=>{const {data,session}=await api();cutoff.value=String(data.weekly_cutoff_day??3);dateInput.value=today();write(data.saved_reference_date===dateInput.value?data.periods:defaults(dateInput.value,cutoff.value));loadedKey=session;baseline=state();changed();status.textContent='Statement date and periods ready.';})().finally(()=>pending=null);return pending;
}
document.getElementById('documentTabStatementPeriods')?.addEventListener('click',()=>{status.textContent='Loading statement periods...';ready().catch(error=>{status.textContent=error.message;});});
root.addEventListener('input',changed);root.addEventListener('change',changed);
dateInput.addEventListener('change',()=>{try{write(defaults(dateInput.value,cutoff.value));status.textContent='Periods calculated for '+dateInput.value+'. Save periods to keep edits for this date.';}catch(error){status.textContent=error.message;}changed();});
cutoff.addEventListener('change',()=>{try{write(defaults(dateInput.value,cutoff.value));status.textContent='Weekly period ends on '+weekdays[Number(cutoff.value)]+'. Save to keep the cutoff day.';}catch(error){status.textContent=error.message;}changed();});
reset.addEventListener('click',()=>{write(defaults(dateInput.value,cutoff.value));changed();status.textContent='Date defaults selected. Save periods to keep them.';});
save.addEventListener('click',async()=>{saving=true;changed();const controls=[...root.querySelectorAll('input,select')];controls.forEach(i=>i.disabled=true);try{const {data}=await api({action:'periods',periods:read(),reference_date:dateInput.value,weekly_cutoff_day:Number(cutoff.value)});write(data.periods);baseline=state();status.textContent='Statement periods and weekly cutoff saved.';}catch(e){status.textContent=e.message;}finally{saving=false;controls.forEach(i=>i.disabled=false);changed();}});
function options(){if(!loadedKey||loadedKey!==key())throw Error('Open Statement Cycles Periods to load the statement settings first.');const ranges=read();for(const c of Object.keys(names)){const r=ranges[c];if(!r.from||!r.to||!r.fromTime||!r.toTime||r.from+'T'+r.fromTime>r.to+'T'+r.toTime||Date.parse(r.to)-Date.parse(r.from)>91*86400000)throw Error('Choose a valid period of up to 92 days for '+names[c]+'.');}return {enabled:root.querySelector('[data-sm-fleet]').checked,frequency:'weekly',ranges};}
const old=window.WootenStatementFleet;
window.WootenStatementFleet=Object.freeze({ready,options:(scope,...args)=>scope==='manual'?options():old.options(scope,...args),load:(...args)=>old.load(...args)});
window.addEventListener('wooten-admin-auth-changed',()=>{loadedKey='';baseline='';changed();});
})();
