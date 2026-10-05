// Saved statement lists are portal-owned; MAS 90 imports do not change membership.
const LIST_ICONS=new Set(['folder','users','user-round-minus','calendar-days','calendar-clock','mail','mail-x','star','fuel','truck','building-2','church','tractor','store','wrench','shield-check']);
export async function handle(request,env,{verifyCurrentAdminPassword,auditStatement}={}){
 const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
 if(!env.ADMIN_IMPORT_KEY||request.headers.get('X-Admin-Key')!==env.ADMIN_IMPORT_KEY)return json({success:false,error:'Unauthorized.'},401);
 if(!['GET','POST'].includes(request.method))return json({success:false,error:'Use GET or POST.'},405);
 try{
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS statement_saved_lists(id TEXT PRIMARY KEY,name TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS statement_saved_list_members(list_id TEXT NOT NULL,account_number TEXT NOT NULL,PRIMARY KEY(list_id,account_number))').run();
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS statement_saved_list_icons(list_id TEXT PRIMARY KEY,icon TEXT NOT NULL)').run();
  if(request.method==='POST'){
   const body=await request.json(),action=body.action;
   if(!['create','rename','add','remove','move','delete'].includes(action))return json({success:false,error:'Unknown list action.'},400);
   if(action==='delete'&&(typeof verifyCurrentAdminPassword!=='function'||!await verifyCurrentAdminPassword(body.current_admin_password)))return json({success:false,error:'The password for the signed-in admin is incorrect. The list was not deleted.'},403);
   const id=action==='create'?crypto.randomUUID():String(body.id||'');
   if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))return json({success:false,error:'Choose a valid list.'},400);
   const previous=action==='create'?null:await env.DB.prepare("SELECT l.id,l.name,COALESCE(i.icon,'folder') AS icon FROM statement_saved_lists l LEFT JOIN statement_saved_list_icons i ON i.list_id=l.id WHERE l.id=?").bind(id).first();
   if(action!=='create'&&!previous)return json({success:false,error:'This list no longer exists. Reload customers.'},404);
   const name=String(body.name||'').trim();
   if(['create','rename'].includes(action)&&(!name||name.length>80))return json({success:false,error:'Enter a list name of 1–80 characters.'},400);
   const hasIcon=Object.prototype.hasOwnProperty.call(body,'icon');
   if(['create','rename'].includes(action)&&hasIcon&&!LIST_ICONS.has(body.icon))return json({success:false,error:'Choose an available list icon.'},400);
   let accounts=[];
   if(['create','add','remove','move'].includes(action)){
    if(!Array.isArray(body.accounts)||!body.accounts.length||body.accounts.length>10000||body.accounts.some(a=>typeof a!=='string'||!/^\d{7,20}$/.test(a)))return json({success:false,error:'Select valid customer accounts.'},400);
    accounts=[...new Set(body.accounts)];
    if(action!=='remove'){
     const valid=await env.DB.prepare('SELECT COUNT(*) AS count FROM customers WHERE account_number IN (SELECT value FROM json_each(?))').bind(JSON.stringify(accounts)).first();
     if(Number(valid.count)!==accounts.length)return json({success:false,error:'Some customers are no longer available. Reload customers and select them again.'},400);
    }
   }
   let destination='',destinationList=null;
   if(action==='move'){
    destination=String(body.destination_id||'');
    if(!/^[a-zA-Z0-9-]{1,80}$/.test(destination)||destination===id)return json({success:false,error:'Choose a different destination list.'},400);
    destinationList=await env.DB.prepare('SELECT id,name FROM statement_saved_lists WHERE id=?').bind(destination).first();
    if(!destinationList)return json({success:false,error:'The destination list no longer exists. Reload customers.'},404);
    const current=await env.DB.prepare('SELECT COUNT(*) AS count FROM statement_saved_list_members WHERE list_id=? AND account_number IN (SELECT value FROM json_each(?))').bind(id,JSON.stringify(accounts)).first();
    if(Number(current.count)!==accounts.length)return json({success:false,error:'Some checked customers are no longer in this list. Reload customers.'},409);
   }
   const jobs=[];
   if(action==='create')jobs.push(env.DB.prepare('INSERT INTO statement_saved_lists(id,name) VALUES(?,?)').bind(id,name));
   if(action==='rename')jobs.push(env.DB.prepare('UPDATE statement_saved_lists SET name=? WHERE id=?').bind(name,id));
   if(action==='create'||(action==='rename'&&hasIcon))jobs.push(env.DB.prepare('INSERT OR REPLACE INTO statement_saved_list_icons(list_id,icon) VALUES(?,?)').bind(id,hasIcon?body.icon:'folder'));
   if(['create','add'].includes(action))jobs.push(env.DB.prepare('INSERT OR IGNORE INTO statement_saved_list_members(list_id,account_number) SELECT ?,value FROM json_each(?) WHERE EXISTS(SELECT 1 FROM statement_saved_lists WHERE id=?)').bind(id,JSON.stringify(accounts),id));
   if(action==='move'){
    // D1 batch commits both changes together. An insert uses current source membership only.
    jobs.push(env.DB.prepare('INSERT OR IGNORE INTO statement_saved_list_members(list_id,account_number) SELECT ?,m.account_number FROM statement_saved_list_members m WHERE m.list_id=? AND m.account_number IN (SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM statement_saved_lists WHERE id=?)').bind(destination,id,JSON.stringify(accounts),destination));
    jobs.push(env.DB.prepare('DELETE FROM statement_saved_list_members WHERE list_id=? AND account_number IN (SELECT value FROM json_each(?))').bind(id,JSON.stringify(accounts)));
   }
   if(action==='remove')jobs.push(env.DB.prepare('DELETE FROM statement_saved_list_members WHERE list_id=? AND account_number IN (SELECT value FROM json_each(?))').bind(id,JSON.stringify(accounts)));
   if(action==='delete'){jobs.push(env.DB.prepare('DELETE FROM statement_saved_list_icons WHERE list_id=?').bind(id));jobs.push(env.DB.prepare('DELETE FROM statement_saved_list_members WHERE list_id=?').bind(id));jobs.push(env.DB.prepare('DELETE FROM statement_saved_lists WHERE id=?').bind(id));}
   // Commit the list change and its tracking history entry together.
   if(typeof auditStatement!=='function')return json({success:false,error:'List tracking is unavailable. Update the Worker together with the statement list module.'},503);
   const label=action==='create'?name:previous.name;
   let detail='',auditAction='';
   const countText=n=>n+' customer'+(n===1?'':'s');
   if(action==='create'){auditAction='statement_list_created';detail='Created statement list “'+name+'” with '+countText(accounts.length)+'. Icon: '+(hasIcon?body.icon:'folder')+'.';}
   if(action==='rename'){
    auditAction='statement_list_edited';const changes=[];
    if(previous.name!==name)changes.push('Renamed “'+previous.name+'” to “'+name+'”');
    if(hasIcon&&previous.icon!==body.icon)changes.push('Icon changed from '+previous.icon+' to '+body.icon);
    detail=changes.length?changes.join('. ')+'.':'Saved statement list “'+name+'”; name and icon unchanged.';
   }
   if(['add','remove'].includes(action)){
    const row=await env.DB.prepare('SELECT COUNT(*) AS count FROM statement_saved_list_members WHERE list_id=? AND account_number IN (SELECT value FROM json_each(?))').bind(id,JSON.stringify(accounts)).first();
    const affected=action==='add'?accounts.length-Number(row.count):Number(row.count);
    auditAction=action==='add'?'statement_list_customers_added':'statement_list_customers_removed';
    detail=(action==='add'?'Added '+countText(affected)+' to':'Removed '+countText(affected)+' from')+' statement list “'+label+'”.';
   }
   if(action==='move'){auditAction='statement_list_customers_moved';detail='Moved '+countText(accounts.length)+' from statement list “'+label+'” to “'+destinationList.name+'”.';}
   if(action==='delete'){
    const row=await env.DB.prepare('SELECT COUNT(*) AS count FROM statement_saved_list_members WHERE list_id=?').bind(id).first();
    auditAction='statement_list_deleted';detail='Deleted statement list “'+label+'” containing '+countText(Number(row.count))+'. Customer records and their cycles were kept.';
   }
   jobs.push(await auditStatement({action:auditAction,id,detail}));
   await env.DB.batch(jobs);
   return json({success:true,id});
  }
  const lists=await env.DB.prepare('SELECT l.id,l.name,l.created_at,COALESCE(i.icon,\'folder\') AS icon FROM statement_saved_lists l LEFT JOIN statement_saved_list_icons i ON i.list_id=l.id ORDER BY l.created_at,l.id').all();
  const members=await env.DB.prepare('SELECT list_id,account_number FROM statement_saved_list_members ORDER BY account_number').all();
  const byList=new Map();for(const row of members.results||[]){if(!byList.has(row.list_id))byList.set(row.list_id,[]);byList.get(row.list_id).push(row.account_number);}
  return json({success:true,lists:(lists.results||[]).map(row=>({...row,accounts:byList.get(row.id)||[]}))});
 }catch(error){console.error('Statement saved lists:',error);return json({success:false,error:'Customer lists could not be saved or loaded. Please try again.'},500);}
}
