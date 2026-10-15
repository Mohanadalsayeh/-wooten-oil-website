(()=>{'use strict';
 const root=document.getElementById('fuelMonitorRoot');if(!root)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Ver1085: soft fuel-specific palette approved for Usage Analytics.
 const fuelPalette={regular:'#6AA8FF',premium:'#57C6B6',road:'#FFCA6B',farm:'#AA95F7',other:'#7995C6'};
 const colorFor=t=>{const n=String(t.fuel||'').toLowerCase();
  if(/farm|off.?road|hsdf/.test(n))return fuelPalette.farm;
  if(/premium|93|super/.test(n))return fuelPalette.premium;
  if(/road|diesel|lsdf|low.?sulfur/.test(n))return fuelPalette.road;
  if(/regular|unleaded|87|gasoline/.test(n))return fuelPalette.regular;
  return fuelPalette.other;
 };
 const dateLabel=iso=>{const a=String(iso).split('-');const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];return (months[Number(a[1])-1]||'')+' '+Number(a[2]);};
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
  // Responsive SVG keeps short month names legible on narrow phone screens.
  const compact=window.innerWidth<=600;
  const max=Math.max(10,...totals)*1.15,w=compact?460:820,h=compact?255:280;
  const left=compact?49:57,right=compact?10:16,top=15,bottom=compact?215:236;
  const usable=w-left-right,step=usable/dates.length;
  let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Estimated daily fuel use in gallons" preserveAspectRatio="xMidYMid meet">`;
  for(let j=0;j<5;j++){
   const y=bottom-j*(bottom-top)/4;
   svg+=`<path d="M${left} ${y} H${w-right}" stroke="#D7E7F8" stroke-dasharray="3 4" stroke-width="1.2"/><text x="${left-9}" y="${y+4}" text-anchor="end" font-size="${compact?13:14}" fill="#6785A6">${fmt(max*j/4)}</text>`;
  }
  dates.forEach((d,i)=>{
   const bar=Math.max(1,step*(compact?.61:.65)),x=left+i*step+(step-bar)/2;
   let y=bottom;
   datasets.forEach(t=>{
    const v=Number(t.points[i].gallons)||0;
    const bh=v/max*(bottom-top);
    if(bh>0){y-=bh;svg+=`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bar.toFixed(2)}" height="${bh.toFixed(2)}" fill="${colorFor(t)}" rx="2.5"><title>${esc(t.fuel)} — ${dateLabel(d)}: ${fmt(v)} gal</title></rect>`;}
   });
   if(i%Math.ceil(dates.length/(compact?7:10))===0||i===dates.length-1){
    svg+=`<text x="${(x+bar/2).toFixed(1)}" y="${bottom+21}" text-anchor="middle" font-size="${compact?13:14}" fill="#5F80A7">${dateLabel(d)}</text>`;
   }
  });
  svg+='</svg>';
  const legend=[...new Map(datasets.map(t=>[String(t.fuel||''),{name:String(t.fuel||''),color:colorFor(t)}])).values()];
  dlg.querySelector('[data-chart]').innerHTML=svg+'<div class="fm-analytics-legend" aria-label="Chart fuel products">'+legend.map(t=>`<span><i style="background:${t.color}"></i>${esc(t.name)}</span>`).join('')+'</div>';
  dlg.querySelector('[data-products]').innerHTML=datasets.map(t=>{const sum=t.points.reduce((a,d)=>a+Number(d.gallons||0),0),days=t.points.filter(d=>Number(d.valid_intervals)>0).length;return `<tr><td><span class="fm-analytics-dot" style="background:${colorFor(t)}"></span>${esc(t.fuel)} (Tank ${t.number})</td><td>${fmt(sum)} gal</td><td>${days?fmt(sum/days)+' gal':'—'}</td><td>${days} days</td></tr>`}).join('')||'<tr><td colspan="4">No tanks configured.</td></tr>';
  dlg.querySelector('[data-explanation]').textContent=unknown?'There are not enough recorded days to establish a reliable typical daily rate. Data collection began when this feature was installed.':data.method;
 }
 async function open(id){
  dlg.innerHTML=`<section class="fm-analytics-panel fm-analytics-modern"><header><div class="fm-analytics-heading"><div class="fm-analytics-eyebrow">LOCATION MONITORING</div><h2>Fuel Usage Analytics</h2><p data-title>Loading...</p></div><button type="button" class="fm-analytics-close" aria-label="Close">×</button></header><div class="fm-analytics-content"><div class="fm-analytics-filters"><label>Time period<select data-range><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><label>Fuel product<select data-fuel><option value="all">All fuel products</option></select></label></div><div class="fm-analytics-kpis"><div><span class="fm-kpi-icon"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16"/><path d="M2 21h16M7 6h7v6H7zM17 8l3 3v6a2 2 0 0 0 4 0v-5l-4-4"/></svg></span><span class="fm-kpi-copy"><small>Estimated usage</small><strong data-total>—</strong></span></div><div><span class="fm-kpi-icon"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M5 20v-5M12 20V9M19 20V4"/></svg></span><span class="fm-kpi-copy"><small>Average on observed days</small><strong data-average>—</strong></span></div><div><span class="fm-kpi-icon"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg></span><span class="fm-kpi-copy"><small>Data coverage</small><strong data-coverage>—</strong></span></div></div><p data-confidence class="fm-analytics-quality">Loading history...</p><h3>Daily fuel consumption</h3><div class="fm-analytics-chart" data-chart></div><h3>Consumption by fuel product</h3><div class="fm-analytics-table-wrap"><table><thead><tr><th scope="col">Fuel product</th><th scope="col">Estimated use</th><th scope="col">Daily average</th><th scope="col">Observed days</th></tr></thead><tbody data-products></tbody></table></div><p class="fm-analytics-explain" data-explanation></p></div><footer><button type="button" class="fm-analytics-close fm-analytics-done">Done</button></footer></section>`;
  const exportBtn=document.createElement('button');exportBtn.type='button';exportBtn.className='fm-analytics-excel';exportBtn.textContent='Export Excel — All Reading History';exportBtn.addEventListener('click',()=>window.WootenFuelHistoryExport.exportLocation(id,exportBtn));exportBtn.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg><span>Export Excel — All Reading History</span>';dlg.querySelector('footer').prepend(exportBtn);
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
