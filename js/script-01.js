(function(){
  const groups = [
    '.section-head', '.service-grid', '.fuel-grid', '.oil-card-wrap', '.location-grid',
    '.why-grid', '.cta .container', '.fuel-request-card'
  ];
  document.querySelectorAll(groups.join(',')).forEach(el=>el.classList.add('reveal-on-scroll'));
  document.querySelectorAll('.service-grid > *, .fuel-grid > *, .location-grid > *, .why-grid > *').forEach(el=>el.classList.add('stagger-card'));

  if(!('IntersectionObserver' in window)){
    document.querySelectorAll('.reveal-on-scroll').forEach(el=>el.classList.add('revealed'));
    return;
  }
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('revealed');
        io.unobserve(entry.target);
      }
    });
  },{threshold:.16,rootMargin:'0px 0px -40px 0px'});
  document.querySelectorAll('.reveal-on-scroll').forEach(el=>io.observe(el));
})();
