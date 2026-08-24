(function(){
  function initMainMenu(){
    var menu=document.getElementById('mobile-menu');
    var button=document.querySelector('.mobile-menu-button');
    if(!menu || !button) return;

    var closeButton=menu.querySelector('.mobile-menu-close');

    function isOpen(){
      return menu.classList.contains('menu-open');
    }

    function openMenu(){
      menu.classList.add('menu-open');
      menu.setAttribute('aria-hidden','false');
      button.setAttribute('aria-expanded','true');

      /* Remove an old #mobile-menu hash if one is present. */
      if(window.location.hash==='#mobile-menu'){
        history.replaceState(null,'',window.location.pathname+window.location.search);
      }
    }

    function closeMenu(){
      menu.classList.remove('menu-open');
      menu.setAttribute('aria-hidden','true');
      button.setAttribute('aria-expanded','false');

      if(window.location.hash==='#mobile-menu'){
        history.replaceState(null,'',window.location.pathname+window.location.search);
      }
    }

    button.setAttribute('aria-expanded','false');
    menu.setAttribute('aria-hidden','true');

    button.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      if(isOpen()) closeMenu();
      else openMenu();
    });

    if(closeButton){
      closeButton.addEventListener('click',function(event){
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
      });
    }

    /* Menu links still navigate normally, but close the dropdown first. */
    menu.addEventListener('click',function(event){
      var link=event.target.closest('a');
      if(!link || link===closeButton) return;
      closeMenu();
    });

    /* This is the behavior requested: click anywhere else on the page = close. */
    document.addEventListener('click',function(event){
      if(!isOpen()) return;
      if(menu.contains(event.target) || button.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener('keydown',function(event){
      if(event.key==='Escape' && isOpen()){
        closeMenu();
        button.focus();
      }
    });

    window.addEventListener('resize',function(){
      if(window.innerWidth>980 && isOpen()) closeMenu();
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',initMainMenu);
  }else{
    initMainMenu();
  }
})();
