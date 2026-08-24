(function(){
  function updateOfficeStatus(){
    var box=document.getElementById('hoursStatus'), text=document.getElementById('hoursStatusText');
    if(!box||!text)return;
    try{
      var parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',minute:'numeric',hour12:false}).formatToParts(new Date());
      var o={}; parts.forEach(function(x){o[x.type]=x.value});
      var weekday=o.weekday, mins=(parseInt(o.hour,10)%24)*60+parseInt(o.minute,10);
      var isWeekend=['Sat','Sun'].indexOf(weekday)>-1;
      var weekdayOpen=['Mon','Tue','Wed','Thu','Fri'].indexOf(weekday)>-1 && mins>=480 && mins<990;
      box.classList.remove('open','closed');
      if(isWeekend){ box.classList.add('closed'); text.textContent='Call the Office'; }
      else { box.classList.add(weekdayOpen?'open':'closed'); text.textContent=weekdayOpen?'Open Now':'Closed Now'; }
    }catch(e){text.textContent='Mon–Fri 8 AM–4:30 PM';}
  }
  updateOfficeStatus(); setInterval(updateOfficeStatus,60000);
})();
