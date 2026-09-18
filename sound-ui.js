(function(root){
  'use strict';
  function create({doc,connected,busy,sendFrame,off,message,onState}){
    const S=root.NozzalaSound,M=root.NozzalaModel,$=id=>doc.getElementById(id),canvas=$('sound-canvas'),ctx=canvas.getContext('2d'),motion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
    let phase='idle',visible=false,generation=0,raf=null,stopping=null,sending=false,lastSend=-Infinity,lastTime=0,previousOnline=connected(),signal=new S.Signal(),frame=empty(),wave=null;
    const active=()=>phase==='waiting'||phase==='listening';
    const mic=new S.Microphone({onState:()=>refresh(),onInterrupted:()=>stop('interrupted')});
    function empty(){return {level:0,lamps:S.colors.map(color=>({color,level:0}))};}
    function refresh(){
      const online=connected(),lost=previousOnline&&!online;previousOnline=online;
      if(lost&&active()){stop('disconnected');return;}
      $('sound-start').disabled=active()||phase==='finishing'||!!mic.pending||busy();
      $('sound-stop').hidden=!active()&&phase!=='finishing';$('sound-stop').disabled=phase==='finishing';
      $('sound-mic-state').textContent=mic.state==='listening'?'麦克风已开启':mic.state==='requesting'||mic.pending?'等待麦克风授权…':'麦克风未开启';
      $('sound-mic-indicator').classList.toggle('live',mic.state==='listening');
      $('sound-mode-note').textContent=$('sound-mode').value==='pulse'?'六个灯一起随声音明暗变化。':'SW1 到 SW6 依次响应低音到高音。';
      $('sound-connection').textContent=online?'已连接键盘 · 灯光同步':'网页预览 · 连接键盘可同步灯光';
    }
    function round(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
    function paint(){
      const rect=canvas.getBoundingClientRect();if(!rect.width)return;
      const dpr=Math.min(2,root.devicePixelRatio||1),w=Math.round(rect.width),h=Math.round(rect.height);
      const pixelsW=Math.round(w*dpr),pixelsH=Math.round(h*dpr);if(canvas.width!==pixelsW||canvas.height!==pixelsH){canvas.width=pixelsW;canvas.height=pixelsH;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
      const pad=w*.055,gap=w*.032,cw=(w-pad*2-gap*2)/3,ch=(h-90)/2-8,top=18;
      frame.lamps.forEach((lamp,key)=>{
        const x=pad+(key%3)*(cw+gap),y=top+Math.floor(key/3)*(ch+14),packed=parseInt(M.ledPresetColor(lamp.color).slice(1),16);
        const light=M.emission([packed>>16,(packed>>8)&255,packed&255].map(value=>Math.round(value*lamp.level))),strength=light.strength,color=light.color,on=strength>0;
        ctx.fillStyle='#17232d';round(x,y,cw,ch,13);ctx.fill();ctx.strokeStyle='#526677';ctx.lineWidth=1;ctx.stroke();
        if(on){ctx.save();round(x+1,y+1,cw-2,ch-2,12);ctx.clip();const gradient=ctx.createLinearGradient(0,y+ch,0,y);gradient.addColorStop(0,color);gradient.addColorStop(1,color.replace('rgb(','rgba(').replace(')',',0.07)'));ctx.globalAlpha=strength*.58;ctx.fillStyle=gradient;ctx.fillRect(x,y+ch*(1-lamp.level),cw,ch*lamp.level);ctx.restore();}
        const cy=y+ch*.42,radius=Math.min(cw,ch)*.19;
        ctx.save();ctx.shadowColor=color;ctx.shadowBlur=motion?.matches?0:strength*25;ctx.fillStyle=on?color:'#26333d';ctx.globalAlpha=on ? .28+strength*.72 : 1;ctx.beginPath();ctx.arc(x+cw/2,cy,radius,0,Math.PI*2);ctx.fill();ctx.restore();
        if(strength>0){ctx.fillStyle='#ffffff';ctx.globalAlpha=strength*.8;ctx.beginPath();ctx.arc(x+cw/2-2,cy-2,radius*.43,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
        ctx.fillStyle='#b5c2cd';ctx.font='600 11px sans-serif';ctx.textAlign='center';ctx.fillText('SW'+(key+1),x+cw/2,y+ch-13);
      });
      const base=h-25;ctx.strokeStyle='#829d9b66';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(pad,base);ctx.lineTo(w-pad,base);ctx.stroke();
      if(wave&&phase==='listening'&&!motion?.matches){ctx.strokeStyle='#bde4dc';ctx.lineWidth=1.5;ctx.beginPath();const gain=Math.pow(2,(Number($('sound-sensitivity').value)-50)/25);for(let i=0;i<160;i++){const value=wave[Math.floor(i*wave.length/160)]||0,x=pad+i/159*(w-pad*2),y=base-Math.max(-1,Math.min(1,value*gain*3))*17;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.stroke();}
    }
    function loop(now){
      if(phase!=='listening')return;
      const sample=mic.sample();if(!sample){stop('interrupted');return;}
      frame=signal.process(sample.frequency,sample.wave,sample.sampleRate,(now-lastTime)/1000,Number($('sound-sensitivity').value),$('sound-mode').value,Number($('sound-brightness').value)/100);lastTime=now;wave=sample.wave;
      const level=Math.round(frame.level*100);$('sound-level').value=level;$('sound-level-value').textContent=level+'%';paint();
      if(connected()&&!sending&&now-lastSend>=100){
        const current=generation,lamps=frame.lamps;sending=true;lastSend=now;
        Promise.resolve().then(()=>{if(current===generation&&phase==='listening')return sendFrame(lamps);}).catch(error=>{if(current===generation)stop('error',error.message);}).finally(()=>{if(current===generation)sending=false;});
      }
      raf=root.requestAnimationFrame(loop);
    }
    async function start(){
      if(active()||phase==='finishing'||mic.pending||busy())return;
      const current=++generation;phase='waiting';stopping=null;signal=new S.Signal();frame=empty();sending=false;lastSend=-Infinity;refresh();onState();message('等待麦克风授权…');
      try{
        const started=await mic.start();if(current!==generation)return;if(!started)throw new Error('无法开启麦克风，请重试。');
        if(connected())await off();if(current!==generation)return;
        phase='listening';lastTime=root.performance.now();refresh();onState();message('正在把声音变成灯光。');raf=root.requestAnimationFrame(loop);
      }catch(error){if(current===generation)await stop('error',S.errorText(error));}
    }
    function stop(reason='cancelled',failure=''){
      if(stopping)return stopping;if(!active()&&phase!=='finishing')return Promise.resolve();
      ++generation;phase='finishing';root.cancelAnimationFrame(raf);const released=mic.stop();frame=empty();wave=null;sending=false;paint();$('sound-level').value=0;$('sound-level-value').textContent='0%';refresh();onState();
      stopping=(async()=>{
        let error=failure,lightsOff=false;
        try{await released;if(connected()){await off();lightsOff=true;}}catch(e){error=error||e.message;}
        finally{phase='idle';stopping=null;refresh();onState();
          message(error||(reason==='interrupted'?'麦克风输入已中断，请重新开始。':reason==='disconnected'?'键盘已断开，麦克风已关闭。':lightsOff?'麦克风已关闭，灯光已熄灭。':'麦克风已关闭。'),!!error||reason==='interrupted');
        }
      })();return stopping;
    }
    $('sound-start').addEventListener('click',start);$('sound-stop').addEventListener('click',()=>stop());
    $('sound-mode').addEventListener('change',()=>{signal=new S.Signal();refresh();});
    for(const id of ['sound-sensitivity','sound-brightness'])$(id).addEventListener('input',()=>{$(id+'-value').textContent=$(id).value+'%';});
    root.addEventListener('resize',()=>{if(visible)paint();});root.addEventListener('pagehide',()=>{if(active())stop('hidden');});
    refresh();
    return {get active(){return active();},get phase(){return phase;},stop,refresh,setVisible(value){visible=value;if(value){refresh();paint();}}};
  }
  root.NozzalaSoundUI={create};
})(typeof globalThis!=='undefined'?globalThis:this);
