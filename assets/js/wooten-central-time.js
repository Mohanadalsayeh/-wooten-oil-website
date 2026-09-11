// Shared browser/Worker display helpers. Saved timestamps remain instants in UTC.
(function(root){
  'use strict';
  const zone='America/Chicago';
  const cache=new Map();
  const isoDay=/^\d{4}-\d{2}-\d{2}$/;
  function calendar(value){
    if(typeof value!=='string')return '';
    let s=value.trim(),m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if(m)s=m[3]+'-'+m[1].padStart(2,'0')+'-'+m[2].padStart(2,'0');
    if(!isoDay.test(s))return '';
    const d=new Date(s+'T12:00:00Z');
    return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
  }
  function parse(value){
    if(value===null||value===undefined||value==='')return null;
    if(value instanceof Date)return Number.isFinite(value.getTime())?new Date(value.getTime()):null;
    const day=calendar(value);
    if(typeof value==='string'&&isoDay.test(value.trim())&&!day)return null;
    let s=typeof value==='string'?value.trim():value;
    // SQLite CURRENT_TIMESTAMP and timezone-free API timestamps represent UTC.
    if(day)s=day+'T12:00:00Z';
    else if(typeof s==='string'&&/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)){
      s=s.replace(' ','T');
      if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s))s+='Z';
    }
    const d=new Date(s);
    return Number.isFinite(d.getTime())?d:null;
  }
  function formatter(options){
    const settings={...options,timeZone:zone},key=JSON.stringify(settings);
    if(!cache.has(key))cache.set(key,new Intl.DateTimeFormat('en-US',settings));
    return cache.get(key);
  }
  function parts(value,options){
    const d=parse(value);if(!d)return null;
    return Object.fromEntries(formatter(options).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  }
  function date(value,options={}){
    const d=parse(value);if(!d)return '—';
    return formatter({year:'numeric',month:'short',day:'numeric',...options}).format(d);
  }
  function dateTime(value,options={}){
    if(calendar(value))return date(value);
    const d=parse(value);if(!d)return '—';
    return formatter({year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,timeZoneName:'short',...options}).format(d);
  }
  function dateKey(value=new Date()){
    const day=calendar(value);if(day)return day;
    const p=parts(value,{year:'numeric',month:'2-digit',day:'2-digit'});
    return p?p.year+'-'+p.month+'-'+p.day:'';
  }
  function numericDateTime(value,order='mdy'){
    const p=parts(value,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true,timeZoneName:'short'});
    if(!p)return '—';
    const day=order==='ymd'?p.year+'-'+p.month+'-'+p.day:p.month+'-'+p.day+'-'+p.year;
    return calendar(value)?day:day+' '+p.hour+':'+p.minute+':'+p.second+' '+p.dayPeriod+' '+p.timeZoneName;
  }
  function shiftDate(value,days){
    const key=dateKey(value);if(!key)return '';
    const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);
    return d.toISOString().slice(0,10);
  }
  function dayStart(value,nextDay=false){
    if(!value)return '';
    if(!isoDay.test(value)||calendar(value)!==value)return null;
    const key=nextDay?shiftDate(value,1):value;
    const wall=Date.parse(key+'T00:00:00Z');let guess=wall;
    for(let i=0;i<3;i++){
      const p=parts(guess,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
      const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);
      guess+=wall-shown;
    }
    return new Date(guess).toISOString();
  }
  function text(value){
    return String(value||'').replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})\b/g,stamp=>dateTime(stamp));
  }
  root.WootenTime=Object.freeze({zone,parse,date,dateTime,dateKey,numericDateTime,shiftDate,dayStart,text});
})(globalThis);
