
(function(){
  var button=document.getElementById('wootenMobileBackTop');
  if(!button) return;
  function isPhone(){
    return window.matchMedia('(max-width:760px)').matches && window.matchMedia('(pointer:coarse)').matches;
  }
  function longPage(){
    var h=Math.max(document.body.scrollHeight,document.documentElement.scrollHeight);
    return h > window.innerHeight * 1.55;
  }
  function update(){
    var show=isPhone() && longPage() && window.scrollY > Math.max(420,window.innerHeight*.55);
    button.classList.toggle('is-visible',show);
  }
  button.addEventListener('click',function(){
    window.scrollTo({top:0,left:0,behavior:'smooth'});
  });
  window.addEventListener('scroll',update,{passive:true});
  window.addEventListener('resize',update,{passive:true});
  window.addEventListener('load',update,{once:true});
  if(window.ResizeObserver){
    try{new ResizeObserver(update).observe(document.body);}catch(_e){}
  }
  setTimeout(update,250);
})();
