/* Ver729: paired manual date fields; independent period behavior retained. */
(()=>{'use strict';
 const roots=[...document.querySelectorAll('[data-statement-fleet]')],states=new Map();
 const frequencyControl=document.getElementById('scheduleWeeklyFrequency');
 let frequencyDirty=false;
 const cycleFrequency=()=>frequencyControl?.value==='biweekly'?'biweekly':'weekly';
 frequencyControl?.addEventListener('change',()=>{frequencyDirty=true;for(const state of states.values())if(!state.manual)refresh(state);});
 const today=()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;};
 const shift=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 for(const root of roots){
  const scope=root.dataset.statementFleet,id='statementFleet-'+scope,manual=scope==='manual',keys=manual?['manual']:['A','B'];
  if(manual)root.innerHTML=`<h3>Fleet Cards &amp; Transactions</h3><label class="sf-enabled"><input type="checkbox" data-sf-enabled checked> Include fleet cards and transactions</label><p>Grouped by card, with total gallons for each card. Prices and sale amounts are not included.</p><div class="sf-period-panel" role="group" aria-labelledby="${id}-period-title"><h4 id="${id}-period-title" class="sf-period-title"><span aria-hidden="true"></span>Transaction period</h4><div class="sf-date-pair"><div class="sf-date-field"><label for="${id}-manual-from">From</label><input id="${id}-manual-from" type="date" data-sf-cycle="manual" data-sf-bound="from" aria-describedby="${id}-from-note"><small id="${id}-from-note">Starting at 12:00 AM</small></div><div class="sf-date-field"><label for="${id}-manual-to">To</label><input id="${id}-manual-to" type="date" data-sf-cycle="manual" data-sf-bound="to" aria-describedby="${id}-to-note"><small id="${id}-to-note">Through the end of the day</small></div></div></div><div class="sf-period-footer"><small>Central time · Up to 92 days</small><button type="button" class="sf-default-dates" data-sf-reset>Use default dates</button></div><p class="sf-help">To defaults to the generation date and can be changed. For today, transactions run through the latest available retrieval. Saved API results must cover the period; sync the required dates in Fleet Cards &amp; Transactions if prompted.</p>`;
  else root.innerHTML=`<h3>Fleet Cards &amp; Transactions</h3><label class="sf-enabled"><input type="checkbox" data-sf-enabled checked> Include fleet cards and transactions</label><p>Grouped by card, with total gallons for each card. Prices and sale amounts are not included.</p>${manual?'':'<p>Cycle B default dates follow the frequency selected in Cycle B settings.</p>'}<div class="sf-ranges">${keys.map(c=>`<fieldset><legend>${manual?'Transaction period':'Cycle '+c+(c==='A'?' — 30 days back':'')}</legend><label for="${id}-${c}-from">From — 12:00 AM</label><input id="${id}-${c}-from" type="date" data-sf-cycle="${c}" data-sf-bound="from"><label for="${id}-${c}-to">To — through this day</label><input id="${id}-${c}-to" type="date" data-sf-cycle="${c}" data-sf-bound="to"></fieldset>`).join('')}</div><button type="button" class="secondary" data-sf-reset>Use default dates</button><p class="sf-help">Central time. To defaults to the generation date and can be changed. For today, transactions run through the latest available retrieval. Saved API results must cover the period; sync the required dates in Fleet Cards &amp; Transactions if prompted.</p>`;
  const state={root,manual,keys,dirty:false,ranges:Object.fromEntries(keys.map(k=>[k,{from:'',to:''}]))};states.set(scope,state);
  root.addEventListener('change',event=>{state.dirty=true;const c=event.target.dataset.sfCycle,b=event.target.dataset.sfBound;if(c&&b)state.ranges[c][b]=event.target.value;refresh(state);});
  root.querySelector('[data-sf-reset]').addEventListener('click',()=>{state.dirty=true;state.ranges=Object.fromEntries(state.keys.map(k=>[k,{from:'',to:''}]));refresh(state,true,true);});
  refresh(state);
 }
 function refresh(state,controls=true,force=false){
  const root=state.root,enabled=root.querySelector('[data-sf-enabled]').checked,frequency=cycleFrequency();
  for(const c of state.keys){
   const r=state.ranges[c],to=r.to||today(),days=state.manual||c==='A'?30:frequency==='biweekly'?14:7;
   const a=root.querySelector(`[data-sf-cycle="${c}"][data-sf-bound="from"]`),b=root.querySelector(`[data-sf-cycle="${c}"][data-sf-bound="to"]`);
   if(force||document.activeElement!==a)a.value=r.from||(valid(to)?shift(to,-days):'');
   if(force||document.activeElement!==b)b.value=to;
   if(controls)a.disabled=b.disabled=!enabled;
  }
  if(controls){root.querySelector('[data-sf-reset]').disabled=!enabled;}
 }
 function options(scope,freeze=false){
  const s=states.get(scope);if(!s)throw Error('Reload the page to load fleet statement controls.');refresh(s,false);
  const enabled=s.root.querySelector('[data-sf-enabled]').checked;
  for(const c of s.keys){
   const a=s.root.querySelector(`[data-sf-cycle="${c}"][data-sf-bound="from"]`),b=s.root.querySelector(`[data-sf-cycle="${c}"][data-sf-bound="to"]`);
   if(enabled&&(!valid(a.value)||!valid(b.value)||a.value>b.value||Date.parse(b.value)-Date.parse(a.value)>91*86400000)){a.focus();throw Error('Choose valid fleet dates'+(s.manual?'':' for Cycle '+c)+', up to 92 calendar days.');}
  }
  if(s.manual){const range=Object.fromEntries(['from','to'].map(b=>[b,s.root.querySelector(`[data-sf-cycle="manual"][data-sf-bound="${b}"]`).value]));return {enabled,frequency:'weekly',ranges:{A:{...range},B:{...range}}};}
  return {enabled,frequency:cycleFrequency(),ranges:freeze?Object.fromEntries(['A','B'].map(c=>[c,Object.fromEntries(['from','to'].map(b=>[b,s.root.querySelector(`[data-sf-cycle="${c}"][data-sf-bound="${b}"]`).value]))])):JSON.parse(JSON.stringify(s.ranges))};
 }
 let loaded=false,loading=null;
 function load(value,frequency='weekly'){
  loaded=true;
  try{if(typeof value==='string')value=JSON.parse(value);}catch{return;}
  value=value||{};
  if(!frequencyDirty&&frequencyControl)frequencyControl.value=frequency==='biweekly'?'biweekly':'weekly';
  for(const s of states.values()){if(s.manual||s.dirty)continue;s.root.querySelector('[data-sf-enabled]').checked=value.enabled!==false;for(const c of ['A','B'])s.ranges[c]={from:value.ranges?.[c]?.from||'',to:value.ranges?.[c]?.to||''};refresh(s);}
 }
 async function ready(){
  if(loaded)return;
  if(loading)return loading;
  const key=document.getElementById('adminKey')?.value.trim();
  if(!key)throw Error('Sign in to load statement settings.');
  loading=(async()=>{const response=await fetch('/api/admin/statement-scheduling?compact=1',{headers:{'X-Admin-Key':key},cache:'no-store'});const data=await response.json();if(document.getElementById('adminKey')?.value.trim()!==key)throw Error('Admin session changed.');if(!response.ok||!data.success)throw Error(data.error||'Statement settings could not be loaded.');load(data.config?.fleet_json,data.config?.weekly_frequency);})().finally(()=>{loading=null;});
  return loading;
 }
 window.addEventListener('wooten-admin-auth-changed',()=>{loaded=false;frequencyDirty=false;if(frequencyControl)frequencyControl.value='weekly';for(const s of states.values()){s.dirty=false;s.ranges=Object.fromEntries(s.keys.map(k=>[k,{from:'',to:''}]));s.root.querySelector('[data-sf-enabled]').checked=true;refresh(s,true,true);}});
 window.WootenStatementFleet=Object.freeze({options,load,ready});
})();
