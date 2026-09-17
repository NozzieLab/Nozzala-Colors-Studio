(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.NozzalaTheme=api;api.start();}
})(typeof globalThis!=='undefined'?globalThis:this,root=>{
  'use strict';
  const storageKey='nozzala.ui.theme',holdMs=700;
  const valid=value=>value==='light'||value==='dark';
  function hueColor(hue){
    // Match the 85% / 52% HSL color in the visible orb's body.
    const c=.816,m=.112,h=((hue%360)+360)%360/60,x=c*(1-Math.abs(h%2-1));
    const rgb=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  class LightQueue {
    constructor(send){this.send=send;this.next=null;this.running=null;}
    set(task){
      this.next=task;
      if(!this.running)this.running=this.drain().finally(()=>{this.running=null;});
      return this.running;
    }
    async drain(){
      let failure;
      while(this.next){const task=this.next;this.next=null;try{await this.send(task);failure=null;}catch(error){failure=error;}}
      if(failure)throw failure;
    }
  }
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
  let started=false,preference=null,media,deviceBridge=null,refreshDevice=()=>{};
  function setDeviceBridge(bridge){deviceBridge=bridge;refreshDevice();}
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
      const status=doc.getElementById('egg-status'),connect=doc.getElementById('egg-connect'),off=doc.getElementById('egg-off');
      let closing=false,stopping=false,connecting=false,revision=0;
      function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
      refreshDevice=()=>{
        const online=!!deviceBridge?.connected;
        connect.hidden=!deviceBridge||online;connect.disabled=connecting||closing||!!deviceBridge?.busy;
        off.disabled=!online||closing||stopping;
        doc.getElementById('egg-workspace').hidden=!!deviceBridge;
        lamps.forEach(lamp=>lamp.disabled=closing||stopping);
        doc.getElementById('egg-shuffle').disabled=closing||stopping;
        doc.getElementById('egg-back').disabled=closing;
        if(!online)message(deviceBridge?'连接键盘，让这些颜色亮起来。':'返回工作室连接键盘，即可同步灯光。');
      };
      const queue=new LightQueue(async task=>{
        if(!deviceBridge?.connected)throw new Error('设备已断开');
        if(task.off)await deviceBridge.off();else await deviceBridge.colors(task.colors);
      });
      function syncColors(){
        if(!egg.open||!deviceBridge?.connected||closing||stopping){refreshDevice();return;}
        const current=++revision;
        message('正在同步到键盘…');
        queue.set({colors:shades.map(hueColor)}).then(()=>{if(current===revision)message('六个颜色已同步到键盘。');},error=>{if(current===revision)message(error.message,true);});
      }
      async function stopLights(){
        const current=++revision;stopping=true;refreshDevice();
        try{await queue.set({off:true});if(current===revision)message('所有灯已熄灭。');}
        finally{stopping=false;refreshDevice();}
      }
      async function leave(){
        if(closing)return;closing=true;refreshDevice();
        try{if(deviceBridge?.connected)await stopLights();}catch(error){message(error.message,true);}
        finally{closing=false;egg.close();refreshDevice();}
      }
      const paint=(lamp,i)=>lamp.style.setProperty('--hue',String(shades[i]));
      lamps.forEach((lamp,i)=>{paint(lamp,i);lamp.addEventListener('click',()=>{shades[i]=(shades[i]+47)%360;paint(lamp,i);syncColors();});});
      doc.getElementById('egg-shuffle')?.addEventListener('click',()=>{lamps.forEach((lamp,i)=>{shades[i]=(shades[i]+73)%360;paint(lamp,i);});syncColors();});
      connect.addEventListener('click',async()=>{connecting=true;refreshDevice();let failure;try{await deviceBridge.connect();syncColors();}catch(error){failure=error;}finally{connecting=false;refreshDevice();}if(failure)message(failure.message,true);});
      off.addEventListener('click',()=>stopLights().catch(error=>message(error.message,true)));
      doc.getElementById('egg-back')?.addEventListener('click',leave);
      egg?.addEventListener('cancel',event=>{event.preventDefault();leave();});
      egg?.addEventListener('close',()=>{doc.documentElement.classList.remove('egg-open');opener?.focus();});
      doc.querySelectorAll('[data-theme-toggle]').forEach(button=>{
        const cancel=bindToggle(button,toggle,()=>{if(!egg||egg.open)return;opener=button;doc.documentElement.classList.add('egg-open');egg.showModal();refreshDevice();syncColors();});
        doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancel();});
        root.addEventListener('blur',cancel);
      });
      apply();
      refreshDevice();
    }
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
    media?.addEventListener?.('change',()=>{if(!valid(preference))apply();});
    root.addEventListener('storage',event=>{if(event.key===storageKey){preference=event.newValue;apply();}});
  }
  return {chooseTheme,bindToggle,start,holdMs,hueColor,LightQueue,setDeviceBridge,refreshDevice:()=>refreshDevice()};
});
