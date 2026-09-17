(function(root){
  'use strict';
  function create({doc,connected,busy,sendMask,off,message,onState}){
    const R=root.NozzalaRhythm,$=id=>doc.getElementById(id),songs=[...root.NozzalaMusic],player=new R.Player();
    let phase='idle',loading=false,game=null,song=null,raf=null,token=0,stopping=null,visible=false,offset=0,flight=2200,lastMask=-1,lastMaskAt=-Infinity,finishReason='',error='';
    const held=Array(6).fill(false),texts=new Map(),canvas=$('rhythm-canvas'),ctx=canvas.getContext('2d');
    const colors=R.colors,motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
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
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const cells=R.layout(w,h);
      const notes=game?.notes||R.chart(songs.find(s=>s.id===$('rhythm-song').value)||songs[0],$('rhythm-difficulty').value),near=Array(6).fill(Infinity);
      for(const note of notes){if(note.time>time+flight)break;if(note.result==null&&note.time>=time-(game?.windows[4]||230))near[R.order[note.lane]]=Math.min(near[R.order[note.lane]],Math.abs(note.time-time));}
      for(const cell of cells){
        const {key,x,y,size,cx,hitY,startY}=cell,color=colors[key],down=held[key],cue=Math.max(0,1-near[key]/350);
        const latest=effects.findLast(e=>e.key===key),pulse=latest?Math.max(0,1-(now-latest.at)/420):0,accent=latest?.result===5?'#f38e85':color;
        ctx.save();const fill=ctx.createLinearGradient(x,y,x,y+size);fill.addColorStop(0,'#202e38');fill.addColorStop(1,'#131e27');ctx.fillStyle=fill;rounded(x,y,size,size,14);ctx.fill();
        ctx.strokeStyle=down?color:cue>.1?color+'90':'#3b4c57';ctx.lineWidth=down?2.5:1;ctx.stroke();
        if(pulse||down){ctx.globalAlpha=down ? .13 : pulse*(reduced ? .13 : .25);ctx.fillStyle=accent;ctx.fill();ctx.globalAlpha=1;}
        ctx.save();rounded(x+1,y+1,size-2,size-2,13);ctx.clip();
        ctx.strokeStyle=color+'16';ctx.lineWidth=1;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(cx+side*size*.3,startY);ctx.lineTo(cx+side*size*.3,hitY);ctx.stroke();}
        const beam=ctx.createLinearGradient(0,hitY-size*.45,0,hitY);beam.addColorStop(0,color+'00');beam.addColorStop(1,color+(down?'50':'16'));ctx.fillStyle=beam;ctx.fillRect(x+size*.15,startY,size*.7,hitY-startY);
        const keyY=hitY+6+(down&&!reduced?2:0),keyHeight=Math.max(22,size*.17);
        ctx.fillStyle=down?color:'#2c3c47';rounded(x+size*.13,keyY,size*.74,keyHeight,7);ctx.fill();ctx.strokeStyle=color+(down?'ff':'65');ctx.stroke();
        ctx.fillStyle=down?'#13212a':color;ctx.font=`600 ${Math.max(13,size*.1)}px sans-serif`;ctx.textAlign='center';ctx.fillText(String(key+1).padStart(2,'0'),cx,keyY+keyHeight*.71);
        ctx.shadowColor=color;ctx.shadowBlur=reduced?0:5+cue*10;ctx.fillStyle=cue>.2?'#f0f6f7':color+'b0';rounded(x+size*.13,hitY-2,size*.74,3,2);ctx.fill();ctx.shadowBlur=0;
        for(const note of notes){
          if(note.time>time+flight)break;if(R.order[note.lane]!==key||note.result!=null||note.time<time-(game?.windows[4]||230))continue;
          const noteY=hitY-(note.time-time)/flight*(hitY-startY),bar=Math.max(4,size*.03),noteWidth=size*.68;
          if(!reduced){const trail=ctx.createLinearGradient(0,noteY-20,0,noteY);trail.addColorStop(0,color+'00');trail.addColorStop(1,color+'35');ctx.fillStyle=trail;ctx.fillRect(cx-noteWidth/2,noteY-20,noteWidth,20);}
          ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=reduced?0:8;rounded(cx-noteWidth/2,noteY-bar/2,noteWidth,bar,3);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ffffffb0';ctx.fillRect(cx-noteWidth/2+3,noteY-bar/2+1,noteWidth-6,1.5);
        }
        for(const effect of effects){
          if(effect.key!==key)continue;const age=(now-effect.at)/650;if(age<0||age>1)continue;
          const missed=effect.result===5,ink=missed?'#f38e85':color;ctx.globalAlpha=(1-age)*(reduced ? .6 : 1);ctx.strokeStyle=ink;ctx.fillStyle=ink;
          if(!reduced&&!missed){
            ctx.lineWidth=2*(1-age);rounded(cx-size*(.28+.16*age),hitY-5-size*.1*age,size*(.56+.32*age),size*(.21+.16*age),9);ctx.stroke();
            if(effect.result<=2)for(let i=0;i<8;i++){const angle=i*Math.PI/4+key*.4,radius=size*(.08+age*.46);ctx.globalAlpha=(1-age)**2;ctx.fillRect(cx+Math.cos(angle)*radius-1.5,hitY+Math.sin(angle)*radius*.48-age*size*.1,3,3);}
          }
          if(effect===latest){ctx.globalAlpha=1-age;ctx.font=`700 ${Math.max(9,size*.068)}px sans-serif`;ctx.textAlign='center';ctx.fillText(effect.grade,cx,y+size*.1);}
        }
        ctx.restore();ctx.restore();
      }
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
