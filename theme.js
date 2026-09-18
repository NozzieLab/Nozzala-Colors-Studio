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
  let started=false,preference=null,media,deviceBridge=null,refreshDevice=()=>{},deviceKey=()=>{};
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
      let closing=false,stopping=false,connecting=false,switching=false,revision=0,view='colors',game=null,rhythm=null,sound=null,lastGamePhase=null;
      function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
      refreshDevice=()=>{
        const online=!!deviceBridge?.connected;
        connect.hidden=!deviceBridge||online;connect.disabled=connecting||closing||!!deviceBridge?.busy;
        off.disabled=!online||closing||stopping;
        doc.getElementById('egg-workspace').hidden=!!deviceBridge;
        lamps.forEach(lamp=>lamp.disabled=closing||stopping);
        doc.getElementById('egg-shuffle').disabled=closing||stopping;
        doc.getElementById('egg-back').disabled=closing;
        for(const id of ['egg-colors-tab','egg-game-tab','egg-rhythm-tab','egg-sound-tab'])doc.getElementById(id).disabled=closing||stopping||switching;
        updateGameControls();rhythm?.refresh();sound?.refresh();
        if(!online){rhythm?.disconnect();if(game){game.held.fill(false);if(game.active)game.stop('disconnected');}if(view!=='sound')message(deviceBridge?(view!=='colors'?'连接键盘后开始游戏。':'连接键盘，让这些颜色亮起来。'):'返回工作室连接键盘，即可同步灯光。');}
      };
      const queue=new LightQueue(async task=>{
        if(!deviceBridge?.connected)throw new Error('设备已断开');
        if(task.off)await deviceBridge.off();else if(Object.hasOwn(task,'audio'))await deviceBridge.audio(task.audio);else if(Object.hasOwn(task,'mole'))await deviceBridge.mole(task.mole);else if(Object.hasOwn(task,'rhythm'))await deviceBridge.rhythm(task.rhythm);else await deviceBridge.colors(task.colors);
      });
      const gameText=new Map();
      function text(id,value){if(gameText.get(id)===String(value))return;gameText.set(id,String(value));doc.getElementById(id).textContent=value;}
      function updateGameControls(){
        if(!game)return;
        const locked=game.active||game.phase==='finishing';
        doc.getElementById('mole-start').disabled=locked||!deviceBridge?.connected||closing||stopping||switching||!!deviceBridge?.busy;
        doc.getElementById('mole-difficulty').disabled=locked;
        doc.getElementById('mole-stop').hidden=!locked;
        doc.getElementById('mole-stop').disabled=game.phase==='finishing';
      }
      function renderGame(state){
        text('mole-time',state.remaining);text('mole-score',state.score);text('mole-target',state.target===null?'—':String(state.target+1).padStart(2,'0'));
        doc.querySelectorAll('[data-mole]').forEach(hole=>hole.classList.toggle('active',Number(hole.dataset.mole)===state.target));
        const feedback={hit:'命中！+10',wrong:'错按了，−5',miss:'地鼠溜走了。'}[state.feedback]||(state.phase==='starting'?'准备灯光…':state.phase==='playing'?'按亮起的实体按键。':'按实体键盘上亮起的按键。');
        text('mole-feedback',feedback);doc.getElementById('mole-feedback').dataset.kind=state.feedback;
        doc.getElementById('mole-result').hidden=state.phase!=='finished';
        for(const selector of ['.mole-board','.mole-hud','#mole-feedback'])doc.querySelector(selector).hidden=state.phase==='finished';
        text('mole-start',state.phase==='finished'?'再玩一局':'开始 60 秒');
        if(state.phase==='finished'){
          text('mole-result-title',state.reason==='complete'?'时间到！本局得分':state.reason==='disconnected'?'连接中断，本局结束':state.reason==='hidden'?'页面已离开，本局结束':state.reason==='error'?'连接异常，本局结束':'本局提前结束');
          text('mole-final',state.score);text('mole-hits',state.hits);text('mole-wrong',state.wrong);text('mole-misses',state.misses);
        }
        if(state.phase!==lastGamePhase){
          lastGamePhase=state.phase;
          if(state.phase==='playing')message('游戏进行中，只按亮起的键。');
          if(state.phase==='finished')message(state.error||'本局已结束，所有灯已熄灭。',!!state.error);
        }
        updateGameControls();
      }
      game=new root.NozzalaMole.Game({light:key=>queue.set({mole:key}),onChange:renderGame});
      rhythm=root.NozzalaRhythmUI.create({doc,connected:()=>!!deviceBridge?.connected,busy:()=>closing||stopping||switching||!!deviceBridge?.busy,sendMask:mask=>queue.set({rhythm:mask}),off:()=>queue.set({off:true}),message,onState:()=>refreshDevice()});
      sound=root.NozzalaSoundUI.create({doc,connected:()=>!!deviceBridge?.connected,busy:()=>closing||stopping||switching||!!deviceBridge?.busy,sendFrame:frame=>queue.set({audio:frame}),off:()=>queue.set({off:true}),message,onState:()=>refreshDevice()});
      deviceKey=event=>{game.key(event.key,event.pressed);rhythm.key(event);};
      renderGame(game.snapshot());
      const difficulty=doc.getElementById('mole-difficulty');
      difficulty.addEventListener('change',()=>text('mole-level-note',({easy:'地鼠停留 1.4 秒',normal:'地鼠停留 0.9 秒',hard:'地鼠停留 0.55 秒'})[difficulty.value]));
      doc.getElementById('mole-start').addEventListener('click',()=>{if(!deviceBridge?.connected)return;++revision;game.start(difficulty.value).catch(error=>message(error.message,true));});
      doc.getElementById('mole-stop').addEventListener('click',()=>game.stop('cancelled'));
      async function mode(next){
        if(next===view||switching||closing)return;
        switching=true;++revision;refreshDevice();
        try{
          if(game.active||game.phase==='finishing')await game.stop('cancelled');if(rhythm.active||rhythm.phase==='finishing')await rhythm.stop('cancelled');
          if(sound.active||sound.phase==='finishing')await sound.stop('cancelled');
          if(deviceBridge?.connected)await stopLights();
          view=next;egg.scrollTop=0;
          doc.getElementById('egg-colors-panel').hidden=view!=='colors';doc.getElementById('mole-panel').hidden=view!=='game';doc.getElementById('rhythm-panel').hidden=view!=='rhythm';rhythm.setVisible(view==='rhythm');
          doc.getElementById('sound-panel').hidden=view!=='sound';sound.setVisible(view==='sound');
          doc.querySelector('.egg-page').classList.toggle('game-view',view==='game');doc.querySelector('.egg-page').classList.toggle('rhythm-view',view==='rhythm');
          doc.querySelector('.egg-page').classList.toggle('sound-view',view==='sound');
          doc.getElementById('egg-colors-tab').setAttribute('aria-pressed',String(view==='colors'));doc.getElementById('egg-game-tab').setAttribute('aria-pressed',String(view==='game'));doc.getElementById('egg-rhythm-tab').setAttribute('aria-pressed',String(view==='rhythm'));
          doc.getElementById('egg-sound-tab').setAttribute('aria-pressed',String(view==='sound'));
          doc.getElementById('egg-title').textContent=view==='game'?'打地鼠':view==='rhythm'?'六键音游':view==='sound'?'音乐律动':'你找到了。';doc.getElementById('egg-subtitle').textContent=view==='game'?'亮哪一键，就打哪一键。':view==='rhythm'?'跟着音乐，让每一下都踩准节拍。':view==='sound'?'让声音变成灯光。':'给灯光一点玩心。';
          if(view==='colors')syncColors();else message(view==='sound'?'点击开启麦克风，即可开始。':view==='rhythm'?'选择曲目，按判定线击打。':'选择难度，开始 60 秒挑战。');
        }catch(error){message(error.message,true);}finally{switching=false;refreshDevice();}
      }
      doc.getElementById('egg-colors-tab').addEventListener('click',()=>mode('colors'));doc.getElementById('egg-game-tab').addEventListener('click',()=>mode('game'));doc.getElementById('egg-rhythm-tab').addEventListener('click',()=>mode('rhythm'));
      doc.getElementById('egg-sound-tab').addEventListener('click',()=>mode('sound'));
      doc.addEventListener('visibilitychange',()=>{if(doc.hidden){if(game.active)game.stop('hidden');if(rhythm.active)rhythm.stop('hidden');if(sound.active)sound.stop('hidden');}});
      function syncColors(){
        if(view!=='colors'||!egg.open||!deviceBridge?.connected||closing||stopping){refreshDevice();return;}
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
        try{if(game.active||game.phase==='finishing')await game.stop('cancelled');if(rhythm.active||rhythm.phase==='finishing')await rhythm.stop('cancelled');if(sound.active||sound.phase==='finishing')await sound.stop('cancelled');if(deviceBridge?.connected)await stopLights();}catch(error){message(error.message,true);}
        finally{closing=false;egg.close();refreshDevice();}
      }
      const paint=(lamp,i)=>lamp.style.setProperty('--hue',String(shades[i]));
      lamps.forEach((lamp,i)=>{paint(lamp,i);lamp.addEventListener('click',()=>{shades[i]=(shades[i]+47)%360;paint(lamp,i);syncColors();});});
      doc.getElementById('egg-shuffle')?.addEventListener('click',()=>{lamps.forEach((lamp,i)=>{shades[i]=(shades[i]+73)%360;paint(lamp,i);});syncColors();});
      connect.addEventListener('click',async()=>{connecting=true;refreshDevice();let failure;try{await deviceBridge.connect();if(view==='colors')syncColors();else if(deviceBridge.connected)message(view==='sound'?(sound.active?'正在把声音变成灯光。':'点击开启麦克风，即可开始。'):view==='rhythm'?'选择曲目，按判定线击打。':'选择难度，开始 60 秒挑战。');}catch(error){failure=error;}finally{connecting=false;refreshDevice();}if(failure)message(failure.message,true);});
      off.addEventListener('click',()=>{if(game.active||game.phase==='finishing')game.stop('cancelled');else if(rhythm.active||rhythm.phase==='finishing')rhythm.stop('cancelled');else if(sound.active||sound.phase==='finishing')sound.stop('cancelled');else stopLights().catch(error=>message(error.message,true));});
      doc.getElementById('egg-back')?.addEventListener('click',leave);
      egg?.addEventListener('cancel',event=>{event.preventDefault();leave();});
      egg?.addEventListener('close',()=>{if(sound.active)sound.stop('hidden');sound.setVisible(false);doc.documentElement.classList.remove('egg-open');opener?.focus();});
      doc.querySelectorAll('[data-theme-toggle]').forEach(button=>{
        const cancel=bindToggle(button,toggle,()=>{if(!egg||egg.open)return;opener=button;doc.documentElement.classList.add('egg-open');egg.showModal();egg.scrollTop=0;refreshDevice();if(view==='colors')syncColors();else if(view==='sound'){sound.setVisible(true);message('点击开启麦克风，即可开始。');}else if(deviceBridge?.connected)message(view==='rhythm'?'选择曲目，按判定线击打。':'选择难度，开始 60 秒挑战。');});
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
  return {chooseTheme,bindToggle,start,holdMs,hueColor,LightQueue,setDeviceBridge,refreshDevice:()=>refreshDevice(),deviceKey:event=>deviceKey(event)};
});
