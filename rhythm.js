(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.NozzalaRhythm=api;})(typeof globalThis!=='undefined'?globalThis:this,root=>{
  'use strict';
  const order=[0,1,2,3,4,5],grades=['PERFECT','GREAT','GOOD','OK','MEH','MISS'];
  // Display neighbouring physical columns as upper/lower pairs; chart keys stay unchanged.
  const laneOrder=[0,3,1,4,2,5];
  const colors=['#90ccdb','#a4c97d','#e496a6','#dfb178','#c2a1e5','#89cabb'];
  const points=[305,300,200,100,50,0],ods={easy:2,normal:5,hard:8};
  // Casual-play windows requested for this keyboard; the osu! reference remains below.
  const timing={easy:[80,125,175,225,270],normal:[60,100,145,190,230],hard:[40,75,110,150,190]};
  function hitWindows(level='normal'){if(!Object.hasOwn(timing,level))throw new Error('无效难度');return [...timing[level]];}
  function layout(width,height){
    const pad=8,laneWidth=(width-pad*2)/6,whiteHeight=Math.max(72,Math.min(110,height*.24)),hitY=height-pad-whiteHeight-12;
    return laneOrder.map((key,track)=>{
      const black=key<3,cx=pad+(track+.5)*laneWidth,column=key%3;
      return {key,track,row:Math.floor(key/3),column,tone:black?'black':'white',x:pad+track*laneWidth,width:laneWidth,cx,startY:10,hitY,keyY:hitY+9,keyHeight:black?whiteHeight*.62:whiteHeight,keyX:black?cx-laneWidth*.36:pad+column*laneWidth*2+2,keyWidth:black?laneWidth*.72:laneWidth*2-4};
    });
  }
  // Adapted from osu!mania (MIT), pinned sources and licence in RHYTHM-SOURCES.md.
  function windows(od){const perfect=od<=5?22.4-.6*od:19.4-1.1*(od-5);return [perfect,64-3*od,97-3*od,127-3*od,151-3*od,188-3*od].map(v=>Math.floor(v)+.5);}
  const comboFactor=combo=>Math.min(Math.max(.5,Math.log(Math.max(1,combo))/Math.log(4)),Math.log(400)/Math.log(4));
  function chart(song,level='normal'){
    if(!Object.hasOwn(ods,level))throw new Error('无效难度');
    const groups=new Map();
    for(const [at,,pitch] of song.notes){const t=Math.round(at*1000);if(!groups.has(t))groups.set(t,[]);groups.get(t).push(pitch);}
    const gap={easy:230,normal:130,hard:90}[level],maxChord={easy:1,normal:2,hard:3}[level];
    const last=Array(6).fill(-Infinity),result=[];let lastGroup=-Infinity;
    for(const [time,pitches] of [...groups].sort((a,b)=>a[0]-b[0])){
      if(level==='easy'&&time-lastGroup<230)continue;
      const sorted=[...new Set(pitches)].sort((a,b)=>b-a),chosen=level==='normal'?[sorted[0],sorted.at(-1)]:sorted;
      const lanes=new Set();
      for(const pitch of chosen){const lane=pitch%6;if(lanes.has(lane)||time-last[lane]<gap)continue;lanes.add(lane);last[lane]=time;result.push({time,lane});if(lanes.size>=maxChord)break;}
      if(lanes.size)lastGroup=time;
    }
    return result.sort((a,b)=>a.time-b.time||a.lane-b.lane);
  }
  class Game {
    constructor(notes,level='normal'){
      if(!notes.length)throw new Error('这首 MIDI 没有可玩的音符');
      this.notes=notes.map(n=>({...n,result:null}));this.lanes=Array.from({length:6},(_,i)=>this.notes.filter(n=>n.lane===i));
      this.cursor=Array(6).fill(0);this.held=Array(6).fill(false);this.windows=hitWindows(level);this.counts=Array(6).fill(0);this.feedback=[];
      this.combo=0;this.maxCombo=0;this.base=0;this.comboScore=0;this.judged=0;this.expire=0;this.last=null;this.active=true;
      this.maxComboScore=this.notes.reduce((s,_,i)=>s+300*comboFactor(i+1),0);
    }
    judge(note,result,error,time=note.time){
      if(note.result!==null)return;
      note.result=result;this.counts[result]++;this.judged++;this.base+=points[result];
      this.combo=result===5?0:this.combo+1;this.maxCombo=Math.max(this.maxCombo,this.combo);
      this.comboScore+=(result===0?300:points[result])*comboFactor(this.combo);
      this.last={grade:grades[result],error};
      this.feedback.push({key:order[note.lane],lane:note.lane,result,grade:grades[result],error,time,combo:this.combo});if(this.feedback.length>64)this.feedback.shift();
    }
    drainFeedback(){return this.feedback.splice(0);}
    advance(time){
      if(!this.active)return;
      while(this.expire<this.notes.length&&this.notes[this.expire].time+this.windows[4]<time){const n=this.notes[this.expire++];if(n.result===null)this.judge(n,5,null,time);}
    }
    key(key,pressed,time){
      const lane=order.indexOf(key);if(lane<0||typeof pressed!=='boolean')return;
      const repeat=this.held[lane];this.held[lane]=pressed;if(!this.active||!pressed||repeat)return;
      this.advance(time);const notes=this.lanes[lane];while(this.cursor[lane]<notes.length&&notes[this.cursor[lane]].result!==null)this.cursor[lane]++;
      let nearest=null,distance=Infinity;
      for(let i=this.cursor[lane];i<notes.length&&notes[i].time<=time+this.windows[4];i++){
        const note=notes[i],delta=Math.abs(time-note.time);if(note.result===null&&delta<=this.windows[4]&&delta<distance){nearest=note;distance=delta;}
      }
      if(!nearest)return; // A premature tap does not consume a future note as a MISS.
      for(let i=this.cursor[lane];i<notes.length&&notes[i]!==nearest;i++)if(notes[i].result===null)this.judge(notes[i],5,null,time);
      const error=time-nearest.time,index=this.windows.findIndex(w=>Math.abs(error)<=w);this.judge(nearest,index,error,time);
    }
    finish(complete){if(complete)this.advance(Infinity);this.active=false;this.held.fill(false);return this.snapshot();}
    snapshot(){const accuracy=this.judged?this.base/(305*this.judged):1;return {score:Math.round(150000*this.comboScore/this.maxComboScore+850000*Math.pow(accuracy,2+2*accuracy)*this.judged/this.notes.length),accuracy,combo:this.combo,maxCombo:this.maxCombo,counts:[...this.counts],judged:this.judged,total:this.notes.length,last:this.last};}
  }
  function parseMidi(buffer){
    const bytes=new Uint8Array(buffer);if(bytes.length>2*1024*1024)throw new Error('MIDI 文件不能超过 2 MB');
    let p=0;const read=n=>{if(p+n>bytes.length)throw new Error('MIDI 文件不完整');const v=bytes.slice(p,p+n);p+=n;return v;};
    const str=n=>String.fromCharCode(...read(n)),uint=n=>read(n).reduce((v,b)=>v*256+b,0);
    const vlq=()=>{let value=0;for(let i=0;i<4;i++){const b=uint(1);value=value*128+(b&127);if(!(b&128))return value;}throw new Error('MIDI 文件格式暂不支持');};
    if(str(4)!=='MThd')throw new Error('请选择标准 MIDI 文件');
    const size=uint(4),format=uint(2),tracks=uint(2),ppq=uint(2);
    if(size<6||format>1||tracks<1||tracks>64||!ppq||(ppq&32768))throw new Error('MIDI 文件格式暂不支持');read(size-6);
    const raw=[],events=[],tempos=new Map([[0,500000]]);let lastTick=0;
    for(let track=0;track<tracks;track++){
      if(str(4)!=='MTrk')throw new Error('MIDI 文件不完整');const length=uint(4),end=p+length;
      if(end>bytes.length)throw new Error('MIDI 文件不完整');let tick=0,running=null;
      while(p<end){tick+=vlq();let status=bytes[p];if(status&128)p++;else {if(running===null)throw new Error('MIDI 文件格式暂不支持');status=running;}
        if(status===255){const type=uint(1),n=vlq(),data=read(n);if(type===81&&n===3){const tempo=data[0]*65536+data[1]*256+data[2];if(!tempo)throw new Error('MIDI 文件格式暂不支持');tempos.set(tick,tempo);}if(type===47)break;continue;}
        if(status===240||status===247){read(vlq());running=null;continue;}
        if(status<128||status>=240)throw new Error('MIDI 文件格式暂不支持');running=status;const kind=status>>4,ch=status&15,n=(kind===12||kind===13)?1:2,data=read(n);if(data.some(v=>v>127))throw new Error('MIDI 文件格式暂不支持');
        if(ch!==9&&(kind===8||kind===9||kind===11&&data[0]===64))events.push([tick,events.length,kind,ch,...data]);
        if(events.length>100000)throw new Error('MIDI 音符过多');
      }
      if(p>end)throw new Error('MIDI 文件不完整');p=end;lastTick=Math.max(lastTick,tick);
    }
    // Controllers may live in a different track from their channel's notes.
    const active=new Map(),sustained=Array.from({length:16},()=>[]),pedal=Array(16).fill(false);
    const close=(note,end)=>{const [start,pitch,velocity]=note;if(end>start)raw.push([start,end,pitch,velocity]);if(raw.length>20000)throw new Error('MIDI 音符过多');};
    for(const [tick,,kind,ch,a,b] of events.sort((a,b)=>a[0]-b[0]||a[1]-b[1])){
      const key=ch*128+a;
      if(kind===11){pedal[ch]=b>=64;if(!pedal[ch]){sustained[ch].forEach(n=>close(n,tick));sustained[ch]=[];}}
      else if(kind===9&&b){if(!active.has(key))active.set(key,[]);active.get(key).push([tick,a,b]);}
      else if(active.get(key)?.length){const note=active.get(key).shift();if(pedal[ch])sustained[ch].push(note);else close(note,tick);}
    }
    for(const held of [...active.values(),...sustained])held.forEach(n=>close(n,lastTick));
    if(!raw.length)throw new Error('这首 MIDI 没有可玩的音符');
    const ticks=[...tempos.keys()].sort((a,b)=>a-b),seconds=[0];
    for(let i=1;i<ticks.length;i++)seconds[i]=seconds[i-1]+(ticks[i]-ticks[i-1])*tempos.get(ticks[i-1])/ppq/1e6;
    const at=t=>{let i=0;while(i+1<ticks.length&&ticks[i+1]<=t)i++;return seconds[i]+(t-ticks[i])*tempos.get(ticks[i])/ppq/1e6;};
    const first=Math.min(...raw.map(n=>at(n[0]))),notes=raw.map(([a,b,k,v])=>[at(a)-first,at(b)-at(a),k,v]).sort((a,b)=>a[0]-b[0]||a[2]-b[2]);
    const duration=Math.max(...notes.map(n=>n[0]+n[1]))+.8;if(!Number.isFinite(duration)||duration>900)throw new Error('MIDI 时长不能超过 15 分钟');
    return {notes,duration};
  }
  class Player {
    constructor(){this.context=null;this.voices=new Set();this.timer=null;this.volume=.5;this.buffers=new Map();this.onInterrupted=()=>{};}
    async unlock(){
      if(!this.context){const Context=root.AudioContext||root.webkitAudioContext;if(!Context)throw new Error('当前浏览器无法播放音乐');this.context=new Context({latencyHint:'interactive'});
        this.gain=this.context.createGain();this.gain.gain.value=this.volume;const compressor=this.context.createDynamicsCompressor();compressor.threshold.value=-3;compressor.knee.value=6;compressor.ratio.value=4;this.gain.connect(compressor);compressor.connect(this.context.destination);
        const real=new Float32Array(9),imag=new Float32Array([0,1,.34,.15,.08,.035,.02,.01,.005]);this.wave=this.context.createPeriodicWave(real,imag);
        this.context.addEventListener('statechange',()=>{if(this.playing&&this.context.state!=='running')this.onInterrupted();});
      }
      await this.context.resume();if(this.context.state!=='running')throw new Error('请允许浏览器播放声音');
    }
    setVolume(value){this.volume=Math.max(0,Math.min(1,value));if(this.gain)this.gain.gain.setTargetAtTime(this.volume,this.context.currentTime,.025);}
    async prepare(song){
      if(!song.audio||this.buffers.has(song.audio))return;
      const controller=new root.AbortController();this.loading=controller;
      try{const response=await root.fetch(song.audio,{signal:controller.signal});if(!response.ok)throw new Error();
        const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
        if(controller.signal.aborted)throw new Error();this.buffers.set(song.audio,buffer);
      }catch{throw new Error('钢琴音频加载失败，请重试。');}finally{if(this.loading===controller)this.loading=null;}
    }
    start(song){
      this.stop();this.playing=true;this.song=song;this.index=0;this.startAt=this.context.currentTime+2.2;
      if(song.audio){
        const buffer=this.buffers.get(song.audio);if(!buffer){this.playing=false;throw new Error('钢琴音频加载失败，请重试。');}
        const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.gain);this.voices.add(source);
        source.onended=()=>{this.voices.delete(source);source.disconnect();};source.start(this.startAt,song.audioOffset||0);return;
      }
      const schedule=()=>{if(!this.playing)return;const ahead=this.context.currentTime+.25;
        while(this.index<song.notes.length&&song.notes[this.index][0]+this.startAt<ahead){const n=song.notes[this.index++];this.note(n,this.startAt+n[0]);}
      };schedule();this.timer=root.setInterval(schedule,25);
    }
    note([,duration,pitch,velocity],at){
      const ctx=this.context;if(at+.05<ctx.currentTime||this.voices.size>=64)return;
      at=Math.max(at,ctx.currentTime);const end=at+Math.min(duration,10),osc=ctx.createOscillator(),gain=ctx.createGain();osc.setPeriodicWave(this.wave);osc.frequency.value=440*Math.pow(2,(pitch-69)/12);
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12*Math.pow(velocity/127,1.5),at+.005);
      gain.gain.exponentialRampToValueAtTime(.003,Math.max(at+.01,end));gain.gain.exponentialRampToValueAtTime(.0001,end+.13);
      osc.connect(gain);gain.connect(this.gain);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(end+.15);
    }
    time(performanceTime=root.performance.now()){
      const ctx=this.context,stamp=ctx.getOutputTimestamp?.();
      const audible=stamp?.contextTime>0?stamp.contextTime+(performanceTime-stamp.performanceTime)/1000:ctx.currentTime-(ctx.outputLatency||0)+(performanceTime-root.performance.now())/1000;
      return (audible-this.startAt)*1000;
    }
    stop(){this.playing=false;this.loading?.abort();this.loading=null;root.clearInterval(this.timer);this.timer=null;for(const osc of this.voices){try{osc.stop();}catch{}}this.voices.clear();}
  }
  return {order,laneOrder,colors,layout,hitWindows,grades,windows,chart,Game,parseMidi,Player};
});
