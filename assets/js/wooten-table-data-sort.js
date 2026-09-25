/* Full-result sort adapters. Renderers apply these orders before slicing pages. */
(()=>{
 const registry=new WeakMap();
 const collator=new Intl.Collator('en-US',{numeric:true,sensitivity:'base'});
 function compare(a,b){if(typeof a==='number'&&!Number.isFinite(a))a=null;if(typeof b==='number'&&!Number.isFinite(b))b=null;if(a==null||a==='')return b==null||b===''?0:1;if(b==null||b==='')return -1;if(typeof a==='number'&&typeof b==='number')return a-b;return collator.compare(String(a),String(b));}
 function register(table,columns,onChange,dropdown){
  if(!table)throw Error('Missing sortable table');if(registry.has(table))return registry.get(table);
  let state=null;
  function syncState(){if(state&&dropdown&&dropdown.value!=='__table_header__')adapter.clear();}
  const adapter={
   apply(rows){syncState();if(!state)return rows.slice();const column=columns[state.index],get=typeof column==='function'?column:r=>r[column];return rows.map((row,index)=>({row,index})).sort((a,b)=>compare(get(a.row),get(b.row))*(state.direction==='ascending'?1:-1)||a.index-b.index).map(x=>x.row);},
   key(){syncState();return state?columns[state.index]+'_'+(state.direction==='ascending'?'asc':'desc'):'';},
   active(){syncState();return !!state;},
   column(){return state?.index??-1;},
   direction(){return state?.direction||'ascending';},
   restore(index,direction){if(columns[index]==null)return;state={index,direction};table.dataset.fullSortColumn=String(index);table.dataset.fullSortDirection=direction;},
   clear(){state=null;delete table.dataset.fullSortColumn;delete table.dataset.fullSortDirection;table.querySelectorAll('th[aria-sort]').forEach(th=>th.setAttribute('aria-sort','none'));},
   async change(index,direction){if(columns[index]==null)return;state={index,direction};table.dataset.fullSortColumn=String(index);table.dataset.fullSortDirection=direction;
    if(dropdown){let option=dropdown.querySelector('option[value="__table_header__"]');if(!option){option=new Option('Column header order','__table_header__');dropdown.add(option);}dropdown.value='__table_header__';}
    return onChange();}
  };
  table.wootenSortAll=adapter.change;table.dataset.fullDataSort='true';
  Array.from(table.tHead?.rows[0]?.cells||[]).forEach((th,i)=>{if(columns[i]==null)th.setAttribute('data-no-sort','');});
  if(dropdown)dropdown.addEventListener('change',()=>{if(dropdown.value!=='__table_header__')adapter.clear();});
  registry.set(table,adapter);return adapter;
 }
 window.WootenTableDataSort={register,compare,get:table=>registry.get(table)};
})();
