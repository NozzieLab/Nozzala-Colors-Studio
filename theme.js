(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.NozzalaTheme=api;api.start();}
})(typeof globalThis!=='undefined'?globalThis:this,root=>{
  'use strict';
  const storageKey='nozzala.ui.theme',holdMs=700;
  const valid=value=>value==='light'||value==='dark';
  function chooseTheme(saved,systemDark){return valid(saved)?saved:systemDark?'dark':'light';}
  function bindToggle(button,toggle,openEgg,clock=root){
    let active=null,timer=null,suppressClick=false;
    function clear(){if(timer!==null)clock.clearTimeout(timer);timer=null;button.classList.remove('holding');}
    function cancel(){clear();if(active)suppressClick=true;active=null;}
    function begin(kind,event){
      clear();suppressClick=false;active={kind,x:event.clientX,y:event.clientY,fired:false};
      button.classList.add('holding');
      timer=clock.setTimeout(()=>{timer=null;if(!active)return;active.fired=true;suppressClick=true;button.classList.remove('holding');openEgg();},holdMs);
    }
    button.addEventListener('pointerdown',event=>{if(event.button===0&&event.isPrimary!==false)begin('pointer',event);});
    button.addEventListener('pointermove',event=>{if(active?.kind==='pointer'&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>10)cancel();});
    button.addEventListener('pointerup',()=>{clear();active=null;});
    button.addEventListener('pointerleave',cancel);
    button.addEventListener('pointercancel',cancel);
    button.addEventListener('blur',cancel);
    button.addEventListener('contextmenu',event=>event.preventDefault());
    button.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();return;}toggle();});
    button.addEventListener('keydown',event=>{
      if(!['Enter',' '].includes(event.key))return;
      event.preventDefault();if(!event.repeat&&!active)begin('keyboard',event);
    });
    button.addEventListener('keyup',event=>{
      if(!['Enter',' '].includes(event.key))return;
      event.preventDefault();const tap=active?.kind==='keyboard'&&!active.fired;clear();active=null;if(tap)toggle();
    });
    return cancel;
  }
  let started=false,preference=null,media;
  function start(){
    if(started||!root.document)return;started=true;
    const doc=root.document;
    media=root.matchMedia?.('(prefers-color-scheme: dark)');
    try{preference=root.localStorage.getItem(storageKey);}catch{}
    function apply(){
      const theme=chooseTheme(preference,!!media?.matches);doc.documentElement.dataset.theme=theme;
      doc.querySelectorAll('[data-theme-toggle]').forEach(button=>{
        button.setAttribute('aria-label',theme==='dark'?'切换到浅色模式':'切换到深色模式');
      });
    }
    function toggle(){
      preference=doc.documentElement.dataset.theme==='dark'?'light':'dark';
      try{root.localStorage.setItem(storageKey,preference);}catch{}
      apply();
    }
    apply(); // Runs in the head, before the page is painted.
    function boot(){
      const egg=doc.getElementById('easter-egg');
      let opener=null;
      const shades=[155,210,265,330,25,65];
      const lamps=[...doc.querySelectorAll('.egg-lamp')];
      const paint=(lamp,i)=>lamp.style.setProperty('--hue',String(shades[i]));
      lamps.forEach((lamp,i)=>{paint(lamp,i);lamp.addEventListener('click',()=>{shades[i]=(shades[i]+47)%360;paint(lamp,i);});});
      doc.getElementById('egg-shuffle')?.addEventListener('click',()=>lamps.forEach((lamp,i)=>{shades[i]=(shades[i]+73)%360;paint(lamp,i);}));
      doc.getElementById('egg-back')?.addEventListener('click',()=>egg.close());
      egg?.addEventListener('close',()=>{doc.documentElement.classList.remove('egg-open');opener?.focus();});
      doc.querySelectorAll('[data-theme-toggle]').forEach(button=>{
        const cancel=bindToggle(button,toggle,()=>{if(!egg||egg.open)return;opener=button;doc.documentElement.classList.add('egg-open');egg.showModal();});
        doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();});
        root.addEventListener('blur',cancel);
      });
      apply();
    }
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
    media?.addEventListener?.('change',()=>{if(!valid(preference))apply();});
    root.addEventListener('storage',event=>{if(event.key===storageKey){preference=event.newValue;apply();}});
  }
  return {chooseTheme,bindToggle,start,holdMs};
});
