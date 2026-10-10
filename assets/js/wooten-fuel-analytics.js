(()=>{'use strict';
 const root=document.getElementById('fuelMonitorRoot');if(!root)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors=['#2476af','#e79731','#219479','#9463ad','#aa5c53','#738397'];
 const dlg=document.createElement('dialog');dlg.className='fm-analytics-dialog';document.body.append(dlg);
 let state=null;
 const fmt=n=>Math.round(n).toLocaleString('en-US');
 function build(){
  if(!state)return;
  const {data}=state,range=Number(state.range),filter=state.fuel;
  const today=new Date();today.setHours(0,0,0,0);
  const dates=Array.from({length:range},(_,i)=>{const d=new Date(today);d.setDate(d.getDate()-(range-1-i));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
  const tanks=data.tanks.filter(t=>filter==='all'||String(t.number)===filter);
  const datasets=tanks.map(t=>{const map=new Map(t.days.map(d=>[d.day,d]));return {...t,points:dates.map(d=>map.get(d)||{day:d,gallons:0,valid_intervals:0,delivery_indicators:0,excluded_drops:0,sample_count:0})}});
  const totals=dates.map((d,i)=>datasets.reduce((v,t)=>v+Number(t.points[i].gallons||0),0));
  const total=totals.reduce((a,b)=>a+b,0),validDays=dates.filter((d,i)=>datasets.some(t=>Number(t.points[i].valid_intervals)>0)).length;
  const unknown=validDays<Math.max(3,Math.ceil(range*.7));
  const warning=datasets.reduce((n,t)=>n+t.points.reduce((a,d)=>a+Number(d.delivery_indicators||0)+Number(d.excluded_drops||0),0),0);
  dlg.querySelector('[data-total]').textContent=fmt(total)+' gal';
  dlg.querySelector('[data-average]').textContent=validDays?fmt(total/validDays)+' gal/day':'Not enough data';
  dlg.querySelector('[data-coverage]').textContent=validDays+' / '+range+' days observed';
  dlg.querySelector('[data-confidence]').textContent=unknown?'Limited history — estimates may be incomplete':warning?'Review suggested — delivery/adjustment events detected':'Based on available readings';
  dlg.querySelector('[data-confidence]').className='fm-analytics-quality'+(unknown||warning?' warn':'');
  const max=Math.max(10,...totals)*1.15,w=820,h=260,left=52,right=12,top=18,bottom=220,usable=w-left-right;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Estimated daily fuel use in gallons" preserveAspectRatio="none">`;
  for(let j=0;j<5;j++){let y=bottom-j*(bottom-top)/4;svg+=`<path d="M${left} ${y} H${w-right}" stroke="#dce6ef" stroke-dasharray="3 4"/><text x="${left-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#69829a">${fmt(max*j/4)}</text>`}
  dates.forEach((d,i)=>{
   const bw=usable/dates.length,bar=Math.max(1,bw*.68),x=left+i*bw+bw*.16;
   let y=bottom;datasets.forEach(t=>{const v=Number(t.points[i].gallons)||0;let bh=v/max*(bottom-top);if(bh>0){y-=bh;const color=colors[(Number(t.number)-1)%colors.length];svg+=`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bar.toFixed(2)}" height="${bh.toFixed(2)}" fill="${color}" rx="2"><title>${esc(t.fuel)} — ${d}: ${fmt(v)} gal</title></rect>`}});
   if(i%Math.ceil(dates.length/7)===0||i===dates.length-1)svg+=`<text x="${(x+bar/2).toFixed(1)}" y="${bottom+19}" text-anchor="middle" font-size="11" fill="#69829a">${d.slice(5)}</text>`;
  });
  svg+='</svg>';
  dlg.querySelector('[data-chart]').innerHTML=svg;
  dlg.querySelector('[data-products]').innerHTML=datasets.map(t=>{const sum=t.points.reduce((a,d)=>a+Number(d.gallons||0),0),days=t.points.filter(d=>Number(d.valid_intervals)>0).length;return `<tr><td><span class="fm-analytics-dot" style="background:${colors[(Number(t.number)-1)%colors.length]}"></span>${esc(t.fuel)} (Tank ${t.number})</td><td>${fmt(sum)} gal</td><td>${days?fmt(sum/days)+' gal':'—'}</td><td>${days} days</td></tr>`}).join('')||'<tr><td colspan="4">No tanks configured.</td></tr>';
  dlg.querySelector('[data-explanation]').textContent=unknown?'There are not enough recorded days to establish a reliable typical daily rate. Data collection began when this feature was installed.':data.method;
 }
 async function open(id){
  dlg.innerHTML=`<section class="fm-analytics-panel"><header><div><div class="fm-analytics-eyebrow">LOCATION MONITORING</div><h2>Fuel Usage Analytics</h2><p data-title>Loading...</p></div><button type="button" class="fm-analytics-close" aria-label="Close">×</button></header><div class="fm-analytics-content"><div class="fm-analytics-filters"><label>Time period<select data-range><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><label>Fuel product<select data-fuel><option value="all">All fuel products</option></select></label></div><div class="fm-analytics-kpis"><div><small>Estimated usage</small><strong data-total>—</strong></div><div><small>Average on observed days</small><strong data-average>—</strong></div><div><small>Data coverage</small><strong data-coverage>—</strong></div></div><p data-confidence class="fm-analytics-quality">Loading history...</p><h3>Daily fuel consumption</h3><div class="fm-analytics-chart" data-chart></div><h3>Consumption by fuel product</h3><div class="fm-analytics-table-wrap"><table><thead><tr><th>Fuel product</th><th>Estimated use</th><th>Daily avg.</th><th>Observed</th></tr></thead><tbody data-products></tbody></table></div><p class="fm-analytics-explain" data-explanation></p></div><footer><button type="button" class="fm-analytics-close fm-analytics-done">Done</button></footer></section>`;
  const exportBtn=document.createElement('button');exportBtn.type='button';exportBtn.className='fm-analytics-excel';exportBtn.textContent='Export Excel — All Reading History';exportBtn.addEventListener('click',()=>window.WootenFuelHistoryExport.exportLocation(id,exportBtn));dlg.querySelector('footer').prepend(exportBtn);
  dlg.showModal();
  dlg.querySelectorAll('.fm-analytics-close').forEach(b=>b.addEventListener('click',()=>dlg.close()));
  dlg.querySelector('[data-range]').addEventListener('change',e=>{state.range=e.target.value;build()});
  dlg.querySelector('[data-fuel]').addEventListener('change',e=>{state.fuel=e.target.value;build()});
  try{
   const key=document.getElementById('adminKey')?.value.trim();if(!key)throw Error('Admin session expired. Sign in again.');
   const res=await fetch('/api/admin/fuel-monitor?analytics_id='+encodeURIComponent(id),{headers:{'X-Admin-Key':key},cache:'no-store'});
   const data=await res.json();if(!res.ok||!data.success)throw Error(data.error||'Unable to load usage history.');if(!dlg.open)return;
   state={data,range:'7',fuel:'all'};dlg.querySelector('[data-title]').textContent=data.location_name+' · Tank inventory trends';
   dlg.querySelector('[data-fuel]').innerHTML='<option value="all">All fuel products</option>'+data.tanks.map(t=>`<option value="${t.number}">${esc(t.fuel)} — Tank ${t.number}</option>`).join('');build();
  }catch(err){if(dlg.open)dlg.querySelector('[data-confidence]').textContent='Unable to load analytics: '+err.message}
 }
 root.addEventListener('click',e=>{const b=e.target.closest('button[data-fuel-analytics]');if(b)open(b.dataset.fuelAnalytics)});
 dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});
})();
