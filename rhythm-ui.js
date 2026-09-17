(function(root){
  'use strict';
  function create({doc,connected,busy,sendMask,off,message,onState}){
    const R=root.NozzalaRhythm,$=id=>doc.getElementById(id),songs=[...root.NozzalaMusic],player=new R.Player();
    let phase='idle',loading=false,game=null,song=null,raf=null,token=0,stopping=null,visible=false,offset=0,flight=2200,lastMask=-1,lastMaskAt=-Infinity,finishReason='',error='';
    const held=Array(6).fill(false),texts=new Map(),canvas=$('rhythm-canvas'),ctx=canvas.getContext('2d');
    const motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
    let effects=[],lastFeedback=null,milestoneUntil=0,comboAnimation=null;
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
    function rounded(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
    function resetEffects(){effects=[];lastFeedback=null;milestoneUntil=0;comboAnimation?.cancel();$('rhythm-milestone').hidden=true;text('rhythm-judgement','');}
    function collectFeedback(){
      const now=root.performance.now();
      for(const event of game.drainFeedback()){
        const effect={...event,at:now};effects.push(effect);lastFeedback=effect;
        if(event.combo>0&&event.combo%25===0){text('rhythm-streak',event.combo+'×');milestoneUntil=now+1100;}
        if(event.result<5&&!motion?.matches){comboAnimation?.cancel();comboAnimation=$('rhythm-combo').animate?.([{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});}
      }
      effects=effects.filter(e=>now-e.at<650).slice(-36);
    }
    function paint(time=-1500){
      const rect=canvas.getBoundingClientRect();if(!rect.width)return;const dpr=Math.min(2,root.devicePixelRatio||1),w=Math.round(rect.width),h=Math.round(rect.height),now=root.performance.now(),reduced=!!motion?.matches;
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const lanes=R.layout(w,h),byKey=new Map(lanes.map(lane=>[lane.key,lane])),hitY=lanes[0].hitY;
      const notes=game?.notes||R.chart(songs.find(s=>s.id===$('rhythm-song').value)||songs[0],$('rhythm-difficulty').value);
      ctx.save();rounded(1,1,w-2,h-2,11);ctx.clip();
      for(const lane of lanes){
        const {x,width,key,tone}=lane;
        ctx.fillStyle=tone==='black'?'#343c48':'#242b35';ctx.fillRect(x,0,width,hitY+4);
        ctx.fillStyle=lane.track%2===0?'#73809265':'#ffffff0c';ctx.fillRect(x,0,lane.track%2===0?2:1,hitY+4);
        if(held[key]){const beam=ctx.createLinearGradient(0,hitY-100,0,hitY);beam.addColorStop(0,'#ccebe100');beam.addColorStop(1,'#ccebe13b');ctx.fillStyle=beam;ctx.fillRect(x+2,hitY-100,width-3,100);}
      }
      // All notes have the same vertical time scale and cross the same line.
      ctx.save();ctx.beginPath();ctx.rect(8,0,w-16,hitY+3);ctx.clip();
      for(const note of notes){
        if(note.time>time+flight)break;if(note.result!=null||note.time<time-(game?.windows[4]||230))continue;
        const lane=byKey.get(R.order[note.lane]),{x,width,startY,tone}=lane,noteY=hitY-(note.time-time)/flight*(hitY-startY),bar=Math.max(9,Math.min(13,width*.16));
        const inset=Math.max(4,width*.07),black=tone==='black';
        ctx.shadowColor=black?'#000000':'#dce4ee';ctx.shadowBlur=reduced?0:3;
        ctx.fillStyle=black?'#11151c':'#e2e6ed';rounded(x+inset,noteY-bar/2,width-inset*2,bar,2);ctx.fill();
        ctx.shadowBlur=0;ctx.lineWidth=black?1.5:1;ctx.strokeStyle=black?'#c2ccd9':'#f8fafc';ctx.stroke();
        ctx.fillStyle=black?'#ffffff35':'#7c8795';ctx.fillRect(x+inset+2,noteY+bar/2-2,width-inset*2-4,1);
      }
      ctx.restore();
      ctx.fillStyle='#121820';ctx.fillRect(8,hitY+4,w-16,h-hitY-4);
      ctx.shadowColor='#c7eadf';ctx.shadowBlur=reduced?0:8;ctx.fillStyle='#d8eee7';ctx.fillRect(8,hitY-1,w-16,2);ctx.shadowBlur=0;
      for(const lane of lanes){
        const {key,x,width,cx,keyHeight,tone}=lane,down=held[key],keyY=lane.keyY+(down&&!reduced?2:0),black=tone==='black';
        ctx.fillStyle=black?'#11151c':'#e2e6ed';rounded(x+4,keyY,width-8,keyHeight,4);ctx.fill();ctx.strokeStyle=down?'#c4f6e4':black?'#8c9aac':'#f5f7fa';ctx.lineWidth=down?2:1;ctx.stroke();
        ctx.fillStyle=black?'#e4eaf1':'#1c232c';ctx.font=`600 ${Math.max(13,Math.min(17,width*.22))}px sans-serif`;ctx.textAlign='center';ctx.fillText(String(key+1).padStart(2,'0'),cx,keyY+keyHeight*.64);
        if(down){ctx.fillStyle='#a7dec8';ctx.fillRect(x+7,keyY+keyHeight-4,width-14,2);}
      }
      // Feedback is anchored at the shared line, away from the incoming-note area.
      for(const effect of effects){
        const age=(now-effect.at)/650;if(age<0||age>1)continue;
        const lane=byKey.get(effect.key),{x,width,cx}=lane,missed=effect.result===5,ink=missed?'#ef9a93':'#bde9d9';
        ctx.save();ctx.globalAlpha=(1-age)**2;ctx.fillStyle=ink;ctx.fillRect(x+3,hitY-2,width-6,4);
        if(!reduced&&!missed){
          ctx.strokeStyle=ink;ctx.lineWidth=2*(1-age);ctx.beginPath();ctx.ellipse(cx,hitY,width*(.3+age*.22),5+age*13,0,0,Math.PI*2);ctx.stroke();
          if(effect.result<=2)for(let i=0;i<6;i++){const angle=Math.PI+i*Math.PI/5,spread=width*(.1+age*.5);ctx.fillRect(cx+Math.cos(angle)*spread-1,hitY+Math.sin(angle)*spread*.65,2,2);}
        }
        ctx.restore();
      }
      ctx.restore();
      $('rhythm-milestone').hidden=now>=milestoneUntil;
      const feedback=lastFeedback&&now-lastFeedback.at<550?lastFeedback:null;
      text('rhythm-judgement',phase==='playing'&&time<0?String(Math.ceil(-time/1000)):feedback?.grade||'');
      $('rhythm-judgement').dataset.grade=feedback?.grade||'';
    }
    function preview(){if(phase==='idle'||phase==='finished'){game=null;phase='idle';resetEffects();$('rhythm-result').hidden=true;$('rhythm-stage').hidden=false;stats();refresh();text('rhythm-time',format((songs.find(s=>s.id===$('rhythm-song').value)||songs[0]).duration));paint();}}
    function loop(){
      if(phase!=='playing')return;
      const time=player.time();game.advance(time-offset);collectFeedback();stats();paint(time);
      text('rhythm-time',format(Math.max(0,song.duration-Math.max(0,time)/1000)));
      let mask=0;for(const n of game.notes){if(n.time>time+180)break;if(n.time>=time-game.windows[4]&&n.result===null)mask|=1<<R.order[n.lane];}
      held.forEach((down,key)=>{if(down)mask|=1<<key;});
      if(mask!==lastMask&&time-lastMaskAt>=45){lastMask=mask;lastMaskAt=time;const generation=token;sendMask(mask).catch(e=>{if(generation===token){error=e.message;stop('error');}});}
      if(time>song.duration*1000+Math.max(0,offset)+200){stop('complete');return;}
      raf=root.requestAnimationFrame(loop);
    }
    async function start(){
      if(loading||active()||phase==='finishing'||!connected())return;
      const generation=++token;phase='starting';stopping=null;game=null;error='';resetEffects();refresh();onState();
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
      ++token;phase='finishing';finishReason=reason;root.cancelAnimationFrame(raf);player.stop();game?.finish(reason==='complete');resetEffects();refresh();onState();
      stopping=(async()=>{try{await off();}catch(e){error=e.message;}finally{phase='finished';$('rhythm-stage').hidden=true;$('rhythm-result').hidden=false;stats();refresh();onState();message(error||'音乐已结束，键盘灯光已关闭。',!!error);}})();return stopping;
    }
    function key({key,pressed,time}){
      if(!Number.isInteger(key)||key<0||key>5)return;held[key]=pressed;
      if(phase==='playing'){game.key(key,pressed,player.time(Number.isFinite(time)?time:root.performance.now())-offset);collectFeedback();stats();}
      else if(visible&&phase==='idle')paint();
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
