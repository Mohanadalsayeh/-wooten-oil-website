(function(){
  var menu = document.getElementById('mobile-menu');
  var button = document.querySelector('.mobile-menu-button');
  if(!menu || !button) return;

  var previousHash = '';

  button.addEventListener('click', function(){
    if(location.hash !== '#mobile-menu'){
      previousHash = location.hash || '';
    }
  });

  document.addEventListener('click', function(event){
    if(location.hash !== '#mobile-menu') return;

    var clickedMenu = menu.contains(event.target);
    var clickedButton = button.contains(event.target);

    if(clickedMenu || clickedButton) return;

    var base = location.pathname + location.search + (previousHash || '');
    history.replaceState(null, '', base);
  });
})();
