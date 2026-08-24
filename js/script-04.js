/* Upgrade 10: sticky header + auto-closing CSS target mobile menu */
(function(){
  var header=document.getElementById('site-header');
  var desktopLinks=Array.prototype.slice.call(document.querySelectorAll('.smart-desktop-nav .nav-link'));
  var locations=document.getElementById('locations');

  function setHeaderState(){ if(header) header.classList.toggle('scrolled',window.scrollY>24); }
  setHeaderState();
  window.addEventListener('scroll',setHeaderState,{passive:true});

  document.querySelectorAll('a[href="#locations"]').forEach(function(link){
    link.addEventListener('click',function(){ if(locations && locations.tagName.toLowerCase()==='details') locations.open=true; });
  });

  var sectionMap=desktopLinks.map(function(link){
    var id=link.getAttribute('href');
    var el=id && id.charAt(0)==='#' ? document.querySelector(id) : null;
    return el ? {link:link,el:el} : null;
  }).filter(Boolean);
  function markActive(){
    if(!sectionMap.length) return;
    var marker=window.scrollY+(header?header.offsetHeight:70)+150,active=null;
    sectionMap.forEach(function(item){var top=item.el.getBoundingClientRect().top+window.scrollY;if(top<=marker) active=item;});
    desktopLinks.forEach(function(link){link.classList.remove('active');link.removeAttribute('aria-current');});
    if(active){active.link.classList.add('active');active.link.setAttribute('aria-current','page');}
  }
  markActive();
  window.addEventListener('scroll',markActive,{passive:true});
  window.addEventListener('resize',markActive);
})();
