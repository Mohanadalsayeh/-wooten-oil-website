(function(){
  'use strict';
  if(window.WootenNotificationSound) return;
  var soundUrl=new URL('../audio/notification-rising-trio.mp3',document.currentScript.src).href;
  var context=null;
  var audioBuffer=null;
  var loading=null;
  var interacted=false;
  var lastRequestedAt=-Infinity;

  function getContext(){
    if(context && context.state!=='closed') return context;
    var AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext) return null;
    try{context=new AudioContext();}catch(_error){return null;}
    return context;
  }

  function load(c){
    if(audioBuffer) return Promise.resolve(audioBuffer);
    if(loading) return loading;
    loading=fetch(soundUrl,{credentials:'same-origin'}).then(function(response){
      if(!response.ok) throw new Error('Notification audio unavailable');
      return response.arrayBuffer();
    }).then(function(bytes){
      return c.decodeAudioData(bytes);
    }).then(function(buffer){
      audioBuffer=buffer;
      return buffer;
    }).catch(function(){return null;}).finally(function(){loading=null;});
    return loading;
  }

  function resume(c){
    try{
      if(c.state==='running') return Promise.resolve();
      return Promise.resolve(c.resume()).catch(function(){});
    }catch(_error){return Promise.resolve();}
  }

  function unlock(){
    interacted=true;
    var c=getContext();
    if(!c) return;
    // Resume in the user gesture; decoding never plays the sound by itself.
    resume(c);
    load(c);
  }

  async function play(){
    if(!interacted || document.hidden) return;
    var requestedAt=Date.now();
    if(requestedAt-lastRequestedAt<1600) return;
    var c=getContext();
    if(!c) return;
    lastRequestedAt=requestedAt;
    try{
      var result=await Promise.all([load(c),resume(c)]);
      // Drop stale alerts rather than playing them after a delayed download.
      if(!result[0] || c.state!=='running' || document.hidden || Date.now()-requestedAt>3000) return;
      var source=c.createBufferSource();
      source.buffer=result[0];
      source.connect(c.destination);
      source.onended=function(){source.disconnect();};
      source.start();
    }catch(_error){/* Audio failures must not interrupt notifications. */}
  }

  ['pointerdown','touchstart','keydown'].forEach(function(type){
    window.addEventListener(type,unlock,{capture:true,passive:true});
  });
  window.WootenNotificationSound={play:play,unlock:unlock};
})();
