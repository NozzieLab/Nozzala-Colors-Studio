(function(root){
  'use strict';
  function create({doc,connected,busy,sendMask,off,message,onState}){
    const R=root.NozzalaRhythm,$=id=>doc.getElementById(id),songs=[...root.NozzalaMusic],player=new R.Player();
    let phase='idle',loading=false,game=null,song=null,raf=null,token=0,stopping=null,visible=false,offset=0,flight=2200,lastMask=-1,lastMaskAt=-Infinity,finishReason='',error='';
    const held=Array(6).fill(false),texts=new Map(),canvas=$('rhythm-canvas'),ctx=canvas.getContext('2d');
    const colors=['#90ccdb','#dfb178','#a4c97d','#c2a1e5','#e496a6','#89cabb'];
    const text=(id,value)=>{if(texts.get(id)!==String(value)){texts.set(id,String(value));$(id).textContent=value;}};
    const format=s=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s))%60).padStart(2,'0')}`;
    const active=()=>phase==='starting'||phase==='playing';
    function options(){const selected=$('rhythm-song').value;$('rhythm-song').replaceChildren();songs.forEach(s=>{const option=doc.createElement('option');option.value=s.id;option.textContent=`${s.title} · ${format(s.duration)}`;$('rhythm-song').append(option);});if(songs.some(s=>s.id===selected))$('rhythm-song').value=selected;}
    function refresh(){
      const locked=loading||active()||phase==='finishing';
      for(const id of ['rhythm-song','rhythm-difficulty','rhythm-speed','rhythm-offset','rhythm-import'])$(id).disabled=locked;
      $('rhythm-start').disabled=locked||!connected()||busy();$('rhythm-stop').hidden=!locked;$('rhythm-stop').disabled=phase==='finishing';
      text('rhythm-start',phase==='finished'?'再玩一局':'开始演奏');
    }
    function stats(){
      const state=game?.snapshot()||{score:0,accuracy:1,combo:0,maxCombo:0,counts:Array(6).fill(0)};
      text('rhythm-score',state.score.toLocaleString('en-US'));text('rhythm-combo',state.combo);text('rhythm-accuracy',(state.accuracy*100).toFixed(2)+'%');
      if(phase==='finished'){
        text('rhythm-final-title',finishReason==='complete'?'演奏完成':finishReason==='disconnected'?'连接中断，本局结束':finishReason==='hidden'?'页面已离开，本局结束':'本局提前结束');
        text('rhythm-final',state.score.toLocaleString('en-US'));text('rhythm-max-combo',state.maxCombo);text('rhythm-final-accuracy',(state.accuracy*100).toFixed(2)+'%');
        R.grades.forEach((grade,i)=>text('rhythm-count-'+i,state.counts[i]));
      }
    }
    function paint(time=-1500){
      const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(2,root.devicePixelRatio||1),w=Math.round(rect.width),h=Math.round(rect.height);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const width=w/6,line=h-64;
      for(let i=0;i<6;i++){ctx.fillStyle=i%2?'#182229':'#1d2730';ctx.fillRect(i*width,0,width-1,h);}
      const notes=game?.notes||R.chart(songs.find(s=>s.id===$('rhythm-song').value)||songs[0],$('rhythm-difficulty').value);
      for(const note of notes){if(note.time<time-250||note.time>time+flight||note.result!=null)continue;const y=line-(note.time-time)/flight*(line-12);ctx.fillStyle=colors[note.lane];ctx.fillRect(note.lane*width+5,y-5,width-10,10);ctx.fillStyle='#ffffff7a';ctx.fillRect(note.lane*width+5,y-5,width-10,2);}
      ctx.fillStyle='#ecf2e6';ctx.fillRect(0,line,w,2);
      for(let i=0;i<6;i++){const physical=R.order[i],y=line+12+(i%2)*9;ctx.fillStyle=held[physical]?colors[i]:'#35434c';ctx.fillRect(i*width+5,y,width-10,28);ctx.fillStyle=held[physical]?'#18222a':'#d3dfdb';ctx.font='600 12px sans-serif';ctx.textAlign='center';ctx.fillText(String(physical+1).padStart(2,'0'),(i+.5)*width,y+19);}
    }
    function preview(){if(phase==='idle'||phase==='finished'){game=null;phase='idle';$('rhythm-result').hidden=true;$('rhythm-stage').hidden=false;stats();refresh();text('rhythm-time',format((songs.find(s=>s.id===$('rhythm-song').value)||songs[0]).duration));paint();}}
    function loop(){
      if(phase!=='playing')return;
      const time=player.time();game.advance(time-offset);stats();paint(time);
      text('rhythm-time',format(Math.max(0,song.duration-Math.max(0,time)/1000)));
      text('rhythm-judgement',time<0?'准备':game.last?.grade||'');
      let mask=0;for(const n of game.notes){if(n.time>time+80)break;if(n.time>=time-80&&n.result===null)mask|=1<<R.order[n.lane];}
      held.forEach((down,key)=>{if(down)mask|=1<<key;});
      if(mask!==lastMask&&time-lastMaskAt>=45){lastMask=mask;lastMaskAt=time;const generation=token;sendMask(mask).catch(e=>{if(generation===token){error=e.message;stop('error');}});}
      if(time>song.duration*1000+Math.max(0,offset)+200){stop('complete');return;}
      raf=root.requestAnimationFrame(loop);
    }
    async function start(){
      if(loading||active()||phase==='finishing'||!connected())return;
      const generation=++token;phase='starting';stopping=null;game=null;error='';refresh();onState();
      try{
        await player.unlock();await off();if(generation!==token)return;
        song=songs.find(s=>s.id===$('rhythm-song').value);offset=Number($('rhythm-offset').value);flight=Number($('rhythm-speed').value);
        if(song.audio)message('正在载入钢琴音频…');await player.prepare(song);if(generation!==token)return;
        game=new R.Game(R.chart(song,$('rhythm-difficulty').value),$('rhythm-difficulty').value);game.held=R.order.map(key=>held[key]);
        lastMask=-1;lastMaskAt=-Infinity;$('rhythm-result').hidden=true;$('rhythm-stage').hidden=false;
        player.start(song);phase='playing';$('rhythm-stage').scrollIntoView({block:'start',behavior:'instant'});message('跟着音乐，在判定线击打。');refresh();onState();loop();
      }catch(e){if(generation===token){error=e.message;await stop('error');}}
    }
    function stop(reason='cancelled'){
      if(stopping)return stopping;if(!active())return Promise.resolve();
      ++token;phase='finishing';finishReason=reason;root.cancelAnimationFrame(raf);player.stop();game?.finish(reason==='complete');refresh();onState();
      stopping=(async()=>{try{await off();}catch(e){error=e.message;}finally{phase='finished';$('rhythm-stage').hidden=true;$('rhythm-result').hidden=false;stats();refresh();onState();message(error||'音乐已结束，键盘灯光已关闭。',!!error);}})();return stopping;
    }
    function key({key,pressed,time}){
      if(!Number.isInteger(key)||key<0||key>5)return;held[key]=pressed;
      if(phase==='playing'){game.key(key,pressed,player.time(Number.isFinite(time)?time:root.performance.now())-offset);stats();}
    }
    options();for(const id of ['rhythm-song','rhythm-difficulty','rhythm-speed'])$(id).addEventListener('change',()=>{flight=Number($('rhythm-speed').value);preview();});
    $('rhythm-start').addEventListener('click',start);$('rhythm-stop').addEventListener('click',()=>stop());
    $('rhythm-volume').addEventListener('input',()=>{player.setVolume(Number($('rhythm-volume').value)/100);text('rhythm-volume-value',$('rhythm-volume').value+'%');});
    $('rhythm-offset').addEventListener('input',()=>text('rhythm-offset-value',$('rhythm-offset').value+' ms'));
    $('rhythm-import').addEventListener('click',()=>$('rhythm-file').click());
    $('rhythm-file').addEventListener('change',async()=>{
      const file=$('rhythm-file').files[0];$('rhythm-file').value='';if(!file||active()||loading)return;loading=true;refresh();
      try{if(file.size>2*1024*1024)throw new Error('MIDI 文件不能超过 2 MB');const parsed=R.parseMidi(await file.arrayBuffer());const existing=songs.findIndex(s=>s.id==='local');if(existing>=0)songs.splice(existing,1);songs.push({...parsed,id:'local',title:file.name.replace(/\.midi?$/i,'').slice(0,70)});options();$('rhythm-song').value='local';preview();message('已载入本地 MIDI，文件不会上传。');}catch(e){message(e.message,true);}finally{loading=false;refresh();}
    });
    player.onInterrupted=()=>{if(active()){error='音频已中断，请重新开始。';stop('audio');}};
    root.addEventListener('resize',()=>{if(visible)paint(phase==='playing'?player.time():-1500);});
    refresh();stats();
    return {get active(){return active();},get phase(){return phase;},stop,key,refresh,setVisible(value){visible=value;if(value){if(phase==='idle')preview();refresh();}},disconnect(){held.fill(false);if(active())stop('disconnected');}};
  }
  root.NozzalaRhythmUI={create};
})(typeof globalThis!=='undefined'?globalThis:this);
