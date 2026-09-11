(function(root){
  'use strict';
  // Shared catalog for the admin screen and Worker authorization.
  const labels=Object.freeze({
    database:'Database & Imports',
    mas90_health:'MAS 90 Automation Health',
    customer_activity:'Customer Activity Dashboard',
    payment_transactions:'Payment Transactions',
    collections:'Credit & Collections',
    activation:'Account Activation',
    statements:'Statements & Invoices',
    notifications:'Notifications',
    communication:'Communication History',
    communications_settings:'Communication Settings',
    applications:'Account Applications',
    customer_requests:'Customer Requests',
    admin_activity:'Recent Admin Activity',
    database_backup:'Backup & Recovery'
  });
  const tabs=Object.freeze({
    customers:'database',automation:'mas90_health',activity:'customer_activity',
    'payment-transactions':'payment_transactions',collections:'collections',activation:'activation',
    documents:'statements',notifications:'notifications',communication:'communication',
    settings:'communications_settings',applications:'applications',requests:'customer_requests',
    users:'admin_activity',backup:'database_backup'
  });
  const keys=Object.freeze(Object.keys(labels));
  function normalize(value){
    try{if(typeof value==='string')value=JSON.parse(value);}catch{return [];}
    return [...new Set((Array.isArray(value)?value:[]).filter(key=>keys.includes(key)))];
  }
  function has(user,key){return !!user&&(user.owner===true||normalize(user.permissions).includes(key));}
  function canOpen(user,tab){return tab==='dashboard'||has(user,tabs[tab]);}
  function legacyPermissions(value){
    const permissions=new Set(normalize(value));
    for(const [oldKey,newKey] of [['database','mas90_health'],['customer_activity','payment_transactions'],['applications','customer_requests']]){
      if(permissions.has(oldKey))permissions.add(newKey);
    }
    // These two sections were available to every existing admin. Versioned migration
    // preserves that access once; later changes made by the owner remain authoritative.
    permissions.add('admin_activity');permissions.add('database_backup');
    return [...permissions];
  }
  root.WootenAdminAccess=Object.freeze({version:2,keys,labels,tabs,normalize,has,canOpen,legacyPermissions});
})(globalThis);
